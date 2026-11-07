// Browser helpers shared by every screen. All data comes from the server; nothing secret lives here.

export const QUALITY = { done_well: 'Done well', needs_fixes: 'Needs fixes', redo: 'Redo' };
export const QCLASS = { done_well: 'good', needs_fixes: 'warn', redo: 'bad' };
export const STATUS = { planned: 'Planned', in_progress: 'In progress', delivered: 'Delivered', missed: 'Missed', blocked_external: 'Blocked by others' };

export class ApiError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

/** Calls Cairn's API. Every change carries the custom header the server requires (CSRF guard). */
export async function api(method, url, body, opts = {}) {
  const headers = { 'x-requested-with': 'impact' };
  if (body) headers['content-type'] = 'application/json';
  if (opts.idem) headers['idempotency-key'] = opts.idem;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && !url.startsWith('/api/auth') && typeof window !== 'undefined') window.dispatchEvent(new Event('cairn:signedout'));
  if (!res.ok) throw new ApiError((data && data.error) || `Request failed (${res.status})`, res.status);
  return data;
}

/** A fresh idempotency key, so a retried request never writes twice. */
export const idem = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

/** Small CSV reader: quoted fields, commas and new lines inside quotes, first row = headers. */
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => x.trim()));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
export function downloadCsv(name, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = rows.map((r) => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
}

export function addDays(ymd, n) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
export function fmtWeek(w) {
  const f = (d) => new Date(`${d}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `${f(w)} – ${f(addDays(w, 6))}`;
}
export function fmtTime(iso) { return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
export const scoreText = (s) => (s === null || s === undefined ? '–' : String(s));

// Who may see or do what (the server checks again on every request).
export const isAdmin = (me) => !!me && ['owner', 'admin'].includes(me.user.role);
export const canAddPeople = (me) => isAdmin(me) || (!!me && me.user.role === 'manager' && me.settings.managersAddTeam);
export const isManager = (me) => isAdmin(me) || (!!me && me.reports > 0);
