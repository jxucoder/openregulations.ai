"""
Sync Job: Fetch data from Regulations.gov → Supabase

This job ONLY fetches and stores raw data.
No analysis, no embeddings, no Claude calls.

Run:
    python -m src.jobs.sync
    python -m src.jobs.sync --docket-id NHTSA-2025-0491
"""

import os
import time
import requests
from datetime import datetime, timezone
from typing import List, Optional, Set, Dict

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

from src.db import get_client, Docket, Comment


class RegulationsGovAPI:
    """Client for Regulations.gov API with rate limiting."""
    
    BASE_URL = "https://api.regulations.gov/v4"
    RATE_LIMIT_DELAY = 0.4  # 400ms between requests
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.environ.get("REGULATIONS_API_KEY")
        if not self.api_key:
            raise ValueError("REGULATIONS_API_KEY not set")
        
        self.headers = {"X-Api-Key": self.api_key}
        self._last_request = 0
    
    def _rate_limit(self):
        """Ensure we don't exceed rate limits."""
        elapsed = time.time() - self._last_request
        if elapsed < self.RATE_LIMIT_DELAY:
            time.sleep(self.RATE_LIMIT_DELAY - elapsed)
        self._last_request = time.time()
    
    def get_active_dockets(self, limit: int = 25) -> List[dict]:
        """Get dockets with open comment periods."""
        self._rate_limit()
        
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        response = requests.get(
            f"{self.BASE_URL}/documents",
            headers=self.headers,
            params={
                "filter[commentEndDate][ge]": today,
                "filter[documentType]": "Proposed Rule",
                "page[size]": limit,
                "sort": "-postedDate"
            }
        )
        response.raise_for_status()
        return response.json().get("data", [])
    
    def get_docket(self, docket_id: str) -> Optional[dict]:
        """Get docket details."""
        self._rate_limit()
        
        response = requests.get(
            f"{self.BASE_URL}/dockets/{docket_id}",
            headers=self.headers
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json().get("data")
    
    def get_comment_ids(self, docket_id: str, limit: int = 10000) -> List[str]:
        """Get list of comment IDs for a docket (fast, no content)."""
        comment_ids = []
        page = 1
        
        while len(comment_ids) < limit:
            self._rate_limit()
            
            response = requests.get(
                f"{self.BASE_URL}/comments",
                headers=self.headers,
                params={
                    "filter[docketId]": docket_id,
                    "page[size]": 250,
                    "page[number]": page,
                }
            )
            
            if response.status_code != 200:
                break
            
            data = response.json().get("data", [])
            if not data:
                break
            
            comment_ids.extend([c["id"] for c in data])
            
            meta = response.json().get("meta", {})
            if not meta.get("hasNextPage", False):
                break
            
            page += 1
        
        return comment_ids[:limit]
    
    def get_comment_detail(self, comment_id: str) -> Optional[dict]:
        """Get full comment details."""
        self._rate_limit()
        
        response = requests.get(
            f"{self.BASE_URL}/comments/{comment_id}",
            headers=self.headers
        )
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return response.json().get("data")
    
    def get_total_comments(self, docket_id: str) -> int:
        """Get total comment count for a docket."""
        self._rate_limit()
        
        response = requests.get(
            f"{self.BASE_URL}/comments",
            headers=self.headers,
            params={
                "filter[docketId]": docket_id,
                "page[size]": 1
            }
        )
        
        if response.status_code != 200:
            return 0
        
        return response.json().get("meta", {}).get("totalElements", 0)


def sync_docket(docket_id: str, max_new_comments: int = 1000) -> Dict:
    """
    Sync a single docket. Only fetches NEW comments.
    
    Args:
        docket_id: Docket to sync
        max_new_comments: Max new comments to fetch per run
        
    Returns:
        Stats dict
    """
    api = RegulationsGovAPI()
    db = get_client()
    
    log_id = db.log_sync_start("sync_docket", docket_id)
    
    try:
        print(f"[SYNC] Starting sync for {docket_id}")
        
        # 1. Update docket metadata
        docket_data = api.get_docket(docket_id)
        if docket_data:
            docket = Docket.from_regulations_gov(docket_data)
            docket.last_synced_at = datetime.now(timezone.utc)
            docket.total_comments_at_sync = api.get_total_comments(docket_id)
            db.upsert_docket(docket)
            print(f"[SYNC] Updated docket metadata")
        
        # 2. Get all comment IDs from API
        api_ids = set(api.get_comment_ids(docket_id))
        print(f"[SYNC] Found {len(api_ids)} comments on Regulations.gov")
        
        # 3. Get IDs we already have
        result = db.client.table("comments").select("id").eq("docket_id", docket_id).execute()
        existing_ids = {row["id"] for row in result.data}
        print(f"[SYNC] Already have {len(existing_ids)} in database")
        
        # 4. Find new IDs
        new_ids = list(api_ids - existing_ids)
        print(f"[SYNC] Need to fetch {len(new_ids)} new comments")
        
        if not new_ids:
            print(f"[SYNC] Nothing new to fetch")
            db.log_sync_complete(log_id, records_fetched=0, records_created=0)
            return {
                "docket_id": docket_id,
                "status": "up_to_date",
                "total_on_api": len(api_ids),
                "in_database": len(existing_ids),
                "newly_fetched": 0
            }
        
        # 5. Fetch new comments (with limit)
        to_fetch = new_ids[:max_new_comments]
        new_comments = []
        
        for i, comment_id in enumerate(to_fetch):
            if i % 50 == 0 and i > 0:
                print(f"[SYNC] Progress: {i}/{len(to_fetch)}")
            
            detail = api.get_comment_detail(comment_id)
            if detail:
                comment = Comment.from_regulations_gov(detail, docket_id)
                new_comments.append(comment)
        
        # 6. Insert new comments
        if new_comments:
            inserted = db.upsert_comments(new_comments)
            print(f"[SYNC] Inserted {inserted} new comments")
        
        db.log_sync_complete(
            log_id,
            records_fetched=len(to_fetch),
            records_created=len(new_comments)
        )
        
        return {
            "docket_id": docket_id,
            "status": "synced",
            "total_on_api": len(api_ids),
            "in_database": len(existing_ids) + len(new_comments),
            "newly_fetched": len(new_comments),
            "remaining": len(new_ids) - len(to_fetch)
        }
        
    except Exception as e:
        print(f"[SYNC] Error: {e}")
        db.log_sync_error(log_id, str(e))
        raise


def run_sync(max_dockets: int = 10, max_comments_per_docket: int = 500) -> List[Dict]:
    """
    Sync all active dockets.
    
    Args:
        max_dockets: Max dockets to sync
        max_comments_per_docket: Max new comments per docket
        
    Returns:
        List of sync results
    """
    api = RegulationsGovAPI()
    db = get_client()
    
    log_id = db.log_sync_start("run_sync")
    
    try:
        print(f"[SYNC] Finding active dockets...")
        
        # Get active dockets
        active_docs = api.get_active_dockets(limit=50)
        
        # Extract unique docket IDs with comment counts
        seen = set()
        dockets = []
        
        for doc in active_docs:
            docket_id = doc.get("attributes", {}).get("docketId")
            if docket_id and docket_id not in seen:
                seen.add(docket_id)
                count = api.get_total_comments(docket_id)
                dockets.append((docket_id, count))
        
        # Sort by comment count (most active first)
        dockets.sort(key=lambda x: -x[1])
        dockets = dockets[:max_dockets]
        
        print(f"[SYNC] Will sync {len(dockets)} dockets")
        
        # Sync each docket
        results = []
        for docket_id, count in dockets:
            print(f"\n[SYNC] === {docket_id} ({count} comments) ===")
            try:
                result = sync_docket(docket_id, max_comments_per_docket)
                results.append(result)
            except Exception as e:
                print(f"[SYNC] Failed: {e}")
                results.append({"docket_id": docket_id, "status": "error", "error": str(e)})
        
        total_fetched = sum(r.get("newly_fetched", 0) for r in results)
        db.log_sync_complete(log_id, records_fetched=len(dockets), records_created=total_fetched)
        
        print(f"\n[SYNC] Complete. Fetched {total_fetched} new comments across {len(dockets)} dockets")
        return results
        
    except Exception as e:
        db.log_sync_error(log_id, str(e))
        raise


# CLI
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Sync from Regulations.gov")
    parser.add_argument("--docket-id", help="Sync specific docket")
    parser.add_argument("--max-dockets", type=int, default=10)
    parser.add_argument("--max-comments", type=int, default=500)
    args = parser.parse_args()
    
    if args.docket_id:
        result = sync_docket(args.docket_id, args.max_comments)
        print(f"\nResult: {result}")
    else:
        results = run_sync(args.max_dockets, args.max_comments)
        print(f"\nSynced {len(results)} dockets")
