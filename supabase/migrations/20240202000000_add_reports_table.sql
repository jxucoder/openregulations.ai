-- Add reports table for freeform HTML analysis reports
-- Separate from analyses to keep structured data (themes, sentiment) distinct from prose reports

CREATE TABLE IF NOT EXISTS reports (
    id SERIAL PRIMARY KEY,
    docket_id TEXT NOT NULL REFERENCES dockets(id) ON DELETE CASCADE,
    report_html TEXT NOT NULL,
    report_metadata JSONB DEFAULT '{}',  -- {total_comments, form_letter_pct, sample_size, input_tokens, output_tokens}
    model_used TEXT DEFAULT 'claude-sonnet-4-20250514',
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT reports_docket_unique UNIQUE (docket_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_docket ON reports(docket_id);
CREATE INDEX IF NOT EXISTS idx_reports_generated ON reports(generated_at DESC);

-- Row Level Security
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read reports" ON reports FOR SELECT USING (true);
CREATE POLICY "Service write reports" ON reports FOR ALL USING (auth.role() = 'service_role');
