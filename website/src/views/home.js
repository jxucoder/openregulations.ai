import { getDockets, getDocket } from '../lib/data.js';
import { renderReport } from '../lib/markdown.js';
import { esc, fmtNum, fmtCompact } from '../lib/format.js';
import { reportRow, icons, loadingBlock, errorBlock } from '../components/ui.js';

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export async function homeView(main) {
  main.innerHTML = `
    <section class="field-grid relative isolate overflow-hidden bg-accent-600 text-white">
      <div class="relative mx-auto grid min-h-[calc(100svh-4rem)] w-full max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 lg:grid-cols-[1.35fr_1fr] lg:px-8 lg:py-10">
        <div>
          <p class="rise font-mono text-sm text-white/75" style="--d:0ms">
            <span class="mr-2 inline-block h-2 w-2 animate-pulse bg-campaign-400 align-middle"></span>reading Regulations.gov
          </p>
          <h1 class="mt-6 text-[clamp(3rem,6.4vw,6rem)] font-black leading-[0.92] tracking-[-0.055em]">
            <span class="rise block" style="--d:80ms">AI analysis</span>
            <span class="rise block" style="--d:160ms">of public</span>
            <span class="rise block" style="--d:240ms">comments on</span>
            <span class="rise block" style="--d:320ms"><span class="relative inline-block">federal rules.<span class="underline-sweep" aria-hidden="true"></span></span></span>
          </h1>
          <p class="rise mt-8 max-w-md text-lg leading-relaxed text-white/85 sm:text-xl" style="--d:420ms">
            What thousands of commenters told the agency, in a few minutes of reading.
          </p>
          <a href="/dockets" class="rise group mt-9 inline-flex items-center gap-3 bg-white px-6 py-4 text-base font-extrabold text-ink-900 transition hover:bg-campaign-400" style="--d:500ms">
            Browse analyses <span class="transition-transform group-hover:translate-x-1">${icons.arrowRight}</span>
          </a>
        </div>

        <div class="rise relative mx-auto w-full max-w-xl" style="--d:300ms">
          <div class="fig-field pointer-events-auto w-full opacity-90" data-figure="terrain" data-play="1"
            data-label="Pillars rising like comment volume"></div>
          <figure id="analyst" class="relative -mt-24 ml-auto w-[92%] bg-ink-900 text-white shadow-[0_40px_80px_-30px_rgba(4,8,50,0.8)] sm:-mt-32" aria-live="off">
            <figcaption class="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3 font-mono text-xs">
              <span class="flex items-center gap-2"><span class="h-1.5 w-1.5 animate-pulse rounded-full bg-campaign-400"></span><span class="text-white/60">analyzing</span> <span id="analyst-id" class="text-white">…</span></span>
              <span id="analyst-count" class="text-white/50"></span>
            </figcaption>
            <p id="analyst-text" class="min-h-[9.5rem] px-4 py-4 text-[15px] leading-relaxed text-white/90 sm:text-base"><span class="caret"></span></p>
            <a id="analyst-link" href="/dockets" class="flex items-center justify-between border-t border-white/10 px-4 py-3 text-sm font-bold text-campaign-400 hover:bg-white/5">
              <span id="analyst-title" class="truncate pr-4">Read the analysis</span>${icons.arrowRight}
            </a>
          </figure>
        </div>
      </div>
    </section>

    <div class="overflow-hidden border-y border-ink-900 bg-ink-900 py-3 text-white" aria-hidden="true">
      <div id="ticker" class="ticker flex w-max gap-10 font-mono text-[13px]"></div>
    </div>

    <section class="container-page py-16 sm:py-20">
      <div class="flex items-end justify-between gap-4">
        <h2 class="text-3xl font-black tracking-[-0.04em] text-ink-900 sm:text-5xl">Latest analyses</h2>
        <a href="/dockets" class="inline-flex items-center gap-1.5 pb-1 text-sm font-bold text-accent-700 hover:text-ink-900">All ${icons.arrowRight}</a>
      </div>
      <ol id="home-reports" class="mt-8 border-t-[3px] border-ink-900">
        <li class="py-6">${loadingBlock(4)}</li>
      </ol>
    </section>
  `;

  const list = main.querySelector('#home-reports');
  let dockets;
  try {
    dockets = await getDockets();
  } catch (err) {
    list.innerHTML = `<li class="py-6">${errorBlock(err.message)}</li>`;
    return;
  }

  const analyzed = dockets.filter((d) => d.hasReport);
  const latest = [...analyzed]
    .sort((a, b) => String(b.reportAt || '').localeCompare(String(a.reportAt || '')))
    .slice(0, 8);
  list.innerHTML = latest.length
    ? latest.map((d, i) => reportRow(d, i)).join('')
    : '<li class="py-6 text-ink-500">No analyses have been published yet.</li>';

  const items = analyzed.map((d) => `
    <span class="flex items-center gap-3 whitespace-nowrap">
      <span class="font-bold text-campaign-400">${esc(d.agency)}</span>
      <span class="text-white/80">${esc(d.id)}</span>
      <span class="text-white/50">${esc(fmtCompact(d.total))} comments</span>
    </span>`).join('<span class="text-white/25">/</span>');
  // Two copies so the loop is seamless.
  main.querySelector('#ticker').innerHTML = items + '<span class="text-white/25">/</span>' + items;

  runAnalyst(main, latest);
}

/** Plain-text opening of a report: its first real paragraph, cut at a sentence end. */
function openingOf(reportHtml) {
  const tpl = document.createElement('template');
  tpl.innerHTML = renderReport(reportHtml).html;
  const para = [...tpl.content.querySelectorAll('p')].map((p) => p.textContent.trim()).find((t) => t.length > 120) || '';
  if (para.length <= 300) return para;
  const cut = para.slice(0, 300);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('; '));
  return end > 140 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`;
}

async function runAnalyst(main, dockets) {
  const card = main.querySelector('#analyst');
  if (!card || !dockets.length) return;
  const $ = (id) => card.querySelector(`#${id}`);
  const alive = () => card.isConnected;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let misses = 0;
  for (let i = 0; alive(); i = (i + 1) % dockets.length) {
    const d = dockets[i];
    let text = '';
    try {
      const { report } = await getDocket(d.id);
      text = report ? openingOf(report.report_html) : '';
    } catch { /* skip this one */ }
    if (!alive()) return;
    if (!text) {
      // A full pass with nothing to show: stop rather than spin.
      if (++misses >= dockets.length) {
        if (!$('analyst-text').textContent.trim()) {
          $('analyst-text').textContent = 'Pick an analysis below to read what commenters argued.';
        }
        return;
      }
      await sleep(50);
      continue;
    }
    misses = 0;

    $('analyst-id').textContent = d.id;
    $('analyst-count').textContent = `${fmtNum(d.total)} comments`;
    $('analyst-title').textContent = d.title;
    $('analyst-link').setAttribute('href', `/docket/${encodeURIComponent(d.id)}`);
    const out = $('analyst-text');

    if (REDUCED) {
      out.textContent = text;
      return;
    }
    for (let n = 0; n <= text.length && alive(); n += 2) {
      out.innerHTML = `${esc(text.slice(0, n))}<span class="caret"></span>`;
      await sleep(14);
    }
    await sleep(4200);
  }
}
