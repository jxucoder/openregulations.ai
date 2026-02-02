/**
 * Cloudflare Worker - RAG Chat API
 * 
 * Handles:
 * - Chat with RAG (retrieves from Supabase, sends to Claude)
 * - Semantic search against comments
 * - Rate limiting per IP
 * 
 * Deploy: wrangler deploy
 */

// Rate limit configuration
const RATE_LIMIT = {
  MAX_REQUESTS_PER_DAY: 100,
  MAX_REQUESTS_PER_MINUTE: 10,
};

// CORS headers
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // Routes
      if (path === '/status') {
        return handleStatus(request, env);
      }
      
      if (path === '/chat' && request.method === 'POST') {
        return handleChat(request, env);
      }
      
      if (path === '/search' && request.method === 'POST') {
        return handleSearch(request, env);
      }
      
      if (path === '/dockets' && request.method === 'GET') {
        return handleDockets(request, env);
      }
      
      if (path === '/docket' && request.method === 'GET') {
        const docketId = url.searchParams.get('id');
        return handleDocket(docketId, env);
      }

      return jsonResponse({ error: 'Not found' }, 404);

    } catch (error) {
      console.error('Worker error:', error);
      return jsonResponse({ error: error.message || 'Internal server error' }, 500);
    }
  },
};

// ============ Supabase Helpers ============

async function supabaseQuery(env, table, query = {}) {
  const params = new URLSearchParams();
  if (query.select) params.set('select', query.select);
  if (query.filter) {
    for (const [key, value] of Object.entries(query.filter)) {
      params.set(key, value);
    }
  }
  if (query.order) params.set('order', query.order);
  if (query.limit) params.set('limit', query.limit);

  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/${table}?${params}`,
    {
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Supabase error: ${response.status}`);
  }

  return response.json();
}

async function supabaseRpc(env, functionName, params = {}) {
  const response = await fetch(
    `${env.SUPABASE_URL}/rest/v1/rpc/${functionName}`,
    {
      method: 'POST',
      headers: {
        'apikey': env.SUPABASE_KEY,
        'Authorization': `Bearer ${env.SUPABASE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params),
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase RPC error: ${response.status} - ${text}`);
  }

  return response.json();
}

async function generateEmbedding(text, env) {
  // Use OpenAI for embeddings (or switch to Supabase Edge Function)
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 8000),
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate embedding');
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// ============ Route Handlers ============

async function handleStatus(request, env) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const remaining = await getRemainingRequests(ip, env);
  
  return jsonResponse({
    status: 'ok',
    remaining,
    limit: RATE_LIMIT.MAX_REQUESTS_PER_DAY,
  });
}

async function handleDockets(request, env) {
  const dockets = await supabaseQuery(env, 'dockets', {
    select: 'id,title,agency,comment_count,comment_end_date',
    order: 'comment_count.desc',
    limit: '50',
  });

  return jsonResponse({ dockets });
}

async function handleDocket(docketId, env) {
  if (!docketId) {
    return jsonResponse({ error: 'Docket ID required' }, 400);
  }

  // Get docket info
  const dockets = await supabaseQuery(env, 'dockets', {
    select: '*',
    filter: { id: `eq.${docketId}` },
  });

  if (!dockets.length) {
    return jsonResponse({ error: 'Docket not found' }, 404);
  }

  // Get analysis if exists
  const analyses = await supabaseQuery(env, 'analyses', {
    select: '*',
    filter: { docket_id: `eq.${docketId}` },
  });

  return jsonResponse({
    docket: dockets[0],
    analysis: analyses[0] || null,
  });
}

async function handleSearch(request, env) {
  const body = await request.json();
  const { query, docket_id, limit = 10 } = body;

  if (!query) {
    return jsonResponse({ error: 'Query required' }, 400);
  }

  // Generate embedding for query
  const embedding = await generateEmbedding(query, env);

  // Semantic search via Supabase RPC
  const results = await supabaseRpc(env, 'match_comments', {
    query_embedding: embedding,
    match_count: limit,
    filter_docket_id: docket_id || null,
  });

  return jsonResponse({ results });
}

async function handleChat(request, env) {
  // Rate limit check
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateLimitResult = await checkRateLimit(ip, env);
  
  if (!rateLimitResult.allowed) {
    return jsonResponse({
      error: 'Rate limit exceeded. Please try again later.',
      retryAfter: rateLimitResult.retryAfter,
    }, 429);
  }

  const body = await request.json();
  const { message, docket_id, conversation_history = [] } = body;

  if (!message) {
    return jsonResponse({ error: 'Message required' }, 400);
  }

  // Step 1: Semantic search for relevant comments
  let relevantComments = [];
  try {
    const embedding = await generateEmbedding(message, env);
    relevantComments = await supabaseRpc(env, 'match_comments', {
      query_embedding: embedding,
      match_count: 5,
      filter_docket_id: docket_id || null,
    });
  } catch (e) {
    console.error('Search failed:', e);
    // Continue without context if search fails
  }

  // Step 2: Get docket analysis if specific docket
  let analysis = null;
  if (docket_id) {
    try {
      const analyses = await supabaseQuery(env, 'analyses', {
        select: 'themes,sentiment,executive_summary,notable_comments',
        filter: { docket_id: `eq.${docket_id}` },
      });
      analysis = analyses[0];
    } catch (e) {
      console.error('Analysis fetch failed:', e);
    }
  }

  // Step 3: Build context for Claude
  const context = buildContext(relevantComments, analysis);
  const systemPrompt = buildSystemPrompt(context);

  // Step 4: Build messages array with history
  const messages = [
    ...conversation_history.slice(-6), // Last 3 exchanges
    { role: 'user', content: message }
  ];

  // Step 5: Call Claude
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system: systemPrompt,
      messages,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Claude error:', error);
    return jsonResponse({ error: 'AI service error' }, 502);
  }

  const data = await response.json();
  await incrementRateLimit(ip, env);

  return jsonResponse({
    response: data.content[0]?.text || 'No response',
    sources: relevantComments.slice(0, 3).map(c => ({
      id: c.comment_id,
      text: (c.comment_text || c.text || '').slice(0, 200) + '...',
      author: c.author,
      similarity: c.similarity,
    })),
  });
}

// ============ Prompt Building ============

function buildContext(comments, analysis) {
  let context = '';

  if (analysis) {
    context += `## Docket Analysis Summary\n`;
    context += `${analysis.executive_summary || ''}\n\n`;
    
    if (analysis.sentiment) {
      context += `Sentiment: ${analysis.sentiment.support || 0}% support, ${analysis.sentiment.oppose || 0}% oppose\n\n`;
    }

    if (analysis.themes?.length) {
      context += `Key Themes:\n`;
      analysis.themes.slice(0, 5).forEach(t => {
        context += `- ${t.name}: ${t.description || ''}\n`;
      });
      context += '\n';
    }
  }

  if (comments?.length) {
    context += `## Relevant Comments\n`;
    comments.forEach((c, i) => {
      const text = c.comment_text || c.text || '';
      context += `[${i + 1}] ${c.author || 'Anonymous'}: "${text.slice(0, 300)}..."\n\n`;
    });
  }

  return context;
}

function buildSystemPrompt(context) {
  return `You are an expert assistant helping users understand federal regulations and public comments.

Your role:
- Answer questions about what the public is saying about proposed rules
- Summarize themes, sentiments, and key arguments from comments
- Explain regulations in plain, accessible language
- Be factual, balanced, and cite specific comments when relevant

Guidelines:
- Reference specific comments from the context when answering
- Acknowledge when you don't have enough data to answer
- Present multiple viewpoints fairly
- Keep responses focused and actionable

${context ? `\n---\nCONTEXT:\n${context}` : ''}`;
}

// ============ Rate Limiting ============

async function checkRateLimit(ip, env) {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  
  let data;
  try {
    const stored = await env.RATE_LIMIT_KV?.get(key);
    data = stored ? JSON.parse(stored) : { count: 0, resetAt: now + 86400000 };
  } catch {
    data = { count: 0, resetAt: now + 86400000 };
  }

  if (now > data.resetAt) {
    data = { count: 0, resetAt: now + 86400000 };
  }

  if (data.count >= RATE_LIMIT.MAX_REQUESTS_PER_DAY) {
    return {
      allowed: false,
      retryAfter: Math.ceil((data.resetAt - now) / 1000),
    };
  }

  return { allowed: true };
}

async function incrementRateLimit(ip, env) {
  const key = `ratelimit:${ip}`;
  const now = Date.now();
  
  let data;
  try {
    const stored = await env.RATE_LIMIT_KV?.get(key);
    data = stored ? JSON.parse(stored) : { count: 0, resetAt: now + 86400000 };
  } catch {
    data = { count: 0, resetAt: now + 86400000 };
  }

  if (now > data.resetAt) {
    data = { count: 1, resetAt: now + 86400000 };
  } else {
    data.count++;
  }

  try {
    await env.RATE_LIMIT_KV?.put(key, JSON.stringify(data), {
      expirationTtl: 86400,
    });
  } catch (e) {
    console.error('Rate limit update failed:', e);
  }
}

async function getRemainingRequests(ip, env) {
  const key = `ratelimit:${ip}`;
  
  try {
    const stored = await env.RATE_LIMIT_KV?.get(key);
    if (!stored) return RATE_LIMIT.MAX_REQUESTS_PER_DAY;
    
    const data = JSON.parse(stored);
    if (Date.now() > data.resetAt) return RATE_LIMIT.MAX_REQUESTS_PER_DAY;
    
    return Math.max(0, RATE_LIMIT.MAX_REQUESTS_PER_DAY - data.count);
  } catch {
    return RATE_LIMIT.MAX_REQUESTS_PER_DAY;
  }
}

// ============ Helpers ============

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json',
    },
  });
}
