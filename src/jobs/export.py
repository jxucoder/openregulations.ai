"""
Export Job: Dump comments from Supabase → JSON files for Claude Code analysis.

This creates flat files that Claude Code can read directly in GitHub Actions,
eliminating the need for the agent to have database credentials.

Run:
    python -m src.jobs.export --docket-id NHTSA-2025-0491
    python -m src.jobs.export --all
"""

import json
import os
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv

load_dotenv()

from src.db import get_client, Comment, Docket

DATA_DIR = Path(__file__).parent.parent.parent / "data" / "comments"


def detect_form_letters(comments: List[Comment], threshold: int = 5) -> Dict:
    """
    Local form letter detection (no LLM needed).
    Groups near-identical comments by normalized text prefix.
    """
    def normalize(text: str) -> str:
        if not text:
            return ""
        return " ".join(text.lower().split())[:500]

    groups = defaultdict(list)
    for c in comments:
        key = normalize(c.text)
        if key:
            groups[key].append(c)

    campaigns = []
    unique = []

    for key, group in groups.items():
        if len(group) >= threshold:
            campaigns.append({
                "id": f"campaign_{len(campaigns) + 1}",
                "template_snippet": group[0].text[:300] if group[0].text else "",
                "count": len(group),
                "comment_ids": [c.id for c in group],
            })
        else:
            unique.extend(group)

    campaigns.sort(key=lambda x: -x["count"])

    return {"campaigns": campaigns, "unique_comments": unique}


def export_docket(docket_id: str, max_comments: int = 5000) -> Path:
    """
    Export a single docket's comments to a JSON file.

    The file contains everything Claude Code needs to analyze:
    docket metadata, form letter stats, unique comments, and campaigns.
    """
    db = get_client()

    docket = db.get_docket(docket_id)
    comments = db.get_comments(docket_id, limit=max_comments)

    if not comments:
        print(f"[EXPORT] No comments for {docket_id}, skipping")
        return None

    form_result = detect_form_letters(comments)
    unique = form_result["unique_comments"]
    campaigns = form_result["campaigns"]
    form_letter_count = len(comments) - len(unique)

    def serialize_comment(c: Comment) -> dict:
        return {
            "id": c.id,
            "text": c.text,
            "author": c.author,
            "organization": c.organization,
            "state": c.state,
            "posted_date": c.posted_date.isoformat() if c.posted_date else None,
        }

    export_data = {
        "docket_id": docket_id,
        "docket_title": docket.title if docket else docket_id,
        "agency": docket.agency if docket else None,
        "comment_end_date": docket.comment_end_date.isoformat() if docket and docket.comment_end_date else None,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "total_comments": len(comments),
            "unique_comments": len(unique),
            "form_letter_count": form_letter_count,
            "form_letter_percentage": round(form_letter_count / len(comments) * 100, 1) if comments else 0,
            "campaign_count": len(campaigns),
        },
        "campaigns": [
            {k: v for k, v in c.items() if k != "comment_ids"}
            for c in campaigns
        ],
        "comments": [serialize_comment(c) for c in unique],
    }

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    output_path = DATA_DIR / f"{docket_id}.json"

    with open(output_path, "w") as f:
        json.dump(export_data, f, indent=2, default=str)

    print(f"[EXPORT] {docket_id}: {len(unique)} unique comments → {output_path}")
    return output_path


def export_all(max_dockets: int = 10, max_comments: int = 5000) -> List[Path]:
    """Export all dockets that have comments."""
    db = get_client()

    result = db.client.table("dockets").select("id, total_comments_at_sync").order(
        "total_comments_at_sync", desc=True
    ).limit(max_dockets).execute()

    paths = []
    for row in result.data:
        docket_id = row["id"]
        path = export_docket(docket_id, max_comments)
        if path:
            paths.append(path)

    print(f"[EXPORT] Exported {len(paths)} dockets to {DATA_DIR}")
    return paths


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Export comments to JSON for Claude Code")
    parser.add_argument("--docket-id", help="Export specific docket")
    parser.add_argument("--all", action="store_true", help="Export all dockets")
    parser.add_argument("--max-dockets", type=int, default=10)
    parser.add_argument("--max-comments", type=int, default=5000)
    args = parser.parse_args()

    if args.docket_id:
        export_docket(args.docket_id, args.max_comments)
    elif args.all:
        export_all(args.max_dockets, args.max_comments)
    else:
        print("Specify --docket-id or --all")
