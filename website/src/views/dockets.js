import { getDockets } from '../lib/data.js';
import { esc, fmtNum, agencyName } from '../lib/format.js';
import { docketRow, icons, loadingBlock, errorBlock } from '../components/ui.js';

const SORTS = {
  comments: { label: 'Most comments', fn: (a, b) => b.total - a.total },
  recent: {
    label: 'Newest analysis',
    fn: (a, b) => String(b.reportAt || '').localeCompare(String(a.reportAt || '')) || b.total - a.total,
  },
  agency: { label: 'Agency A–Z', fn: (a, b) => a.agency.localeCompare(b.agency) || b.total - a.total },
};

function readState() {
  const p = new URLSearchParams(window.location.search);
  return {
    q: p.get('q') || '',
    agency: p.get('agency') || '',
    analyzed: p.get('analyzed') === '1',
    sort: SORTS[p.get('sort')] ? p.get('sort') : 'comments',
  };
}

function writeState(state) {
  const p = new URLSearchParams();
  if (state.q) p.set('q', state.q);
  if (state.agency) p.set('agency', state.agency);
  if (state.analyzed) p.set('analyzed', '1');
  if (state.sort !== 'comments') p.set('sort', state.sort);
  const qs = p.toString();
  window.history.replaceState(window.history.state, '', `/dockets${qs ? `?${qs}` : ''}`);
}

export async function docketsView(main) {
  const state = readState();

  main.innerHTML = `
    <section class="border-b border-ink-100">
      <div class="container-page py-12 sm:py-14">
        <p class="eyebrow">Dockets</p>
        <h1 class="mt-3 font-serif text-3xl font-semibold tracking-tight text-ink-900 sm:text-4xl">Federal rules open to public comment</h1>
        <p class="mt-3 max-w-2xl text-ink-600">
          A docket holds one rulemaking: the proposal, supporting documents, and every public comment.
          Dockets marked <span class="tag-report align-middle">Analysis</span> have a published AI analysis.
        </p>
      </div>
    </section>

    <section class="container-page py-8">
      <form id="filters" class="grid gap-3 sm:grid-cols-[1fr_14rem_11rem] sm:items-center" role="search" onsubmit="return false">
        <label class="relative">
          <span class="sr-only">Search dockets</span>
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">${icons.search}</span>
          <input id="f-q" type="search" class="field pl-9" placeholder="Search by title, agency, or docket ID" value="${esc(state.q)}" autocomplete="off">
        </label>
        <label>
          <span class="sr-only">Agency</span>
          <select id="f-agency" class="field" disabled><option value="">All agencies</option></select>
        </label>
        <label>
          <span class="sr-only">Sort</span>
          <select id="f-sort" class="field">
            ${Object.entries(SORTS).map(([k, s]) => `<option value="${k}" ${k === state.sort ? 'selected' : ''}>${s.label}</option>`).join('')}
          </select>
        </label>
        <label class="flex cursor-pointer items-center gap-2 text-sm text-ink-700 sm:col-span-3">
          <input id="f-analyzed" type="checkbox" class="h-4 w-4 rounded border-ink-300 text-accent-600 focus:ring-accent-500" ${state.analyzed ? 'checked' : ''}>
          Only show dockets with an analysis
        </label>
      </form>

      <div class="mt-6 flex items-center justify-between text-sm text-ink-500">
        <p id="result-count" aria-live="polite">Loading dockets…</p>
      </div>
      <div class="card mt-3 overflow-hidden">
        <div class="hidden grid-cols-[5.5rem_1fr_8rem_7rem] gap-4 border-b border-ink-100 bg-paper-100 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-ink-500 sm:grid">
          <span>Agency</span><span>Docket</span><span>Comments</span><span class="text-right">Status</span>
        </div>
        <ul id="docket-list" class="divide-y divide-ink-100"><li class="p-5">${loadingBlock(6)}</li></ul>
      </div>
    </section>
  `;

  let dockets;
  try {
    dockets = await getDockets();
  } catch (err) {
    main.querySelector('#docket-list').innerHTML = `<li class="p-5">${errorBlock(err.message)}</li>`;
    main.querySelector('#result-count').textContent = '';
    return;
  }

  const counts = {};
  for (const d of dockets) counts[d.agency] = (counts[d.agency] || 0) + 1;
  const agencySelect = main.querySelector('#f-agency');
  agencySelect.innerHTML = `<option value="">All agencies (${dockets.length})</option>` +
    Object.keys(counts).sort().map((a) => `
      <option value="${esc(a)}" ${a === state.agency ? 'selected' : ''}>${esc(a)}: ${esc(agencyName(a))} (${counts[a]})</option>`).join('');
  agencySelect.disabled = false;

  const list = main.querySelector('#docket-list');
  const countEl = main.querySelector('#result-count');

  const apply = () => {
    const q = state.q.trim();
    // Match at word starts so "epa" finds EPA, not "Department".
    const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = q ? new RegExp(`(^|[^a-z0-9])${escaped}`, 'i') : null;
    const rows = dockets
      .filter((d) => !state.agency || d.agency === state.agency)
      .filter((d) => !state.analyzed || d.hasReport)
      .filter((d) => !re || re.test(`${d.id} ${d.title} ${d.agency} ${agencyName(d.agency)}`))
      .sort(SORTS[state.sort].fn);

    countEl.textContent = `${fmtNum(rows.length)} of ${fmtNum(dockets.length)} dockets`;
    list.innerHTML = rows.length
      ? rows.map(docketRow).join('')
      : `<li class="px-5 py-12 text-center text-sm text-ink-500">No dockets match these filters.
           <button type="button" id="clear-filters" class="ml-1 font-semibold text-accent-700 hover:underline">Clear filters</button></li>`;
    writeState(state);
  };

  main.querySelector('#f-q').addEventListener('input', (e) => { state.q = e.target.value; apply(); });
  agencySelect.addEventListener('change', (e) => { state.agency = e.target.value; apply(); });
  main.querySelector('#f-sort').addEventListener('change', (e) => { state.sort = e.target.value; apply(); });
  main.querySelector('#f-analyzed').addEventListener('change', (e) => { state.analyzed = e.target.checked; apply(); });
  list.addEventListener('click', (e) => {
    if (e.target.id !== 'clear-filters') return;
    Object.assign(state, { q: '', agency: '', analyzed: false });
    main.querySelector('#f-q').value = '';
    agencySelect.value = '';
    main.querySelector('#f-analyzed').checked = false;
    apply();
  });

  apply();
}
