-- Seed data for testing
-- Run with: supabase db reset (includes migrations + seed)

-- Sample docket
INSERT INTO dockets (id, title, agency, agency_name, abstract, comment_end_date, total_comments_at_sync)
VALUES (
    'TEST-2025-0001',
    'Test Regulation for Development',
    'TEST',
    'Test Agency',
    'This is a test docket for development purposes.',
    CURRENT_DATE + INTERVAL '30 days',
    3
) ON CONFLICT (id) DO NOTHING;

-- Sample comments
INSERT INTO comments (id, docket_id, text, author, organization, sentiment, quality_score, posted_date)
VALUES 
    ('TEST-2025-0001-0001', 'TEST-2025-0001', 
     'I strongly support this regulation because it will improve safety standards.',
     'Jane Smith', 'Safety First Coalition', 'support', 4, NOW()),
    ('TEST-2025-0001-0002', 'TEST-2025-0001',
     'I oppose this rule as it will increase costs for small businesses without clear benefits.',
     'John Doe', 'Small Business Association', 'oppose', 3, NOW()),
    ('TEST-2025-0001-0003', 'TEST-2025-0001',
     'Please consider the environmental impact of this regulation. Studies show...',
     'Dr. Emily Chen', 'University Research Lab', 'neutral', 5, NOW())
ON CONFLICT (id) DO NOTHING;

-- Sample analysis
INSERT INTO analyses (docket_id, total_comments, unique_comments, form_letter_percentage, 
    sentiment, themes, executive_summary, analyzed_at)
VALUES (
    'TEST-2025-0001',
    3,
    3,
    0,
    '{"oppose": 33, "support": 33, "neutral": 34}',
    '[{"id": "safety", "name": "Safety Standards", "count": 1}, {"id": "costs", "name": "Business Costs", "count": 1}]',
    'This test docket received 3 comments with mixed sentiment. Key themes include safety standards and business costs.',
    NOW()
) ON CONFLICT (docket_id) DO UPDATE SET analyzed_at = NOW();
