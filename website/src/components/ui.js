/**
 * Shared presentational pieces. All return HTML strings with escaped data.
 */

import { esc, fmtNum, fmtCompact, fmtPct, fmtDate, agencyName } from '../lib/format.js';

export const logoMark = (cls = 'h-7 w-7') => `
  <svg class="${cls}" viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="6" fill="#0e1a2b"/>
    <rect x="7" y="8" width="18" height="2.5" rx="1.25" fill="#fbfaf7"/>
    <rect x="7" y="13.5" width="18" height="2.5" rx="1.25" fill="#fbfaf7" opacity=".55"/>
    <rect x="7" y="19" width="11" height="2.5" rx="1.25" fill="#f0a43a"/>
    <rect x="7" y="24.5" width="14" height="2.5" rx="1.25" fill="#fbfaf7" opacity=".55"/>
  </svg>`;

export const icons = {
  arrowRight: '<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M3 10a.75.75 0 0 1 .75-.75h10.64l-3.97-3.97a.75.75 0 1 1 1.06-1.06l5.25 5.25a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 1 1-1.06-1.06l3.97-3.97H3.75A.75.75 0 0 1 3 10Z" clip-rule="evenodd"/></svg>',
  external: '<svg class="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-4a.75.75 0 0 1 1.5 0v4A2.25 2.25 0 0 1 12.75 17h-8.5A2.25 2.25 0 0 1 2 14.75v-8.5A2.25 2.25 0 0 1 4.25 4h5a.75.75 0 0 1 0 1.5h-5Zm7.25-.75a.75.75 0 0 1 .75-.75h3.5a.75.75 0 0 1 .75.75v3.5a.75.75 0 0 1-1.5 0V6.56l-5.22 5.22a.75.75 0 1 1-1.06-1.06l5.22-5.22H12.25a.75.75 0 0 1-.75-.75Z" clip-rule="evenodd"/></svg>',
  chat: '<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M10 2c-4.42 0-8 3.03-8 6.75 0 2.04 1.08 3.86 2.78 5.1-.12.9-.5 1.98-1.36 2.93a.5.5 0 0 0 .4.83c1.73-.1 3.1-.74 4.07-1.4.67.13 1.38.2 2.11.2 4.42 0 8-3.03 8-6.75S14.42 2 10 2Z" clip-rule="evenodd"/></svg>',
  search: '<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.45 4.39l3.08 3.08a.75.75 0 1 1-1.06 1.06l-3.08-3.08A7 7 0 0 1 2 9Z" clip-rule="evenodd"/></svg>',
  close: '<svg class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z"/></svg>',
  send: '<svg class="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M3.1 2.29a.75.75 0 0 0-.98.92l1.6 5.6a.75.75 0 0 0 .6.53l6.43 1.06-6.43 1.06a.75.75 0 0 0-.6.53l-1.6 5.6a.75.75 0 0 0 .98.92 28.9 28.9 0 0 0 15.29-7.15.75.75 0 0 0 0-1.12A28.9 28.9 0 0 0 3.1 2.29Z"/></svg>',
};

/** Horizontal bar: form-letter share vs original comments. */
export function compositionBar(formPct, { height = 'h-1.5', label = false } = {}) {
  if (formPct == null) return '';
  const pct = Math.max(0, Math.min(100, Number(formPct)));
  const bar = `
    <div class="flex ${height} w-full overflow-hidden rounded-full bg-ink-100" role="img"
      aria-label="${esc(fmtPct(pct))} form letters, ${esc(fmtPct(100 - pct))} original comments">
      <div class="bg-campaign-400" style="width:${pct}%"></div>
      <div class="bg-ink-700" style="width:${100 - pct}%"></div>
    </div>`;
  if (!label) return bar;
  return `
    ${bar}
    <div class="mt-2 flex justify-between text-xs text-ink-500">
      <span class="flex items-center gap-1.5"><span class="h-2 w-2 rounded-full bg-campaign-400"></span>Form letters ${esc(fmtPct(pct, pct % 1 ? 1 : 0))}</span>
      <span class="flex items-center gap-1.5">Original ${esc(fmtPct(100 - pct, pct % 1 ? 1 : 0))}<span class="h-2 w-2 rounded-full bg-ink-700"></span></span>
    </div>`;
}

export function sentimentBar(s) {
  if (!s) return '';
  const o = Number(s.oppose) || 0;
  const n = Number(s.neutral) || 0;
  const p = Number(s.support) || 0;
  return `
    <div class="flex h-2 w-full overflow-hidden rounded-full bg-ink-100" role="img"
      aria-label="${o}% oppose, ${n}% neutral, ${p}% support">
      <div class="bg-rose-500" style="width:${o}%"></div>
      <div class="bg-ink-300" style="width:${n}%"></div>
      <div class="bg-emerald-500" style="width:${p}%"></div>
    </div>
    <div class="mt-2 flex justify-between text-xs text-ink-600">
      <span><span class="font-semibold text-rose-600">${o}%</span> oppose</span>
      <span><span class="font-semibold text-ink-700">${n}%</span> neutral</span>
      <span><span class="font-semibold text-emerald-700">${p}%</span> support</span>
    </div>`;
}

/** Card used on the home page for published analyses. */
export function reportCard(d) {
  return `
    <a href="/docket/${encodeURIComponent(d.id)}" class="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:border-ink-200 hover:shadow-[0_8px_24px_-12px_rgba(14,26,43,0.25)]">
      <div class="flex items-center justify-between gap-2">
        <span class="tag-agency" title="${esc(agencyName(d.agency))}">${esc(d.agency)}</span>
        <span class="truncate font-mono text-[11px] text-ink-400">${esc(d.id)}</span>
      </div>
      <h3 class="mt-3 line-clamp-3 font-serif text-lg font-semibold leading-snug text-ink-900 group-hover:text-accent-700">${esc(d.title)}</h3>
      <div class="mt-auto pt-5">
        ${compositionBar(d.formPct)}
        <div class="mt-2.5 flex items-center justify-between text-xs text-ink-500">
          <span><span class="font-semibold text-ink-800">${esc(fmtCompact(d.total))}</span> comments${d.formPct != null ? ` · ${esc(fmtPct(d.formPct))} form letters` : ''}</span>
          ${d.reportAt ? `<span>${esc(fmtDate(d.reportAt))}</span>` : ''}
        </div>
      </div>
    </a>`;
}

/** Row used in docket lists. */
export function docketRow(d) {
  return `
    <li>
      <a href="/docket/${encodeURIComponent(d.id)}" class="group grid grid-cols-[1fr_auto] items-start gap-x-4 gap-y-1 px-4 py-4 transition-colors hover:bg-paper-100 sm:grid-cols-[5.5rem_1fr_8rem_7rem] sm:items-center sm:px-5">
        <span class="hidden sm:block"><span class="tag-agency" title="${esc(agencyName(d.agency))}">${esc(d.agency)}</span></span>
        <span class="min-w-0">
          <span class="block font-medium leading-snug text-ink-900 group-hover:text-accent-700">${esc(d.title)}</span>
          <span class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-500">
            <span class="sm:hidden tag-agency">${esc(d.agency)}</span>
            <span class="font-mono">${esc(d.id)}</span>
          </span>
        </span>
        <span class="text-right text-sm tabular-nums text-ink-700 sm:text-left">
          <span class="font-semibold text-ink-900">${esc(fmtNum(d.total))}</span>
          <span class="block text-xs text-ink-500 sm:inline">comments</span>
        </span>
        <span class="col-span-2 sm:col-span-1 sm:text-right">
          ${d.hasReport
            ? '<span class="tag-report">Analysis</span>'
            : '<span class="text-xs text-ink-400">Not yet analyzed</span>'}
        </span>
      </a>
    </li>`;
}

export function loadingBlock(lines = 3) {
  return `
    <div class="space-y-3" aria-busy="true" aria-label="Loading">
      ${Array.from({ length: lines }, (_, i) => `<div class="skeleton h-4" style="width:${90 - i * 12}%"></div>`).join('')}
    </div>`;
}

export function errorBlock(message) {
  return `
    <div class="card border-rose-200 bg-rose-50/50 p-6 text-sm text-rose-900">
      <p class="font-semibold">We couldn't load this data.</p>
      <p class="mt-1 text-rose-800">${esc(message)}</p>
      <button type="button" data-action="reload" class="btn-secondary mt-4">Try again</button>
    </div>`;
}
