/**
 * Formatting and escaping helpers.
 * Everything that comes from the database is untrusted: run it through esc()
 * before interpolating into HTML.
 */

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function fmtNum(n) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return Number(n).toLocaleString('en-US');
}

export function fmtCompact(n) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtPct(n, digits = 0) {
  if (n == null || Number.isNaN(Number(n))) return '—';
  return `${Number(n).toFixed(digits)}%`;
}

/** Format a date or timestamp. Date-only strings (YYYY-MM-DD) are treated as calendar dates. */
export function fmtDate(value, style = 'medium') {
  if (!value) return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = new Date(dateOnly ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return null;
  const opts = style === 'long'
    ? { year: 'numeric', month: 'long', day: 'numeric' }
    : { year: 'numeric', month: 'short', day: 'numeric' };
  if (dateOnly) opts.timeZone = 'UTC';
  return d.toLocaleDateString('en-US', opts);
}

export function daysUntil(value) {
  if (!value) return null;
  const end = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T23:59:59Z` : value);
  if (Number.isNaN(end.getTime())) return null;
  return Math.ceil((end - Date.now()) / 86_400_000);
}

/** Decode HTML entities in plain text (e.g. "&rsquo;") without executing markup. */
export function decodeEntities(text) {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(String(text), 'text/html');
  return doc.documentElement.textContent || '';
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

const AGENCIES = {
  AMS: 'Agricultural Marketing Service',
  APHIS: 'Animal and Plant Health Inspection Service',
  BOEM: 'Bureau of Ocean Energy Management',
  CFPB: 'Consumer Financial Protection Bureau',
  CMS: 'Centers for Medicare & Medicaid Services',
  CPSC: 'Consumer Product Safety Commission',
  DOD: 'Department of Defense',
  DOE: 'Department of Energy',
  DOJ: 'Department of Justice',
  DOT: 'Department of Transportation',
  ED: 'Department of Education',
  EPA: 'Environmental Protection Agency',
  ETA: 'Employment and Training Administration',
  FAA: 'Federal Aviation Administration',
  FDA: 'Food and Drug Administration',
  FEMA: 'Federal Emergency Management Agency',
  FISCAL: 'Bureau of the Fiscal Service',
  FMCSA: 'Federal Motor Carrier Safety Administration',
  FRA: 'Federal Railroad Administration',
  FS: 'Forest Service',
  FSIS: 'Food Safety and Inspection Service',
  FTC: 'Federal Trade Commission',
  FWS: 'Fish and Wildlife Service',
  HHS: 'Department of Health and Human Services',
  HUD: 'Department of Housing and Urban Development',
  ICEB: 'Immigration and Customs Enforcement',
  IRS: 'Internal Revenue Service',
  NHTSA: 'National Highway Traffic Safety Administration',
  NOAA: 'National Oceanic and Atmospheric Administration',
  NPS: 'National Park Service',
  NRC: 'Nuclear Regulatory Commission',
  OCC: 'Office of the Comptroller of the Currency',
  OPM: 'Office of Personnel Management',
  OSHA: 'Occupational Safety and Health Administration',
  PHMSA: 'Pipeline and Hazardous Materials Safety Administration',
  RHS: 'Rural Housing Service',
  SEC: 'Securities and Exchange Commission',
  USCG: 'U.S. Coast Guard',
  USCIS: 'U.S. Citizenship and Immigration Services',
  WHD: 'Wage and Hour Division',
};

export function agencyName(code, fallback) {
  return fallback || AGENCIES[code] || code || 'Unknown agency';
}

export function regulationsUrl(docketId) {
  return `https://www.regulations.gov/docket/${encodeURIComponent(docketId)}`;
}

export function commentUrl(docketId) {
  return `https://www.regulations.gov/commenton/${encodeURIComponent(docketId)}`;
}
