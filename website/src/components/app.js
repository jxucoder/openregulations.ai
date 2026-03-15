/**
 * Main application component
 * 2-column layout: sidebar (dockets) + main content
 */

import { renderChat } from './chat.js';
import { renderReport } from './report.js';
import { formatNumber, daysUntil } from '../lib/utils.js';

// App state
let selectedDocketId = null;
let dockets = [];
let analysisCache = {};
let reportCache = {};
let chatOpen = false;

// Data source config
const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

// ============ Data Fetching ============

/**
 * Fetch from Supabase REST API directly
 */
async function supabaseFetch(table, params = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return [];

  const searchParams = new URLSearchParams();
  if (params.select) searchParams.set('select', params.select);
  if (params.order) searchParams.set('order', params.order);
  if (params.limit) searchParams.set('limit', params.limit);
  if (params.filter) {
    for (const [key, value] of Object.entries(params.filter)) {
      searchParams.set(key, value);
    }
  }

  const response = await fetch(
    `${SUPABASE_URL}/rest/v1/${table}?${searchParams}`,
    {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
      },
    }
  );

  if (!response.ok) return [];
  return response.json();
}

/**
 * Fetch dockets list (with analysis sentiment for sidebar)
 */
async function fetchDockets() {
  // Prefer worker if available
  if (WORKER_URL) {
    try {
      const response = await fetch(`${WORKER_URL}/dockets`);
      if (response.ok) {
        const data = await response.json();
        if (data.dockets?.length) return data.dockets;
      }
    } catch (e) {
      console.warn('Worker not available, falling back to Supabase');
    }
  }

  // Direct Supabase fallback
  const [rawDockets, analyses, reports] = await Promise.all([
    supabaseFetch('dockets', {
      select: 'id,title,agency,abstract,total_comments_at_sync,comment_end_date',
      order: 'total_comments_at_sync.desc.nullslast',
      limit: '50',
    }),
    supabaseFetch('analyses', {
      select: 'docket_id,sentiment,total_comments',
    }),
    supabaseFetch('reports', {
      select: 'docket_id',
    }),
  ]);

  const analysisMap = {};
  for (const a of analyses) analysisMap[a.docket_id] = a;
  const reportSet = new Set(reports.map(r => r.docket_id));

  return rawDockets.map(d => ({
    ...d,
    total_comments: d.total_comments_at_sync || 0,
    sentiment: analysisMap[d.id]?.sentiment || null,
    has_report: reportSet.has(d.id),
  }));
}

/**
 * Fetch single docket with analysis + report
 */
async function fetchDocketDetail(docketId) {
  // Prefer worker if available
  if (WORKER_URL) {
    try {
      const response = await fetch(`${WORKER_URL}/docket?id=${docketId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {
      console.warn('Worker not available, falling back to Supabase');
    }
  }

  // Direct Supabase fallback
  const [docketRows, analysisRows, reportRows] = await Promise.all([
    supabaseFetch('dockets', {
      select: '*',
      filter: { id: `eq.${docketId}` },
    }),
    supabaseFetch('analyses', {
      select: '*',
      filter: { docket_id: `eq.${docketId}` },
    }),
    supabaseFetch('reports', {
      select: '*',
      filter: { docket_id: `eq.${docketId}` },
    }),
  ]);

  return {
    docket: docketRows[0] || null,
    analysis: analysisRows[0] || null,
    report: reportRows[0] || null,
  };
}

// ============ Rendering ============

/**
 * Render the full application
 */
export async function renderApp(container) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-cream-50">
      <div class="text-center">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-900 mx-auto mb-4"></div>
        <p class="text-navy-500">Loading dockets...</p>
      </div>
    </div>
  `;

  dockets = await fetchDockets();

  container.innerHTML = `
    <div class="min-h-screen flex flex-col">
      ${renderHeader()}

      <div class="flex-1 flex">
        <!-- Sidebar -->
        <aside id="sidebar" class="w-80 bg-white border-r border-navy-100 flex flex-col">
          ${renderSidebar()}
        </aside>

        <!-- Main Content -->
        <main id="main-content" class="flex-1 bg-cream-50 overflow-y-auto">
          ${renderMainContent()}
        </main>
      </div>

      <!-- Floating Chat Button -->
      <button
        id="chat-fab"
        class="fixed bottom-6 right-6 w-14 h-14 bg-navy-900 hover:bg-navy-800 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 z-40"
        aria-label="Open chat"
      >
        <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
        </svg>
      </button>

      <!-- Chat Popup -->
      <div id="chat-popup" class="fixed bottom-24 right-6 w-96 bg-white rounded-2xl shadow-2xl border border-navy-100 z-50 hidden">
        <div class="flex items-center justify-between p-4 border-b border-navy-100">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 bg-navy-100 rounded-full flex items-center justify-center">
              <svg class="w-4 h-4 text-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
              </svg>
            </div>
            <div>
              <h3 class="font-semibold text-navy-900 text-sm">Ask About Regulations</h3>
              <p class="text-xs text-navy-500">${selectedDocketId ? selectedDocketId : 'All dockets'}</p>
            </div>
          </div>
          <button id="chat-close" class="p-1 hover:bg-navy-100 rounded-lg transition-colors">
            <svg class="w-5 h-5 text-navy-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div id="chat-container" class="h-96"></div>
      </div>

      <!-- Backdrop -->
      <div id="chat-backdrop" class="fixed inset-0 bg-black/20 z-30 hidden"></div>
    </div>
  `;

  initEventHandlers();
}

function renderHeader() {
  return `
    <header class="bg-navy-900 text-white">
      <div class="bg-navy-800 px-6 py-1.5 text-center">
        <p class="text-xs text-navy-300">
          Open source AI analysis powered by Claude & GPT models.
          <span class="text-navy-400">Not affiliated with any government.</span>
        </p>
      </div>
      <div class="px-6 h-14 flex items-center justify-between border-t border-navy-700">
        <div class="flex items-center space-x-3">
          <svg class="w-7 h-7" viewBox="0 0 100 100" fill="none">
            <rect width="100" height="100" rx="8" fill="#243b53"/>
            <path d="M25 20h50v8H25zM25 35h50v4H25zM25 45h50v4H25zM25 55h35v4H25z" fill="#faf8f5"/>
            <circle cx="75" cy="70" r="15" fill="#10b981"/>
            <path d="M70 70l4 4 8-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round"/>
          </svg>
          <span class="text-lg font-serif font-bold">OpenRegulations.ai</span>
        </div>

        <nav class="flex items-center space-x-4 text-sm">
          <a href="https://regulations.gov" target="_blank" class="text-navy-300 hover:text-white transition-colors">
            Regulations.gov
          </a>
          <a href="https://github.com/openregulations" target="_blank" class="text-navy-300 hover:text-white transition-colors">
            GitHub
          </a>
        </nav>
      </div>
    </header>
  `;
}

function renderSidebar() {
  if (!dockets.length) {
    return `
      <div class="p-4 border-b border-navy-100">
        <h2 class="text-xs font-semibold text-navy-500 uppercase tracking-wider">Active Dockets</h2>
      </div>
      <div class="flex-1 flex items-center justify-center p-6">
        <p class="text-sm text-navy-400 text-center">No dockets found. Check your Supabase connection.</p>
      </div>
    `;
  }

  return `
    <div class="p-4 border-b border-navy-100">
      <div class="relative">
        <input
          type="text"
          id="docket-search"
          class="w-full pl-9 pr-4 py-2 text-sm border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-navy-500 focus:border-transparent"
          placeholder="Search dockets..."
        />
        <svg class="absolute left-3 top-2.5 w-4 h-4 text-navy-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
      </div>
    </div>

    <div class="p-4 border-b border-navy-100">
      <h2 class="text-xs font-semibold text-navy-500 uppercase tracking-wider mb-3">Active Dockets</h2>
      <div class="text-xs text-navy-400">${dockets.length} dockets tracked</div>
    </div>

    <div id="docket-list" class="flex-1 overflow-y-auto">
      ${dockets.map(d => renderSidebarDocket(d)).join('')}
    </div>

    <div class="p-4 border-t border-navy-100 bg-navy-50">
      <p class="text-xs text-navy-500">
        Data from <a href="https://regulations.gov" class="underline hover:text-navy-700">Regulations.gov</a>
      </p>
    </div>
  `;
}

function renderSidebarDocket(docket) {
  const isSelected = docket.id === selectedDocketId;
  const commentEnd = docket.comment_end_date || docket.comment_period_end;
  const days = daysUntil(commentEnd);
  const daysText = commentEnd ? (days > 0 ? `${days}d left` : 'Closed') : '';
  const totalComments = docket.total_comments || docket.total_comments_at_sync || 0;

  // Sentiment bar (only if analysis has sentiment data)
  const sentiment = docket.sentiment;
  const sentimentBar = sentiment ? `
    <div class="mt-2 h-1 rounded-full overflow-hidden flex">
      <div class="bg-red-400" style="width: ${sentiment.oppose || 0}%"></div>
      <div class="bg-slate-300" style="width: ${sentiment.neutral || 0}%"></div>
      <div class="bg-emerald-400" style="width: ${sentiment.support || 0}%"></div>
    </div>
  ` : '';

  return `
    <div
      class="docket-item p-4 border-b border-navy-50 cursor-pointer transition-colors ${isSelected ? 'bg-navy-100 border-l-4 border-l-navy-600' : 'hover:bg-navy-50'}"
      data-docket-id="${docket.id}"
    >
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-medium text-navy-500">${docket.agency}</span>
        ${docket.has_report ? `
          <span class="text-xs text-emerald-600 flex items-center gap-0.5">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
            </svg>
            Report
          </span>
        ` : ''}
      </div>

      <h3 class="text-sm font-medium text-navy-900 line-clamp-2 mb-2">${docket.title}</h3>

      <div class="flex items-center justify-between text-xs text-navy-500">
        <span>${formatNumber(totalComments)} comments</span>
        ${daysText ? `<span class="${days <= 7 && days > 0 ? 'text-red-500' : ''}">${daysText}</span>` : ''}
      </div>

      ${sentimentBar}
    </div>
  `;
}

function renderMainContent() {
  if (selectedDocketId) {
    return renderDocketDetail();
  }
  return renderWelcome();
}

function renderWelcome() {
  return `
    <div class="h-full flex flex-col">
      <div class="flex-1 flex items-center justify-center p-8">
        <div class="max-w-xl text-center">
          <div class="w-16 h-16 mx-auto mb-6 bg-navy-100 rounded-full flex items-center justify-center">
            <svg class="w-8 h-8 text-navy-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
            </svg>
          </div>

          <h1 class="text-2xl font-serif font-bold text-navy-900 mb-3">
            Understand What America Is Saying
          </h1>
          <p class="text-navy-600 mb-8">
            AI-powered analysis of public comments on federal regulations.
            Select a docket from the sidebar to see the full analysis report.
          </p>

          <div class="grid grid-cols-2 gap-4 text-left max-w-md mx-auto">
            <div class="p-4 bg-white rounded-lg border border-navy-100">
              <div class="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-4 h-4 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
              </div>
              <h3 class="font-medium text-navy-900 text-sm">Form Letter Detection</h3>
              <p class="text-xs text-navy-500 mt-1">Identify organized campaigns</p>
            </div>

            <div class="p-4 bg-white rounded-lg border border-navy-100">
              <div class="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/>
                </svg>
              </div>
              <h3 class="font-medium text-navy-900 text-sm">Policy Analysis</h3>
              <p class="text-xs text-navy-500 mt-1">AI-written analyst reports</p>
            </div>

            <div class="p-4 bg-white rounded-lg border border-navy-100">
              <div class="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/>
                </svg>
              </div>
              <h3 class="font-medium text-navy-900 text-sm">Sentiment Analysis</h3>
              <p class="text-xs text-navy-500 mt-1">Support vs opposition</p>
            </div>

            <div class="p-4 bg-white rounded-lg border border-navy-100">
              <div class="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center mb-2">
                <svg class="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"/>
                </svg>
              </div>
              <h3 class="font-medium text-navy-900 text-sm">Notable Quotes</h3>
              <p class="text-xs text-navy-500 mt-1">Most impactful comments</p>
            </div>
          </div>

          <button
            id="welcome-chat-btn"
            class="mt-8 inline-flex items-center gap-2 px-6 py-3 bg-navy-900 hover:bg-navy-800 text-white rounded-lg transition-colors"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"/>
            </svg>
            Ask a Question
          </button>
        </div>
      </div>
    </div>
  `;
}

function renderDocketDetail() {
  const docket = dockets.find(d => d.id === selectedDocketId);
  const analysis = analysisCache[selectedDocketId];
  const report = reportCache[selectedDocketId];

  if (!docket) {
    return `<div class="p-8 text-center text-navy-500">Docket not found</div>`;
  }

  // Use report metadata for stats if available, fall back to analysis
  const meta = report?.report_metadata || {};
  const totalComments = meta.total_comments || analysis?.total_comments || docket.total_comments_at_sync || docket.total_comments || 0;
  const uniqueComments = meta.unique_comments || analysis?.unique_comments;
  const formLetterPct = meta.form_letter_pct ?? analysis?.form_letter_percentage;

  return `
    <div class="h-full flex flex-col">
      <div class="flex-1 overflow-y-auto">
        <div class="p-6 space-y-6">
          <!-- Header -->
          <div class="bg-white rounded-xl border border-navy-100 p-6">
            <div class="flex items-start justify-between mb-3">
              <span class="px-2 py-1 text-xs font-medium bg-navy-100 text-navy-700 rounded">${docket.agency}</span>
              <span class="text-sm text-navy-400">${docket.id}</span>
            </div>

            <h1 class="text-xl font-serif font-bold text-navy-900 mb-3">${docket.title}</h1>

            ${(docket.abstract) ? `
              <p class="text-sm text-navy-600 mb-4 leading-relaxed">${docket.abstract}</p>
            ` : ''}

            <!-- Stats row -->
            <div class="flex items-end justify-between pt-4 border-t border-navy-100">
              <div class="flex gap-8">
                <div>
                  <div class="text-2xl font-bold text-navy-900">${formatNumber(totalComments)}</div>
                  <div class="text-xs text-navy-500">Total Comments</div>
                </div>
                ${uniqueComments ? `
                  <div>
                    <div class="text-2xl font-bold text-navy-900">${uniqueComments}</div>
                    <div class="text-xs text-navy-500">Unique</div>
                  </div>
                ` : ''}
                ${formLetterPct != null ? `
                  <div>
                    <div class="text-2xl font-bold text-navy-900">${formLetterPct.toFixed(0)}%</div>
                    <div class="text-xs text-navy-500">Form Letters</div>
                  </div>
                ` : ''}
              </div>
              <div class="text-right">
                <div class="text-xs text-navy-400">Last updated</div>
                <div class="text-sm text-navy-600">${report?.generated_at ? new Date(report.generated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : analysis?.analyzed_at ? new Date(analysis.analyzed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</div>
              </div>
            </div>
          </div>

          ${report ? renderReport(report, docket) : (analysis ? renderAnalysisSections(analysis) : `
            <div class="bg-navy-50 rounded-xl p-8 text-center">
              <p class="text-navy-500">Analysis not yet available for this docket.</p>
            </div>
          `)}
        </div>
      </div>
    </div>
  `;
}

function renderAnalysisSections(analysis) {
  return `
    ${analysis.executive_summary ? `
      <div class="bg-white rounded-xl border border-navy-100 p-6">
        <h2 class="text-sm font-semibold text-navy-900 mb-4">Executive Summary</h2>
        <div class="prose prose-sm prose-navy max-w-none">
          ${analysis.executive_summary.split('\n').filter(p => p.trim()).map(p => `<p class="text-navy-600 mb-3">${p}</p>`).join('')}
        </div>
      </div>
    ` : ''}

    ${analysis.sentiment ? `
      <div class="bg-white rounded-xl border border-navy-100 p-6">
        <h2 class="text-sm font-semibold text-navy-900 mb-4">Sentiment Breakdown</h2>
        <div class="flex items-center gap-6">
          <div class="flex-1">
            <div class="h-4 rounded-full overflow-hidden flex bg-navy-100">
              <div class="bg-red-500 transition-all" style="width: ${analysis.sentiment.oppose || 0}%"></div>
              <div class="bg-slate-300 transition-all" style="width: ${analysis.sentiment.neutral || 0}%"></div>
              <div class="bg-emerald-500 transition-all" style="width: ${analysis.sentiment.support || 0}%"></div>
            </div>
          </div>
        </div>
        <div class="flex justify-between mt-3 text-sm">
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-red-500"></div>
            <span class="text-navy-600">Oppose <span class="font-semibold text-navy-900">${analysis.sentiment.oppose || 0}%</span></span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-slate-300"></div>
            <span class="text-navy-600">Neutral <span class="font-semibold text-navy-900">${analysis.sentiment.neutral || 0}%</span></span>
          </div>
          <div class="flex items-center gap-2">
            <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
            <span class="text-navy-600">Support <span class="font-semibold text-navy-900">${analysis.sentiment.support || 0}%</span></span>
          </div>
        </div>
      </div>
    ` : ''}

    ${analysis.themes?.length ? `
      <div class="bg-white rounded-xl border border-navy-100 p-6">
        <h2 class="text-sm font-semibold text-navy-900 mb-4">Key Themes</h2>
        <div class="space-y-4">
          ${analysis.themes.map(theme => `
            <div class="flex gap-4">
              <div class="w-1 rounded-full flex-shrink-0 ${theme.sentiment === 'support' ? 'bg-emerald-500' : theme.sentiment === 'oppose' ? 'bg-red-500' : 'bg-slate-300'}"></div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between mb-1">
                  <h3 class="font-medium text-navy-900">${theme.name}</h3>
                  <span class="text-xs text-navy-400 flex-shrink-0 ml-2">${theme.count} mentions</span>
                </div>
                <p class="text-sm text-navy-600 mb-2">${theme.description}</p>
                ${theme.sample_quote ? `
                  <p class="text-sm text-navy-400 italic border-l-2 border-navy-200 pl-3">"${theme.sample_quote.slice(0, 120)}..."</p>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}

    ${analysis.notable_comments?.length ? `
      <div class="bg-white rounded-xl border border-navy-100 p-6">
        <h2 class="text-sm font-semibold text-navy-900 mb-4">Notable Comments</h2>
        <div class="space-y-4">
          ${analysis.notable_comments.map(comment => `
            <div class="p-4 bg-cream-50 rounded-lg">
              <div class="flex items-center gap-2 mb-2">
                <div class="w-8 h-8 rounded-full bg-navy-200 flex items-center justify-center text-navy-600 text-sm font-medium">
                  ${(comment.author || 'A').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div class="font-medium text-navy-900 text-sm">${comment.author || 'Anonymous'}</div>
                  ${comment.organization ? `<div class="text-xs text-navy-400">${comment.organization}</div>` : ''}
                </div>
                ${comment.quality_score ? `
                  <div class="ml-auto flex items-center gap-1">
                    ${Array(comment.quality_score).fill().map(() => `
                      <svg class="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                      </svg>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
              <p class="text-navy-700 text-sm">"${comment.excerpt}"</p>
              ${comment.why_notable ? `
                <p class="mt-2 text-xs text-navy-500">
                  <span class="font-medium">Why notable:</span> ${comment.why_notable}
                </p>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ============ Event Handlers ============

function initEventHandlers() {
  document.querySelectorAll('.docket-item').forEach(item => {
    item.addEventListener('click', () => {
      selectDocket(item.dataset.docketId);
    });
  });

  const searchInput = document.getElementById('docket-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterDockets(e.target.value);
    });
  }

  const chatFab = document.getElementById('chat-fab');
  const chatPopup = document.getElementById('chat-popup');
  const chatClose = document.getElementById('chat-close');
  const chatBackdrop = document.getElementById('chat-backdrop');
  const welcomeChatBtn = document.getElementById('welcome-chat-btn');

  const openChat = () => {
    chatOpen = true;
    chatPopup.classList.remove('hidden');
    chatBackdrop.classList.remove('hidden');
    chatFab.classList.add('hidden');
    const chatContainer = document.getElementById('chat-container');
    if (chatContainer && !chatContainer.hasChildNodes()) {
      renderChat(chatContainer, selectedDocketId);
    }
  };

  const closeChat = () => {
    chatOpen = false;
    chatPopup.classList.add('hidden');
    chatBackdrop.classList.add('hidden');
    chatFab.classList.remove('hidden');
  };

  chatFab?.addEventListener('click', openChat);
  chatClose?.addEventListener('click', closeChat);
  chatBackdrop?.addEventListener('click', closeChat);
  welcomeChatBtn?.addEventListener('click', openChat);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatOpen) closeChat();
  });
}

async function selectDocket(docketId) {
  selectedDocketId = docketId;

  document.querySelectorAll('.docket-item').forEach(item => {
    const isSelected = item.dataset.docketId === docketId;
    item.classList.toggle('bg-navy-100', isSelected);
    item.classList.toggle('border-l-4', isSelected);
    item.classList.toggle('border-l-navy-600', isSelected);
  });

  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = `
    <div class="h-full flex items-center justify-center">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-900 mx-auto mb-3"></div>
        <p class="text-sm text-navy-500">Loading analysis...</p>
      </div>
    </div>
  `;

  const { docket, analysis, report } = await fetchDocketDetail(docketId);

  if (docket) {
    const idx = dockets.findIndex(d => d.id === docketId);
    if (idx >= 0) dockets[idx] = { ...dockets[idx], ...docket };
  }
  if (analysis) analysisCache[docketId] = analysis;
  if (report) reportCache[docketId] = report;

  mainContent.innerHTML = renderMainContent();

  const chatSubtitle = document.querySelector('#chat-popup p.text-xs');
  if (chatSubtitle) chatSubtitle.textContent = selectedDocketId || 'All dockets';

  const chatContainer = document.getElementById('chat-container');
  if (chatContainer) renderChat(chatContainer, selectedDocketId);
}

function filterDockets(searchTerm) {
  const term = searchTerm.toLowerCase();
  document.querySelectorAll('.docket-item').forEach(item => {
    const docketId = item.dataset.docketId;
    const docket = dockets.find(d => d.id === docketId);
    const matches = !term ||
      docket.id.toLowerCase().includes(term) ||
      docket.title.toLowerCase().includes(term) ||
      docket.agency.toLowerCase().includes(term);
    item.style.display = matches ? 'block' : 'none';
  });
}
