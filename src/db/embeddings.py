"""
Embedding generation for semantic search
"""

import os
from typing import List, Optional
from .models import Comment, CommentEmbedding

try:
    import openai
except ImportError:
    openai = None


def get_openai_client():
    """Get OpenAI client for embeddings."""
    if openai is None:
        raise ImportError("Please install openai: pip install openai")
    
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")
    
    return openai.OpenAI(api_key=api_key)


def generate_embedding(text: str, model: str = "text-embedding-3-small") -> List[float]:
    """
    Generate embedding for a single text.
    
    Args:
        text: Text to embed
        model: OpenAI embedding model
        
    Returns:
        List of floats (1536 dimensions for text-embedding-3-small)
    """
    client = get_openai_client()
    
    # Truncate to max tokens (~8000 chars for safety)
    text = text[:8000] if text else ""
    
    response = client.embeddings.create(
        model=model,
        input=text,
        encoding_format="float"
    )
    
    return response.data[0].embedding


def generate_embeddings_batch(
    texts: List[str],
    model: str = "text-embedding-3-small"
) -> List[List[float]]:
    """
    Generate embeddings for multiple texts in a single API call.
    
    Args:
        texts: List of texts to embed
        model: OpenAI embedding model
        
    Returns:
        List of embedding vectors
    """
    if not texts:
        return []
    
    client = get_openai_client()
    
    # Truncate texts
    texts = [t[:8000] if t else "" for t in texts]
    
    response = client.embeddings.create(
        model=model,
        input=texts,
        encoding_format="float"
    )
    
    # Sort by index to maintain order
    sorted_data = sorted(response.data, key=lambda x: x.index)
    return [d.embedding for d in sorted_data]


def embed_comments(
    comments: List[Comment],
    model: str = "text-embedding-3-small",
    batch_size: int = 100
) -> List[CommentEmbedding]:
    """
    Generate embeddings for a list of comments.
    
    Args:
        comments: Comments to embed
        model: Embedding model to use
        batch_size: Number of comments per API call
        
    Returns:
        List of CommentEmbedding objects
    """
    embeddings = []
    
    for i in range(0, len(comments), batch_size):
        batch = comments[i:i + batch_size]
        texts = [c.text or "" for c in batch]
        
        batch_embeddings = generate_embeddings_batch(texts, model)
        
        for comment, embedding in zip(batch, batch_embeddings):
            embeddings.append(CommentEmbedding(
                comment_id=comment.id,
                embedding=embedding,
                docket_id=comment.docket_id,
                model=model,
                sentiment=comment.sentiment,
            ))
    
    return embeddings


def embed_query(query: str, model: str = "text-embedding-3-small") -> List[float]:
    """
    Generate embedding for a search query.
    
    Args:
        query: Search query text
        model: Embedding model (must match what was used for documents)
        
    Returns:
        Embedding vector
    """
    return generate_embedding(query, model)


# Cost estimation
EMBEDDING_COSTS = {
    "text-embedding-3-small": 0.00002,  # $0.02 per 1M tokens
    "text-embedding-3-large": 0.00013,  # $0.13 per 1M tokens
}


def estimate_embedding_cost(
    num_comments: int,
    avg_tokens_per_comment: int = 200,
    model: str = "text-embedding-3-small"
) -> float:
    """
    Estimate cost to embed comments.
    
    Args:
        num_comments: Number of comments to embed
        avg_tokens_per_comment: Average tokens per comment (default 200)
        model: Embedding model
        
    Returns:
        Estimated cost in USD
    """
    total_tokens = num_comments * avg_tokens_per_comment
    cost_per_token = EMBEDDING_COSTS.get(model, 0.00002)
    return total_tokens * cost_per_token
