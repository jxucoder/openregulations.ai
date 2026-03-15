/**
 * Report renderer component
 * Renders pre-built HTML reports with metadata bar, sanitized with DOMPurify
 */

import DOMPurify from 'dompurify';

/**
 * Render an HTML report with metadata header
 * @param {Object} report - Report object from API (report_html is pre-rendered server-side)
 * @param {Object} docket - Docket object for context
 * @returns {string} HTML string
 */
export function renderReport(report, docket) {
  const metadata = report.report_metadata || {};
  const generatedDate = report.generated_at
    ? new Date(report.generated_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : 'Unknown';

  const totalComments = metadata.total_comments?.toLocaleString() || '—';
  const formLetterPct = metadata.form_letter_pct != null
    ? `${metadata.form_letter_pct}%`
    : '—';
  const sampleSize = metadata.sample_size?.toLocaleString() || '—';

  // Sanitize the pre-rendered HTML
  const cleanHtml = DOMPurify.sanitize(report.report_html || '');

  return `
    <!-- Report metadata bar -->
    <div class="bg-white rounded-xl border border-navy-100 p-4 mb-6">
      <div class="flex items-center justify-between flex-wrap gap-3">
        <div class="flex items-center gap-6 text-sm">
          <div>
            <span class="text-navy-400">Agency</span>
            <span class="ml-1 font-medium text-navy-900">${docket?.agency || '—'}</span>
          </div>
          <div>
            <span class="text-navy-400">Comments</span>
            <span class="ml-1 font-medium text-navy-900">${totalComments}</span>
          </div>
          <div>
            <span class="text-navy-400">Form letters</span>
            <span class="ml-1 font-medium text-navy-900">${formLetterPct}</span>
          </div>
          <div>
            <span class="text-navy-400">Sample</span>
            <span class="ml-1 font-medium text-navy-900">${sampleSize}</span>
          </div>
        </div>
        <div class="text-xs text-navy-400">
          Generated ${generatedDate} by ${report.model_used || 'Claude'}
        </div>
      </div>
    </div>

    <!-- Report content -->
    <div class="bg-white rounded-xl border border-navy-100 p-8">
      <div class="prose prose-navy max-w-none
        prose-headings:font-serif prose-headings:text-navy-900
        prose-h2:text-lg prose-h2:mt-8 prose-h2:mb-4
        prose-h3:text-base prose-h3:mt-6 prose-h3:mb-3
        prose-p:text-navy-600 prose-p:leading-relaxed
        prose-li:text-navy-600
        prose-blockquote:border-navy-200 prose-blockquote:text-navy-500 prose-blockquote:not-italic
        prose-strong:text-navy-900
        prose-a:text-navy-600 prose-a:underline
      ">
        ${cleanHtml}
      </div>
    </div>
  `;
}
