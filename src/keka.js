// Keka sync: people, reporting lines, department, job title and (optionally) mobile number.
//
// Privacy: only the fields an admin ticked in Settings are ever requested, and only from this allow-list.
// Salary, payroll, bank, tax, documents, personal email, birth date and attendance are never requested,
// whatever is ticked: the request names the fields, and nothing outside ALLOWED_FIELDS can be named.
const crypto = require('crypto');
const { VsError } = require('./viasocket');

const ALLOWED_FIELDS = ['id', 'employeeNumber', 'displayName', 'email', 'reportsTo.id', 'reportsTo.email', 'groups', 'jobTitle.title', 'mobilePhone'];
const PAGE_SIZE = 200;
const MAX_PAGES = 40;
const MAX_LEAVERS_PER_RUN = 10;

function fieldsFor(hr) {
  const f = ['id', 'employeeNumber', 'displayName', 'email'];
  if (hr.reportingLine) f.push('reportsTo.id', 'reportsTo.email');
  if (hr.department) f.push('groups');
  if (hr.jobTitle) f.push('jobTitle.title');
  if (hr.phone) f.push('mobilePhone');
  return f.filter((x) => ALLOWED_FIELDS.includes(x));
}

// The list of employees in Keka's answer. Fails closed: if the shape is not one we know, nothing is applied.
function employeesFrom(out) {
  const list = Array.isArray(out) ? out : (out && (Array.isArray(out.data) ? out.data : Array.isArray(out.employees) ? out.employees : Array.isArray(out.items) ? out.items : Array.isArray(out.results) ? out.results : null));
  if (list) return list;
  if (out && typeof out === 'object' && typeof out.email === 'string') return [out];
  throw new VsError('UNREADABLE', 'Could not read the list of employees from Keka\'s answer. Nothing was changed.');
}

function create(ctx) {
  const { db, now, newId, audit, userIn, settingsOf, subtreeIds, offboardCore, vs, slack, sha, appUrl } = ctx;

  for (const sql of ['ALTER TABLE users ADD COLUMN keka_id TEXT']) { try { db.exec(sql); } catch { /* exists */ } }
  db.exec(`CREATE TABLE IF NOT EXISTS keka_sync_runs (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, started_at TEXT NOT NULL, finished_at TEXT, trigger TEXT NOT NULL, dry_run INTEGER NOT NULL,
    status TEXT NOT NULL, summary_json TEXT, error TEXT)`);

  async function fetchAll(ws, fields, statuses) {
    const all = [];
    let prevFirst = null;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const out = await vs.run(ws.id, 'keka', 'employees', { mode: 'all', filters: { employmentStatus: statuses }, pageNumber: page, pageSize: PAGE_SIZE, select_response_fields: fields });
      const list = employeesFrom(out);
      if (!list.length) return all;
      const firstId = list[0] && (list[0].id || list[0].email);
      if (page > 1 && firstId && firstId === prevFirst) return all; // the same page again: stop
      prevFirst = firstId;
      all.push(...list);
      if (list.length < PAGE_SIZE) return all;
    }
    throw new VsError('TOO_MANY', 'Keka returned more pages than expected. Nothing was changed.');
  }

  const norm = (e) => ({
    kekaId: e.id === undefined || e.id === null ? null : String(e.id).slice(0, 80),
    email: String(e.email || '').trim().toLowerCase(),
    name: String(e.displayName || '').trim().slice(0, 120),
    title: e.jobTitle && e.jobTitle.title ? String(e.jobTitle.title).trim().slice(0, 40) : null,
    dept: Array.isArray(e.groups) ? ((e.groups.find((g) => g && g.groupType === 2) || {}).title || null) : null, // groupType 2 = department in Keka's documented sample
    phone: String(e.mobilePhone || '').replace(/[\s+-]/g, ''),
    mgrEmail: e.reportsTo && e.reportsTo.email ? String(e.reportsTo.email).trim().toLowerCase() : null,
    mgrKekaId: e.reportsTo && e.reportsTo.id !== undefined && e.reportsTo.id !== null ? String(e.reportsTo.id) : null
  });

  // Applies Keka's picture to the workspace. dryRun: everything runs, then is rolled back, so the preview is exact.
  function apply(ws, working, relieved, { dryRun, actorId }) {
    const s = settingsOf(ws);
    const hr = s.hrFields;
    const sum = { created: 0, updated: 0, moved: 0, offboarded: 0, held: [], samples: [] }; // held: people left alone, with the reason
    const note = (t) => { if (sum.samples.length < 12) sum.samples.push(t); };
    const skip = (t) => { if (sum.held.length < 15) sum.held.push(t); };
    const owner = db.prepare("SELECT * FROM users WHERE workspace_id = ? AND role = 'owner' AND active = 1 ORDER BY created_at LIMIT 1").get(ws.id);
    const users = () => db.prepare('SELECT * FROM users WHERE workspace_id = ?').all(ws.id);
    let byEmail = new Map();
    let byKeka = new Map();
    const reindex = () => { const all = users(); byEmail = new Map(all.map((u) => [u.email, u])); byKeka = new Map(all.filter((u) => u.keka_id).map((u) => [u.keka_id, u])); };
    reindex();

    db.exec('BEGIN IMMEDIATE');
    try {
      const created = [];
      const people = working.map(norm).filter((p) => p.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
      for (const p of people) {
        if (ws.allowed_domain && !p.email.endsWith(`@${ws.allowed_domain}`)) { skip(`${p.email}: not on ${ws.allowed_domain}`); continue; }
        const u = (p.kekaId && byKeka.get(p.kekaId)) || byEmail.get(p.email);
        const phone = hr.phone && /^\d{8,15}$/.test(p.phone) ? p.phone : null;
        if (!u) {
          const id = newId('u');
          db.prepare('INSERT INTO users (id, workspace_id, email, name, role, level, department, phone, keka_id, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
            .run(id, ws.id, p.email, p.name || p.email.split('@')[0], 'member', hr.jobTitle ? p.title : null, hr.department ? p.dept : null, phone, p.kekaId, now());
          const token = crypto.randomBytes(24).toString('base64url');
          db.prepare('INSERT INTO invites (token_hash, workspace_id, email, role, level, department, created_by, expires_at) VALUES (?,?,?,?,?,?,?,?)')
            .run(sha(token), ws.id, p.email, 'member', hr.jobTitle ? p.title : null, hr.department ? p.dept : null, actorId || (owner && owner.id) || 'keka', new Date(Date.now() + 30 * 864e5).toISOString());
          slack.enqueue(ws, 'join', id, `join:${id}`, `Welcome to ${require('./brand').NAME}, ${p.name.split(' ')[0] || 'there'}. Set your password here (the link works once): ${appUrl() || ''}/#/join/${token}`);
          created.push(id);
          sum.created += 1;
          note(`New: ${p.name || p.email}`);
          reindex();
          continue;
        }
        if (!u.active) { skip(`${p.email}: left earlier in the app (use Bring back if they returned)`); continue; }
        const upd = {};
        if (p.kekaId && u.keka_id !== p.kekaId) upd.keka_id = p.kekaId;
        if (!u.pw_hash && p.name && p.name !== u.name) upd.name = p.name;
        if (hr.jobTitle && p.title && p.title !== u.level) upd.level = p.title;
        if (hr.department && p.dept && p.dept !== u.department) upd.department = p.dept;
        if (phone && phone !== u.phone) upd.phone = phone;
        const keys = Object.keys(upd);
        if (keys.length) {
          db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => upd[k]), u.id);
          if (keys.some((k) => k !== 'keka_id')) { sum.updated += 1; note(`Updated: ${u.name} (${keys.filter((k) => k !== 'keka_id').join(', ')})`); }
        }
      }
      reindex();
      // Reporting lines, after everyone exists, so a manager added in the same run can be found.
      if (hr.reportingLine) {
        for (const p of people) {
          const u = (p.kekaId && byKeka.get(p.kekaId)) || byEmail.get(p.email);
          if (!u || !u.active || u.role === 'owner') continue;
          const m = (p.mgrEmail && byEmail.get(p.mgrEmail)) || (p.mgrKekaId && byKeka.get(p.mgrKekaId)) || null;
          if (!m) { if (p.mgrEmail || p.mgrKekaId) skip(`${u.email}: manager is not in the workspace yet`); continue; }
          if (!m.active || m.id === u.id || u.reports_to === m.id) continue;
          if (subtreeIds(ws.id, u.id).includes(m.id)) { skip(`${u.email}: reporting to ${m.email} would make a loop`); continue; }
          db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(m.id, u.id);
          sum.moved += 1;
          note(`Reports to ${m.name}: ${u.name}`);
          reindex();
        }
      }
      for (const id of created) { // new people without a Keka manager start under the owner, so someone can rank them
        const u = userIn(ws.id, id);
        if (u && !u.reports_to && owner) db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(owner.id, id);
      }
      // Leavers: only people Keka explicitly marks as Relieved. Absence from a list never removes anyone.
      for (const r of relieved.map(norm)) {
        const u = (r.kekaId && byKeka.get(r.kekaId)) || byEmail.get(r.email);
        if (!u || !u.active) continue;
        if (u.role === 'owner' || u.role === 'admin') { skip(`${u.email}: is an ${u.role} and shows as left in Keka. Please handle by hand.`); continue; }
        if (sum.offboarded >= MAX_LEAVERS_PER_RUN) { skip(`${u.email}: more than ${MAX_LEAVERS_PER_RUN} leavers in one run. Review by hand.`); continue; }
        const mgr = u.reports_to ? userIn(ws.id, u.reports_to) : null;
        const newMgr = (mgr && mgr.active ? mgr : owner) || null;
        offboardCore(ws, actorId || null, u, newMgr, 'keka');
        sum.offboarded += 1;
        note(`Left: ${u.name}`);
        reindex();
      }
      db.exec(dryRun ? 'ROLLBACK' : 'COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch { /* already rolled back */ }
      throw e;
    }
    return sum;
  }

  async function sync(ws, { dryRun = false, trigger = 'manual', actorId = null } = {}) {
    if (!vs.connected(ws.id, 'keka')) return { skipped: 'Keka is not connected' };
    const s = settingsOf(ws);
    if (s.peopleSource !== 'keka') return { skipped: 'This company is not set to "Keka sync" in Settings' };
    if (trigger === 'nightly' && !vs.status(ws.id, 'keka').confirmedAt) return { skipped: 'Run a first sync by hand before it runs on its own' };
    const runId = newId('ks');
    db.prepare('INSERT INTO keka_sync_runs (id, workspace_id, started_at, trigger, dry_run, status) VALUES (?,?,?,?,?,?)').run(runId, ws.id, now(), trigger, dryRun ? 1 : 0, 'running');
    try {
      const working = await fetchAll(ws, fieldsFor(s.hrFields), ['Working']);
      if (!working.length) throw new VsError('EMPTY', 'Keka returned nobody, so nothing was changed.');
      const relieved = await fetchAll(ws, ['id', 'email'], ['Relieved']);
      const sum = apply(ws, working, relieved, { dryRun, actorId });
      db.prepare("UPDATE keka_sync_runs SET finished_at = ?, status = 'ok', summary_json = ? WHERE id = ?").run(now(), JSON.stringify(sum), runId);
      if (!dryRun) {
        slack.flushSoon(ws); // welcome messages for new people go out now
        vs.markVerified(ws.id, 'keka');
        if (trigger === 'manual') vs.confirm(ws.id, 'keka');
        audit(ws.id, actorId, 'people.synced', 'workspace', ws.id, { source: 'keka', created: sum.created, updated: sum.updated, moved: sum.moved, offboarded: sum.offboarded });
      }
      return { ok: true, dryRun, ...sum };
    } catch (e) {
      const msg = e.code === 'ACTION_FAILED' || e instanceof VsError ? e.message : 'The sync failed unexpectedly';
      db.prepare("UPDATE keka_sync_runs SET finished_at = ?, status = 'failed', error = ? WHERE id = ?").run(now(), msg, runId);
      return { ok: false, error: msg };
    }
  }

  // Called by the hourly job: once a day, in the quiet hours of the company's time zone.
  async function nightly(ws, date = new Date()) {
    const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ws.timezone, hour: '2-digit', hour12: false }).format(date)) % 24;
    if (hour < 2 || hour >= 5) return { skipped: 'not the quiet hours' };
    const since = new Date(date.getTime() - 20 * 3600e3).toISOString();
    if (db.prepare("SELECT 1 FROM keka_sync_runs WHERE workspace_id = ? AND dry_run = 0 AND status = 'ok' AND started_at > ?").get(ws.id, since)) return { skipped: 'already synced today' };
    return sync(ws, { trigger: 'nightly' });
  }

  function lastRuns(ws) {
    return db.prepare('SELECT started_at, finished_at, trigger, dry_run, status, summary_json, error FROM keka_sync_runs WHERE workspace_id = ? ORDER BY started_at DESC LIMIT 5').all(ws.id)
      .map((r) => ({ ...r, summary: r.summary_json ? JSON.parse(r.summary_json) : null, summary_json: undefined }));
  }

  return { sync, nightly, lastRuns, fieldsFor, ALLOWED_FIELDS };
}

module.exports = { create, fieldsFor, ALLOWED_FIELDS, employeesFrom };
