import { esc, fmtDate } from '../lib/format.js';

export const REPO_URL = 'https://github.com/jxucoder/openregulations.ai';

const NAV = [
  { href: '/dockets', label: 'Analyses' },
  { href: '/about', label: 'About' },
];

export function header(path) {
  const onField = path === '/';
  const bar = onField
    ? 'bg-accent-600 text-white border-white/15'
    : 'bg-white/95 text-ink-900 border-ink-200 backdrop-blur';
  return `
    <header class="sticky top-0 z-30 border-b ${bar}">
      <div class="container-page flex h-16 items-center justify-between gap-4">
        <a href="/" class="text-[1.05rem] font-extrabold tracking-tight" aria-label="OpenRegulations.ai home">
          OpenRegulations<span class="font-mono font-medium ${onField ? 'text-white/70' : 'text-ink-400'}">.ai</span>
        </a>
        <nav class="flex items-center gap-1 text-sm font-semibold" aria-label="Main">
          ${NAV.map(({ href, label }) => {
            const active = path === href || (href === '/dockets' && path.startsWith('/docket/'));
            const tone = onField
              ? 'text-white hover:bg-white/10'
              : active ? 'bg-accent-50 text-accent-700' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900';
            return `<a href="${href}" class="px-3 py-2 transition-colors ${tone}" ${active ? 'aria-current="page"' : ''}>${label}</a>`;
          }).join('')}
          <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" class="hidden px-3 py-2 transition-colors sm:inline-flex ${onField ? 'text-white hover:bg-white/10' : 'text-ink-600 hover:bg-ink-50 hover:text-ink-900'}">GitHub</a>
        </nav>
      </div>
    </header>`;
}

export function footer(lastSynced) {
  return `
    <footer class="mt-24 bg-ink-900 text-ink-300">
      <div class="container-page flex flex-wrap items-start justify-between gap-6 py-10 text-sm leading-relaxed">
        <p class="max-w-xl">
          Independent and open source. Not affiliated with any government or with Regulations.gov.
          Analyses are written by AI from a sample of comments and can be wrong.
        </p>
        <p class="font-mono text-xs">
          <a class="hover:text-white" href="${REPO_URL}" target="_blank" rel="noopener noreferrer">source</a> ·
          <a class="hover:text-white" href="/about">method</a>
          ${lastSynced ? ` · data synced ${esc(fmtDate(lastSynced))}` : ''}
        </p>
      </div>
    </footer>`;
}
