/**
 * Analysis display component
 * Renders detailed analysis for a single docket
 */

import { formatNumber, percentage, getSentimentColor, escapeHtml } from '../lib/utils.js';

/**
 * Render full analysis view
 * @param {HTMLElement} container - Container element
 * @param {object} analysis - Full analysis data from JSON
 */
export function renderAnalysisDetail(container, analysis) {
  container.innerHTML = `
    <div class="space-y-8">
      ${renderAnalysisHeader(analysis)}
      ${renderStatsGrid(analysis.stats)}
      ${renderSentimentSection(analysis.sentiment)}
      ${renderThemesSection(analysis.themes)}
      ${renderCampaignsSection(analysis.campaigns)}
      ${renderNotableCommentsSection(analysis.notable_comments)}
      ${renderExecutiveSummary(analysis.executive_summary)}
    </div>
  `;
}

/**
 * Render analysis header
 */
function renderAnalysisHeader(analysis) {
  return `
    <div class="document-header">
      <div class="flex items-start justify-between">
        <div>
          <span class="badge badge-navy mb-2">${analysis.agency}</span>
          <h1 class="text-2xl md:text-3xl font-serif font-bold text-navy-900">
            ${escapeHtml(analysis.title)}
          </h1>
          <p class="text-navy-600 mt-1">${analysis.docket_id}</p>
        </div>
        <a href="https://www.regulations.gov/docket/${analysis.docket_id}" 
           target="_blank"
           class="btn btn-secondary text-sm">
          View on Regulations.gov
          <svg class="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
          </svg>
        </a>
      </div>
      
      <p class="mt-4 text-navy-700">${escapeHtml(analysis.abstract || '')}</p>
      
      <div class="flex flex-wrap gap-4 mt-4 text-sm text-navy-600">
        <span>Analyzed: ${new Date(analysis.analyzed_at).toLocaleDateString()}</span>
        <span>Comment period: ${analysis.comment_period_start} to ${analysis.comment_period_end}</span>
      </div>
    </div>
  `;
}

/**
 * Render stats grid
 */
function renderStatsGrid(stats) {
  return `
    <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
      <div class="card text-center">
        <div class="text-3xl font-bold text-navy-900">${formatNumber(stats.total_comments)}</div>
        <div class="text-sm text-navy-600 mt-1">Total Comments</div>
      </div>
      
      <div class="card text-center">
        <div class="text-3xl font-bold text-navy-900">${formatNumber(stats.unique_comments)}</div>
        <div class="text-sm text-navy-600 mt-1">Unique Comments</div>
      </div>
      
      <div class="card text-center">
        <div class="text-3xl font-bold text-red-600">${stats.form_letter_percentage}%</div>
        <div class="text-sm text-navy-600 mt-1">Form Letters</div>
      </div>
      
      <div class="card text-center">
        <div class="text-3xl font-bold text-emerald-600">${formatNumber(stats.high_quality_count)}</div>
        <div class="text-sm text-navy-600 mt-1">High Quality</div>
      </div>
    </div>
  `;
}

/**
 * Render sentiment breakdown
 */
function renderSentimentSection(sentiment) {
  const total = sentiment.oppose + sentiment.support + sentiment.neutral;
  
  return `
    <div class="card">
      <h2 class="text-xl font-serif font-bold text-navy-900 mb-4">Sentiment Analysis</h2>
      
      <div class="flex items-center gap-8">
        <!-- Donut chart placeholder -->
        <div class="relative w-32 h-32 flex-shrink-0">
          <svg viewBox="0 0 36 36" class="w-full h-full">
            <!-- Background -->
            <circle cx="18" cy="18" r="15.915" fill="none" stroke="#e5e7eb" stroke-width="3"/>
            
            <!-- Oppose (red) -->
            <circle cx="18" cy="18" r="15.915" fill="none" 
              stroke="#ef4444" stroke-width="3"
              stroke-dasharray="${sentiment.oppose} ${100 - sentiment.oppose}"
              stroke-dashoffset="25"
              class="transition-all duration-500"/>
            
            <!-- Support (green) -->
            <circle cx="18" cy="18" r="15.915" fill="none"
              stroke="#10b981" stroke-width="3"
              stroke-dasharray="${sentiment.support} ${100 - sentiment.support}"
              stroke-dashoffset="${25 - sentiment.oppose}"
              class="transition-all duration-500"/>
          </svg>
          <div class="absolute inset-0 flex items-center justify-center">
            <span class="text-xs text-navy-500">${total > 0 ? formatNumber(total) : '—'}</span>
          </div>
        </div>
        
        <!-- Legend -->
        <div class="flex-1 space-y-3">
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div class="w-3 h-3 rounded-full bg-red-500 mr-2"></div>
              <span class="text-navy-700">Oppose</span>
            </div>
            <span class="font-bold text-navy-900">${sentiment.oppose}%</span>
          </div>
          
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div class="w-3 h-3 rounded-full bg-emerald-500 mr-2"></div>
              <span class="text-navy-700">Support</span>
            </div>
            <span class="font-bold text-navy-900">${sentiment.support}%</span>
          </div>
          
          <div class="flex items-center justify-between">
            <div class="flex items-center">
              <div class="w-3 h-3 rounded-full bg-slate-400 mr-2"></div>
              <span class="text-navy-700">Neutral</span>
            </div>
            <span class="font-bold text-navy-900">${sentiment.neutral}%</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Render themes section
 */
function renderThemesSection(themes) {
  if (!themes || themes.length === 0) {
    return `
      <div class="card">
        <h2 class="text-xl font-serif font-bold text-navy-900 mb-4">Themes</h2>
        <p class="text-navy-600">No themes extracted yet.</p>
      </div>
    `;
  }
  
  return `
    <div class="card">
      <h2 class="text-xl font-serif font-bold text-navy-900 mb-4">Discussion Themes</h2>
      
      <div class="space-y-4">
        ${themes.map((theme, idx) => `
          <div class="border-l-4 ${theme.sentiment === 'oppose' ? 'border-red-400' : theme.sentiment === 'support' ? 'border-emerald-400' : 'border-slate-400'} pl-4 py-2">
            <div class="flex items-center justify-between mb-1">
              <h3 class="font-medium text-navy-900">${escapeHtml(theme.name)}</h3>
              <div class="flex items-center gap-2">
                ${theme.is_campaign ? '<span class="badge bg-amber-100 text-amber-800 text-xs">Campaign</span>' : ''}
                <span class="text-sm text-navy-600">${theme.percentage}%</span>
              </div>
            </div>
            <p class="text-sm text-navy-600 mb-2">${escapeHtml(theme.description)}</p>
            
            ${theme.sample_quotes && theme.sample_quotes.length > 0 ? `
              <blockquote class="text-sm italic text-navy-500 border-l-2 border-navy-200 pl-3 mt-2">
                "${escapeHtml(theme.sample_quotes[0].text)}"
              </blockquote>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render campaigns section
 */
function renderCampaignsSection(campaigns) {
  if (!campaigns || campaigns.length === 0) {
    return '';
  }
  
  return `
    <div class="card">
      <h2 class="text-xl font-serif font-bold text-navy-900 mb-2">Form Letter Campaigns</h2>
      <p class="text-sm text-navy-600 mb-4">
        Organized campaigns where many people submitted similar or identical comments.
      </p>
      
      <div class="space-y-4">
        ${campaigns.map(campaign => `
          <div class="bg-amber-50 border border-amber-200 rounded-document p-4">
            <div class="flex items-start justify-between mb-2">
              <div>
                <span class="font-medium text-navy-900">
                  ${campaign.likely_source || 'Unknown Source'}
                </span>
                <span class="text-sm text-navy-600 ml-2">
                  ${formatNumber(campaign.comment_count)} comments (${campaign.percentage}%)
                </span>
              </div>
              <span class="badge ${campaign.sentiment === 'oppose' ? 'badge-red' : 'badge-green'}">
                ${campaign.sentiment}
              </span>
            </div>
            <p class="text-sm text-navy-600 italic">
              "${escapeHtml(campaign.template_snippet)}..."
            </p>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render notable comments section
 */
function renderNotableCommentsSection(comments) {
  if (!comments || comments.length === 0) {
    return '';
  }
  
  return `
    <div class="card">
      <h2 class="text-xl font-serif font-bold text-navy-900 mb-2">Notable Comments</h2>
      <p class="text-sm text-navy-600 mb-4">
        High-quality comments with substantive analysis, data, or expert perspectives.
      </p>
      
      <div class="space-y-4">
        ${comments.map(comment => `
          <div class="border border-navy-100 rounded-document p-4">
            <div class="flex items-start justify-between mb-2">
              <div>
                <span class="font-medium text-navy-900">${escapeHtml(comment.author)}</span>
                ${comment.organization ? `
                  <span class="text-sm text-navy-600 ml-1">
                    (${escapeHtml(comment.organization)})
                  </span>
                ` : ''}
              </div>
              <div class="flex items-center">
                ${renderQualityStars(comment.quality_score)}
              </div>
            </div>
            <p class="text-sm text-navy-700">${escapeHtml(comment.excerpt)}</p>
            ${comment.why_notable ? `
              <p class="text-xs text-navy-500 mt-2">
                <span class="font-medium">Why notable:</span> ${escapeHtml(comment.why_notable)}
              </p>
            ` : ''}
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Render quality stars
 */
function renderQualityStars(score) {
  const stars = [];
  for (let i = 1; i <= 5; i++) {
    const filled = i <= score;
    stars.push(`
      <svg class="w-4 h-4 ${filled ? 'text-amber-400' : 'text-navy-200'}" fill="currentColor" viewBox="0 0 20 20">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
      </svg>
    `);
  }
  return stars.join('');
}

/**
 * Render executive summary
 */
function renderExecutiveSummary(summary) {
  if (!summary) return '';
  
  return `
    <div class="card bg-navy-50">
      <h2 class="text-xl font-serif font-bold text-navy-900 mb-4">Executive Summary</h2>
      <div class="prose prose-navy text-navy-700 whitespace-pre-wrap">
        ${escapeHtml(summary)}
      </div>
    </div>
  `;
}

/**
 * Render compact analysis card (for grid view)
 */
export function renderAnalysisCard(docket) {
  return `
    <div class="card card-hover cursor-pointer" data-docket-id="${docket.id}">
      <h3 class="font-serif font-bold text-navy-900 mb-2">${escapeHtml(docket.title)}</h3>
      <p class="text-sm text-navy-500">${docket.id}</p>
      <div class="mt-4 flex items-center justify-between text-sm">
        <span>${formatNumber(docket.total_comments)} comments</span>
        <span class="badge badge-navy">${docket.agency}</span>
      </div>
    </div>
  `;
}

/**
 * Load analysis data from JSON file
 */
export async function loadAnalysis(docketId) {
  try {
    const response = await fetch(`/src/data/analysis-${docketId}.json`);
    if (!response.ok) throw new Error('Analysis not found');
    return await response.json();
  } catch (error) {
    console.error('Failed to load analysis:', error);
    return null;
  }
}
