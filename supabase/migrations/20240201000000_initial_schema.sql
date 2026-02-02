-- OpenRegulations.ai Database Schema
-- Run with: supabase db push

-- ============================================
-- EXTENSIONS
-- ============================================

CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================
-- TABLES
-- ============================================

-- Dockets: Regulatory docket metadata
CREATE TABLE IF NOT EXISTS dockets (
    id TEXT PRIMARY KEY,                    -- e.g., "NHTSA-2025-0491"
    title TEXT NOT NULL,
    agency TEXT NOT NULL,                   -- e.g., "NHTSA", "FDA"
    agency_name TEXT,
    abstract TEXT,
    document_type TEXT,
    regulations_url TEXT,
    posted_date DATE,
    comment_start_date DATE,
    comment_end_date DATE,
    last_synced_at TIMESTAMPTZ,
    total_comments_at_sync INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments: Public comments on dockets
CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,                    -- e.g., "NHTSA-2025-0491-0001"
    docket_id TEXT NOT NULL REFERENCES dockets(id) ON DELETE CASCADE,
    text TEXT,
    title TEXT,
    author TEXT,
    organization TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'US',
    is_form_letter BOOLEAN DEFAULT FALSE,
    form_letter_cluster_id TEXT,
    sentiment TEXT,                         -- 'oppose', 'support', 'neutral'
    quality_score INTEGER,                  -- 1-5
    posted_date TIMESTAMPTZ,
    received_date TIMESTAMPTZ,
    has_attachments BOOLEAN DEFAULT FALSE,
    attachment_count INTEGER DEFAULT 0,
    fetched_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comment embeddings for semantic search
CREATE TABLE IF NOT EXISTS comment_embeddings (
    comment_id TEXT PRIMARY KEY REFERENCES comments(id) ON DELETE CASCADE,
    embedding vector(1536),                 -- OpenAI text-embedding-3-small
    model TEXT DEFAULT 'text-embedding-3-small',
    docket_id TEXT NOT NULL,
    sentiment TEXT,
    theme_ids TEXT[],
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Analysis results
CREATE TABLE IF NOT EXISTS analyses (
    docket_id TEXT PRIMARY KEY REFERENCES dockets(id) ON DELETE CASCADE,
    total_comments INTEGER,
    unique_comments INTEGER,
    form_letter_count INTEGER,
    form_letter_percentage NUMERIC(5,2),
    high_quality_count INTEGER,
    sentiment JSONB,
    themes JSONB,
    campaigns JSONB,
    notable_comments JSONB,
    executive_summary TEXT,
    key_findings TEXT[],
    alerts JSONB,
    analyzed_at TIMESTAMPTZ DEFAULT NOW(),
    analysis_version TEXT DEFAULT '1.0',
    model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sync log for tracking jobs
CREATE TABLE IF NOT EXISTS sync_log (
    id SERIAL PRIMARY KEY,
    job_type TEXT NOT NULL,
    docket_id TEXT,
    status TEXT NOT NULL,
    records_fetched INTEGER,
    records_created INTEGER,
    records_updated INTEGER,
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_message TEXT,
    error_details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

-- Dockets
CREATE INDEX IF NOT EXISTS idx_dockets_agency ON dockets(agency);
CREATE INDEX IF NOT EXISTS idx_dockets_comment_end ON dockets(comment_end_date);
CREATE INDEX IF NOT EXISTS idx_dockets_synced ON dockets(last_synced_at);

-- Comments
CREATE INDEX IF NOT EXISTS idx_comments_docket ON comments(docket_id);
CREATE INDEX IF NOT EXISTS idx_comments_posted ON comments(posted_date DESC);
CREATE INDEX IF NOT EXISTS idx_comments_sentiment ON comments(sentiment);
CREATE INDEX IF NOT EXISTS idx_comments_form_letter ON comments(is_form_letter);
CREATE INDEX IF NOT EXISTS idx_comments_quality ON comments(quality_score DESC);

-- Full-text search on comments
CREATE INDEX IF NOT EXISTS idx_comments_text_search ON comments 
    USING gin(to_tsvector('english', coalesce(text, '')));

-- Embeddings vector index
CREATE INDEX IF NOT EXISTS idx_embeddings_vector ON comment_embeddings 
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);
CREATE INDEX IF NOT EXISTS idx_embeddings_docket ON comment_embeddings(docket_id);

-- Sync log
CREATE INDEX IF NOT EXISTS idx_sync_log_job ON sync_log(job_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_log_docket ON sync_log(docket_id, started_at DESC);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Semantic search function
CREATE OR REPLACE FUNCTION match_comments(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.7,
    match_count int DEFAULT 10,
    filter_docket_id text DEFAULT NULL
)
RETURNS TABLE (
    comment_id text,
    comment_text text,
    author text,
    sentiment text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.text,
        c.author,
        c.sentiment,
        1 - (e.embedding <=> query_embedding) AS similarity
    FROM comment_embeddings e
    JOIN comments c ON c.id = e.comment_id
    WHERE (filter_docket_id IS NULL OR e.docket_id = filter_docket_id)
      AND 1 - (e.embedding <=> query_embedding) > match_threshold
    ORDER BY e.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Get dockets needing analysis
CREATE OR REPLACE FUNCTION get_dockets_needing_analysis(limit_count int DEFAULT 5)
RETURNS TABLE (id text, title text, total_comments int)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT d.id, d.title, d.total_comments_at_sync
    FROM dockets d
    LEFT JOIN analyses a ON a.docket_id = d.id
    WHERE d.total_comments_at_sync > 0
      AND (a.docket_id IS NULL OR a.analyzed_at < d.last_synced_at)
    ORDER BY d.total_comments_at_sync DESC
    LIMIT limit_count;
END;
$$;

-- ============================================
-- ROW LEVEL SECURITY
-- ============================================

ALTER TABLE dockets ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Public read dockets" ON dockets FOR SELECT USING (true);
CREATE POLICY "Public read comments" ON comments FOR SELECT USING (true);
CREATE POLICY "Public read analyses" ON analyses FOR SELECT USING (true);
CREATE POLICY "Public read embeddings" ON comment_embeddings FOR SELECT USING (true);

-- Service role full access (for cron jobs)
CREATE POLICY "Service write dockets" ON dockets FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write comments" ON comments FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write analyses" ON analyses FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write embeddings" ON comment_embeddings FOR ALL USING (auth.role() = 'service_role');
CREATE POLICY "Service write sync_log" ON sync_log FOR ALL USING (auth.role() = 'service_role');
