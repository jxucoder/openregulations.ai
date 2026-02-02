"""
Report Job: Generate daily summary report

Reads from DB, generates a summary of activity.

Run:
    python -m src.jobs.report
"""

import os
from datetime import datetime, timezone, timedelta
from typing import Dict, List

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from src.db import get_client


def generate_daily_report() -> Dict:
    """
    Generate a daily report of regulatory activity.
    
    Returns:
        Report dict with summary stats
    """
    db = get_client()
    today = datetime.now(timezone.utc).date()
    
    print(f"[REPORT] Generating daily report for {today}")
    
    # 1. Get active dockets (comment period open)
    active_dockets = db.client.table("dockets").select(
        "id, title, agency, total_comments_at_sync, comment_end_date"
    ).gte("comment_end_date", today.isoformat()).execute()
    
    # 2. Get recently analyzed dockets
    recent_analyses = db.client.table("analyses").select(
        "docket_id, total_comments, sentiment, analyzed_at"
    ).gte("analyzed_at", (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()).execute()
    
    # 3. Get sync stats from last 24h
    sync_logs = db.client.table("sync_log").select(
        "job_type, records_created, status"
    ).gte("started_at", (datetime.now(timezone.utc) - timedelta(days=1)).isoformat()).execute()
    
    # 4. Compute stats
    total_active = len(active_dockets.data)
    total_comments = sum(d.get("total_comments_at_sync", 0) or 0 for d in active_dockets.data)
    
    new_comments_24h = sum(
        s.get("records_created", 0) or 0 
        for s in sync_logs.data 
        if s.get("job_type") == "sync_docket"
    )
    
    # 5. Find trending (most comments)
    trending = sorted(
        active_dockets.data,
        key=lambda x: x.get("total_comments_at_sync", 0) or 0,
        reverse=True
    )[:5]
    
    # 6. Find approaching deadlines
    approaching = [
        d for d in active_dockets.data
        if d.get("comment_end_date") and 
        (datetime.fromisoformat(d["comment_end_date"]).date() - today).days <= 7
    ]
    approaching.sort(key=lambda x: x["comment_end_date"])
    
    # 7. Build report
    report = {
        "date": today.isoformat(),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        
        "summary": {
            "active_dockets": total_active,
            "total_comments": total_comments,
            "new_comments_24h": new_comments_24h,
            "analyses_run_24h": len(recent_analyses.data),
        },
        
        "trending": [
            {
                "id": d["id"],
                "title": d["title"],
                "agency": d["agency"],
                "comments": d.get("total_comments_at_sync", 0)
            }
            for d in trending
        ],
        
        "approaching_deadlines": [
            {
                "id": d["id"],
                "title": d["title"],
                "deadline": d["comment_end_date"],
                "days_remaining": (datetime.fromisoformat(d["comment_end_date"]).date() - today).days
            }
            for d in approaching[:5]
        ],
        
        "recent_analyses": [
            {
                "docket_id": a["docket_id"],
                "total_comments": a["total_comments"],
                "sentiment": a.get("sentiment", {}),
                "analyzed_at": a["analyzed_at"]
            }
            for a in recent_analyses.data
        ]
    }
    
    print(f"[REPORT] Generated report:")
    print(f"  Active dockets: {report['summary']['active_dockets']}")
    print(f"  Total comments: {report['summary']['total_comments']}")
    print(f"  New in 24h: {report['summary']['new_comments_24h']}")
    
    return report


def print_report(report: Dict):
    """Pretty print a report."""
    print("\n" + "=" * 60)
    print(f"DAILY REGULATORY REPORT - {report['date']}")
    print("=" * 60)
    
    s = report["summary"]
    print(f"\n📊 Summary")
    print(f"   Active dockets: {s['active_dockets']}")
    print(f"   Total comments: {s['total_comments']:,}")
    print(f"   New comments (24h): {s['new_comments_24h']:,}")
    print(f"   Analyses run: {s['analyses_run_24h']}")
    
    print(f"\n🔥 Trending Dockets")
    for d in report["trending"]:
        print(f"   • {d['id']}: {d['comments']:,} comments")
        print(f"     {d['title'][:50]}...")
    
    print(f"\n⏰ Approaching Deadlines")
    for d in report["approaching_deadlines"]:
        print(f"   • {d['id']}: {d['days_remaining']} days left")
        print(f"     {d['title'][:50]}...")
    
    print("\n" + "=" * 60)


# CLI
if __name__ == "__main__":
    report = generate_daily_report()
    print_report(report)
