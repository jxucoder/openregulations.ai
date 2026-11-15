import { logoMark } from './ui.js';
import { esc, fmtDate } from '../lib/format.js';

export const REPO_URL = 'https://github.com/jxucoder/openregulations.ai';

const NAV = [
  { href: '/dockets', label: 'Dockets' },
  { href: '/about', label: 'Methodology', short: 'Method' },
];

export function header(path) {
  return `
    <header class="sticky top-0 z-30 border-b border-ink-100 bg-paper/90 backdrop-blur supports-[backdrop-filter]:bg-paper/75">
      <div class="container-page flex h-16 items-center justify-between gap-4">
        <a href="/" class="flex items-center gap-2.5" aria-label="OpenRegulations.ai home">
          ${logoMark()}
          <span class="font-serif text-[1.05rem] font-semibold tracking-tight text-ink-900">OpenRegulations<span class="text-ink-400">.ai</span></span>
        </a>
        <nav class="flex items-center gap-0.5 text-sm sm:gap-1" aria-label="Main">
          ${NAV.map(({ href, label, short }) => {
            const active = path === href || path.startsWith(`${href}/`) || (href === '/dockets' && path.startsWith('/docket/'));
            return `<a href="${href}" class="rounded-md px-2.5 py-2 font-medium transition-colors sm:px-3 ${active ? 'text-ink-900 bg-ink-100' : 'text-ink-600 hover:text-ink-900 hover:bg-ink-50'}" ${active ? 'aria-current="page"' : ''}>${short ? `<span class="sm:hidden">${short}</span><span class="hidden sm:inline">${label}</span>` : label}</a>`;
          }).join('')}
          <a href="${REPO_URL}" target="_blank" rel="noopener noreferrer" class="hidden rounded-md px-3 py-2 font-medium text-ink-600 transition-colors hover:bg-ink-50 hover:text-ink-900 sm:inline-flex">GitHub</a>
        </nav>
      </div>
    </header>`;
}

export function footer(lastSynced) {
  return `
    <footer class="mt-24 border-t border-ink-100 bg-paper-100">
      <div class="container-page grid gap-8 py-12 text-sm text-ink-600 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <div class="flex items-center gap-2.5">
            ${logoMark('h-6 w-6')}
            <span class="font-serif font-semibold text-ink-900">OpenRegulations.ai</span>
          </div>
          <p class="mt-3 max-w-sm leading-relaxed">
            An independent, open-source project. Not affiliated with the U.S. government or Regulations.gov.
            Analyses are written by AI from a sample of comments and can contain mistakes. Check the source comments before you rely on them.
          </p>
        </div>
        <div>
          <h2 class="eyebrow">Explore</h2>
          <ul class="mt-3 space-y-2">
            <li><a class="hover:text-ink-900" href="/dockets">All dockets</a></li>
            <li><a class="hover:text-ink-900" href="/about">How the analysis works</a></li>
            <li><a class="hover:text-ink-900" href="https://www.regulations.gov" target="_blank" rel="noopener noreferrer">Regulations.gov</a></li>
          </ul>
        </div>
        <div>
          <h2 class="eyebrow">Project</h2>
          <ul class="mt-3 space-y-2">
            <li><a class="hover:text-ink-900" href="${REPO_URL}" target="_blank" rel="noopener noreferrer">Source code</a></li>
            <li><a class="hover:text-ink-900" href="${REPO_URL}/issues" target="_blank" rel="noopener noreferrer">Report an issue</a></li>
            <li class="text-ink-500">Apache 2.0 license</li>
          </ul>
          ${lastSynced ? `<p class="mt-4 text-xs text-ink-500">Data last synced ${esc(fmtDate(lastSynced))}</p>` : ''}
        </div>
      </div>
    </footer>`;
}
