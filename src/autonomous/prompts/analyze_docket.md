# Task: Analyze Docket

## Input
- `docket_id`: The docket to analyze (e.g., "NHTSA-2025-0491")

## Instructions

Analyze the public comments for this docket. Follow these steps:

### Step 1: Check Existing Data
Query the database to see if we already have an analysis:
```sql
SELECT * FROM analyses WHERE docket_id = '{docket_id}' 
ORDER BY analyzed_at DESC LIMIT 1
```

If recent analysis exists (< 24 hours old), use it instead of re-analyzing.

### Step 2: Fetch Comments
If no recent analysis, fetch comments from the API:
- Start with limit=100 for initial assessment
- If >1000 total comments, sample strategically

### Step 3: Detect Form Letters
Run form letter detection to separate signal from noise:
- Group by text similarity
- Calculate form letter percentage
- Identify distinct campaigns

### Step 4: Extract Themes
For UNIQUE comments only (not form letters), extract:
- Main arguments being made
- Sentiment (support/oppose/neutral)
- Quality indicators (substantive vs generic)

### Step 5: Generate Summary
Create an executive summary that answers:
- What are people saying? (themes)
- How organized is this? (form letter %)
- What's the sentiment split?
- What should decision-makers know?

### Step 6: Save Results
Store the analysis in the database for future use.

### Step 7: Check Alert Conditions
Alert if:
- Form letter rate > 70%
- Sentiment > 90% one-sided
- Any other unusual pattern

## Output Format
Return a structured analysis with:
- `docket_id`
- `total_comments`
- `unique_comments`  
- `form_letter_percentage`
- `sentiment`: {support, oppose, neutral}
- `themes`: [{name, description, count}]
- `campaigns`: [{preview, count}]
- `executive_summary`
- `alerts`: [] (if any)
