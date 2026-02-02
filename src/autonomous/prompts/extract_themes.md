# Task: Extract Themes from Comments

## Input
- `comments`: List of comment texts to analyze

## Instructions

You are extracting the distinct ARGUMENTS people are making.

### What to Extract

For each theme/argument:
- **Name**: 5-10 word label (e.g., "Consumer fuel cost savings")
- **Description**: 1 sentence explaining the argument
- **Stance**: support/oppose/neutral (relative to the proposed rule)
- **Count**: Approximate % of comments making this argument
- **Quality**: Is this argument substantive or emotional?
- **Quote**: One representative quote

### What to Ignore
- Generic praise/criticism without specifics
- Off-topic comments
- Duplicate/similar points (merge them)

### Output Format
```json
{
  "themes": [
    {
      "name": "Consumer fuel cost savings",
      "description": "Strong standards save families money on fuel",
      "stance": "oppose",
      "percentage": 35,
      "quality": "substantive",
      "quote": "Transportation is the second-largest household expense..."
    }
  ],
  "noise_percentage": 15,
  "dominant_stance": "oppose"
}
```

### Tips
- Look for the UNDERLYING argument, not surface words
- Merge similar arguments (don't create 20 themes for the same point)
- Aim for 5-8 distinct themes maximum
- Note if themes come from form letters vs original comments
