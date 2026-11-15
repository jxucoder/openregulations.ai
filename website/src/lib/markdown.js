/**
 * Report rendering.
 *
 * Reports in the database come in three shapes: plain HTML, Markdown, and
 * Markdown with inline HTML (usually <blockquote>). marked passes HTML blocks
 * through untouched, so one pipeline handles all three. The output is always
 * sanitized: reports quote public comments verbatim, so treat them as untrusted.
 */

import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { slugify } from './format.js';

marked.setOptions({ gfm: true, breaks: false });

const ALLOWED_TAGS = [
  'h2', 'h3', 'h4', 'p', 'br', 'hr', 'strong', 'b', 'em', 'i', 'u', 'a', 'ul', 'ol', 'li',
  'blockquote', 'cite', 'q', 'code', 'pre', 'table', 'thead', 'tbody', 'tr', 'th', 'td',
  'sup', 'sub', 'small', 'mark',
];

/**
 * Render report text to sanitized HTML plus a table of contents.
 * @param {string} source - Markdown and/or HTML
 * @param {{demoteH1?: boolean}} [options]
 * @returns {{html: string, toc: Array<{id: string, text: string}>}}
 */
export function renderReport(source, { demoteH1 = true } = {}) {
  let text = String(source || '').replace(/\r\n/g, '\n');
  // Reports sometimes open with a top-level heading; the page already has an h1.
  if (demoteH1) text = text.replace(/^# (.+)$/gm, '## $1').replace(/<(\/?)h1\b/gi, '<$1h2');

  const rawHtml = marked.parse(text);
  const clean = DOMPurify.sanitize(rawHtml, { ALLOWED_TAGS, ALLOWED_ATTR: ['href', 'title'] });

  const tpl = document.createElement('template');
  tpl.innerHTML = clean;

  const toc = [];
  const used = new Set();
  tpl.content.querySelectorAll('h2').forEach((h) => {
    let id = `sec-${slugify(h.textContent) || 'section'}`;
    while (used.has(id)) id += '-x';
    used.add(id);
    h.id = id;
    toc.push({ id, text: h.textContent.trim() });
  });

  tpl.content.querySelectorAll('a[href]').forEach((a) => {
    const href = a.getAttribute('href') || '';
    if (/^https?:\/\//i.test(href)) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    } else if (!href.startsWith('#') && !href.startsWith('/')) {
      a.removeAttribute('href');
    }
  });

  const wrap = document.createElement('div');
  wrap.appendChild(tpl.content);
  return { html: wrap.innerHTML, toc };
}

/** Light Markdown for chat replies: same sanitizer, no TOC. */
export function renderInline(source) {
  return renderReport(source, { demoteH1: true }).html;
}
