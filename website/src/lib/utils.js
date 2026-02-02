/**
 * Utility functions for the OpenRegulations website
 */

/**
 * Format a number with commas
 * @param {number} num - Number to format
 * @returns {string} Formatted number string
 */
export function formatNumber(num) {
  return num.toLocaleString('en-US');
}

/**
 * Format a date string
 * @param {string} dateStr - ISO date string
 * @returns {string} Formatted date
 */
export function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Calculate days until a deadline
 * @param {string} deadline - ISO date string
 * @returns {number} Days remaining (negative if past)
 */
export function daysUntil(deadline) {
  const now = new Date();
  const target = new Date(deadline);
  const diff = target - now;
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

/**
 * Truncate text to a maximum length
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength = 150) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}

/**
 * Debounce a function
 * @param {Function} fn - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Debounced function
 */
export function debounce(fn, delay = 300) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

/**
 * Generate a unique ID
 * @returns {string} Unique ID
 */
export function generateId() {
  return Math.random().toString(36).substr(2, 9);
}

/**
 * Calculate percentage
 * @param {number} value - Current value
 * @param {number} total - Total value
 * @returns {number} Percentage (0-100)
 */
export function percentage(value, total) {
  if (total === 0) return 0;
  return Math.round((value / total) * 100);
}

/**
 * Get sentiment color class
 * @param {string} sentiment - 'support', 'oppose', or 'neutral'
 * @returns {string} Tailwind color class
 */
export function getSentimentColor(sentiment) {
  const colors = {
    support: 'bg-emerald-500',
    oppose: 'bg-red-500',
    neutral: 'bg-slate-400',
  };
  return colors[sentiment] || colors.neutral;
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
