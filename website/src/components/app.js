/**
 * Main application component
 * 2-column layout: sidebar (dockets) + main content
 */

import { renderChat } from './chat.js';
import { formatNumber, daysUntil } from '../lib/utils.js';

// App state
let selectedDocketId = null;
let dockets = [];
let chatOpen = false;

// Sample data - will be replaced by API data
const SAMPLE_DOCKETS = [
  {
    id: 'NHTSA-2025-0491',
    title: 'Corporate Average Fuel Economy Standards',
    agency: 'NHTSA',
    summary: 'NHTSA is proposing to roll back Corporate Average Fuel Economy (CAFE) standards for passenger cars and light trucks for model years 2022-2031. The proposed rule would reduce required fuel efficiency improvements, potentially lowering the average fleet requirement from the current trajectory. This rulemaking affects all automakers selling vehicles in the United States.',
    total_comments: 4957,
    sentiment: { oppose: 98, support: 2, neutral: 0 },
    comment_period_end: '2026-02-15',
    is_trending: true,
    tags: ['environment', 'automotive']
  },
  {
    id: 'FAA-2025-1908',
    title: 'Remote Identification of Unmanned Aircraft',
    agency: 'FAA',
    summary: 'The FAA proposes requiring remote identification capability for most unmanned aircraft (drones) operating in U.S. airspace. Remote ID would broadcast identification and location information, enabling tracking of drones in flight by law enforcement and federal agencies.',
    total_comments: 3129,
    sentiment: { oppose: 45, support: 40, neutral: 15 },
    comment_period_end: '2026-02-28',
    is_trending: false,
    tags: ['technology', 'aviation']
  },
  {
    id: 'FDA-2023-P-3942',
    title: 'Gluten-Free Labeling of Fermented Foods',
    agency: 'FDA',
    summary: 'FDA is seeking comments on whether to allow fermented and hydrolyzed foods to bear a "gluten-free" label when compliance cannot be verified using current testing methods. This affects products like beer, soy sauce, and yogurt where gluten proteins may be broken down during fermentation.',
    total_comments: 1855,
    sentiment: { oppose: 20, support: 70, neutral: 10 },
    comment_period_end: '2026-03-01',
    is_trending: false,
    tags: ['health', 'food']
  }
];

// Sample analysis data (can be updated with API data)
let SAMPLE_ANALYSIS = {
  'NHTSA-2025-0491': {
    total_comments: 4957,
    unique_comments: 56,
    form_letter_count: 154,
    form_letter_percentage: 73.3,
    high_quality_count: 4,
    last_updated: 'Feb 2, 2026',
    sentiment: { oppose: 98, support: 2, neutral: 0 },
    themes: [
      { name: 'Consumer Cost Savings', count: 25, sentiment: 'oppose', description: 'Arguments that fuel economy standards save consumers money through reduced fuel costs.', sample_quote: 'Current CAFE standards are estimated to save drivers around $7,000 in fuel costs over the lifetime of a vehicle.' },
      { name: 'Public Health & Air Quality', count: 20, sentiment: 'oppose', description: 'Concerns about increased emissions affecting health, especially in vulnerable communities.', sample_quote: 'Rolling back fuel efficiency allows more harmful emissions into the air we breathe.' },
      { name: 'Climate Change', count: 18, sentiment: 'oppose', description: 'Transportation as a major source of climate emissions.', sample_quote: 'Transportation remains the largest source of climate-warming emissions in the United States.' },
      { name: 'U.S. Competitiveness', count: 15, sentiment: 'oppose', description: 'Concerns about falling behind China and other countries in EV development.', sample_quote: 'Dropping CAFE standards gives a strategic advantage to China\'s EV industry.' },
      { name: 'Innovation & Technology', count: 12, sentiment: 'oppose', description: 'Standards drive automaker innovation in cleaner technologies.', sample_quote: 'For decades, fuel economy standards have pushed automakers to innovate and improve efficiency.' },
    ],
    notable_comments: [
      { author: 'Carolyn Petrakis', excerpt: 'I am a retired clinical social worker with decades of experience in healthcare... Strong fuel economy standards save people money and protect public health.', why_notable: 'Professional healthcare perspective with specific cost data', quality_score: 4 },
      { author: 'Alex Moore-VanDyke', excerpt: 'Transportation is the second-largest household expense for American families, accounting for about 15% of average spending. For lower-income households, the burden is far worse.', why_notable: 'Detailed economic analysis with statistics', quality_score: 5 },
      { author: 'Alexis Alt', excerpt: 'Dropping or weakening CAFE standards gives a strategic advantage to China\'s EV industry, allowing them to gain a stronger foothold in global markets.', why_notable: 'Geopolitical analysis of competitive implications', quality_score: 4 },
    ],
    executive_summary: 'Public sentiment is overwhelmingly opposed (98%) to proposed fuel economy standard rollbacks. Commenters cite consumer savings, public health, climate protection, and U.S. competitiveness as key concerns.\n\nThe primary arguments center on five areas: economic impacts on consumers, public health consequences, environmental effects, automotive industry competitiveness, and technological innovation.\n\nForm letter campaigns account for 73% of comments, indicating organized advocacy from environmental groups. However, the unique substantive comments consistently oppose the rollback across diverse demographic groups.'
  }
};

// API URL - set via env or use sample data
const API_URL = import.meta.env.VITE_WORKER_URL || '';

/**
 * Fetch dockets from API
 */
async function fetchDockets() {
  if (!API_URL) return SAMPLE_DOCKETS;
  
  try {
    const response = await fetch(`${API_URL}/dockets`);
    if (response.ok) {
      const data = await response.json();
      return data.dockets?.length ? data.dockets : SAMPLE_DOCKETS;
    }
  } catch (e) {
    console.warn('API not available, using sample data');
  }
  return SAMPLE_DOCKETS;
}

/**
 * Fetch single docket with analysis from API
 */
async function fetchDocketDetail(docketId) {
  if (!API_URL) {
    return {
      docket: SAMPLE_DOCKETS.find(d => d.id === docketId),
      analysis: SAMPLE_ANALYSIS[docketId]
    };
  }
  
  try {
    const response = await fetch(`${API_URL}/docket?id=${docketId}`);
    if (response.ok) {
      const data = await response.json();
      // Merge with sample data for any missing fields
      const sampleDocket = SAMPLE_DOCKETS.find(d => d.id === docketId);
      const sampleAnalysis = SAMPLE_ANALYSIS[docketId];
      return {
        docket: { ...sampleDocket, ...data.docket },
        analysis: data.analysis || sampleAnalysis
      };
    }
  } catch (e) {
    console.warn('Failed to fetch docket detail');
  }
  
  return {
    docket: SAMPLE_DOCKETS.find(d => d.id === docketId),
    analysis: SAMPLE_ANALYSIS[docketId]
  };
}

/**
 * Render the full application
 */
export async function renderApp(container) {
  // Show loading state
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-cream-50">
      <div class="text-center">
        <div class="animate-spin rounded-full h-10 w-10 border-b-2 border-navy-900 mx-auto mb-4"></div>
        <p class="text-navy-500">Loading dockets...</p>
      </div>
    </div>
  `;
  
  // Fetch dockets
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
  
  // Initialize event handlers
  initEventHandlers();
}

/**
 * Render header
 */
function renderHeader() {
  return `
    <header class="bg-navy-900 text-white">
      <!-- Disclaimer banner -->
      <div class="bg-navy-800 px-6 py-1.5 text-center">
        <p class="text-xs text-navy-300">
          Open source AI analysis powered by Claude & GPT models. 
          <span class="text-navy-400">Not affiliated with any government.</span>
        </p>
      </div>
      <!-- Main header -->
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

/**
 * Render sidebar
 */
function renderSidebar() {
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
      <div class="text-xs text-navy-400">${dockets.length} dockets analyzed</div>
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

/**
 * Render sidebar docket item
 */
function renderSidebarDocket(docket) {
  const isSelected = docket.id === selectedDocketId;
  const days = daysUntil(docket.comment_period_end);
  const daysText = days > 0 ? `${days}d left` : 'Closed';
  
  return `
    <div 
      class="docket-item p-4 border-b border-navy-50 cursor-pointer transition-colors ${isSelected ? 'bg-navy-100 border-l-4 border-l-navy-600' : 'hover:bg-navy-50'}"
      data-docket-id="${docket.id}"
    >
      <div class="flex items-center justify-between mb-1">
        <span class="text-xs font-medium text-navy-500">${docket.agency}</span>
        ${docket.is_trending ? `
          <span class="text-xs text-amber-600 flex items-center">
            <svg class="w-3 h-3 mr-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z"/>
            </svg>
            Hot
          </span>
        ` : ''}
      </div>
      
      <h3 class="text-sm font-medium text-navy-900 line-clamp-2 mb-2">${docket.title}</h3>
      
      <div class="flex items-center justify-between text-xs text-navy-500">
        <span>${formatNumber(docket.total_comments)} comments</span>
        <span class="${days <= 7 ? 'text-red-500' : ''}">${daysText}</span>
      </div>
      
      <!-- Mini sentiment bar -->
      <div class="mt-2 h-1 rounded-full overflow-hidden flex">
        <div class="bg-red-400" style="width: ${docket.sentiment.oppose}%"></div>
        <div class="bg-slate-300" style="width: ${docket.sentiment.neutral}%"></div>
        <div class="bg-emerald-400" style="width: ${docket.sentiment.support}%"></div>
      </div>
    </div>
  `;
}

/**
 * Render main content area
 */
function renderMainContent() {
  if (selectedDocketId) {
    return renderDocketDetail();
  }
  return renderWelcome();
}

/**
 * Render welcome/home state
 */
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
            Select a docket from the sidebar to see themes, sentiment, and key arguments.
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
              <h3 class="font-medium text-navy-900 text-sm">Theme Extraction</h3>
              <p class="text-xs text-navy-500 mt-1">Key topics and arguments</p>
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

/**
 * Render docket detail view
 */
function renderDocketDetail() {
  const docket = dockets.find(d => d.id === selectedDocketId);
  const analysis = SAMPLE_ANALYSIS[selectedDocketId];
  
  if (!docket) {
    return `<div class="p-8 text-center text-navy-500">Docket not found</div>`;
  }
  
  return `
    <div class="h-full flex flex-col">
      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto">
        <div class="p-6 space-y-6">
          <!-- Header -->
          <div class="bg-white rounded-xl border border-navy-100 p-6">
            <div class="flex items-start justify-between mb-3">
              <span class="px-2 py-1 text-xs font-medium bg-navy-100 text-navy-700 rounded">${docket.agency}</span>
              <span class="text-sm text-navy-400">${docket.id}</span>
            </div>
            
            <h1 class="text-xl font-serif font-bold text-navy-900 mb-3">${docket.title}</h1>
            
            ${(docket.summary || docket.abstract) ? `
              <p class="text-sm text-navy-600 mb-4 leading-relaxed">${docket.summary || docket.abstract}</p>
            ` : ''}
            
            <!-- Stats row -->
            <div class="flex items-end justify-between pt-4 border-t border-navy-100">
              <div class="flex gap-8">
                <div>
                  <div class="text-2xl font-bold text-navy-900">${formatNumber(analysis?.total_comments || docket.total_comments)}</div>
                  <div class="text-xs text-navy-500">Total Comments</div>
                </div>
                <div>
                  <div class="text-2xl font-bold text-navy-900">${analysis?.unique_comments || '—'}</div>
                  <div class="text-xs text-navy-500">Unique</div>
                </div>
                <div>
                  <div class="text-2xl font-bold text-navy-900">${analysis?.form_letter_percentage?.toFixed(0) || '—'}%</div>
                  <div class="text-xs text-navy-500">Form Letters</div>
                </div>
                <div>
                  <div class="text-2xl font-bold text-navy-900">${analysis?.high_quality_count || '—'}</div>
                  <div class="text-xs text-navy-500">High Quality</div>
                </div>
              </div>
              <div class="text-right">
                <div class="text-xs text-navy-400">Last updated</div>
                <div class="text-sm text-navy-600">${analysis?.last_updated || 'Feb 2, 2026'}</div>
              </div>
            </div>
          </div>
          
          ${analysis ? renderAnalysisSections(analysis) : `
            <div class="bg-navy-50 rounded-xl p-8 text-center">
              <p class="text-navy-500">Analysis not yet available for this docket.</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
}

/**
 * Render analysis sections
 */
function renderAnalysisSections(analysis) {
  return `
    <!-- Executive Summary (at top) -->
    ${analysis.executive_summary ? `
      <div class="bg-white rounded-xl border border-navy-100 p-6">
        <h2 class="text-sm font-semibold text-navy-900 mb-4">Executive Summary</h2>
        <div class="prose prose-sm prose-navy max-w-none">
          ${analysis.executive_summary.split('\n').filter(p => p.trim()).map(p => `<p class="text-navy-600 mb-3">${p}</p>`).join('')}
        </div>
      </div>
    ` : ''}
    
    <!-- Sentiment -->
    <div class="bg-white rounded-xl border border-navy-100 p-6">
      <h2 class="text-sm font-semibold text-navy-900 mb-4">Sentiment Breakdown</h2>
      
      <div class="flex items-center gap-6">
        <div class="flex-1">
          <div class="h-4 rounded-full overflow-hidden flex bg-navy-100">
            <div class="bg-red-500 transition-all" style="width: ${analysis.sentiment.oppose}%"></div>
            <div class="bg-slate-300 transition-all" style="width: ${analysis.sentiment.neutral}%"></div>
            <div class="bg-emerald-500 transition-all" style="width: ${analysis.sentiment.support}%"></div>
          </div>
        </div>
      </div>
      
      <div class="flex justify-between mt-3 text-sm">
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-red-500"></div>
          <span class="text-navy-600">Oppose <span class="font-semibold text-navy-900">${analysis.sentiment.oppose}%</span></span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-slate-300"></div>
          <span class="text-navy-600">Neutral <span class="font-semibold text-navy-900">${analysis.sentiment.neutral}%</span></span>
        </div>
        <div class="flex items-center gap-2">
          <div class="w-3 h-3 rounded-full bg-emerald-500"></div>
          <span class="text-navy-600">Support <span class="font-semibold text-navy-900">${analysis.sentiment.support}%</span></span>
        </div>
      </div>
    </div>
    
    <!-- Themes -->
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
    
    <!-- Notable Comments -->
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

/**
 * Initialize event handlers
 */
function initEventHandlers() {
  // Docket selection
  document.querySelectorAll('.docket-item').forEach(item => {
    item.addEventListener('click', () => {
      const docketId = item.dataset.docketId;
      selectDocket(docketId);
    });
  });
  
  // Search
  const searchInput = document.getElementById('docket-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterDockets(e.target.value);
    });
  }
  
  // Chat popup handlers
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
    
    // Initialize chat if not already
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
  
  // Escape key to close
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && chatOpen) {
      closeChat();
    }
  });
}

/**
 * Select a docket
 */
async function selectDocket(docketId) {
  selectedDocketId = docketId;
  
  // Update sidebar selection
  document.querySelectorAll('.docket-item').forEach(item => {
    const isSelected = item.dataset.docketId === docketId;
    item.classList.toggle('bg-navy-100', isSelected);
    item.classList.toggle('border-l-4', isSelected);
    item.classList.toggle('border-l-navy-600', isSelected);
  });
  
  // Show loading in main content
  const mainContent = document.getElementById('main-content');
  mainContent.innerHTML = `
    <div class="h-full flex items-center justify-center">
      <div class="text-center">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-navy-900 mx-auto mb-3"></div>
        <p class="text-sm text-navy-500">Loading analysis...</p>
      </div>
    </div>
  `;
  
  // Fetch docket detail from API
  const { docket, analysis } = await fetchDocketDetail(docketId);
  
  // Store in cache for rendering
  if (docket) {
    const idx = dockets.findIndex(d => d.id === docketId);
    if (idx >= 0) dockets[idx] = { ...dockets[idx], ...docket };
  }
  if (analysis) {
    SAMPLE_ANALYSIS[docketId] = analysis;
  }
  
  // Update main content
  mainContent.innerHTML = renderMainContent();
  
  // Update chat popup header
  const chatSubtitle = document.querySelector('#chat-popup p.text-xs');
  if (chatSubtitle) {
    chatSubtitle.textContent = selectedDocketId || 'All dockets';
  }
  
  // Re-init chat with new docket context
  const chatContainer = document.getElementById('chat-container');
  if (chatContainer) {
    renderChat(chatContainer, selectedDocketId);
  }
}

/**
 * Filter dockets by search term
 */
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
