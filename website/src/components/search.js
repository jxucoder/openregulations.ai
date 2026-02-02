/**
 * Search component for finding similar comments
 */

import { loadEmbeddings, textSearch, filterByTheme, filterBySentiment } from '../lib/vector-db.js';
import { debounce, escapeHtml } from '../lib/utils.js';

/**
 * Render search component
 * @param {HTMLElement} container - Container element
 * @param {string} docketId - Current docket ID
 */
export function renderSearch(container, docketId) {
  container.innerHTML = `
    <div class="card">
      <h3 class="font-serif font-bold text-navy-900 mb-4">Search Comments</h3>
      
      <div class="space-y-4">
        <!-- Search input -->
        <div class="relative">
          <input 
            type="text" 
            id="search-input"
            class="input pl-10"
            placeholder="Search comments by keyword or topic..."
          />
          <svg class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
          </svg>
        </div>
        
        <!-- Filters -->
        <div class="flex flex-wrap gap-2">
          <select id="sentiment-filter" class="input w-auto text-sm">
            <option value="">All sentiments</option>
            <option value="oppose">Oppose</option>
            <option value="support">Support</option>
            <option value="neutral">Neutral</option>
          </select>
          
          <select id="theme-filter" class="input w-auto text-sm">
            <option value="">All themes</option>
            <!-- Themes populated dynamically -->
          </select>
        </div>
        
        <!-- Results -->
        <div id="search-results" class="space-y-3 mt-4">
          <p class="text-sm text-navy-500">Enter a search term to find relevant comments.</p>
        </div>
      </div>
    </div>
  `;
  
  // Initialize search functionality
  initSearch(container, docketId);
}

/**
 * Initialize search event listeners
 */
async function initSearch(container, docketId) {
  const searchInput = container.querySelector('#search-input');
  const sentimentFilter = container.querySelector('#sentiment-filter');
  const themeFilter = container.querySelector('#theme-filter');
  const resultsContainer = container.querySelector('#search-results');
  
  // Load embeddings data
  const embeddingsData = await loadEmbeddings(docketId);
  
  // Populate theme filter if we have data
  if (embeddingsData) {
    const themes = extractThemes(embeddingsData);
    themes.forEach(theme => {
      const option = document.createElement('option');
      option.value = theme;
      option.textContent = theme;
      themeFilter.appendChild(option);
    });
  }
  
  // Debounced search function
  const performSearch = debounce(() => {
    const query = searchInput.value.trim();
    const sentiment = sentimentFilter.value;
    const theme = themeFilter.value;
    
    let results = [];
    
    if (embeddingsData && embeddingsData.comments) {
      results = [...embeddingsData.comments];
      
      // Filter by sentiment
      if (sentiment) {
        results = results.filter(c => c.sentiment === sentiment);
      }
      
      // Filter by theme
      if (theme) {
        results = results.filter(c => c.theme_ids && c.theme_ids.includes(theme));
      }
      
      // Text search if query provided
      if (query) {
        results = textSearch(query, results);
      }
    }
    
    renderResults(resultsContainer, results.slice(0, 20), query);
  }, 300);
  
  // Add event listeners
  searchInput.addEventListener('input', performSearch);
  sentimentFilter.addEventListener('change', performSearch);
  themeFilter.addEventListener('change', performSearch);
}

/**
 * Extract unique themes from embeddings
 */
function extractThemes(embeddingsData) {
  const themes = new Set();
  
  embeddingsData.comments.forEach(comment => {
    if (comment.theme_ids) {
      comment.theme_ids.forEach(t => themes.add(t));
    }
  });
  
  return Array.from(themes).sort();
}

/**
 * Render search results
 */
function renderResults(container, results, query) {
  if (results.length === 0) {
    container.innerHTML = `
      <p class="text-sm text-navy-500">
        ${query ? 'No comments found matching your search.' : 'Enter a search term to find relevant comments.'}
      </p>
    `;
    return;
  }
  
  container.innerHTML = `
    <p class="text-sm text-navy-600 mb-3">
      Found ${results.length}${results.length === 20 ? '+' : ''} comments
    </p>
    
    <div class="space-y-3 max-h-96 overflow-y-auto scrollbar-thin">
      ${results.map(result => renderResultItem(result, query)).join('')}
    </div>
  `;
}

/**
 * Render single search result item
 */
function renderResultItem(result, query) {
  const sentimentColors = {
    oppose: 'bg-red-100 text-red-700',
    support: 'bg-emerald-100 text-emerald-700',
    neutral: 'bg-slate-100 text-slate-700'
  };
  
  const text = result.text || result.text_preview || '';
  const highlightedText = query ? highlightMatches(text, query) : escapeHtml(text);
  
  return `
    <div class="p-3 bg-white border border-navy-100 rounded-document">
      <div class="flex items-center gap-2 mb-2">
        <span class="text-xs font-mono text-navy-400">${result.id}</span>
        <span class="text-xs px-2 py-0.5 rounded ${sentimentColors[result.sentiment] || sentimentColors.neutral}">
          ${result.sentiment || 'unknown'}
        </span>
        ${result.matchScore ? `
          <span class="text-xs text-navy-400">
            ${Math.round(result.matchScore * 100)}% match
          </span>
        ` : ''}
      </div>
      <p class="text-sm text-navy-700 line-clamp-3">${highlightedText}</p>
    </div>
  `;
}

/**
 * Highlight search matches in text
 */
function highlightMatches(text, query) {
  const escaped = escapeHtml(text);
  const terms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);
  
  let result = escaped;
  terms.forEach(term => {
    const regex = new RegExp(`(${escapeRegex(term)})`, 'gi');
    result = result.replace(regex, '<mark class="bg-amber-200 px-0.5">$1</mark>');
  });
  
  return result;
}

/**
 * Escape special regex characters
 */
function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
