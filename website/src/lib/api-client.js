/**
 * Client for the Worker's AI endpoints (chat, rate-limit status).
 */

const WORKER_URL = (import.meta.env.VITE_WORKER_URL || '').replace(/\/$/, '');

export const chatAvailable = Boolean(WORKER_URL);

/**
 * Ask a question, optionally scoped to one docket.
 * @param {string} message
 * @param {{docketId?: string|null, history?: Array<{role: string, content: string}>}} [options]
 * @returns {Promise<{response: string, sources: Array<Object>}>}
 */
export async function sendChatMessage(message, { docketId = null, history = [] } = {}) {
  const res = await fetch(`${WORKER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message,
      docket_id: docketId,
      conversation_history: history.slice(-6),
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 429) throw new Error('You have reached the daily question limit. Please try again tomorrow.');
    throw new Error(body.error || `Request failed (${res.status})`);
  }

  const data = await res.json();
  return { response: data.response || '', sources: data.sources || [] };
}

/** @returns {Promise<{remaining: number, limit: number}|null>} */
export async function checkStatus() {
  if (!WORKER_URL) return null;
  try {
    const res = await fetch(`${WORKER_URL}/status`);
    return res.ok ? res.json() : null;
  } catch {
    return null;
  }
}
