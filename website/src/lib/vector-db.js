/**
 * Client-side vector database for semantic search
 * 
 * Loads pre-computed embeddings from JSON and performs
 * cosine similarity search in the browser.
 */

// Cache for loaded embeddings
const embeddingsCache = new Map();

/**
 * Load embeddings for a docket
 * @param {string} docketId - Docket ID
 * @returns {Promise<object|null>} Embeddings data or null
 */
export async function loadEmbeddings(docketId) {
  // Check cache first
  if (embeddingsCache.has(docketId)) {
    return embeddingsCache.get(docketId);
  }
  
  try {
    const response = await fetch(`/src/data/embeddings-${docketId}.json`);
    if (!response.ok) {
      console.warn(`Embeddings not found for ${docketId}`);
      return null;
    }
    
    const data = await response.json();
    embeddingsCache.set(docketId, data);
    return data;
  } catch (error) {
    console.error('Failed to load embeddings:', error);
    return null;
  }
}

/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} Similarity score (0-1)
 */
export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error('Vectors must have same dimension');
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  
  if (normA === 0 || normB === 0) return 0;
  
  return dotProduct / (normA * normB);
}

/**
 * Search for similar comments
 * @param {number[]} queryEmbedding - Query vector
 * @param {object} embeddingsData - Loaded embeddings data
 * @param {number} topK - Number of results to return
 * @returns {Array} Top K similar comments with scores
 */
export function searchSimilar(queryEmbedding, embeddingsData, topK = 10) {
  if (!embeddingsData || !embeddingsData.comments) {
    return [];
  }
  
  const results = embeddingsData.comments.map(comment => ({
    id: comment.id,
    text: comment.text_preview,
    sentiment: comment.sentiment,
    themes: comment.theme_ids,
    score: cosineSimilarity(queryEmbedding, comment.embedding)
  }));
  
  // Sort by similarity score descending
  results.sort((a, b) => b.score - a.score);
  
  return results.slice(0, topK);
}

/**
 * Search across multiple dockets
 * @param {number[]} queryEmbedding - Query vector
 * @param {string[]} docketIds - Docket IDs to search
 * @param {number} topK - Number of results per docket
 * @returns {Promise<object>} Results grouped by docket
 */
export async function searchAcrossDockets(queryEmbedding, docketIds, topK = 5) {
  const results = {};
  
  await Promise.all(
    docketIds.map(async (docketId) => {
      const embeddings = await loadEmbeddings(docketId);
      if (embeddings) {
        results[docketId] = searchSimilar(queryEmbedding, embeddings, topK);
      }
    })
  );
  
  return results;
}

/**
 * Find comments matching a theme
 * @param {string} themeId - Theme ID to filter by
 * @param {object} embeddingsData - Loaded embeddings data
 * @returns {Array} Comments with the specified theme
 */
export function filterByTheme(themeId, embeddingsData) {
  if (!embeddingsData || !embeddingsData.comments) {
    return [];
  }
  
  return embeddingsData.comments.filter(
    comment => comment.theme_ids && comment.theme_ids.includes(themeId)
  );
}

/**
 * Find comments by sentiment
 * @param {string} sentiment - 'oppose', 'support', or 'neutral'
 * @param {object} embeddingsData - Loaded embeddings data
 * @returns {Array} Comments with the specified sentiment
 */
export function filterBySentiment(sentiment, embeddingsData) {
  if (!embeddingsData || !embeddingsData.comments) {
    return [];
  }
  
  return embeddingsData.comments.filter(
    comment => comment.sentiment === sentiment
  );
}

/**
 * Get embedding statistics
 * @param {object} embeddingsData - Loaded embeddings data
 * @returns {object} Statistics about the embeddings
 */
export function getEmbeddingStats(embeddingsData) {
  if (!embeddingsData || !embeddingsData.comments) {
    return null;
  }
  
  const comments = embeddingsData.comments;
  
  const sentimentCounts = {
    oppose: 0,
    support: 0,
    neutral: 0
  };
  
  comments.forEach(c => {
    if (c.sentiment in sentimentCounts) {
      sentimentCounts[c.sentiment]++;
    }
  });
  
  return {
    docketId: embeddingsData.docket_id,
    model: embeddingsData.model,
    dimension: embeddingsData.dimension,
    totalComments: comments.length,
    sentimentBreakdown: sentimentCounts,
    createdAt: embeddingsData.created_at
  };
}

/**
 * Simple text-based search (fallback when no embeddings)
 * @param {string} query - Search query
 * @param {Array} comments - Array of comment objects with text
 * @returns {Array} Matching comments
 */
export function textSearch(query, comments) {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);
  
  return comments
    .map(comment => {
      const textLower = (comment.text || comment.text_preview || '').toLowerCase();
      const matchCount = queryTerms.filter(term => textLower.includes(term)).length;
      return {
        ...comment,
        matchScore: matchCount / queryTerms.length
      };
    })
    .filter(c => c.matchScore > 0)
    .sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * Cluster comments by similarity (for visualization)
 * Simple k-means-like clustering
 * @param {object} embeddingsData - Loaded embeddings data
 * @param {number} k - Number of clusters
 * @returns {Array} Cluster assignments
 */
export function clusterComments(embeddingsData, k = 5) {
  if (!embeddingsData || !embeddingsData.comments || embeddingsData.comments.length < k) {
    return [];
  }
  
  const comments = embeddingsData.comments;
  
  // Initialize centroids randomly
  const centroids = [];
  const usedIndices = new Set();
  
  while (centroids.length < k) {
    const idx = Math.floor(Math.random() * comments.length);
    if (!usedIndices.has(idx)) {
      usedIndices.add(idx);
      centroids.push([...comments[idx].embedding]);
    }
  }
  
  // Assign comments to nearest centroid
  const assignments = comments.map(comment => {
    let bestCluster = 0;
    let bestScore = -1;
    
    centroids.forEach((centroid, idx) => {
      const score = cosineSimilarity(comment.embedding, centroid);
      if (score > bestScore) {
        bestScore = score;
        bestCluster = idx;
      }
    });
    
    return {
      commentId: comment.id,
      cluster: bestCluster,
      score: bestScore
    };
  });
  
  return assignments;
}
