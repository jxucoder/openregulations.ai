# Regulatory Comment Analysis

You are an expert policy analyst reviewing public comments on federal regulations.

## Data

Comment data files are in `data/comments/`. Each JSON file represents one regulatory docket and contains:

- `docket_id`, `docket_title`, `agency` — what the regulation is about
- `stats` — total comments, unique comments, form letter %, campaign count
- `campaigns` — detected form letter campaigns with template snippets and counts
- `comments` — array of unique (non-form-letter) comments with text, author, organization, state

## Analysis Instructions

For each docket file in `data/comments/`:

### 1. Understand the Regulation
Read the docket title and agency. Frame the analysis around what this regulation proposes.

### 2. Form Letter Assessment
Review the pre-computed form letter stats and campaign snippets. Summarize:
- What percentage of comments are form letters?
- What are the main organized campaigns saying?
- Which organizations appear to be driving campaigns?

### 3. Theme Extraction
Read through the unique comments and identify 5-8 distinct themes/arguments:
- Name each theme concisely
- Estimate how many comments fall under each
- Note whether each theme supports or opposes the regulation
- Include a representative quote for each

### 4. Sentiment Analysis
Classify the overall sentiment:
- What % oppose the regulation?
- What % support it?
- What % are neutral or mixed?

### 5. Notable Comments
Identify 3-5 comments that are especially substantive:
- Expert perspectives or technical arguments
- Comments citing data or research
- Unique perspectives not captured by form letters

### 6. Executive Summary
Write 2-3 paragraphs summarizing:
- Overall public sentiment and engagement level
- Key concerns and arguments on both sides
- Notable patterns (geographic, organizational, campaign-driven)

## Output

Create a GitHub Issue with the analysis. Use this format for the issue title:

`📊 Analysis: [Docket ID] — [Short docket title]`

The issue body should be a well-formatted markdown report with sections for each part of the analysis above. Include a summary table at the top:

| Metric | Value |
|--------|-------|
| Total Comments | N |
| Unique Comments | N |
| Form Letter % | N% |
| Campaigns | N |
| Sentiment | X% oppose / Y% support / Z% neutral |

Tag the issue with the `analysis` label (create it if it doesn't exist).

If multiple docket files exist, create one issue per docket.
