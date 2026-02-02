"""
Embed Job: Generate embeddings for comments

This job ONLY generates embeddings.
Assumes data is already synced.

Run:
    python -m src.jobs.embed --docket-id NHTSA-2025-0491
    python -m src.jobs.embed --all
"""

import os
from datetime import datetime, timezone
from typing import List, Dict, Optional

# Load environment variables
from dotenv import load_dotenv
load_dotenv()

try:
    import openai
except ImportError:
    openai = None

from src.db import get_client, Comment, CommentEmbedding


def get_openai_client():
    """Get OpenAI client for embeddings."""
    if openai is None:
        raise ImportError("Please install openai: pip install openai")
    
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")
    
    return openai.OpenAI(api_key=api_key)


def embed_texts(texts: List[str], model: str = "text-embedding-3-small") -> List[List[float]]:
    """Generate embeddings for multiple texts."""
    if not texts:
        return []
    
    client = get_openai_client()
    
    # Truncate texts to avoid token limits
    texts = [t[:8000] if t else "" for t in texts]
    
    response = client.embeddings.create(
        model=model,
        input=texts,
        encoding_format="float"
    )
    
    # Sort by index to maintain order
    sorted_data = sorted(response.data, key=lambda x: x.index)
    return [d.embedding for d in sorted_data]


def embed_docket(docket_id: str, batch_size: int = 100, max_comments: int = 5000) -> Dict:
    """
    Generate embeddings for comments in a docket.
    
    Only embeds comments that don't already have embeddings.
    Skips form letters.
    
    Args:
        docket_id: Docket to embed
        batch_size: Comments per API call
        max_comments: Max comments to embed
        
    Returns:
        Stats dict
    """
    db = get_client()
    
    log_id = db.log_sync_start("embed_docket", docket_id)
    
    try:
        print(f"[EMBED] Starting embeddings for {docket_id}")
        
        # 1. Get comments without embeddings (excluding form letters)
        comments = db.get_comments_without_embeddings(docket_id, limit=max_comments)
        
        if not comments:
            print(f"[EMBED] No comments need embedding")
            db.log_sync_complete(log_id, records_fetched=0, records_created=0)
            return {"docket_id": docket_id, "embedded": 0, "status": "up_to_date"}
        
        print(f"[EMBED] Need to embed {len(comments)} comments")
        
        # 2. Generate embeddings in batches
        all_embeddings = []
        
        for i in range(0, len(comments), batch_size):
            batch = comments[i:i + batch_size]
            texts = [c.text or "" for c in batch]
            
            print(f"[EMBED] Batch {i//batch_size + 1}: {len(batch)} comments")
            
            vectors = embed_texts(texts)
            
            for comment, vector in zip(batch, vectors):
                all_embeddings.append(CommentEmbedding(
                    comment_id=comment.id,
                    embedding=vector,
                    docket_id=docket_id,
                    sentiment=comment.sentiment,
                ))
        
        # 3. Store embeddings
        if all_embeddings:
            inserted = db.upsert_embeddings(all_embeddings)
            print(f"[EMBED] Stored {inserted} embeddings")
        
        db.log_sync_complete(log_id, records_fetched=len(comments), records_created=len(all_embeddings))
        
        return {
            "docket_id": docket_id,
            "embedded": len(all_embeddings),
            "status": "success"
        }
        
    except Exception as e:
        print(f"[EMBED] Error: {e}")
        db.log_sync_error(log_id, str(e))
        raise


def run_embeddings(max_dockets: int = 5, max_comments_per_docket: int = 1000) -> List[Dict]:
    """
    Generate embeddings for dockets that need them.
    """
    db = get_client()
    
    print(f"[EMBED] Finding dockets needing embeddings...")
    
    # Get dockets with comments but missing embeddings
    # Simple approach: get dockets ordered by comment count
    dockets = db.client.table("dockets").select("id, total_comments_at_sync").order(
        "total_comments_at_sync", desc=True
    ).limit(max_dockets * 2).execute()
    
    results = []
    embedded_count = 0
    
    for d in dockets.data:
        if embedded_count >= max_dockets:
            break
        
        docket_id = d["id"]
        
        # Check if needs embedding
        comments_needing = db.get_comments_without_embeddings(docket_id, limit=1)
        
        if comments_needing:
            print(f"\n[EMBED] === {docket_id} ===")
            try:
                result = embed_docket(docket_id, max_comments=max_comments_per_docket)
                results.append(result)
                embedded_count += 1
            except Exception as e:
                print(f"[EMBED] Failed: {e}")
                results.append({"docket_id": docket_id, "status": "error", "error": str(e)})
    
    total = sum(r.get("embedded", 0) for r in results)
    print(f"\n[EMBED] Complete. Generated {total} embeddings across {len(results)} dockets")
    
    return results


def get_embedding_stats(docket_id: str) -> Dict:
    """Get embedding coverage stats for a docket."""
    db = get_client()
    
    # Total unique comments (non-form-letter)
    comments_result = db.client.table("comments").select(
        "id", count="exact"
    ).eq("docket_id", docket_id).eq("is_form_letter", False).execute()
    
    total_unique = comments_result.count or 0
    
    # Comments with embeddings
    embeddings_result = db.client.table("comment_embeddings").select(
        "comment_id", count="exact"
    ).eq("docket_id", docket_id).execute()
    
    has_embedding = embeddings_result.count or 0
    
    return {
        "docket_id": docket_id,
        "unique_comments": total_unique,
        "with_embeddings": has_embedding,
        "missing": total_unique - has_embedding,
        "coverage_pct": round(has_embedding / total_unique * 100, 1) if total_unique > 0 else 0
    }


# CLI
if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Generate embeddings")
    parser.add_argument("--docket-id", help="Embed specific docket")
    parser.add_argument("--all", action="store_true", help="Embed all pending")
    parser.add_argument("--stats", action="store_true", help="Show stats only")
    parser.add_argument("--max-dockets", type=int, default=5)
    parser.add_argument("--max-comments", type=int, default=1000)
    args = parser.parse_args()
    
    if args.stats and args.docket_id:
        stats = get_embedding_stats(args.docket_id)
        print(f"\nEmbedding stats for {args.docket_id}:")
        print(f"  Unique comments: {stats['unique_comments']}")
        print(f"  With embeddings: {stats['with_embeddings']}")
        print(f"  Missing: {stats['missing']}")
        print(f"  Coverage: {stats['coverage_pct']}%")
    elif args.docket_id:
        result = embed_docket(args.docket_id, max_comments=args.max_comments)
        print(f"\nResult: {result}")
    elif args.all:
        results = run_embeddings(args.max_dockets, args.max_comments)
        print(f"\nEmbedded {len(results)} dockets")
    else:
        print("Specify --docket-id, --all, or --stats")
