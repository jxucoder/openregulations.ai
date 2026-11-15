/**
 * "Ask about this docket" drawer. Talks to the Worker's /chat endpoint,
 * which retrieves relevant comments and the docket analysis before answering.
 */

import { sendChatMessage, checkStatus } from '../lib/api-client.js';
import { renderInline } from '../lib/markdown.js';
import { esc } from '../lib/format.js';
import { icons } from './ui.js';

let root = null;
let current = null; // { docket, history: [{role, content, sources?}] , busy }

const SUGGESTIONS = [
  'What are the strongest arguments against this proposal?',
  'Who supports it, and why?',
  'What do organizations say compared to individuals?',
];

function ensureRoot() {
  if (root) return root;
  root = document.createElement('div');
  root.id = 'chat-root';
  document.body.appendChild(root);
  return root;
}

export function closeChat() {
  if (!root) return;
  root.innerHTML = '';
  document.body.classList.remove('overflow-hidden', 'lg:overflow-auto');
}

export function openChat(docket) {
  if (!current || current.docket.id !== docket.id) {
    current = { docket, history: [], busy: false };
  }
  const el = ensureRoot();
  el.innerHTML = `
    <div class="fixed inset-0 z-40 bg-ink-900/30" data-close></div>
    <section role="dialog" aria-modal="true" aria-labelledby="chat-title"
      class="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-ink-100 bg-paper shadow-2xl">
      <header class="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
        <div class="min-w-0">
          <h2 id="chat-title" class="font-semibold text-ink-900">Ask about this docket</h2>
          <p class="mt-0.5 truncate text-xs text-ink-500">${esc(docket.id)} · answers cite public comments</p>
        </div>
        <button type="button" class="rounded-md p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-900" data-close aria-label="Close">${icons.close}</button>
      </header>
      <div id="chat-log" class="flex-1 space-y-4 overflow-y-auto px-5 py-5" aria-live="polite"></div>
      <form id="chat-form" class="border-t border-ink-100 p-4">
        <div class="flex gap-2">
          <label class="flex-1"><span class="sr-only">Your question</span>
            <input id="chat-input" class="field" placeholder="Ask a question…" autocomplete="off" maxlength="500">
          </label>
          <button class="btn-primary px-3" aria-label="Send">${icons.send}</button>
        </div>
        <p id="chat-status" class="mt-2 text-[11px] text-ink-400">AI answers can be wrong. Check the cited comments.</p>
      </form>
    </section>`;

  document.body.classList.add('overflow-hidden', 'lg:overflow-auto');
  el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeChat));
  el.querySelector('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = el.querySelector('#chat-input');
    ask(input.value);
    input.value = '';
  });
  el.querySelector('#chat-log').addEventListener('click', (e) => {
    const q = e.target.closest('[data-suggest]');
    if (q) ask(q.dataset.suggest);
  });

  renderLog();
  el.querySelector('#chat-input').focus();

  checkStatus().then((s) => {
    const status = el.querySelector('#chat-status');
    if (s?.remaining != null && status) {
      status.textContent = `AI answers can be wrong. Check the cited comments. ${s.remaining} questions left today.`;
    }
  });
}

function renderLog() {
  const log = root?.querySelector('#chat-log');
  if (!log) return;
  if (!current.history.length) {
    log.innerHTML = `
      <p class="text-sm text-ink-600">Ask about the arguments, the people commenting, or the campaigns on this docket.</p>
      <div class="space-y-2">
        ${SUGGESTIONS.map((s) => `<button type="button" data-suggest="${esc(s)}" class="block w-full rounded-md border border-ink-200 bg-white px-3 py-2 text-left text-sm text-ink-700 hover:border-ink-300 hover:bg-ink-50">${esc(s)}</button>`).join('')}
      </div>`;
    return;
  }
  log.innerHTML = current.history.map((m) => {
    if (m.role === 'user') {
      return `<div class="ml-8 rounded-lg bg-ink-900 px-4 py-2.5 text-sm text-white">${esc(m.content)}</div>`;
    }
    if (m.error) {
      return `<div class="mr-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">${esc(m.content)}</div>`;
    }
    const sources = (m.sources || []).filter((s) => s.id);
    return `
      <div class="mr-4 rounded-lg border border-ink-100 bg-white px-4 py-3">
        <div class="prose prose-sm prose-report max-w-none">${renderInline(m.content)}</div>
        ${sources.length ? `
          <div class="mt-3 border-t border-ink-100 pt-2 text-xs text-ink-500">Sources:
            ${sources.map((s) => `<a class="font-mono hover:text-accent-700" href="https://www.regulations.gov/comment/${encodeURIComponent(s.id)}" target="_blank" rel="noopener noreferrer">${esc(s.id)}</a>`).join(', ')}
          </div>` : ''}
      </div>`;
  }).join('') + (current.busy ? `
    <div class="mr-4 flex gap-1 rounded-lg border border-ink-100 bg-white px-4 py-4" aria-label="Thinking">
      ${[0, 150, 300].map((d) => `<span class="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-400" style="animation-delay:${d}ms"></span>`).join('')}
    </div>` : '');
  log.scrollTop = log.scrollHeight;
}

async function ask(text) {
  const message = String(text || '').trim();
  if (!message || current.busy) return;
  const session = current;
  const history = session.history.filter((m) => !m.error).map(({ role, content }) => ({ role, content }));
  session.history.push({ role: 'user', content: message });
  session.busy = true;
  renderLog();
  try {
    const { response, sources } = await sendChatMessage(message, { docketId: session.docket.id, history });
    session.history.push({ role: 'assistant', content: response || 'No answer was returned.', sources });
  } catch (err) {
    session.history.push({ role: 'assistant', content: err.message || 'Something went wrong.', error: true });
  } finally {
    session.busy = false;
    if (current === session) renderLog();
  }
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeChat();
});
