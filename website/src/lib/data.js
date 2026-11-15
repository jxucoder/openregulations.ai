/**
 * Data access. Reads go to the Cloudflare Worker first (cached at the edge),
 * then fall back to Supabase's public REST API using the publishable key.
 * Both paths are normalized to the same shapes.
 */

const WORKER_URL = (import.meta.env.VITE_WORKER_URL || '').replace(/\/$/, '');
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

export const DOCKET_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_.-]{2,80}$/;

async function getJSON(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return res.json();
}

function supabase(table, params) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return Promise.reject(new Error('No data source configured'));
  }
  const qs = new URLSearchParams(params);
  return getJSON(`${SUPABASE_URL}/rest/v1/${table}?${qs}`, {
    headers: { apikey: SUPABASE_KEY },
  });
}

async function viaWorker(path) {
  if (!WORKER_URL) return null;
  try {
    return await getJSON(`${WORKER_URL}${path}`);
  } catch (err) {
    console.warn(`Worker ${path} unavailable, using Supabase directly`, err);
    return null;
  }
}

/**
 * @typedef {Object} DocketSummary
 * @property {string} id
 * @property {string} title
 * @property {string} agency
 * @property {number} total
 * @property {string|null} commentEnd
 * @property {string|null} lastSynced
 * @property {boolean} hasReport
 * @property {string|null} reportAt
 * @property {number|null} formPct
 * @property {number|null} campaigns
 * @property {{support?: number, oppose?: number, neutral?: number}|null} sentiment
 */

function normalizeSummary(d, reports = {}, analyses = {}) {
  const report = reports[d.id];
  const meta = report?.report_metadata || {};
  return {
    id: d.id,
    title: d.title || d.id,
    agency: d.agency || d.id.split(/[-_]/)[0],
    total: d.total_comments_at_sync ?? d.total_comments ?? 0,
    commentEnd: d.comment_end_date || null,
    lastSynced: d.last_synced_at || null,
    hasReport: Boolean(d.has_report ?? report),
    reportAt: d.report_generated_at ?? report?.generated_at ?? null,
    formPct: d.form_letter_pct ?? meta.form_letter_pct ?? null,
    campaigns: d.campaign_count ?? meta.campaign_count ?? null,
    sentiment: d.sentiment ?? analyses[d.id]?.sentiment ?? null,
  };
}

let docketsPromise = null;

/** @returns {Promise<DocketSummary[]>} */
export function getDockets() {
  if (!docketsPromise) {
    docketsPromise = loadDockets().catch((err) => {
      docketsPromise = null;
      throw err;
    });
  }
  return docketsPromise;
}

async function loadDockets() {
  const fromWorker = await viaWorker('/dockets');
  if (fromWorker?.dockets?.length) {
    return fromWorker.dockets.map((d) => normalizeSummary(d));
  }

  const [dockets, reports, analyses] = await Promise.all([
    supabase('dockets', {
      select: 'id,title,agency,total_comments_at_sync,comment_end_date,last_synced_at',
      total_comments_at_sync: 'gt.0',
      order: 'total_comments_at_sync.desc.nullslast',
      limit: '500',
    }),
    supabase('reports', { select: 'docket_id,generated_at,report_metadata' }),
    supabase('analyses', { select: 'docket_id,sentiment' }).catch(() => []),
  ]);

  const reportMap = Object.fromEntries(reports.map((r) => [r.docket_id, r]));
  const analysisMap = Object.fromEntries(analyses.map((a) => [a.docket_id, a]));
  return dockets.map((d) => normalizeSummary(d, reportMap, analysisMap));
}

const detailCache = new Map();

/**
 * @param {string} id
 * @returns {Promise<{docket: Object|null, analysis: Object|null, report: Object|null}>}
 */
export function getDocket(id) {
  if (!DOCKET_ID_RE.test(id)) {
    return Promise.resolve({ docket: null, analysis: null, report: null });
  }
  if (!detailCache.has(id)) {
    const p = loadDocket(id).catch((err) => {
      detailCache.delete(id);
      throw err;
    });
    detailCache.set(id, p);
  }
  return detailCache.get(id);
}

async function loadDocket(id) {
  const fromWorker = await viaWorker(`/docket?id=${encodeURIComponent(id)}`);
  if (fromWorker && 'docket' in fromWorker) {
    return {
      docket: fromWorker.docket,
      analysis: fromWorker.analysis || null,
      report: fromWorker.report || null,
    };
  }

  const filter = `eq.${id}`;
  const [dockets, analyses, reports] = await Promise.all([
    supabase('dockets', { select: '*', id: filter }),
    supabase('analyses', { select: '*', docket_id: filter }).catch(() => []),
    supabase('reports', { select: '*', docket_id: filter }),
  ]);
  return { docket: dockets[0] || null, analysis: analyses[0] || null, report: reports[0] || null };
}
