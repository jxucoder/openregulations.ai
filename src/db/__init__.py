"""
Database module for OpenRegulations.ai

Uses Supabase (PostgreSQL + pgvector) for:
- Storing dockets, comments, analyses
- Semantic search with embeddings
"""

from .client import get_client, SupabaseClient
from .models import Docket, Comment, Analysis, CommentEmbedding
from .embeddings import embed_comments, embed_query, generate_embedding

__all__ = [
    # Client
    "get_client",
    "SupabaseClient",
    # Models
    "Docket",
    "Comment",
    "Analysis",
    "CommentEmbedding",
    # Embeddings
    "embed_comments",
    "embed_query",
    "generate_embedding",
]
