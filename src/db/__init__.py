"""
Database module for OpenRegulations.ai

Uses Supabase (PostgreSQL + pgvector) for:
- Storing dockets, comments, analyses
- Semantic search with embeddings
"""

from .client import SupabaseClient, get_client
from .embeddings import embed_comments, embed_query, generate_embedding
from .models import Analysis, Comment, CommentEmbedding, Docket, Report

__all__ = [
    # Client
    "get_client",
    "SupabaseClient",
    # Models
    "Docket",
    "Comment",
    "Analysis",
    "CommentEmbedding",
    "Report",
    # Embeddings
    "embed_comments",
    "embed_query",
    "generate_embedding",
]
