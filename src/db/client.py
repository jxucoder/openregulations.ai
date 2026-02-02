"""
Supabase database client for OpenRegulations.ai
"""

import os
from typing import Optional, List, Dict, Any
from datetime import datetime, timezone
from dataclasses import asdict

try:
    from supabase import create_client, Client
except ImportError:
    raise ImportError("Please install supabase: pip install supabase")

from .models import Docket, Comment, Analysis, CommentEmbedding


# Singleton client instance
_client: Optional["SupabaseClient"] = None


def get_client() -> "SupabaseClient":
    """Get or create the Supabase client singleton."""
    global _client
    if _client is None:
        _client = SupabaseClient()
    return _client


class SupabaseClient:
    """
    Supabase client wrapper with typed methods for OpenRegulations data.
    """
    
    def __init__(self):
        url = os.environ.get("SUPABASE_URL")
        
        # Support both old and new key formats
        # New: SUPABASE_SECRET_KEY (sb_secret_...) or SUPABASE_PUBLISHABLE_KEY (sb_publishable_...)
        # Old: SUPABASE_SERVICE_KEY or SUPABASE_ANON_KEY
        key = (
            os.environ.get("SUPABASE_SECRET_KEY") or      # New secret key
            os.environ.get("SUPABASE_SERVICE_KEY") or     # Old service_role key
            os.environ.get("SUPABASE_PUBLISHABLE_KEY") or # New publishable key
            os.environ.get("SUPABASE_ANON_KEY")           # Old anon key
        )
        
        if not url or not key:
            raise ValueError(
                "Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_KEY)"
            )
        
        self.client: Client = create_client(url, key)
    
    # =========================================================================
    # DOCKETS
    # =========================================================================
    
    def upsert_docket(self, docket: Docket) -> Dict:
        """Insert or update a docket."""
        data = docket.to_dict()
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = self.client.table("dockets").upsert(data).execute()
        return result.data[0] if result.data else {}
    
    def upsert_dockets(self, dockets: List[Docket]) -> int:
        """Bulk upsert dockets. Returns count."""
        if not dockets:
            return 0
        
        data = [d.to_dict() for d in dockets]
        for d in data:
            d["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = self.client.table("dockets").upsert(data).execute()
        return len(result.data) if result.data else 0
    
    def get_docket(self, docket_id: str) -> Optional[Docket]:
        """Get a single docket by ID."""
        result = self.client.table("dockets").select("*").eq("id", docket_id).execute()
        if result.data:
            return Docket.from_dict(result.data[0])
        return None
    
    def get_active_dockets(self, limit: int = 50) -> List[Docket]:
        """Get dockets with open comment periods."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        result = (
            self.client.table("dockets")
            .select("*")
            .gte("comment_end_date", today)
            .order("comment_end_date")
            .limit(limit)
            .execute()
        )
        
        return [Docket.from_dict(d) for d in result.data]
    
    def get_dockets_needing_sync(self, hours_since: int = 24) -> List[Docket]:
        """Get dockets that haven't been synced recently."""
        cutoff = datetime.now(timezone.utc).replace(
            hour=datetime.now(timezone.utc).hour - hours_since
        )
        
        result = (
            self.client.table("dockets")
            .select("*")
            .or_(f"last_synced_at.is.null,last_synced_at.lt.{cutoff.isoformat()}")
            .execute()
        )
        
        return [Docket.from_dict(d) for d in result.data]
    
    # =========================================================================
    # COMMENTS
    # =========================================================================
    
    def upsert_comments(self, comments: List[Comment]) -> int:
        """Bulk upsert comments. Returns count."""
        if not comments:
            return 0
        
        data = [c.to_dict() for c in comments]
        result = self.client.table("comments").upsert(data).execute()
        return len(result.data) if result.data else 0
    
    def get_comments(
        self,
        docket_id: str,
        limit: int = 100,
        offset: int = 0,
        exclude_form_letters: bool = False
    ) -> List[Comment]:
        """Get comments for a docket."""
        query = (
            self.client.table("comments")
            .select("*")
            .eq("docket_id", docket_id)
        )
        
        if exclude_form_letters:
            query = query.eq("is_form_letter", False)
        
        result = query.order("posted_date", desc=True).range(offset, offset + limit - 1).execute()
        return [Comment.from_dict(c) for c in result.data]
    
    def get_comment_count(self, docket_id: str) -> int:
        """Get total comment count for a docket."""
        result = (
            self.client.table("comments")
            .select("id", count="exact")
            .eq("docket_id", docket_id)
            .execute()
        )
        return result.count or 0
    
    def get_comments_since(self, docket_id: str, since: datetime) -> List[Comment]:
        """Get comments posted after a certain date."""
        result = (
            self.client.table("comments")
            .select("*")
            .eq("docket_id", docket_id)
            .gt("fetched_at", since.isoformat())
            .execute()
        )
        return [Comment.from_dict(c) for c in result.data]
    
    def update_comment_classification(
        self,
        comment_id: str,
        is_form_letter: Optional[bool] = None,
        sentiment: Optional[str] = None,
        quality_score: Optional[int] = None,
        form_letter_cluster_id: Optional[str] = None
    ) -> bool:
        """Update classification fields on a comment."""
        updates = {}
        if is_form_letter is not None:
            updates["is_form_letter"] = is_form_letter
        if sentiment is not None:
            updates["sentiment"] = sentiment
        if quality_score is not None:
            updates["quality_score"] = quality_score
        if form_letter_cluster_id is not None:
            updates["form_letter_cluster_id"] = form_letter_cluster_id
        
        if not updates:
            return False
        
        result = self.client.table("comments").update(updates).eq("id", comment_id).execute()
        return len(result.data) > 0
    
    def bulk_update_form_letters(self, cluster_id: str, comment_ids: List[str]) -> int:
        """Mark multiple comments as form letters."""
        if not comment_ids:
            return 0
        
        result = (
            self.client.table("comments")
            .update({
                "is_form_letter": True,
                "form_letter_cluster_id": cluster_id
            })
            .in_("id", comment_ids)
            .execute()
        )
        return len(result.data) if result.data else 0
    
    # =========================================================================
    # EMBEDDINGS
    # =========================================================================
    
    def upsert_embeddings(self, embeddings: List[CommentEmbedding]) -> int:
        """Bulk upsert comment embeddings."""
        if not embeddings:
            return 0
        
        data = [e.to_dict() for e in embeddings]
        result = self.client.table("comment_embeddings").upsert(data).execute()
        return len(result.data) if result.data else 0
    
    def semantic_search(
        self,
        query_embedding: List[float],
        docket_id: Optional[str] = None,
        threshold: float = 0.7,
        limit: int = 10
    ) -> List[Dict]:
        """
        Search for similar comments using vector similarity.
        
        Returns list of dicts with: comment_id, comment_text, author, sentiment, similarity
        """
        result = self.client.rpc(
            "match_comments",
            {
                "query_embedding": query_embedding,
                "match_threshold": threshold,
                "match_count": limit,
                "filter_docket_id": docket_id
            }
        ).execute()
        
        return result.data or []
    
    def get_comments_without_embeddings(
        self,
        docket_id: str,
        limit: int = 100
    ) -> List[Comment]:
        """Get comments that don't have embeddings yet."""
        # Get all comment IDs for docket
        comments_result = (
            self.client.table("comments")
            .select("id")
            .eq("docket_id", docket_id)
            .eq("is_form_letter", False)
            .execute()
        )
        
        if not comments_result.data:
            return []
        
        comment_ids = [c["id"] for c in comments_result.data]
        
        # Get IDs that already have embeddings
        embeddings_result = (
            self.client.table("comment_embeddings")
            .select("comment_id")
            .in_("comment_id", comment_ids)
            .execute()
        )
        
        embedded_ids = {e["comment_id"] for e in embeddings_result.data}
        missing_ids = [cid for cid in comment_ids if cid not in embedded_ids][:limit]
        
        if not missing_ids:
            return []
        
        # Fetch full comments
        result = self.client.table("comments").select("*").in_("id", missing_ids).execute()
        return [Comment.from_dict(c) for c in result.data]
    
    # =========================================================================
    # ANALYSES
    # =========================================================================
    
    def upsert_analysis(self, analysis: Analysis) -> Dict:
        """Insert or update analysis for a docket."""
        data = analysis.to_dict()
        data["updated_at"] = datetime.now(timezone.utc).isoformat()
        
        result = self.client.table("analyses").upsert(data).execute()
        return result.data[0] if result.data else {}
    
    def get_analysis(self, docket_id: str) -> Optional[Analysis]:
        """Get analysis for a docket."""
        result = (
            self.client.table("analyses")
            .select("*")
            .eq("docket_id", docket_id)
            .execute()
        )
        
        if result.data:
            return Analysis.from_dict(result.data[0])
        return None
    
    def get_all_analyses(self, limit: int = 50) -> List[Analysis]:
        """Get all analyses, most recent first."""
        result = (
            self.client.table("analyses")
            .select("*")
            .order("analyzed_at", desc=True)
            .limit(limit)
            .execute()
        )
        
        return [Analysis.from_dict(a) for a in result.data]
    
    # =========================================================================
    # SYNC LOG
    # =========================================================================
    
    def log_sync_start(self, job_type: str, docket_id: Optional[str] = None) -> int:
        """Log the start of a sync job. Returns the log ID."""
        result = self.client.table("sync_log").insert({
            "job_type": job_type,
            "docket_id": docket_id,
            "status": "started",
            "started_at": datetime.now(timezone.utc).isoformat()
        }).execute()
        
        return result.data[0]["id"] if result.data else 0
    
    def log_sync_complete(
        self,
        log_id: int,
        records_fetched: int = 0,
        records_created: int = 0,
        records_updated: int = 0
    ):
        """Log successful completion of a sync job."""
        started = self.client.table("sync_log").select("started_at").eq("id", log_id).execute()
        started_at = datetime.fromisoformat(started.data[0]["started_at"].replace("Z", "+00:00"))
        duration = int((datetime.now(timezone.utc) - started_at).total_seconds() * 1000)
        
        self.client.table("sync_log").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "duration_ms": duration,
            "records_fetched": records_fetched,
            "records_created": records_created,
            "records_updated": records_updated
        }).eq("id", log_id).execute()
    
    def log_sync_error(self, log_id: int, error_message: str, error_details: Dict = None):
        """Log a failed sync job."""
        self.client.table("sync_log").update({
            "status": "failed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "error_message": error_message,
            "error_details": error_details
        }).eq("id", log_id).execute()
    
    # =========================================================================
    # UTILITIES
    # =========================================================================
    
    def text_search(
        self,
        query: str,
        docket_id: Optional[str] = None,
        limit: int = 20
    ) -> List[Comment]:
        """Full-text search on comment text."""
        sql = f"""
            SELECT * FROM comments
            WHERE to_tsvector('english', coalesce(text, '')) @@ plainto_tsquery('english', '{query}')
            {"AND docket_id = '" + docket_id + "'" if docket_id else ""}
            ORDER BY ts_rank(to_tsvector('english', text), plainto_tsquery('english', '{query}')) DESC
            LIMIT {limit}
        """
        
        # Use RPC for raw SQL (need to create function first)
        # For now, fall back to simple LIKE search
        query_filter = f"%{query}%"
        
        q = self.client.table("comments").select("*").ilike("text", query_filter)
        if docket_id:
            q = q.eq("docket_id", docket_id)
        
        result = q.limit(limit).execute()
        return [Comment.from_dict(c) for c in result.data]
    
    def get_stats(self) -> Dict:
        """Get database statistics."""
        dockets = self.client.table("dockets").select("id", count="exact").execute()
        comments = self.client.table("comments").select("id", count="exact").execute()
        analyses = self.client.table("analyses").select("docket_id", count="exact").execute()
        embeddings = self.client.table("comment_embeddings").select("comment_id", count="exact").execute()
        
        return {
            "dockets": dockets.count or 0,
            "comments": comments.count or 0,
            "analyses": analyses.count or 0,
            "embeddings": embeddings.count or 0
        }
