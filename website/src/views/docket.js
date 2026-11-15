import { getDocket } from '../lib/data.js';
import { renderReport } from '../lib/markdown.js';
import {
  esc, fmtNum, fmtPct, fmtDate, daysUntil, decodeEntities, agencyName, regulationsUrl, commentUrl,
} from '../lib/format.js';
import { compositionBar, sentimentBar, icons, loadingBlock, errorBlock, emptyState } from '../components/ui.js';
import { openChat } from '../components/chat.js';
import { chatAvailable } from '../lib/api-client.js';

function stat(label, value, hint = '') {
  return `
    <div class="flex items-baseline justify-between gap-3 py-2.5">
      <dt class="text-sm text-ink-600">${label}${hint ? `<span class="block text-xs text-ink-400">${hint}</span>` : ''}</dt>
      <dd class="font-semibold tabular-nums text-ink-900">${value}</dd>
    </div>`;
}

function deadline(end) {
  const days = daysUntil(end);
  if (days == null) return '';
  if (days < 0) return `<span class="text-ink-500">Comment period closed ${esc(fmtDate(end))}</span>`;
  const urgent = days <= 7;
  return `<span class="${urgent ? 'font-semibold text-rose-700' : 'text-ink-700'}">Comments close ${esc(fmtDate(end))} (${days === 0 ? 'today' : `${days} day${days === 1 ? '' : 's'} left`})</span>`;
}

function glanceCard(docketTotal, report, analysis) {
  const meta = report?.report_metadata || {};
  const retrieved = meta.total_comments ?? analysis?.total_comments;
  const formPct = meta.form_letter_pct ?? (analysis?.form_letter_percentage != null ? Number(analysis.form_letter_percentage) : null);
  const sample = meta.sample_size;
  const partial = retrieved != null && docketTotal > retrieved;
  return `
    <div class="card p-5">
      <dl class="grid grid-cols-2 gap-4 font-mono">
        <div><dt class="text-xs text-ink-500">comments</dt><dd class="mt-1 text-2xl font-bold text-ink-900">${esc(fmtNum(docketTotal))}</dd></div>
        ${sample != null ? `<div><dt class="text-xs text-ink-500">read by AI</dt><dd class="mt-1 text-2xl font-bold text-ink-900">${esc(fmtNum(sample))}</dd></div>` : ''}
      </dl>
      ${formPct != null ? `<div class="mt-5">${compositionBar(formPct, { height: 'h-2', label: true })}</div>` : ''}
      ${partial ? `<p class="mt-4 text-xs leading-relaxed text-ink-500">Based on the ${esc(fmtNum(retrieved))} comments retrieved so far.</p>` : ''}
    </div>`;
}

function tocCard(toc) {
  if (toc.length < 3) return '';
  return `
    <nav class="card hidden p-5 lg:block" aria-label="In this analysis">
      <h2 class="eyebrow">in this analysis</h2>
      <ol class="mt-3 space-y-1.5 text-sm">
        ${toc.map((t) => `<li><a href="#${t.id}" data-toc="${t.id}" class="block border-l-2 border-transparent py-0.5 pl-3 text-ink-600 transition-colors hover:border-ink-300 hover:text-ink-900">${esc(t.text)}</a></li>`).join('')}
      </ol>
    </nav>`;
}

function structuredSections(analysis) {
  if (!analysis) return '';
  const themes = Array.isArray(analysis.themes) ? [...analysis.themes].sort((a, b) => (b.count || 0) - (a.count || 0)) : [];
  const campaigns = Array.isArray(analysis.campaigns) ? analysis.campaigns : [];
  const notable = Array.isArray(analysis.notable_comments) ? analysis.notable_comments : [];
  const maxCount = Math.max(1, ...themes.map((t) => t.count || 0));
  const toneClass = { support: 'bg-emerald-500', oppose: 'bg-rose-500' };

  return `
    <section class="mt-14 space-y-10 border-t border-ink-100 pt-10" aria-labelledby="structured-heading">
      <div>
        <p class="eyebrow">Structured analysis</p>
        <h2 id="structured-heading" class="mt-2 font-sans text-2xl font-semibold tracking-tight text-ink-900">Themes and sentiment</h2>
        <p class="mt-2 text-sm text-ink-500">From a separate classification pass${analysis.analyzed_at ? ` on ${esc(fmtDate(analysis.analyzed_at))}` : ''}, which may cover a different sample than the analysis above.</p>
      </div>

      ${analysis.sentiment ? `
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Position on the proposal</h3>
          <div class="mt-3">${sentimentBar(analysis.sentiment)}</div>
        </div>` : ''}

      ${themes.length ? `
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Most-raised themes</h3>
          <ul class="mt-4 space-y-5">
            ${themes.map((t) => `
              <li>
                <div class="flex items-baseline justify-between gap-4">
                  <span class="font-medium text-ink-900">${esc(t.name)}</span>
                  <span class="shrink-0 text-xs tabular-nums text-ink-500">${esc(fmtNum(t.count))} ${t.count === 1 ? 'mention' : 'mentions'}</span>
                </div>
                <div class="mt-1.5 h-1 rounded-full bg-ink-100"><div class="h-1 rounded-full ${toneClass[t.sentiment] || 'bg-ink-400'}" style="width:${Math.round(((t.count || 0) / maxCount) * 100)}%"></div></div>
                ${t.description ? `<p class="mt-2 text-sm leading-relaxed text-ink-600">${esc(t.description)}</p>` : ''}
              </li>`).join('')}
          </ul>
        </div>` : ''}

      ${campaigns.length ? `
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Form-letter campaigns</h3>
          <ul class="mt-4 space-y-3">
            ${campaigns.map((c) => `
              <li class="rounded-lg border border-campaign-100 bg-campaign-100/30 p-4">
                <div class="flex items-center justify-between gap-3 text-xs">
                  <span class="font-semibold text-campaign-700">${esc(fmtNum(c.comment_count))} identical comments</span>
                  ${c.percentage != null ? `<span class="text-ink-500">${esc(fmtPct(c.percentage, 1))} of retrieved</span>` : ''}
                </div>
                <p class="mt-2 line-clamp-3 font-sans text-sm leading-relaxed text-ink-700">“${esc(decodeEntities(c.template_snippet))}…”</p>
              </li>`).join('')}
          </ul>
        </div>` : ''}

      ${notable.length ? `
        <div>
          <h3 class="text-sm font-semibold text-ink-900">Notable comments</h3>
          <ul class="mt-4 space-y-4">
            ${notable.map((n) => `
              <li class="card p-5">
                <blockquote class="font-sans leading-relaxed text-ink-800">“${esc(decodeEntities(n.excerpt))}”</blockquote>
                <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
                  <span><span class="font-semibold text-ink-800">${esc(n.author || 'Anonymous')}</span>${n.organization ? `, ${esc(n.organization)}` : ''}</span>
                  ${n.comment_id ? `<a class="font-mono hover:text-accent-700" href="https://www.regulations.gov/comment/${encodeURIComponent(n.comment_id)}" target="_blank" rel="noopener noreferrer">${esc(n.comment_id)}</a>` : ''}
                </div>
                ${n.why_notable ? `<p class="mt-2 text-xs text-ink-500">Why it stands out: ${esc(n.why_notable)}</p>` : ''}
              </li>`).join('')}
          </ul>
        </div>` : ''}
    </section>`;
}

function pendingState(docket) {
  return `
    <div class="card">
      ${emptyState({
        figure: 'drawer',
        title: 'No analysis yet',
        body: `We track this docket but haven't analyzed its ${esc(fmtNum(docket.total_comments_at_sync))} comments yet.`,
        action: `<a href="${regulationsUrl(docket.id)}" target="_blank" rel="noopener noreferrer" class="btn-secondary mt-5">Read them on Regulations.gov ${icons.external}</a>`,
      })}
    </div>`;
}

export async function docketView(main, { id }) {
  main.innerHTML = `
    <div class="container-page py-12">
      <div class="max-w-3xl space-y-4">
        <div class="skeleton h-4 w-40"></div>
        <div class="skeleton h-10 w-full"></div>
        <div class="skeleton h-10 w-2/3"></div>
      </div>
      <div class="mt-12 grid gap-10 lg:grid-cols-12">
        <div class="lg:col-span-8">${loadingBlock(8)}</div>
      </div>
    </div>`;

  let data;
  try {
    data = await getDocket(id);
  } catch (err) {
    main.innerHTML = `<div class="container-page py-16">${errorBlock(err.message)}</div>`;
    return { title: id };
  }

  const { docket, analysis, report } = data;
  if (!docket) {
    main.innerHTML = `
      <div class="container-page py-24 text-center">
        <p class="eyebrow">Not found</p>
        <h1 class="mt-3 font-sans text-3xl font-semibold text-ink-900">We don't track docket “${esc(id)}”</h1>
        <p class="mt-3 text-ink-600">It may still exist on Regulations.gov.</p>
        <div class="mt-8 flex justify-center gap-3">
          <a class="btn-primary" href="/dockets">Browse dockets</a>
          <a class="btn-secondary" href="${regulationsUrl(id)}" target="_blank" rel="noopener noreferrer">Search Regulations.gov ${icons.external}</a>
        </div>
      </div>`;
    return { title: 'Docket not found', status: 404 };
  }

  const total = docket.total_comments_at_sync ?? 0;
  const rendered = report ? renderReport(report.report_html) : null;
  const summaryAnalysis = !report && analysis?.executive_summary ? renderReport(analysis.executive_summary) : null;
  const body = rendered || summaryAnalysis;
  const closes = deadline(docket.comment_end_date);
  const daysLeft = daysUntil(docket.comment_end_date);
  const canComment = daysLeft != null && daysLeft >= 0;

  main.innerHTML = `
    <article>
      <header class="border-b border-ink-100">
        <div class="container-page pb-10 pt-8 sm:pt-10">
          <nav class="text-sm text-ink-500" aria-label="Breadcrumb">
            <a href="/dockets" class="hover:text-ink-900">Analyses</a>
            <span class="mx-1.5 text-ink-300">/</span>
            <a href="/dockets?agency=${encodeURIComponent(docket.agency)}" class="hover:text-ink-900">${esc(docket.agency)}</a>
          </nav>
          <div class="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
            <span class="tag-agency">${esc(docket.agency)}</span>
            <span class="text-ink-600">${esc(agencyName(docket.agency, docket.agency_name))}</span>
            <span class="text-ink-300" aria-hidden="true">·</span>
            <span class="font-mono text-xs text-ink-500">${esc(docket.id)}</span>
          </div>
          <h1 class="mt-4 max-w-4xl text-3xl font-semibold leading-[1.05] tracking-[-0.035em] text-ink-900 sm:text-4xl lg:text-5xl">${esc(docket.title)}</h1>
          ${docket.abstract ? `<p class="mt-5 max-w-3xl text-lg leading-relaxed text-ink-600">${esc(docket.abstract)}</p>` : ''}
          <div class="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-ink-600">
            <span><span class="font-semibold text-ink-900">${esc(fmtNum(total))}</span> public comments</span>
            ${closes}
            ${report?.generated_at ? `<span>Analysis published ${esc(fmtDate(report.generated_at))}</span>` : ''}
          </div>
          <div class="mt-7 flex flex-wrap gap-3">
            ${canComment ? `<a href="${commentUrl(docket.id)}" target="_blank" rel="noopener noreferrer" class="btn-primary">Submit a comment ${icons.external}</a>` : ''}
            <a href="${regulationsUrl(docket.id)}" target="_blank" rel="noopener noreferrer" class="${canComment ? 'btn-secondary' : 'btn-primary'}">View on Regulations.gov ${icons.external}</a>
            ${chatAvailable && body ? `<button type="button" id="ask-btn" class="btn-secondary">${icons.chat} Ask about this docket</button>` : ''}
          </div>
        </div>
      </header>

      <div class="container-page grid gap-10 py-10 lg:grid-cols-12 lg:gap-12">
        <div class="min-w-0 lg:col-span-8">
          ${body ? `
            <div class="mb-8 flex items-start gap-3 rounded-lg border border-ink-100 bg-white p-4 text-sm leading-relaxed text-ink-600">
              <svg class="mt-0.5 h-4 w-4 shrink-0 text-ink-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-7-4a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM9 9a.75.75 0 0 0 0 1.5h.25v2.75a.75.75 0 0 0 1.5 0V10.25A1.25 1.25 0 0 0 9.5 9H9Z" clip-rule="evenodd"/></svg>
              <p>Written by AI from public comments. Quotes come from commenters, and the claims in them have not been fact-checked. <a href="/about" class="font-medium text-accent-700 hover:underline">How this works</a></p>
            </div>
            <div class="report prose prose-report max-w-none prose-lg prose-headings:scroll-mt-24 prose-h2:mt-12 prose-h2:text-[1.6rem] prose-h3:text-lg prose-p:leading-[1.75] prose-blockquote:font-normal prose-blockquote:text-[1.05rem] prose-blockquote:leading-relaxed">
              ${body.html}
            </div>
            ${report ? `<p class="mt-10 border-t border-ink-100 pt-5 text-xs text-ink-500">Generated ${esc(fmtDate(report.generated_at, 'long') || '')}${report.model_used ? ` with ${esc(report.model_used)}` : ''}. Comments retrieved from Regulations.gov.</p>` : ''}
          ` : pendingState(docket)}
          ${structuredSections(analysis)}
        </div>

        <aside class="order-first lg:order-none lg:col-span-4">
          <div class="space-y-5 lg:sticky lg:top-24">
            ${glanceCard(total, report, analysis)}
            ${body ? tocCard(body.toc) : ''}
          </div>
        </aside>
      </div>
    </article>`;

  main.querySelector('#ask-btn')?.addEventListener('click', () => openChat(docket));
  if (body) watchToc(main);

  return {
    title: `${docket.title} (${docket.id})`,
    description: report
      ? `What ${fmtNum(total)} public comments say about the ${docket.agency} rule “${docket.title}”: AI analysis of arguments, campaigns, and notable voices.`
      : `${fmtNum(total)} public comments on the ${docket.agency} docket “${docket.title}”.`,
  };
}

function watchToc(main) {
  const links = main.querySelectorAll('[data-toc]');
  if (!links.length || !('IntersectionObserver' in window)) return;
  const byId = new Map([...links].map((a) => [a.dataset.toc, a]));
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      links.forEach((a) => a.classList.remove('!border-accent-600', '!text-ink-900', 'font-medium'));
      byId.get(entry.target.id)?.classList.add('!border-accent-600', '!text-ink-900', 'font-medium');
    }
  }, { rootMargin: '-15% 0px -70% 0px' });
  main.querySelectorAll('.report h2[id]').forEach((h) => observer.observe(h));
}
