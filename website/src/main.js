import './styles/main.css';
import { header, footer } from './components/layout.js';
import { closeChat } from './components/chat.js';
import { getDockets } from './lib/data.js';
import { homeView } from './views/home.js';
import { docketsView } from './views/dockets.js';
import { docketView } from './views/docket.js';
import { aboutView } from './views/about.js';

const SITE = 'OpenRegulations.ai';
const DEFAULT_DESCRIPTION = document.querySelector('meta[name="description"]')?.content || '';

const routes = [
  { pattern: /^\/$/, view: homeView },
  { pattern: /^\/dockets\/?$/, view: docketsView },
  { pattern: /^\/docket\/([^/]+)\/?$/, view: docketView, params: (m) => ({ id: decodeURIComponent(m[1]) }) },
  { pattern: /^\/about\/?$/, view: aboutView },
];

function notFoundView(main) {
  main.innerHTML = `
    <div class="container-page py-24 text-center">
      <p class="eyebrow">404</p>
      <h1 class="mt-3 font-serif text-3xl font-semibold text-ink-900">This page doesn't exist</h1>
      <p class="mt-3 text-ink-600">The link may be outdated.</p>
      <a href="/" class="btn-primary mt-8">Go home</a>
    </div>`;
  return { title: 'Page not found' };
}

function setMeta({ title, description } = {}) {
  document.title = title ? `${title} · ${SITE}` : `${SITE}: what the public tells federal agencies`;
  document.querySelector('meta[name="description"]')?.setAttribute('content', description || DEFAULT_DESCRIPTION);
}

const app = document.getElementById('app');
app.innerHTML = `
  <div id="header"></div>
  <main id="main" tabindex="-1" class="min-h-[60vh] outline-none"></main>
  <div id="footer">${footer()}</div>`;
const main = document.getElementById('main');
let navToken = 0;

async function render({ focus = false } = {}) {
  const token = ++navToken;
  const path = window.location.pathname;
  document.getElementById('header').innerHTML = header(path);
  closeChat();

  let route = null;
  let match = null;
  for (const r of routes) {
    match = path.match(r.pattern);
    if (match) { route = r; break; }
  }

  const view = route ? route.view : notFoundView;
  const params = route?.params ? route.params(match) : {};
  setMeta(route === routes[0] ? {} : { title: '…' });
  const meta = await view(main, params);
  if (token !== navToken) return;
  setMeta(meta || (route === routes[1] ? { title: 'Dockets', description: 'Browse federal rulemaking dockets and their public comments.' } : {}));
  if (focus) main.focus({ preventScroll: true });
}

function navigate(url) {
  const next = new URL(url, window.location.href);
  if (next.pathname === window.location.pathname && next.search === window.location.search && next.hash) {
    document.getElementById(next.hash.slice(1))?.scrollIntoView({ behavior: 'smooth' });
    window.history.replaceState(window.history.state, '', next.hash);
    return;
  }
  window.history.pushState({}, '', next.pathname + next.search + next.hash);
  window.scrollTo(0, 0);
  render({ focus: true });
}

document.addEventListener('click', (e) => {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const a = e.target.closest('a[href]');
  if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  e.preventDefault();
  navigate(url.href);
});

document.addEventListener('click', (e) => {
  if (e.target.closest('[data-action="reload"]')) window.location.reload();
});

window.addEventListener('popstate', () => render());

render();

// Footer shows data freshness once dockets load (shared, cached request).
getDockets()
  .then((dockets) => {
    const last = dockets.map((d) => d.lastSynced).filter(Boolean).sort().pop();
    if (last) document.getElementById('footer').innerHTML = footer(last);
  })
  .catch(() => {});
