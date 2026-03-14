# Task: Full Pipeline

## Instructions

Run the complete OpenRegulations automation pipeline. You are the orchestrator
that decides what needs to happen and in what order.

### Step 1: Check System Status
Use `get_system_status` to understand:
- How many dockets/comments/analyses exist
- What was synced/analyzed recently
- What needs attention

### Step 2: Sync New Data
Use `sync_active_dockets` to discover and fetch new dockets with open comment periods.
This finds active proposed rules on Regulations.gov and pulls their comments.

### Step 3: Analyze Dockets
Use `analyze_pending_dockets` to run AI analysis on dockets that:
- Have never been analyzed, OR
- Have received new comments since the last analysis

Analysis includes form letter detection, theme extraction, sentiment classification,
and executive summary generation.

### Step 4: Generate Embeddings
Use `embed_pending_dockets` to create vector embeddings for semantic search.
Only processes non-form-letter comments that don't already have embeddings.

### Step 5: Generate Report
Use `generate_report` to create a daily summary of:
- Active docket counts and comment volumes
- Trending dockets (most engagement)
- Approaching deadlines
- Recent analysis results

### Step 6: Check for Alerts
Review the results and send alerts for:
- Form letter rate > 70% on any docket
- Sentiment > 90% one-sided
- Comment velocity > 500/day
- Any errors or failures in the pipeline

### Step 7: Summary
Provide a final summary of everything that was done:
- Dockets synced and new comment counts
- Analyses completed and key findings
- Embeddings generated
- Any alerts or issues

## Important Notes
- If a step fails, log the error and continue with the next step
- Don't re-analyze dockets that were analyzed in the last 24 hours
- Be efficient with API calls (Regulations.gov has rate limits)
