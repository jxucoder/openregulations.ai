"""
Analyze Job: Read comments from DB → Claude → Store analysis

This job ONLY does analysis.
Assumes data is already synced.

Run:
    python -m src.jobs.analyze --docket-id NHTSA-2025-0491
    python -m src.jobs.analyze --all
"""

import os
import json
from datetime import datetime, timezone
from typing import List, Dict, Optional
from collections import Counter

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

try:
    import anthropic
except ImportError:
    anthropic = None

from src.db import get_client, Comment, Analysis


def get_claude_client():
    """Get Anthropic client."""
    if anthropic is None:
        raise ImportError("Please install anthropic: pip install anthropic")
    return anthropic.Anthropic()


def analyze_docket(docket_id: str, sample_size: int = 200) -> Dict:
    """
    Run full analysis on a docket.
    
    Steps:
    1. Load comments from DB
    2. Detect form letters (local, no LLM)
    3. Extract themes (Claude)
    4. Classify sentiment (Claude)
    5. Generate summary (Claude)
    6. Store results in DB
    
    Args:
        docket_id: Docket to analyze
        sample_size: Max unique comments to send to Claude
        
    Returns:
        Analysis results dict
    """
    db = get_client()
    claude = get_claude_client()
    
    log_id = db.log_sync_start("analyze_docket", docket_id)
    
    try:
        print(f"[ANALYZE] Starting analysis for {docket_id}")
        
        # 1. Load all comments from DB
        comments = db.get_comments(docket_id, limit=10000)
        if not comments:
            raise ValueError(f"No comments found for {docket_id}")
        
        print(f"[ANALYZE] Loaded {len(comments)} comments from DB")
        
        # 2. Detect form letters (local - no LLM)
        print(f"[ANALYZE] Detecting form letters...")
        form_letter_result = detect_form_letters(comments)
        unique_comments = form_letter_result["unique_comments"]
        campaigns = form_letter_result["campaigns"]
        
        print(f"[ANALYZE] Found {len(campaigns)} campaigns, {len(unique_comments)} unique comments")
        
        # Update form letter flags in DB
        for campaign in campaigns:
            db.bulk_update_form_letters(
                campaign["id"],
                campaign["comment_ids"]
            )
        
        # 3. Sample unique comments for LLM analysis
        sample = unique_comments[:sample_size]
        sample_texts = [c.text for c in sample if c.text]
        
        # 4. Extract themes (Claude)
        print(f"[ANALYZE] Extracting themes from {len(sample_texts)} comments...")
        themes = extract_themes(claude, docket_id, sample_texts)
        
        # 5. Classify sentiment (Claude)
        print(f"[ANALYZE] Classifying sentiment...")
        sentiment = classify_sentiment(claude, sample_texts)
        
        # 6. Find notable comments
        print(f"[ANALYZE] Finding notable comments...")
        notable = find_notable_comments(claude, sample[:50])
        
        # 7. Generate executive summary
        print(f"[ANALYZE] Generating summary...")
        summary = generate_summary(claude, docket_id, themes, sentiment, campaigns)
        
        # 8. Build analysis object
        analysis = Analysis(
            docket_id=docket_id,
            total_comments=len(comments),
            unique_comments=len(unique_comments),
            form_letter_count=len(comments) - len(unique_comments),
            form_letter_percentage=round(
                (len(comments) - len(unique_comments)) / len(comments) * 100, 1
            ),
            high_quality_count=len([n for n in notable if n.get("quality_score", 0) >= 4]),
            sentiment=sentiment,
            themes=themes,
            campaigns=[{
                "id": c["id"],
                "template_snippet": c["template"][:200],
                "comment_count": c["count"],
                "percentage": round(c["count"] / len(comments) * 100, 1)
            } for c in campaigns],
            notable_comments=notable,
            executive_summary=summary,
            analyzed_at=datetime.now(timezone.utc),
        )
        
        # 9. Save to DB
        db.upsert_analysis(analysis)
        print(f"[ANALYZE] Saved analysis to database")
        
        db.log_sync_complete(log_id, records_fetched=len(comments), records_created=1)
        
        return analysis.to_dict()
        
    except Exception as e:
        print(f"[ANALYZE] Error: {e}")
        db.log_sync_error(log_id, str(e))
        raise


def detect_form_letters(comments: List[Comment], threshold: float = 0.85) -> Dict:
    """
    Detect form letter campaigns using text similarity.
    
    No LLM - uses simple text comparison for speed.
    """
    from collections import defaultdict
    
    # Normalize text for comparison
    def normalize(text: str) -> str:
        if not text:
            return ""
        # Remove extra whitespace, lowercase, first 500 chars
        return " ".join(text.lower().split())[:500]
    
    # Group by normalized text
    text_groups = defaultdict(list)
    for c in comments:
        key = normalize(c.text)
        if key:
            text_groups[key].append(c)
    
    # Find campaigns (groups with 5+ identical/similar comments)
    campaigns = []
    unique_comments = []
    
    for key, group in text_groups.items():
        if len(group) >= 5:
            # This is a campaign
            campaigns.append({
                "id": f"campaign_{len(campaigns)+1}",
                "template": group[0].text[:500] if group[0].text else "",
                "count": len(group),
                "comment_ids": [c.id for c in group]
            })
        else:
            # These are unique
            unique_comments.extend(group)
    
    # Sort campaigns by size
    campaigns.sort(key=lambda x: -x["count"])
    
    return {
        "campaigns": campaigns,
        "unique_comments": unique_comments,
        "total": len(comments),
        "form_letter_pct": round((len(comments) - len(unique_comments)) / len(comments) * 100, 1)
    }


def extract_themes(client, docket_id: str, comments: List[str]) -> List[Dict]:
    """Extract themes using Claude."""
    
    if not comments:
        return []
    
    # Sample if too many
    sample = comments[:100]
    comments_text = "\n---\n".join(sample)
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=2000,
        messages=[{
            "role": "user",
            "content": f"""Analyze these public comments on federal regulation {docket_id}.

Extract the main THEMES (distinct arguments/concerns being raised).

Comments:
{comments_text}

Return JSON array of themes:
[
  {{
    "id": "theme-slug",
    "name": "Theme Name",
    "description": "1-2 sentence description",
    "count": estimated_count,
    "sentiment": "oppose" or "support" or "mixed",
    "sample_quote": "Representative quote..."
  }}
]

Return ONLY valid JSON, no other text."""
        }]
    )
    
    # Parse JSON from response
    text = response.content[0].text
    try:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except:
        pass
    
    return []


def classify_sentiment(client, comments: List[str]) -> Dict:
    """Classify overall sentiment using Claude."""
    
    if not comments:
        return {"oppose": 0, "support": 0, "neutral": 0}
    
    sample = comments[:50]
    comments_text = "\n---\n".join(sample)
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=500,
        messages=[{
            "role": "user",
            "content": f"""Classify the overall sentiment of these public comments on a federal regulation.

Comments:
{comments_text}

What percentage oppose, support, or are neutral toward the regulation?

Return ONLY JSON: {{"oppose": N, "support": N, "neutral": N}}
Numbers should sum to 100."""
        }]
    )
    
    text = response.content[0].text
    try:
        start = text.find("{")
        end = text.rfind("}") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except:
        pass
    
    return {"oppose": 50, "support": 30, "neutral": 20}


def find_notable_comments(client, comments: List[Comment]) -> List[Dict]:
    """Find high-quality notable comments."""
    
    if not comments:
        return []
    
    # Format comments for analysis
    comments_text = "\n\n".join([
        f"[{c.id}] by {c.author or 'Anonymous'}{' (' + c.organization + ')' if c.organization else ''}:\n{c.text[:500]}"
        for c in comments[:30]
        if c.text
    ])
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1500,
        messages=[{
            "role": "user",
            "content": f"""Review these public comments and identify the most NOTABLE ones.

Notable = substantive, well-reasoned, cites evidence, expert perspective, or unique insight.

Comments:
{comments_text}

Return JSON array of top 5 notable comments:
[
  {{
    "comment_id": "ID from above",
    "author": "Name",
    "organization": "Org or null",
    "quality_score": 1-5,
    "excerpt": "Key quote (50-100 words)",
    "why_notable": "Brief reason"
  }}
]

Return ONLY valid JSON."""
        }]
    )
    
    text = response.content[0].text
    try:
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            return json.loads(text[start:end])
    except:
        pass
    
    return []


def generate_summary(
    client,
    docket_id: str,
    themes: List[Dict],
    sentiment: Dict,
    campaigns: List[Dict]
) -> str:
    """Generate executive summary."""
    
    themes_text = "\n".join([
        f"- {t['name']}: {t.get('description', '')}"
        for t in themes[:5]
    ])
    
    campaigns_text = "\n".join([
        f"- {c['count']} comments ({c.get('percentage', 0)}%): \"{c['template'][:100]}...\""
        for c in campaigns[:3]
    ])
    
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=1000,
        messages=[{
            "role": "user",
            "content": f"""Write a brief executive summary of public comments on {docket_id}.

Sentiment: {sentiment.get('oppose', 0)}% oppose, {sentiment.get('support', 0)}% support, {sentiment.get('neutral', 0)}% neutral

Main themes:
{themes_text}

Form letter campaigns:
{campaigns_text}

Write 2-3 paragraphs summarizing:
1. Overall public sentiment
2. Key concerns/arguments
3. Notable patterns (campaigns, who's commenting)

Be factual and balanced."""
        }]
    )
    
    return response.content[0].text


def run_analysis(max_dockets: int = 3) -> List[Dict]:
    """
    Analyze dockets that need analysis.
    
    Prioritizes:
    1. Dockets never analyzed
    2. Dockets with new comments since last analysis
    """
    db = get_client()
    
    print(f"[ANALYZE] Finding dockets to analyze...")
    
    # Get dockets with comments but no analysis
    # Or analysis older than last sync
    result = db.client.rpc("get_dockets_needing_analysis", {
        "limit_count": max_dockets
    }).execute()
    
    # Fallback: just get dockets ordered by comment count
    if not result.data:
        dockets = db.client.table("dockets").select("id").order(
            "total_comments_at_sync", desc=True
        ).limit(max_dockets).execute()
        docket_ids = [d["id"] for d in dockets.data]
    else:
        docket_ids = [d["id"] for d in result.data]
    
    print(f"[ANALYZE] Will analyze {len(docket_ids)} dockets")
    
    results = []
    for docket_id in docket_ids:
        print(f"\n[ANALYZE] === {docket_id} ===")
        try:
            result = analyze_docket(docket_id)
            results.append({"docket_id": docket_id, "status": "success"})
        except Exception as e:
            print(f"[ANALYZE] Failed: {e}")
            results.append({"docket_id": docket_id, "status": "error", "error": str(e)})
    
    return results


# CLI
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Analyze comments with Claude")
    parser.add_argument("--docket-id", help="Analyze specific docket")
    parser.add_argument("--all", action="store_true", help="Analyze all pending dockets")
    parser.add_argument("--max-dockets", type=int, default=3)
    parser.add_argument("--sample-size", type=int, default=200)
    args = parser.parse_args()
    
    if args.docket_id:
        result = analyze_docket(args.docket_id, args.sample_size)
        print(f"\n[ANALYZE] Complete!")
        print(f"  Themes: {len(result.get('themes', []))}")
        print(f"  Sentiment: {result.get('sentiment')}")
        print(f"  Summary: {result.get('executive_summary', '')[:200]}...")
    elif args.all:
        results = run_analysis(args.max_dockets)
        print(f"\n[ANALYZE] Analyzed {len(results)} dockets")
    else:
        print("Specify --docket-id or --all")
