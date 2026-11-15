# OpenRegulations.ai Website

AI-powered analysis of federal regulatory comments. This static website displays pre-computed analysis of public comments and provides an interactive chat interface for exploring regulations.

## Tech Stack

- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first styling
- **Vanilla JS** - No framework; a small router and template-string views
- **marked + DOMPurify** - Render and sanitize AI reports
- **Cloudflare Pages + Workers** - Hosting, data API, and rate-limited chat

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Navigate to website folder
cd website

# Install dependencies
npm install

# Start development server
npm run dev
```

The site will be available at `http://localhost:3000`

### Building for Production

```bash
npm run build
```

Output goes to `dist/`.

## Project Structure

```
website/
├── index.html              # Entry point (fonts, meta)
├── src/
│   ├── main.js             # History-API router: /, /dockets, /docket/:id, /about
│   ├── views/              # One module per page
│   ├── components/         # Layout, shared UI pieces, chat drawer
│   ├── lib/
│   │   ├── data.js         # Worker first, Supabase REST fallback
│   │   ├── markdown.js     # Report rendering (Markdown/HTML -> sanitized HTML + TOC)
│   │   ├── api-client.js   # Chat endpoints on the Worker
│   │   └── format.js       # Escaping, numbers, dates, agency names
│   └── styles/main.css
├── public/                 # Static assets
└── worker/                 # Cloudflare Worker (data API + RAG chat)
```

## Configuration

Build-time variables (set in `.github/workflows/deploy-cloudflare.yml`):

```env
VITE_WORKER_URL=https://openregulations-api.jxucoder.workers.dev
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_KEY=sb_publishable_...   # publishable key only; RLS allows public reads
```

## Deployment

Pushing to `main` (changes under `website/`) deploys the Worker and the site to Cloudflare Pages.
Pages serves `index.html` for unknown paths (there is no top-level `404.html`), so client-side routes
like `/docket/NHTSA-2025-0491` work on direct load.

Secrets are managed in 1Password; see `scripts/secrets.sh`.

## Design

- **Typography**: Source Serif 4 for headings and report text, Inter for interface text
- **Color**: ink (near-black navy) on warm paper; amber marks form-letter campaigns everywhere
- **Principle**: separate campaigns from original voices, and always state what share of the docket an analysis covers

## License

Apache 2.0
