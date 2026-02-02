"""
Modal deployment for the Comment Analyzer.

Deploy with:
    modal deploy modal_app.py

Run manually:
    modal run modal_app.py::analyze --docket-id NHTSA-2025-0491

Scheduled: Runs daily at 6am UTC automatically.
"""

import modal
import os
import json

# Create the Modal app
app = modal.App("openregulations-analyzer")

# Define the image with dependencies
image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "requests",
    "anthropic",
)


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("anthropic-key"),  # Set in Modal dashboard
        modal.Secret.from_name("regulations-key"),
    ],
    timeout=600,  # 10 minutes max
)
def analyze(docket_id: str, limit: int = 100) -> dict:
    """
    Analyze a single docket.
    
    Usage:
        modal run modal_app.py::analyze --docket-id NHTSA-2025-0491
    """
    # Import here to avoid issues with Modal serialization
    import sys
    sys.path.insert(0, "/root")
    
    from src.agents.comment_analyzer import CommentAnalyzerOrchestrator
    
    api_key = os.environ.get("REGULATIONS_API_KEY")
    orchestrator = CommentAnalyzerOrchestrator(api_key)
    
    result = orchestrator.analyze(docket_id, limit)
    
    print(f"\n{'='*60}")
    print("EXECUTIVE SUMMARY")
    print('='*60)
    print(result["executive_summary"])
    
    return result


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("anthropic-key"),
        modal.Secret.from_name("regulations-key"),
    ],
    schedule=modal.Cron("0 6 * * *"),  # Daily at 6am UTC
    timeout=1800,  # 30 minutes for batch
)
def daily_scan():
    """
    Daily job to find and analyze hot dockets.
    Runs automatically on schedule.
    """
    import requests
    from datetime import datetime, timezone
    
    api_key = os.environ.get("REGULATIONS_API_KEY")
    headers = {"X-Api-Key": api_key}
    
    # Find dockets with active comment periods and high engagement
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    response = requests.get(
        "https://api.regulations.gov/v4/documents",
        headers=headers,
        params={
            "filter[commentEndDate][ge]": today,
            "page[size]": 25,
            "sort": "-postedDate",
        }
    )
    
    if response.status_code != 200:
        print(f"Error fetching documents: {response.status_code}")
        return
    
    documents = response.json().get("data", [])
    
    # Get comment counts for each docket
    hot_dockets = []
    seen_dockets = set()
    
    for doc in documents:
        docket_id = doc.get("attributes", {}).get("docketId")
        if not docket_id or docket_id in seen_dockets:
            continue
        seen_dockets.add(docket_id)
        
        # Get comment count
        resp = requests.get(
            "https://api.regulations.gov/v4/comments",
            headers=headers,
            params={"filter[docketId]": docket_id, "page[size]": 5}
        )
        
        if resp.status_code == 200:
            count = resp.json().get("meta", {}).get("totalElements", 0)
            if count >= 100:  # Only analyze dockets with 100+ comments
                hot_dockets.append({"docket_id": docket_id, "comment_count": count})
    
    print(f"Found {len(hot_dockets)} hot dockets")
    
    # Analyze top 3 by comment count
    hot_dockets.sort(key=lambda x: -x["comment_count"])
    
    results = []
    for docket in hot_dockets[:3]:
        print(f"\nAnalyzing {docket['docket_id']} ({docket['comment_count']} comments)...")
        result = analyze.remote(docket["docket_id"], limit=100)
        results.append(result)
    
    return results


@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("anthropic-key"),
        modal.Secret.from_name("regulations-key"),
    ],
)
@modal.web_endpoint(method="POST")
def analyze_endpoint(item: dict):
    """
    Web API endpoint for on-demand analysis.
    
    POST /analyze_endpoint
    {"docket_id": "NHTSA-2025-0491", "limit": 50}
    """
    docket_id = item.get("docket_id")
    limit = item.get("limit", 100)
    
    if not docket_id:
        return {"error": "docket_id required"}
    
    result = analyze.remote(docket_id, limit)
    return result


@app.local_entrypoint()
def main(docket_id: str = "NHTSA-2025-0491", limit: int = 100):
    """
    Local entrypoint for testing.
    
    modal run modal_app.py --docket-id NHTSA-2025-0491 --limit 50
    """
    result = analyze.remote(docket_id, limit)
    
    # Save locally
    with open(f"analysis-{docket_id}.json", "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"\nSaved to analysis-{docket_id}.json")
