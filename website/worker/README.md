# Cloudflare Worker - API Proxy

This worker proxies requests to the Claude API and handles rate limiting.

## Setup

### 1. Install Wrangler

```bash
npm install -g wrangler
```

### 2. Login to Cloudflare

```bash
wrangler login
```

### 3. Create KV Namespace (for rate limiting)

```bash
wrangler kv:namespace create "RATE_LIMIT_KV"
```

Copy the namespace ID and add it to `wrangler.toml`:

```toml
[[kv_namespaces]]
binding = "RATE_LIMIT_KV"
id = "your-namespace-id-here"
```

### 4. Add API Key Secret

```bash
wrangler secret put ANTHROPIC_API_KEY
# Paste your API key when prompted
```

### 5. Deploy

```bash
wrangler deploy
```

The worker will be available at: `https://openregulations-proxy.<your-subdomain>.workers.dev`

## Local Development

```bash
wrangler dev
```

This starts a local server at `http://localhost:8787`

## Endpoints

### GET /status
Check rate limit status

```bash
curl https://openregulations-proxy.workers.dev/status
```

### POST /chat
Send a chat message

```bash
curl -X POST https://openregulations-proxy.workers.dev/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What is this docket about?"}'
```

### POST /chat/stream
Stream a chat response

### POST /analyze
Analyze comments

```bash
curl -X POST https://openregulations-proxy.workers.dev/analyze \
  -H "Content-Type: application/json" \
  -d '{"query": "What are the main concerns?", "comments": ["Comment 1", "Comment 2"]}'
```

## Rate Limits

- 100 requests per day per IP
- 5 requests per minute burst limit

## Cost

Cloudflare Workers free tier includes:
- 100,000 requests/day
- 10ms CPU time per request

This should be more than enough for the chat feature.
