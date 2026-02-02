# Task: Daily Scan

## Instructions

Run a daily scan to find interesting regulatory activity.

### Step 1: Find Active Dockets
Query Regulations.gov for dockets with:
- Open comment period (ends in future)
- Posted in last 7 days

### Step 2: Check Comment Velocity
For each docket, get comment count and calculate velocity:
- Compare to yesterday's count (from database)
- Flag if >500 new comments in 24h

### Step 3: Prioritize
Rank dockets by:
1. Comment velocity (trending)
2. Total comments (engagement)
3. Days until deadline (urgency)

### Step 4: Analyze Top 3
Run full analysis on top 3 dockets that haven't been analyzed in 24h.

### Step 5: Generate Daily Report
Create a summary:
```
## Daily Regulatory Scan - {date}

### Trending Dockets
1. {docket_id} - {velocity} new comments, {total} total
   - Topic: {title}
   - Deadline: {days} days
   
### New High-Engagement Dockets
...

### Alerts
- {any alerts from analyses}
```

### Step 6: Save & Notify
- Save scan results to database
- Send daily digest via configured channels
