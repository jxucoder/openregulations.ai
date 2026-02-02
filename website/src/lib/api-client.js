/**
 * API client for communicating with the Cloudflare Worker proxy
 */

// Configuration - update this URL after deploying the Cloudflare Worker
const WORKER_URL = import.meta.env.VITE_WORKER_URL || 'https://openregulations-proxy.workers.dev';

/**
 * Send a chat message to the LLM via the proxy
 * @param {string} message - User message
 * @param {Array} context - Relevant context (documents, comments)
 * @param {object} options - Additional options (docket_id, etc.)
 * @returns {Promise<string>} LLM response
 */
export async function sendChatMessage(message, context = [], options = {}) {
  const response = await fetch(`${WORKER_URL}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      context,
      docket_id: options.docket_id || null,
      conversation_history: options.conversation_history || [],
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  const data = await response.json();
  return data.response;
}

/**
 * Send a chat message with streaming response
 * @param {string} message - User message
 * @param {Array} context - Relevant context
 * @param {Function} onChunk - Callback for each text chunk
 * @param {object} options - Additional options (docket_id, etc.)
 * @returns {Promise<void>}
 */
export async function streamChatMessage(message, context = [], onChunk, options = {}) {
  const response = await fetch(`${WORKER_URL}/chat/stream`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      context,
      docket_id: options.docket_id || null,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    
    const chunk = decoder.decode(value);
    onChunk(chunk);
  }
}

/**
 * Analyze a specific comment or set of comments
 * @param {string} query - Analysis query
 * @param {Array} comments - Comments to analyze
 * @returns {Promise<object>} Analysis result
 */
export async function analyzeComments(query, comments) {
  const response = await fetch(`${WORKER_URL}/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      comments,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(error.error || `Request failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Check the API status and rate limit
 * @returns {Promise<object>} Status object with remaining requests
 */
export async function checkStatus() {
  const response = await fetch(`${WORKER_URL}/status`);
  
  if (!response.ok) {
    throw new Error('Failed to check status');
  }

  return response.json();
}
