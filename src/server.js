const path = require('path');
const crypto = require('crypto');
const express = require('express');
const db = require('./db');
const S = require('./scoring');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '100kb' }));

// ---------- helpers ----------
const now = () => new Date().toISOString();
const newId = (p) => `${p}_${crypto.randomBytes(9).toString('base64url')}`;
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const isProd = !!process.env.APP_NAME;

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const bad = (m) => new HttpError(400, m);
const forbidden = (m = 'You do not have access to this') => new HttpError(403, m);
const notFound = (m = 'Not found') => new HttpError(404, m);

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}
function checkPassword(pw, stored) {
  if (!stored) return false;
  const [, saltHex, keyHex] = stored.split('$');
  const key = crypto.scryptSync(pw, Buffer.from(saltHex, 'hex'), 64);
  return crypto.timingSafeEqual(key, Buffer.from(keyHex, 'hex'));
}

function audit(wsId, actorId, action, entity, entityId, detail) {
  db.prepare('INSERT INTO audit_log (workspace_id, actor_id, action, entity, entity_id, detail_json, created_at) VALUES (?,?,?,?,?,?,?)')
    .run(wsId, actorId || null, action, entity || null, entityId || null, detail ? JSON.stringify(detail) : null, now());
}

const str = (v, name, { min = 1, max = 500, optional = false } = {}) => {
  if (v === undefined || v === null || v === '') {
    if (optional) return null;
    throw bad(`${name} is required`);
  }
  if (typeof v !== 'string') throw bad(`${name} must be text`);
  const t = v.trim();
  if (t.length < min || t.length > max) throw bad(`${name} must be ${min}-${max} characters`);
  return t;
};
const emailOf = (v) => {
  const e = str(v, 'Email', { max: 200 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw bad('Email is not valid');
  return e;
};
const urlOf = (v) => {
  const u = str(v, 'Proof link', { max: 1000, optional: true });
  if (!u) return null;
  try {
    const p = new URL(u);
    if (!['http:', 'https:'].includes(p.protocol)) throw new Error();
  } catch { throw bad('Proof link must be an http(s) link'); }
  return u;
};
const ROLES = ['owner', 'admin', 'manager', 'member'];
const validTz = (tz) => { try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; } };

// ---------- dates (per workspace time zone) ----------
function localDate(tz, d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const dow = (ymd) => new Date(`${ymd}T00:00:00Z`).getUTCDay();
function mondayOf(ymd) { const w = dow(ymd); return addDays(ymd, w === 0 ? -6 : 1 - w); }
function currentWeek(ws) { return mondayOf(localDate(ws.timezone)); }
function weekParam(ws, v) {
  if (!v) return currentWeek(ws);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw bad('week must be YYYY-MM-DD');
  return mondayOf(v);
}

// ---------- workspace + hierarchy ----------
const getWs = (id) => db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
const settingsOf = (ws) => S.mergeSettings(JSON.parse(ws.settings_json || '{}'));
const userIn = (wsId, id) => db.prepare('SELECT * FROM users WHERE workspace_id = ? AND id = ?').get(wsId, id);
const isAdmin = (u) => u.role === 'owner' || u.role === 'admin';

function ancestors(u) {
  const out = [];
  const seen = new Set([u.id]);
  let cur = u;
  while (cur.reports_to && !seen.has(cur.reports_to)) {
    const m = userIn(u.workspace_id, cur.reports_to);
    if (!m) break;
    out.push(m);
    seen.add(m.id);
    cur = m;
  }
  return out;
}
function subtreeIds(wsId, rootId) {
  const all = db.prepare('SELECT id, reports_to FROM users WHERE workspace_id = ?').all(wsId);
  const kids = new Map();
  for (const r of all) { if (!kids.has(r.reports_to)) kids.set(r.reports_to, []); kids.get(r.reports_to).push(r.id); }
  const out = [];
  const stack = [...(kids.get(rootId) || [])];
  while (stack.length) { const id = stack.pop(); if (out.includes(id)) continue; out.push(id); stack.push(...(kids.get(id) || [])); }
  return out;
}
const isAncestorOf = (actor, target) => ancestors(target).some((a) => a.id === actor.id);
const canSee = (actor, target) => actor.id === target.id || isAdmin(actor) || isAncestorOf(actor, target);
const canManage = (actor, target) => actor.id !== target.id && (isAdmin(actor) || isAncestorOf(actor, target));
// The ranker and primary rater: the direct manager; an admin when the person has no manager.
function isRankerFor(actor, target) {
  if (actor.id === target.id) return isAdmin(actor) && !target.reports_to;
  return target.reports_to === actor.id || isAdmin(actor) || isAncestorOf(actor, target);
}
// Can this person add and look after people? Admins always; managers only for their own team, if the workspace allows it.
function canAddPeople(actor, settings) {
  return isAdmin(actor) || (actor.role === 'manager' && settings.managersAddTeam);
}
const inMyTeam = (actor, target) => isAdmin(actor) || isAncestorOf(actor, target);
function visibleUsers(actor) {
  if (isAdmin(actor)) return db.prepare('SELECT * FROM users WHERE workspace_id = ? AND active = 1 ORDER BY name').all(actor.workspace_id);
  const ids = [actor.id, ...subtreeIds(actor.workspace_id, actor.id)];
  return ids.map((id) => userIn(actor.workspace_id, id)).filter((u) => u && u.active);
}
const publicUser = (u) => u && ({ id: u.id, name: u.name, email: u.email, role: u.role, level: u.level, department: u.department, reports_to: u.reports_to, phone: u.phone, active: !!u.active, joined: !!u.pw_hash });

// ---------- auth ----------
function parseCookies(h) {
  const out = {};
  for (const part of (h || '').split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const exp = new Date(Date.now() + 14 * 864e5).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)').run(sha(token), userId, exp);
  res.setHeader('Set-Cookie', `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${14 * 86400}${isProd ? '; Secure' : ''}`);
}
function currentUser(req) {
  const t = parseCookies(req.headers.cookie).sid;
  if (!t) return null;
  const s = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(sha(t));
  if (!s || s.expires_at < now()) return null;
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(s.user_id);
  return u && u.active ? u : null;
}

// CSRF: every state-changing API call must come from our own page (custom header, SameSite cookie).
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && !req.path.startsWith('/m91/callback/') && req.get('x-requested-with') !== 'impact') return next(forbidden('Missing request header'));
  next();
});

const loginAttempts = new Map();
function rateLimit(key) {
  const t = Date.now();
  const arr = (loginAttempts.get(key) || []).filter((x) => t - x < 15 * 60e3);
  if (arr.length >= (Number(process.env.RATE_LIMIT_MAX) || 10)) throw new HttpError(429, 'Too many attempts. Try again in a few minutes.');
  arr.push(t);
  loginAttempts.set(key, arr);
}

const wrap = (fn) => (req, res, next) => { try { const r = fn(req, res); if (r !== undefined) res.json(r); } catch (e) { next(e); } };
function auth(req, res, next) {
  const u = currentUser(req);
  if (!u) return next(new HttpError(401, 'Please sign in'));
  req.user = u;
  req.ws = getWs(u.workspace_id);
  req.settings = settingsOf(req.ws);
  // After any change, close phone alerts whose condition just cleared (never raises; the hourly sweep does that).
  if (req.method !== 'GET') res.on('finish', () => { if (res.statusCode < 300 && req.ws.m91_link) setImmediate(() => alerts.sweep(getWs(req.ws.id), { raise: false }).catch(() => {})); });
  next();
}
const adminOnly = (req, res, next) => (isAdmin(req.user) ? next() : next(forbidden('Only admins can do this')));

// Idempotency: a retried POST with the same key returns the first answer and writes nothing twice.
function idempotent(req, res, next) {
  const key = req.get('idempotency-key');
  if (!key) return next();
  if (key.length > 100) return next(bad('Idempotency-Key too long'));
  const hit = db.prepare('SELECT * FROM idempotency WHERE workspace_id = ? AND user_id = ? AND key = ?').get(req.user.workspace_id, req.user.id, key);
  if (hit) return res.status(hit.status).set('Idempotent-Replay', 'true').type('json').send(hit.body);
  const orig = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      db.prepare('INSERT OR IGNORE INTO idempotency VALUES (?,?,?,?,?,?)').run(req.user.workspace_id, req.user.id, key, res.statusCode, JSON.stringify(body), now());
    }
    return orig(body);
  };
  next();
}

app.post('/api/auth/signup', wrap((req, res) => {
  rateLimit(`signup:${req.ip}`);
  const company = str(req.body.company, 'Company name', { max: 120 });
  const name = str(req.body.name, 'Your name', { max: 120 });
  const email = emailOf(req.body.email);
  const password = str(req.body.password, 'Password', { min: 10, max: 200 });
  const tz = req.body.timezone && validTz(req.body.timezone) ? req.body.timezone : 'UTC';
  const domain = req.body.allowed_domain ? str(req.body.allowed_domain, 'Allowed email domain', { max: 120 }).toLowerCase().replace(/^@/, '') : null;
  if (domain && !email.endsWith(`@${domain}`)) throw bad(`Your own email must be on ${domain}`);
  const wsId = newId('ws');
  const uid = newId('u');
  db.transaction(() => {
    db.prepare('INSERT INTO workspaces (id, name, timezone, country, allowed_domain, settings_json, created_at) VALUES (?,?,?,?,?,?,?)')
      .run(wsId, company, tz, req.body.country ? String(req.body.country).slice(0, 60) : null, domain, '{}', now());
    db.prepare('INSERT INTO users (id, workspace_id, email, name, pw_hash, role, level, department, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uid, wsId, email, name, hashPassword(password), 'owner', req.body.level ? String(req.body.level).slice(0, 40) : 'Founder', null, now());
    audit(wsId, uid, 'workspace.created', 'workspace', wsId, { name: company });
  })();
  startSession(res, uid);
  return { ok: true };
}));

app.post('/api/auth/login', wrap((req, res) => {
  const email = emailOf(req.body.email);
  rateLimit(`login:${email}`);
  const password = str(req.body.password, 'Password', { max: 200 });
  let rows = db.prepare('SELECT u.*, w.name AS ws_name FROM users u JOIN workspaces w ON w.id = u.workspace_id WHERE u.email = ? AND u.active = 1').all(email);
  rows = rows.filter((r) => checkPassword(password, r.pw_hash));
  if (!rows.length) throw new HttpError(401, 'Email or password is wrong');
  let chosen = rows[0];
  if (rows.length > 1) {
    chosen = rows.find((r) => r.workspace_id === req.body.workspace_id);
    if (!chosen) return { chooseWorkspace: rows.map((r) => ({ id: r.workspace_id, name: r.ws_name })) };
  }
  startSession(res, chosen.id);
  return { ok: true };
}));

app.post('/api/auth/logout', wrap((req, res) => {
  const t = parseCookies(req.headers.cookie).sid;
  if (t) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(t));
  res.setHeader('Set-Cookie', 'sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
  return { ok: true };
}));

app.get('/api/invites/:token', wrap((req) => {
  const inv = db.prepare('SELECT * FROM invites WHERE token_hash = ?').get(sha(req.params.token));
  if (!inv || inv.used_at || inv.expires_at < now()) throw notFound('This invite link is not valid any more');
  return { email: inv.email, workspace: getWs(inv.workspace_id).name, role: inv.role };
}));

app.post('/api/invites/:token/accept', wrap((req, res) => {
  rateLimit(`invite:${req.ip}`);
  const inv = db.prepare('SELECT * FROM invites WHERE token_hash = ?').get(sha(req.params.token));
  if (!inv || inv.used_at || inv.expires_at < now()) throw notFound('This invite link is not valid any more');
  const name = str(req.body.name, 'Your name', { max: 120 });
  const password = str(req.body.password, 'Password', { min: 10, max: 200 });
  const exists = db.prepare('SELECT id, pw_hash FROM users WHERE workspace_id = ? AND email = ?').get(inv.workspace_id, inv.email);
  if (exists && exists.pw_hash) throw bad('This email already has an account here. Sign in instead.');
  const uid = exists ? exists.id : newId('u');
  db.transaction(() => {
    if (exists) {
      // Created by a people import: the row (and its reporting line) already exists; the person sets a password.
      db.prepare('UPDATE users SET name = ?, pw_hash = ? WHERE id = ?').run(name, hashPassword(password), uid);
    } else {
      db.prepare('INSERT INTO users (id, workspace_id, email, name, pw_hash, role, level, department, reports_to, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(uid, inv.workspace_id, inv.email, name, hashPassword(password), inv.role, inv.level, inv.department, inv.reports_to, now());
    }
    db.prepare('UPDATE invites SET used_at = ? WHERE token_hash = ?').run(now(), inv.token_hash);
    audit(inv.workspace_id, uid, 'user.joined', 'user', uid, { invited_by: inv.created_by });
  })();
  startSession(res, uid);
  return { ok: true };
}));

// ---------- me / settings / people ----------
app.get('/api/me', auth, wrap((req) => ({
  user: publicUser(req.user),
  workspace: { id: req.ws.id, name: req.ws.name, timezone: req.ws.timezone, country: req.ws.country, allowed_domain: req.ws.allowed_domain },
  settings: req.settings,
  week: currentWeek(req.ws),
  reports: subtreeIds(req.ws.id, req.user.id).length
})));

app.get('/api/settings', auth, wrap((req) => ({ settings: req.settings, defaults: S.DEFAULT_SETTINGS })));

app.put('/api/settings', auth, adminOnly, wrap((req) => {
  const b = req.body || {};
  const next = S.mergeSettings({ ...JSON.parse(req.ws.settings_json || '{}'), ...(b.settings || {}) });
  const errs = S.validateSettings(next);
  if (errs.length) throw bad(errs.join('; '));
  const name = b.name ? str(b.name, 'Company name', { max: 120 }) : req.ws.name;
  const tz = b.timezone ? (validTz(b.timezone) ? b.timezone : (() => { throw bad('Unknown time zone'); })()) : req.ws.timezone;
  const domain = b.allowed_domain === undefined ? req.ws.allowed_domain : (b.allowed_domain ? String(b.allowed_domain).toLowerCase().replace(/^@/, '').slice(0, 120) : null);
  db.prepare('UPDATE workspaces SET name = ?, timezone = ?, allowed_domain = ?, settings_json = ? WHERE id = ?').run(name, tz, domain, JSON.stringify(next), req.ws.id);
  audit(req.ws.id, req.user.id, 'settings.updated', 'workspace', req.ws.id, { settings: next, timezone: tz, name });
  return { ok: true, settings: next };
}));

app.get('/api/people', auth, wrap((req) => ({ people: visibleUsers(req.user).map(publicUser) })));

// Everyone in the workspace, names only: for "who used your work" pickers and coins.
app.get('/api/directory', auth, wrap((req) => ({
  people: db.prepare('SELECT id, name, department, level FROM users WHERE workspace_id = ? AND active = 1 ORDER BY name').all(req.ws.id)
})));

app.post('/api/invites', auth, idempotent, wrap((req) => {
  const b = req.body || {};
  if (!canAddPeople(req.user, req.settings)) throw forbidden(req.user.role === 'manager' ? 'In this workspace only admins add people' : 'Only managers and admins can add people');
  const email = emailOf(b.email);
  if (req.ws.allowed_domain && !email.endsWith(`@${req.ws.allowed_domain}`)) throw bad(`Only ${req.ws.allowed_domain} emails can join this workspace`);
  const role = ROLES.includes(b.role) && b.role !== 'owner' ? b.role : 'member';
  if (!isAdmin(req.user) && role !== 'member' && role !== 'manager') throw forbidden();
  if (role === 'admin' && !isAdmin(req.user)) throw forbidden('Only admins can invite admins');
  let reportsTo = b.reports_to || req.user.id;
  const mgr = userIn(req.ws.id, reportsTo);
  if (!mgr) throw bad('Manager not found');
  if (!isAdmin(req.user) && mgr.id !== req.user.id && !isAncestorOf(req.user, mgr)) throw forbidden('You can only add people under yourself or your team');
  const already = db.prepare('SELECT active FROM users WHERE workspace_id = ? AND email = ?').get(req.ws.id, email);
  if (already) throw bad(already.active ? 'This person is already in the workspace' : 'This person left earlier. Use "Bring back" under Former people.');
  const token = crypto.randomBytes(24).toString('base64url');
  const level = b.level ? String(b.level).slice(0, 40) : null;
  const department = b.department ? String(b.department).slice(0, 80) : null;
  const uid = newId('u');
  db.transaction(() => {
    // The person exists (as "invited") from now on, so they show in the team, can be moved, or get a new link.
    db.prepare('INSERT INTO users (id, workspace_id, email, name, role, level, department, reports_to, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(uid, req.ws.id, email, b.name ? String(b.name).trim().slice(0, 120) || email.split('@')[0] : email.split('@')[0], role, level, department, reportsTo, now());
    db.prepare('INSERT INTO invites (token_hash, workspace_id, email, role, level, department, reports_to, created_by, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(sha(token), req.ws.id, email, role, level, department, reportsTo, req.user.id, new Date(Date.now() + 14 * 864e5).toISOString());
    audit(req.ws.id, req.user.id, 'invite.created', 'user', uid, { role, reports_to: reportsTo });
  })();
  return { ok: true, link: `/#/join/${token}` };
}));

app.patch('/api/people/:id', auth, wrap((req) => {
  const target = userIn(req.ws.id, req.params.id);
  if (!target) throw notFound();
  const b = req.body || {};
  const selfEdit = target.id === req.user.id;
  const keys0 = Object.keys(b);
  const managerEdit = !isAdmin(req.user) && !selfEdit && canAddPeople(req.user, req.settings) && inMyTeam(req.user, target);
  if (managerEdit) {
    // Managers look after their own team: details, moving people inside their team, member <-> manager.
    if (!keys0.every((k) => ['name', 'phone', 'level', 'department', 'reports_to', 'active', 'role'].includes(k))) throw forbidden();
    if (b.role !== undefined && !['member', 'manager'].includes(b.role)) throw forbidden('Only admins can make admins');
    if (target.role === 'admin' || target.role === 'owner') throw forbidden();
    if (b.reports_to !== undefined) {
      const m = b.reports_to ? userIn(req.ws.id, b.reports_to) : null;
      if (!m || (m.id !== req.user.id && !isAncestorOf(req.user, m))) throw forbidden('You can only move people within your own team');
    }
  } else if (!isAdmin(req.user) && !(selfEdit && keys0.every((k) => ['name', 'phone'].includes(k)))) throw forbidden('Only admins or their manager can change this');
  const upd = {};
  if (b.name !== undefined) upd.name = str(b.name, 'Name', { max: 120 });
  if (b.phone !== undefined) {
    const p = String(b.phone || '').replace(/[\s+-]/g, '');
    if (p && !/^\d{8,15}$/.test(p)) throw bad('Phone must be digits with country code, without +');
    upd.phone = p || null;
  }
  if (b.level !== undefined) upd.level = b.level ? String(b.level).slice(0, 40) : null;
  if (b.department !== undefined) upd.department = b.department ? String(b.department).slice(0, 80) : null;
  if (b.role !== undefined) {
    if (!ROLES.includes(b.role)) throw bad('Unknown role');
    if ((b.role === 'owner' || target.role === 'owner') && req.user.role !== 'owner') throw forbidden('Only the owner can change owners');
    if (target.role === 'owner' && b.role !== 'owner' && db.prepare("SELECT COUNT(*) c FROM users WHERE workspace_id = ? AND role = 'owner' AND active = 1").get(req.ws.id).c < 2) throw bad('The workspace needs at least one owner');
    upd.role = b.role;
  }
  if (b.reports_to !== undefined) {
    if (b.reports_to) {
      const m = userIn(req.ws.id, b.reports_to);
      if (!m) throw bad('Manager not found');
      if (m.id === target.id || subtreeIds(req.ws.id, target.id).includes(m.id)) throw bad('That would make a loop in the reporting line');
      upd.reports_to = m.id;
    } else upd.reports_to = null;
  }
  if (b.active !== undefined) {
    if (target.id === req.user.id) throw bad('You cannot deactivate yourself');
    upd.active = b.active ? 1 : 0;
  }
  const keys = Object.keys(upd);
  if (!keys.length) return { ok: true };
  db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...keys.map((k) => upd[k]), target.id);
  audit(req.ws.id, req.user.id, 'user.updated', 'user', target.id, upd);
  return { ok: true };
}));

// ---------- joiners, movers, leavers ----------
// Someone leaves: their reports move to a new manager, sign-in stops at once, and every past week, rating and coin stays on record.
app.post('/api/people/:id/offboard', auth, idempotent, wrap((req) => {
  const target = userIn(req.ws.id, req.params.id);
  if (!target) throw notFound();
  if (target.id === req.user.id) throw bad('You cannot remove yourself');
  if (!canManage(req.user, target) || !(isAdmin(req.user) || canAddPeople(req.user, req.settings))) throw forbidden();
  if (target.role === 'owner' && req.user.role !== 'owner') throw forbidden('Only an owner can remove an owner');
  if (target.role === 'owner' && db.prepare("SELECT COUNT(*) c FROM users WHERE workspace_id = ? AND role = 'owner' AND active = 1").get(req.ws.id).c < 2) throw bad('The workspace needs at least one owner');
  if (!target.active) return { ok: true, already: true };
  const reports = db.prepare('SELECT id FROM users WHERE workspace_id = ? AND reports_to = ? AND active = 1').all(req.ws.id, target.id);
  let newMgr = null;
  if (reports.length) {
    newMgr = userIn(req.ws.id, req.body.new_manager_id || target.reports_to || req.user.id);
    if (!newMgr || !newMgr.active || newMgr.id === target.id) throw bad('Choose who their team reports to now');
    if (subtreeIds(req.ws.id, target.id).includes(newMgr.id) && !reports.some((r) => r.id === newMgr.id)) throw bad('Pick someone outside the leaver\'s team, or one of their direct reports');
    if (!isAdmin(req.user) && newMgr.id !== req.user.id && !isAncestorOf(req.user, newMgr)) throw forbidden('Move their team to someone in your own team');
  }
  db.transaction(() => {
    for (const r of reports) {
      if (newMgr && r.id === newMgr.id) db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(target.reports_to, r.id); // promoted report steps into the gap
      else db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(newMgr.id, r.id);
    }
    db.prepare('UPDATE users SET active = 0 WHERE id = ?').run(target.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(target.id);
    db.prepare('UPDATE invites SET used_at = ? WHERE workspace_id = ? AND email = ? AND used_at IS NULL').run(now(), req.ws.id, target.email);
    audit(req.ws.id, req.user.id, 'user.offboarded', 'user', target.id, { reports_moved_to: newMgr && newMgr.id, reports: reports.length });
  })();
  return { ok: true, reportsMoved: reports.length };
}));

// Someone comes back: sign-in works again; they rejoin under the manager chosen here.
app.post('/api/people/:id/reactivate', auth, wrap((req) => {
  const target = userIn(req.ws.id, req.params.id);
  if (!target) throw notFound();
  const mgr = req.body.reports_to ? userIn(req.ws.id, req.body.reports_to) : req.user;
  if (!mgr || !mgr.active) throw bad('Manager not found');
  if (!(isAdmin(req.user) || (canAddPeople(req.user, req.settings) && (mgr.id === req.user.id || isAncestorOf(req.user, mgr))))) throw forbidden();
  db.prepare('UPDATE users SET active = 1, reports_to = ? WHERE id = ?').run(mgr.id, target.id);
  audit(req.ws.id, req.user.id, 'user.reactivated', 'user', target.id, { reports_to: mgr.id });
  return { ok: true };
}));

// A new invite link for someone who has not joined yet (the old link stops working).
app.post('/api/people/:id/invite-link', auth, wrap((req) => {
  const target = userIn(req.ws.id, req.params.id);
  if (!target || !target.active) throw notFound();
  if (target.pw_hash) throw bad('This person has already joined');
  if (!(isAdmin(req.user) || (canAddPeople(req.user, req.settings) && inMyTeam(req.user, target)))) throw forbidden();
  const token = crypto.randomBytes(24).toString('base64url');
  db.transaction(() => {
    db.prepare('UPDATE invites SET used_at = ? WHERE workspace_id = ? AND email = ? AND used_at IS NULL').run(now(), req.ws.id, target.email);
    db.prepare('INSERT INTO invites (token_hash, workspace_id, email, role, level, department, reports_to, created_by, expires_at) VALUES (?,?,?,?,?,?,?,?,?)')
      .run(sha(token), req.ws.id, target.email, target.role, target.level, target.department, target.reports_to, req.user.id, new Date(Date.now() + 30 * 864e5).toISOString());
  })();
  audit(req.ws.id, req.user.id, 'invite.reissued', 'user', target.id, null);
  return { ok: true, link: `/#/join/${token}` };
}));

// People who have left, for admins and their former managers' chain.
app.get('/api/people/former', auth, wrap((req) => ({
  people: db.prepare('SELECT * FROM users WHERE workspace_id = ? AND active = 0 ORDER BY name').all(req.ws.id).filter((u) => isAdmin(req.user) || isAncestorOf(req.user, u)).map(publicUser)
})));

// ---------- people import (CSV from any HR tool) ----------
// rows: [{ email, name, role, level, department, manager_email, phone }]. dryRun: true checks without saving.
app.post('/api/people/import', auth, idempotent, wrap((req) => {
  if (!canAddPeople(req.user, req.settings)) throw forbidden('Only admins and managers can add people');
  const asManager = !isAdmin(req.user);
  const myTeam = new Set(asManager ? [req.user.id, ...subtreeIds(req.ws.id, req.user.id)] : []);
  const b = req.body || {};
  const rows = Array.isArray(b.rows) ? b.rows : [];
  if (!rows.length || rows.length > 2000) throw bad('Send 1-2000 rows');
  const existing = new Map(db.prepare('SELECT * FROM users WHERE workspace_id = ?').all(req.ws.id).map((u) => [u.email, u]));
  const seen = new Set();
  const results = [];
  const clean = [];
  rows.forEach((r, i) => {
    const line = i + 2; // header is line 1
    const errs = [];
    let email = String(r.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.push('email is not valid');
    else if (req.ws.allowed_domain && !email.endsWith(`@${req.ws.allowed_domain}`)) errs.push(`only ${req.ws.allowed_domain} emails can join`);
    if (seen.has(email)) errs.push('email appears twice in the file');
    seen.add(email);
    const name = String(r.name || '').trim().slice(0, 120);
    if (!name && !existing.has(email)) errs.push('name is required for new people');
    let role = String(r.role || 'member').trim().toLowerCase();
    if (role === 'tl' || role === 'lead') role = 'manager';
    if (!['member', 'manager', 'admin'].includes(role)) errs.push('role must be member, manager or admin');
    const phone = String(r.phone || '').replace(/[\s+-]/g, '');
    if (phone && !/^\d{8,15}$/.test(phone)) errs.push('phone must be digits with country code');
    const mgr = String(r.manager_email || '').trim().toLowerCase();
    if (mgr === email && mgr) errs.push('a person cannot report to themselves');
    const cur = existing.get(email);
    if (cur && cur.role === 'owner') role = 'owner'; // never demote an owner through a file
    if (asManager) {
      if (!['member', 'manager'].includes(role)) errs.push('managers can add members and managers only');
      if (cur && !myTeam.has(cur.id)) errs.push('this person is not in your team');
      if (cur && cur.id === req.user.id) errs.push('you cannot change yourself here');
    }
    clean.push({ line, email, name, role, level: String(r.level || '').trim().slice(0, 40) || null, department: String(r.department || '').trim().slice(0, 80) || null, phone: phone || null, mgr, errs, cur });
  });
  // Managers must exist in the workspace or in the file.
  const fileEmails = new Set(clean.map((c) => c.email));
  for (const c of clean) if (c.mgr && !fileEmails.has(c.mgr) && !existing.has(c.mgr)) c.errs.push(`manager ${c.mgr} is not in the file or the workspace`);
  if (asManager) for (const c of clean) if (c.mgr && existing.has(c.mgr) && !myTeam.has(existing.get(c.mgr).id)) c.errs.push(`manager ${c.mgr} is not in your team`);
  // Reporting loops across the final picture.
  const finalMgr = new Map([...existing.values()].map((u) => [u.email, u.reports_to ? [...existing.values()].find((x) => x.id === u.reports_to)?.email : null]));
  for (const c of clean) finalMgr.set(c.email, c.mgr || (c.cur ? finalMgr.get(c.email) : (c.email === req.user.email ? null : req.user.email)));
  for (const c of clean) {
    let cur = c.email; const path = new Set();
    while (cur && !path.has(cur)) { path.add(cur); cur = finalMgr.get(cur); }
    if (cur) c.errs.push('this would make a loop in the reporting line');
  }
  const invalid = clean.filter((c) => c.errs.length);
  const summary = { new: clean.filter((c) => !c.cur && !c.errs.length).length, updated: clean.filter((c) => c.cur && !c.errs.length).length, errors: invalid.map((c) => ({ line: c.line, email: c.email, errors: c.errs })) };
  if (b.dryRun || invalid.length) return { ok: !invalid.length, dryRun: !!b.dryRun, ...summary };
  const links = [];
  db.transaction(() => {
    for (const c of clean) {
      if (c.cur) {
        db.prepare('UPDATE users SET name = COALESCE(NULLIF(?, \'\'), name), role = ?, level = COALESCE(?, level), department = COALESCE(?, department), phone = COALESCE(?, phone), active = 1 WHERE id = ?')
          .run(c.name, c.role, c.level, c.department, c.phone, c.cur.id);
      } else {
        const id = newId('u');
        db.prepare('INSERT INTO users (id, workspace_id, email, name, role, level, department, phone, created_at) VALUES (?,?,?,?,?,?,?,?,?)')
          .run(id, req.ws.id, c.email, c.name, c.role, c.level, c.department, c.phone, now());
        existing.set(c.email, { id, email: c.email });
        const token = crypto.randomBytes(24).toString('base64url');
        db.prepare('INSERT INTO invites (token_hash, workspace_id, email, role, level, department, created_by, expires_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(sha(token), req.ws.id, c.email, c.role, c.level, c.department, req.user.id, new Date(Date.now() + 30 * 864e5).toISOString());
        links.push({ email: c.email, name: c.name, link: `/#/join/${token}` });
      }
    }
    for (const c of clean) {
      const target = existing.get(c.email);
      const mgrEmail = c.mgr || (c.cur ? null : (c.email === req.user.email ? null : req.user.email));
      if (mgrEmail) db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(existing.get(mgrEmail).id, target.id);
    }
    audit(req.ws.id, req.user.id, 'people.imported', 'workspace', req.ws.id, { new: summary.new, updated: summary.updated, source: 'csv' });
  })();
  return { ok: true, ...summary, links };
}));

// Leave from a file: rows [{ email, date }] (YYYY-MM-DD). Unknown emails are reported, not guessed.
app.post('/api/leave/import', auth, wrap((req) => {
  if (!canAddPeople(req.user, req.settings)) throw forbidden('Only admins and managers can import leave');
  const rows = Array.isArray(req.body && req.body.rows) ? req.body.rows : [];
  if (!rows.length || rows.length > 5000) throw bad('Send 1-5000 rows');
  const team = isAdmin(req.user) ? null : new Set(subtreeIds(req.ws.id, req.user.id));
  const users = new Map(db.prepare('SELECT id, email FROM users WHERE workspace_id = ?').all(req.ws.id).filter((u) => !team || team.has(u.id)).map((u) => [u.email, u.id]));
  const errors = [];
  const ok = [];
  rows.forEach((r, i) => {
    const email = String(r.email || '').trim().toLowerCase();
    const date = String(r.date || '').trim();
    if (!users.has(email)) errors.push({ line: i + 2, email, errors: [team ? 'not in your team' : 'not in this workspace'] });
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.push({ line: i + 2, email, errors: ['date must be YYYY-MM-DD'] });
    else ok.push([users.get(email), date]);
  });
  if (errors.length) return { ok: false, errors };
  db.transaction(() => ok.forEach(([uid, d]) => db.prepare("INSERT OR IGNORE INTO leave_days (workspace_id, user_id, day, source) VALUES (?,?,?,'csv')").run(req.ws.id, uid, d)))();
  audit(req.ws.id, req.user.id, 'leave.imported', 'workspace', req.ws.id, { days: ok.length });
  return { ok: true, imported: ok.length };
}));

// ---------- items, stacks, scoring ----------
const getItem = (wsId, id) => db.prepare('SELECT * FROM items WHERE workspace_id = ? AND id = ?').get(wsId, id);
const ratingsFor = (itemId) => db.prepare('SELECT r.*, u.name AS rater_name FROM ratings r JOIN users u ON u.id = r.rater_id WHERE r.item_id = ? ORDER BY r.created_at').all(itemId);
const stackOf = (wsId, userId, week) => db.prepare('SELECT * FROM stacks WHERE workspace_id = ? AND user_id = ? AND week_start = ?').get(wsId, userId, week);

function leaveFor(ws, settings, userId, week) {
  const days = [...Array(7)].map((_, i) => addDays(week, i)).filter((d) => settings.workingDays.includes(dow(d)));
  const off = db.prepare('SELECT day FROM leave_days WHERE workspace_id = ? AND user_id = ? AND day >= ? AND day <= ?').all(ws.id, userId, week, addDays(week, 6)).map((r) => r.day);
  const available = days.filter((d) => !off.includes(d)).length;
  return { working: days.length, available, days: off };
}

function computeWeek(ws, settings, userId, week) {
  const items = db.prepare('SELECT * FROM items WHERE workspace_id = ? AND user_id = ? AND week_start = ? ORDER BY COALESCE(rank, 99), created_at').all(ws.id, userId, week);
  for (const it of items) it.ratings = ratingsFor(it.id);
  const leave = leaveFor(ws, settings, userId, week);
  const res = S.weeklyScore(items, settings, leave);
  const allRatings = items.flatMap((i) => i.ratings);
  const coins = db.prepare('SELECT COALESCE(SUM(coins),0) c FROM coins WHERE workspace_id = ? AND to_id = ? AND week_start = ?').get(ws.id, userId, week).c;
  return { week, items, leave, score: res.score, earned: res.earned, possible: res.possible, pending: res.pending, breakdown: res.items, quality: S.qualitySummary(allRatings), coins, alignment: S.alignmentPct(items, settings) };
}

function itemView(it, actor) {
  const ratings = (it.ratings || ratingsFor(it.id)).map((r) => ({ id: r.id, rater: r.rater_name, rater_id: r.rater_id, role: r.rater_role, quality: r.quality, note: r.note, at: r.created_at }));
  const blockers = db.prepare('SELECT id, description, raised_at, resolved_at, escalated, claimed_by FROM blockers WHERE item_id = ? ORDER BY raised_at').all(it.id);
  return { ...it, stretch: !!it.stretch, ratings, blockers, mine: it.user_id === actor.id };
}

app.get('/api/week', auth, wrap((req) => {
  const target = req.query.user ? userIn(req.ws.id, String(req.query.user)) : req.user;
  if (!target || !canSee(req.user, target)) throw forbidden();
  const week = weekParam(req.ws, req.query.week);
  const w = computeWeek(req.ws, req.settings, target.id, week);
  const stack = stackOf(req.ws.id, target.id, week);
  const manager = target.reports_to ? userIn(req.ws.id, target.reports_to) : null;
  // Priorities of the level above, for alignment links.
  const parentOptions = manager ? db.prepare('SELECT id, title, rank FROM items WHERE workspace_id = ? AND user_id = ? AND week_start = ? AND rank IS NOT NULL ORDER BY rank').all(req.ws.id, manager.id, week) : [];
  return {
    person: publicUser(target), manager: manager && { id: manager.id, name: manager.name }, week,
    locked: !!(stack && stack.locked_at), locked_at: stack && stack.locked_at,
    canRank: isRankerFor(req.user, target), isSelf: target.id === req.user.id,
    items: w.items.map((i) => itemView(i, req.user)), score: w.score, pending: w.pending, quality: w.quality, coins: w.coins,
    alignment: w.alignment, leave: w.leave, breakdown: w.breakdown, parentOptions
  };
}));

app.post('/api/items', auth, idempotent, wrap((req, res) => {
  const b = req.body || {};
  const target = b.user_id ? userIn(req.ws.id, b.user_id) : req.user;
  if (!target) throw notFound('Person not found');
  if (target.id !== req.user.id && !canManage(req.user, target)) throw forbidden();
  const week = weekParam(req.ws, b.week);
  const kind = ['work', 'unplanned', 'helping'].includes(b.kind) ? b.kind : 'work';
  let parent = null;
  if (b.parent_item_id) {
    parent = getItem(req.ws.id, b.parent_item_id);
    if (!parent || parent.user_id !== target.reports_to) throw bad('You can only link to a priority of your manager');
  }
  const id = newId('it');
  const t = now();
  db.prepare('INSERT INTO items (id, workspace_id, user_id, week_start, title, details, kind, parent_item_id, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, req.ws.id, target.id, week, str(b.title, 'Title', { max: 200 }), str(b.details, 'Details', { max: 2000, optional: true }), kind, parent ? parent.id : null, req.user.id, t, t);
  audit(req.ws.id, req.user.id, 'item.created', 'item', id, { for: target.id, week, kind });
  res.status(201);
  return { id };
}));

app.patch('/api/items/:id', auth, wrap((req) => {
  const it = getItem(req.ws.id, req.params.id);
  if (!it) throw notFound();
  const owner = userIn(req.ws.id, it.user_id);
  const isOwner = owner.id === req.user.id;
  if (!isOwner && !canManage(req.user, owner)) throw forbidden();
  const b = req.body || {};
  const upd = {};
  const locked = !!(stackOf(req.ws.id, it.user_id, it.week_start) || {}).locked_at;
  if (b.title !== undefined || b.details !== undefined) {
    if (locked && it.rank) throw bad('This priority is locked. Ask your manager to change it.');
    if (b.title !== undefined) upd.title = str(b.title, 'Title', { max: 200 });
    if (b.details !== undefined) upd.details = str(b.details, 'Details', { max: 2000, optional: true });
  }
  if (b.parent_item_id !== undefined) {
    if (b.parent_item_id) {
      const p = getItem(req.ws.id, b.parent_item_id);
      if (!p || p.user_id !== owner.reports_to) throw bad('You can only link to a priority of your manager');
      upd.parent_item_id = p.id;
    } else upd.parent_item_id = null;
  }
  if (b.status !== undefined) {
    if (!isOwner) throw forbidden('Only the person doing the work updates its status');
    if (!['planned', 'in_progress', 'missed'].includes(b.status)) throw bad('Use Deliver to mark work as delivered');
    if (it.status === 'delivered' && db.prepare('SELECT 1 FROM ratings WHERE item_id = ?').get(it.id)) throw bad('Rated work cannot change status');
    upd.status = b.status;
  }
  const keys = Object.keys(upd);
  if (!keys.length) return { ok: true };
  upd.updated_at = now();
  const ks = Object.keys(upd);
  db.prepare(`UPDATE items SET ${ks.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...ks.map((k) => upd[k]), it.id);
  audit(req.ws.id, req.user.id, 'item.updated', 'item', it.id, upd);
  return { ok: true };
}));

app.delete('/api/items/:id', auth, wrap((req) => {
  const it = getItem(req.ws.id, req.params.id);
  if (!it) throw notFound();
  const owner = userIn(req.ws.id, it.user_id);
  if (owner.id !== req.user.id && !canManage(req.user, owner)) throw forbidden();
  if (it.rank) throw bad('Ranked priorities cannot be deleted. Ask your manager to take it out of the ranking first.');
  if (db.prepare('SELECT 1 FROM ratings WHERE item_id = ?').get(it.id) || db.prepare('SELECT 1 FROM items WHERE parent_item_id = ?').get(it.id)) throw bad('This item has ratings or linked work and is kept for the record');
  db.prepare('DELETE FROM blockers WHERE item_id = ?').run(it.id);
  db.prepare('DELETE FROM items WHERE id = ?').run(it.id);
  audit(req.ws.id, req.user.id, 'item.deleted', 'item', it.id, { title: it.title });
  return { ok: true };
}));

// Rank a person's week: order = [{ item_id, stretch, second_rater_id }] top first.
app.post('/api/stacks/rank', auth, idempotent, wrap((req) => {
  const b = req.body || {};
  const target = userIn(req.ws.id, b.user_id);
  if (!target) throw notFound('Person not found');
  if (!isRankerFor(req.user, target)) throw forbidden('Only their manager can rank this week');
  const week = weekParam(req.ws, b.week);
  const order = Array.isArray(b.order) ? b.order : [];
  const max = req.settings.rankWeights.length;
  if (order.length > max) throw bad(`Rank at most ${max} items`);
  const stack = stackOf(req.ws.id, target.id, week);
  const reason = b.reason ? str(b.reason, 'Reason', { max: 500 }) : null;
  if (stack && stack.locked_at && !reason) throw bad('This week is locked. Give a reason for the change.');
  const ids = new Set();
  for (const o of order) {
    const it = getItem(req.ws.id, o.item_id);
    if (!it || it.user_id !== target.id || it.week_start !== week) throw bad('Every ranked item must belong to this person and week');
    if (ids.has(it.id)) throw bad('An item is listed twice');
    ids.add(it.id);
    if (o.second_rater_id) {
      const r = userIn(req.ws.id, o.second_rater_id);
      if (!r || r.id === target.id) throw bad('Second rater must be someone else in the workspace');
    }
  }
  const before = db.prepare('SELECT id, rank, stretch FROM items WHERE workspace_id = ? AND user_id = ? AND week_start = ? AND rank IS NOT NULL').all(req.ws.id, target.id, week);
  db.transaction(() => {
    db.prepare('UPDATE items SET rank = NULL, updated_at = ? WHERE workspace_id = ? AND user_id = ? AND week_start = ?').run(now(), req.ws.id, target.id, week);
    order.forEach((o, i) => db.prepare('UPDATE items SET rank = ?, stretch = ?, second_rater_id = ?, updated_at = ? WHERE id = ?').run(i + 1, o.stretch ? 1 : 0, o.second_rater_id || null, now(), o.item_id));
    if (!stack) db.prepare('INSERT INTO stacks (workspace_id, user_id, week_start) VALUES (?,?,?)').run(req.ws.id, target.id, week);
    audit(req.ws.id, req.user.id, stack && stack.locked_at ? 'stack.changed_after_lock' : 'stack.ranked', 'stack', `${target.id}:${week}`, { before, after: order, reason });
  })();
  return { ok: true };
}));

app.post('/api/stacks/lock', auth, idempotent, wrap((req) => {
  const b = req.body || {};
  const target = userIn(req.ws.id, b.user_id);
  if (!target) throw notFound('Person not found');
  if (!isRankerFor(req.user, target)) throw forbidden('Only their manager can lock this week');
  const week = weekParam(req.ws, b.week);
  const ranked = db.prepare('SELECT COUNT(*) c FROM items WHERE workspace_id = ? AND user_id = ? AND week_start = ? AND rank IS NOT NULL').get(req.ws.id, target.id, week).c;
  if (!ranked) throw bad('Rank at least one priority before locking');
  const stack = stackOf(req.ws.id, target.id, week);
  if (stack && stack.locked_at) return { ok: true, already: true };
  if (!stack) db.prepare('INSERT INTO stacks (workspace_id, user_id, week_start, locked_at, locked_by) VALUES (?,?,?,?,?)').run(req.ws.id, target.id, week, now(), req.user.id);
  else db.prepare('UPDATE stacks SET locked_at = ?, locked_by = ? WHERE workspace_id = ? AND user_id = ? AND week_start = ?').run(now(), req.user.id, req.ws.id, target.id, week);
  audit(req.ws.id, req.user.id, 'stack.locked', 'stack', `${target.id}:${week}`, { ranked });
  return { ok: true };
}));

app.post('/api/items/:id/deliver', auth, idempotent, wrap((req) => {
  const it = getItem(req.ws.id, req.params.id);
  if (!it) throw notFound();
  if (it.user_id !== req.user.id) throw forbidden('Only the person doing the work delivers it');
  if (it.status === 'delivered') return { ok: true, already: true };
  const url = urlOf(req.body.proof_url);
  const note = str(req.body.proof_note, 'Proof note', { max: 2000, optional: true });
  if (!url && !note) throw bad('Add a proof link or a note that shows the result');
  db.prepare("UPDATE items SET status = 'delivered', proof_url = ?, proof_note = ?, proof_source = 'self-reported', delivered_at = ?, updated_at = ? WHERE id = ?").run(url, note, now(), now(), it.id);
  db.prepare('UPDATE blockers SET resolved_at = ?, resolved_by = ? WHERE item_id = ? AND resolved_at IS NULL').run(now(), req.user.id, it.id);
  audit(req.ws.id, req.user.id, 'item.delivered', 'item', it.id, { proof_url: url, has_note: !!note });
  return { ok: true };
}));

// ---------- blockers ----------
app.post('/api/items/:id/block', auth, idempotent, wrap((req, res) => {
  const it = getItem(req.ws.id, req.params.id);
  if (!it) throw notFound();
  if (it.user_id !== req.user.id) throw forbidden('Only the person doing the work raises a blocker');
  if (it.status === 'delivered') throw bad('This work is already delivered');
  if (db.prepare('SELECT 1 FROM blockers WHERE item_id = ? AND resolved_at IS NULL').get(it.id)) throw bad('This item already has an open blocker');
  const id = newId('bl');
  db.prepare('INSERT INTO blockers (id, workspace_id, item_id, user_id, description, raised_at) VALUES (?,?,?,?,?,?)').run(id, req.ws.id, it.id, req.user.id, str(req.body.description, 'What is blocking you', { max: 1000 }), now());
  audit(req.ws.id, req.user.id, 'blocker.raised', 'blocker', id, { item_id: it.id, rank: it.rank });
  res.status(201);
  return { id };
}));

app.post('/api/blockers/:id/resolve', auth, wrap((req) => {
  const bl = db.prepare('SELECT * FROM blockers WHERE workspace_id = ? AND id = ?').get(req.ws.id, req.params.id);
  if (!bl) throw notFound();
  const owner = userIn(req.ws.id, bl.user_id);
  if (owner.id !== req.user.id && !canManage(req.user, owner)) throw forbidden();
  if (bl.resolved_at) return { ok: true, already: true };
  db.transaction(() => {
    db.prepare('UPDATE blockers SET resolved_at = ?, resolved_by = ? WHERE id = ?').run(now(), req.user.id, bl.id);
    // Only the manager can declare the work blocked by others (no score penalty).
    if (req.body.external && canManage(req.user, owner)) db.prepare("UPDATE items SET status = 'blocked_external', updated_at = ? WHERE id = ?").run(now(), bl.item_id);
  })();
  audit(req.ws.id, req.user.id, 'blocker.resolved', 'blocker', bl.id, { external: !!req.body.external });
  return { ok: true };
}));

// ---------- ratings ----------
// Primary rater: the direct manager (an admin when the person has no manager).
function raterRoleFor(actor, it) {
  const owner = userIn(actor.workspace_id, it.user_id);
  if (!owner || owner.id === actor.id) return null;
  const primary = owner.reports_to ? owner.reports_to === actor.id : isAdmin(actor);
  return primary ? 'primary' : null;
}
function needsSecond(it, settings) { return !!(it.rank && it.rank <= settings.secondRaterRanks); }
function canBeSecond(actor, it, settings) {
  if (!needsSecond(it, settings) || actor.id === it.user_id) return false;
  if (it.second_rater_id) return it.second_rater_id === actor.id;
  const owner = userIn(actor.workspace_id, it.user_id);
  const anc = ancestors(owner);
  if (anc.length >= 2) return anc[1].id === actor.id; // manager's manager
  return isAdmin(actor) && owner.reports_to !== actor.id;
}

app.get('/api/ratings/pending', auth, wrap((req) => {
  const delivered = db.prepare("SELECT * FROM items WHERE workspace_id = ? AND status = 'delivered' AND user_id != ? ORDER BY delivered_at").all(req.ws.id, req.user.id);
  const out = [];
  for (const it of delivered) {
    if (db.prepare('SELECT 1 FROM ratings WHERE item_id = ? AND rater_id = ?').get(it.id, req.user.id)) continue;
    const prim = raterRoleFor(req.user, it);
    const sec = !prim && canBeSecond(req.user, it, req.settings);
    if (!prim && !sec) continue;
    const owner = userIn(req.ws.id, it.user_id);
    out.push({ ...itemView(it, req.user), owner: { id: owner.id, name: owner.name, level: owner.level }, as: prim ? 'primary' : 'second', weight: S.weightForRank(it.rank, req.settings) });
  }
  return { items: out };
}));

app.post('/api/items/:id/rate', auth, idempotent, wrap((req, res) => {
  const it = getItem(req.ws.id, req.params.id);
  if (!it) throw notFound();
  if (it.status !== 'delivered') throw bad('Only delivered work can be rated');
  const role = raterRoleFor(req.user, it) || (canBeSecond(req.user, it, req.settings) ? 'second' : null);
  if (!role) throw forbidden('You are not a rater for this work');
  const quality = req.body.quality;
  if (!['done_well', 'needs_fixes', 'redo'].includes(quality)) throw bad('Pick Done well, Needs fixes or Redo');
  const note = str(req.body.note, 'Note', { max: 1000, optional: true });
  if (quality !== 'done_well' && !note) throw bad('Add a note: what needs fixing or why it should be redone');
  if (db.prepare('SELECT 1 FROM ratings WHERE item_id = ? AND rater_id = ?').get(it.id, req.user.id)) throw bad('You already rated this. Use a dispute to change a rating.');
  const id = newId('rt');
  db.prepare('INSERT INTO ratings (id, workspace_id, item_id, rater_id, rater_role, quality, note, created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, req.ws.id, it.id, req.user.id, role, quality, note, now());
  audit(req.ws.id, req.user.id, 'rating.created', 'rating', id, { item_id: it.id, quality, role });
  res.status(201);
  return { id };
}));

// ---------- disputes ----------
function disputeResolverOk(actor, rating) {
  const rater = userIn(actor.workspace_id, rating.rater_id);
  if (actor.id === rating.rater_id) return false;
  const it = getItem(actor.workspace_id, rating.item_id);
  if (it.user_id === actor.id) return false;
  if (rater && rater.reports_to) return rater.reports_to === actor.id || isAdmin(actor);
  return isAdmin(actor);
}

app.post('/api/ratings/:id/dispute', auth, idempotent, wrap((req, res) => {
  const r = db.prepare('SELECT * FROM ratings WHERE workspace_id = ? AND id = ?').get(req.ws.id, req.params.id);
  if (!r) throw notFound();
  const it = getItem(req.ws.id, r.item_id);
  if (it.user_id !== req.user.id) throw forbidden('Only the person whose work was rated can dispute it');
  if (db.prepare("SELECT 1 FROM disputes WHERE rating_id = ? AND status = 'open'").get(r.id)) throw bad('This rating already has an open dispute');
  const id = newId('dp');
  db.prepare('INSERT INTO disputes (id, workspace_id, rating_id, raised_by, reason, original_quality, created_at) VALUES (?,?,?,?,?,?,?)').run(id, req.ws.id, r.id, req.user.id, str(req.body.reason, 'Reason', { max: 1000 }), r.quality, now());
  audit(req.ws.id, req.user.id, 'dispute.raised', 'dispute', id, { rating_id: r.id });
  res.status(201);
  return { id };
}));

app.get('/api/disputes', auth, wrap((req) => {
  const rows = db.prepare(`SELECT d.*, r.item_id, r.rater_id, i.title, i.user_id AS owner_id, ru.name AS rater_name, ou.name AS owner_name
    FROM disputes d JOIN ratings r ON r.id = d.rating_id JOIN items i ON i.id = r.item_id JOIN users ru ON ru.id = r.rater_id JOIN users ou ON ou.id = i.user_id
    WHERE d.workspace_id = ? ORDER BY d.created_at DESC`).all(req.ws.id);
  return {
    disputes: rows.filter((d) => d.owner_id === req.user.id || d.rater_id === req.user.id || disputeResolverOk(req.user, { rater_id: d.rater_id, item_id: d.item_id }))
      .map((d) => ({ ...d, canResolve: d.status === 'open' && disputeResolverOk(req.user, { rater_id: d.rater_id, item_id: d.item_id }) }))
  };
}));

app.post('/api/disputes/:id/resolve', auth, wrap((req) => {
  const d = db.prepare('SELECT * FROM disputes WHERE workspace_id = ? AND id = ?').get(req.ws.id, req.params.id);
  if (!d) throw notFound();
  if (d.status !== 'open') return { ok: true, already: true };
  const r = db.prepare('SELECT * FROM ratings WHERE id = ?').get(d.rating_id);
  if (!disputeResolverOk(req.user, r)) throw forbidden('This dispute goes to the rater\'s manager');
  const decision = req.body.decision;
  const note = str(req.body.note, 'Note', { max: 1000 });
  if (decision === 'changed') {
    const q = req.body.new_quality;
    if (!['done_well', 'needs_fixes', 'redo'].includes(q)) throw bad('Pick the new rating');
    db.transaction(() => {
      db.prepare("UPDATE disputes SET status = 'changed', new_quality = ?, resolver_id = ?, resolution_note = ?, resolved_at = ? WHERE id = ?").run(q, req.user.id, note, now(), d.id);
      db.prepare('UPDATE ratings SET quality = ? WHERE id = ?').run(q, r.id);
    })();
  } else if (decision === 'upheld') {
    db.prepare("UPDATE disputes SET status = 'upheld', resolver_id = ?, resolution_note = ?, resolved_at = ? WHERE id = ?").run(req.user.id, note, now(), d.id);
  } else throw bad('Decision must be upheld or changed');
  audit(req.ws.id, req.user.id, 'dispute.resolved', 'dispute', d.id, { decision, original: d.original_quality, new_quality: req.body.new_quality || null });
  return { ok: true };
}));

// ---------- coins ----------
function coinTotals(wsId, userId, week) {
  return {
    given: db.prepare('SELECT COALESCE(SUM(coins),0) c FROM coins WHERE workspace_id = ? AND from_id = ? AND week_start = ?').get(wsId, userId, week).c
  };
}
app.get('/api/coins', auth, wrap((req) => {
  const week = currentWeek(req.ws);
  const q = 'SELECT c.id, c.coins, c.reason, c.created_at, c.week_start, f.name AS from_name, t.name AS to_name FROM coins c JOIN users f ON f.id = c.from_id JOIN users t ON t.id = c.to_id WHERE c.workspace_id = ? AND';
  return {
    week, remaining: req.settings.coinsPerWeek - coinTotals(req.ws.id, req.user.id, week).given, maxPerPerson: req.settings.maxCoinsPerPerson,
    received: db.prepare(`${q} c.to_id = ? ORDER BY c.created_at DESC LIMIT 50`).all(req.ws.id, req.user.id),
    given: db.prepare(`${q} c.from_id = ? ORDER BY c.created_at DESC LIMIT 50`).all(req.ws.id, req.user.id)
  };
}));
app.post('/api/coins', auth, idempotent, wrap((req, res) => {
  const b = req.body || {};
  const to = userIn(req.ws.id, b.to_id);
  if (!to || !to.active) throw bad('Pick a person');
  const week = currentWeek(req.ws);
  const coins = Number(b.coins);
  const reason = str(b.reason, 'Reason', { min: 3, max: 300 });
  const err = db.transaction(() => {
    const givenThisWeek = coinTotals(req.ws.id, req.user.id, week).given;
    const givenToThisPerson = db.prepare('SELECT COALESCE(SUM(coins),0) c FROM coins WHERE workspace_id = ? AND from_id = ? AND to_id = ? AND week_start = ?').get(req.ws.id, req.user.id, to.id, week).c;
    const e = S.checkCoinGift({ fromId: req.user.id, toId: to.id, coins, givenThisWeek, givenToThisPerson }, req.settings);
    if (e) return e;
    const id = newId('cn');
    db.prepare('INSERT INTO coins (id, workspace_id, from_id, to_id, coins, reason, week_start, created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, req.ws.id, req.user.id, to.id, coins, reason, week, now());
    audit(req.ws.id, req.user.id, 'coins.given', 'coins', id, { to: to.id, coins });
    return null;
  })();
  if (err) throw bad(err);
  res.status(201);
  return { ok: true };
}));

// ---------- leave ----------
app.post('/api/leave', auth, wrap((req) => {
  const b = req.body || {};
  const target = b.user_id ? userIn(req.ws.id, b.user_id) : req.user;
  if (!target || (target.id !== req.user.id && !canManage(req.user, target))) throw forbidden();
  const days = Array.isArray(b.days) ? b.days : [];
  if (!days.length || days.length > 60 || !days.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))) throw bad('days must be 1-60 dates as YYYY-MM-DD');
  const ins = db.prepare('INSERT OR IGNORE INTO leave_days (workspace_id, user_id, day, source) VALUES (?,?,?,?)');
  const del = db.prepare('DELETE FROM leave_days WHERE workspace_id = ? AND user_id = ? AND day = ?');
  db.transaction(() => days.forEach((d) => (b.remove ? del.run(req.ws.id, target.id, d) : ins.run(req.ws.id, target.id, d, 'manual'))))();
  audit(req.ws.id, req.user.id, b.remove ? 'leave.removed' : 'leave.added', 'user', target.id, { days });
  return { ok: true };
}));

// ---------- scorecard / team ----------
app.get('/api/scorecard', auth, wrap((req) => {
  const target = req.query.user ? userIn(req.ws.id, String(req.query.user)) : req.user;
  if (!target || !canSee(req.user, target)) throw forbidden();
  const cur = currentWeek(req.ws);
  const weeks = [4, 3, 2, 1, 0].map((n) => addDays(cur, -7 * n));
  const trend = weeks.map((w) => {
    const c = computeWeek(req.ws, req.settings, target.id, w);
    return { week: w, score: c.score, pending: c.pending, coins: c.coins, quality: c.quality, alignment: c.alignment };
  });
  const thisWeek = computeWeek(req.ws, req.settings, target.id, cur);
  const coinNotes = db.prepare('SELECT c.coins, c.reason, f.name AS from_name FROM coins c JOIN users f ON f.id = c.from_id WHERE c.workspace_id = ? AND c.to_id = ? AND c.week_start = ? ORDER BY c.created_at DESC').all(req.ws.id, target.id, cur);
  // Plain facts only. No AI here, and nothing that implies a rating.
  const changed = thisWeek.items.filter((i) => i.status === 'delivered').map((i) => ({ title: i.title, rank: i.rank, proof_url: i.proof_url, proof_note: i.proof_note }));
  return { person: publicUser(target), week: cur, current: { score: thisWeek.score, pending: thisWeek.pending, quality: thisWeek.quality, coins: thisWeek.coins, alignment: thisWeek.alignment, leave: thisWeek.leave, breakdown: thisWeek.breakdown }, trend, coinNotes, changed };
}));

app.get('/api/team', auth, wrap((req) => {
  const week = weekParam(req.ws, req.query.week);
  const people = visibleUsers(req.user).filter((u) => u.id !== req.user.id || isAdmin(req.user));
  const rows = people.map((u) => {
    const c = computeWeek(req.ws, req.settings, u.id, week);
    const q = c.quality;
    const rated = q.done_well + q.needs_fixes + q.redo;
    const openBlockers = db.prepare('SELECT COUNT(*) c FROM blockers WHERE workspace_id = ? AND user_id = ? AND resolved_at IS NULL').get(req.ws.id, u.id).c;
    const stack = stackOf(req.ws.id, u.id, week);
    return {
      id: u.id, name: u.name, level: u.level, department: u.department, reports_to: u.reports_to, role: u.role,
      score: c.score, pending: c.pending, qualityPct: rated ? Math.round((q.done_well / rated) * 100) : null, quality: q,
      coins: c.coins, alignment: c.alignment, openBlockers, locked: !!(stack && stack.locked_at), onLeave: c.leave.days.length
    };
  });
  // How each rater rates: makes harsh or lenient patterns visible.
  const ids = new Set(people.map((p) => p.id));
  const raters = db.prepare(`SELECT r.rater_id, u.name, r.quality, COUNT(*) n FROM ratings r JOIN users u ON u.id = r.rater_id
    JOIN items i ON i.id = r.item_id WHERE r.workspace_id = ? AND i.week_start >= ? GROUP BY r.rater_id, r.quality`).all(req.ws.id, addDays(week, -28));
  const dist = {};
  for (const r of raters) {
    if (!ids.has(r.rater_id) && r.rater_id !== req.user.id && !isAdmin(req.user)) continue;
    dist[r.rater_id] = dist[r.rater_id] || { name: r.name, done_well: 0, needs_fixes: 0, redo: 0 };
    dist[r.rater_id][r.quality] = r.n;
  }
  const depts = {};
  for (const r of rows) {
    const k = r.department || 'No department';
    depts[k] = depts[k] || { department: k, people: 0, scored: 0, total: 0, blockers: 0 };
    depts[k].people += 1;
    depts[k].blockers += r.openBlockers;
    if (r.score !== null) { depts[k].scored += 1; depts[k].total += r.score; }
  }
  return {
    week, people: rows,
    departments: Object.values(depts).map((d) => ({ department: d.department, people: d.people, blockers: d.blockers, avgScore: d.scored ? Math.round(d.total / d.scored) : null })),
    raters: Object.values(dist)
  };
}));

app.get('/api/audit', auth, wrap((req) => {
  const limit = Math.min(200, Number(req.query.limit) || 100);
  const rows = isAdmin(req.user)
    ? db.prepare('SELECT a.*, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.workspace_id = ? ORDER BY a.id DESC LIMIT ?').all(req.ws.id, limit)
    : db.prepare('SELECT a.*, u.name AS actor FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id WHERE a.workspace_id = ? AND a.actor_id = ? ORDER BY a.id DESC LIMIT ?').all(req.ws.id, req.user.id, limit);
  return { entries: rows };
}));

app.get('/api/incidents', auth, wrap((req) => ({
  incidents: db.prepare('SELECT * FROM incidents WHERE workspace_id = ? ORDER BY raised_at DESC LIMIT 100').all(req.ws.id),
  blockersOverThreshold: db.prepare(`SELECT b.id, b.description, b.raised_at, i.title, i.rank, u.name FROM blockers b JOIN items i ON i.id = b.item_id JOIN users u ON u.id = b.user_id
    WHERE b.workspace_id = ? AND b.resolved_at IS NULL AND i.rank IS NOT NULL AND i.rank <= ? AND b.raised_at <= ?`).all(req.ws.id, req.settings.secondRaterRanks, new Date(Date.now() - req.settings.blockerEscalationHours * 3600e3).toISOString())
})));

// ---------- phone alerts (M91) ----------
const m91 = require('./m91');
const alerts = require('./alerts').init({ db, now, audit, userIn, currentWeek, localDate, settingsOf });
const m91Error = (e) => {
  if (e.code === 'CHANNEL_EMPTY') return 'Nobody in that channel can be reached yet: everyone needs the M91 app installed and the invite accepted.';
  if (e.status === 401) return 'That link is wrong or was deleted. Copy it again from the M91 app.';
  if (e.code === 'NETWORK') return 'Could not reach M91 right now. Try again in a minute.';
  return e.message;
};

app.get('/api/alerts/setup', auth, wrap((req) => ({
  configured: !!req.ws.m91_link, channel: req.ws.m91_channel || null,
  moments: Object.entries(alerts.MOMENTS).map(([key, text]) => ({ key, text, on: req.settings.alertMoments[key] !== false })),
  canEdit: isAdmin(req.user)
})));

app.post('/api/alerts/link', auth, adminOnly, async (req, res, next) => {
  try {
    const link = m91.cleanLink(req.body && req.body.link);
    const info = await m91.checkLink(link); // raises nothing
    db.prepare('UPDATE workspaces SET m91_link = ?, m91_channel = ? WHERE id = ?').run(m91.seal(link), info.channel.name, req.ws.id);
    audit(req.ws.id, req.user.id, 'alerts.connected', 'workspace', req.ws.id, { channel: info.channel.name });
    res.json({ ok: true, channel: info.channel.name });
  } catch (e) { next(e instanceof m91.M91Error ? bad(m91Error(e)) : e); }
});

app.delete('/api/alerts/link', auth, adminOnly, wrap((req) => {
  db.prepare('UPDATE workspaces SET m91_link = NULL, m91_channel = NULL WHERE id = ?').run(req.ws.id);
  audit(req.ws.id, req.user.id, 'alerts.disconnected', 'workspace', req.ws.id, null);
  return { ok: true };
}));

const lastTest = new Map();
app.post('/api/alerts/test', auth, adminOnly, async (req, res, next) => {
  try {
    if (!req.ws.m91_link) throw bad('Paste your channel link first');
    if (Date.now() - (lastTest.get(req.ws.id) || 0) < 60e3) throw bad('Wait a minute between tests');
    lastTest.set(req.ws.id, Date.now());
    const r = await m91.send(alerts.linkOf(req.ws), {
      title: `Test from Proof of Impact: ${req.user.name} checked that phone alerts work`,
      description: 'This is a test. Nothing needs doing. Tap "It rang" so the app knows it reached you.',
      severity: 'LOW', isAutoClose: true,
      responseOptions: [{ label: 'It rang', effect: 'SHARED' }, { label: 'Seen', effect: 'PERSONAL' }]
    });
    audit(req.ws.id, req.user.id, 'alerts.tested', 'workspace', req.ws.id, { delivered: r.delivered || 0 });
    res.json({ ok: true, delivered: r.delivered || 0, alertId: r._id, unregistered: (r.unregistered || []).length });
  } catch (e) { next(e instanceof m91.M91Error ? bad(m91Error(e)) : e); }
});

// Read the test alert back: the only proof a person saw it is an answer.
app.get('/api/alerts/test/:alertId', auth, adminOnly, async (req, res, next) => {
  try {
    const a = await m91.read(alerts.linkOf(req.ws), String(req.params.alertId).slice(0, 64));
    res.json({ status: a.status, answered: a.decision ? a.decision.label : null, responses: (a.responses || []).length, pending: a.pending });
  } catch (e) { next(e instanceof m91.M91Error ? bad(m91Error(e)) : e); }
});

// M91 posts here when someone answers or an alert ends. The body is only a signal (it cannot be verified yet):
// we read the alert back from M91 with the workspace's own link and act on that.
app.post('/api/m91/callback/:wsId', async (req, res) => {
  try {
    const ws = getWs(req.params.wsId);
    const body = req.body || {};
    const customId = body.alert && typeof body.alert.customId === 'string' ? body.alert.customId : null;
    if (!ws || !ws.m91_link || !customId) return res.sendStatus(204);
    const key = typeof body.idempotencyKey === 'string' ? body.idempotencyKey.slice(0, 200) : null;
    if (key && db.prepare('SELECT 1 FROM m91_callbacks WHERE key = ?').get(key)) return res.sendStatus(200);
    const inc = db.prepare('SELECT * FROM incidents WHERE workspace_id = ? AND custom_id = ?').get(ws.id, customId);
    if (inc) {
      const a = await m91.read(alerts.linkOf(ws), customId);
      const hint = body.response && body.response.by && body.response.by.name;
      alerts.apply(ws, inc, a, hint);
      // Closed in M91 without an answer: counts as "Seen". Kept until the problem clears so it does not ring again.
      if ((a.status === 'RESOLVED' || body.event === 'closed') && !a.decision) db.prepare("UPDATE incidents SET status = 'dismissed', acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ? AND status = 'open'").run(now(), inc.id);
      await alerts.sweep(getWs(ws.id), { raise: false });
    }
    if (key) db.prepare('INSERT OR IGNORE INTO m91_callbacks VALUES (?,?)').run(key, now());
    res.sendStatus(200);
  } catch (e) {
    console.error('m91 callback failed', e.code || e.message);
    res.sendStatus(500); // M91 retries
  }
});

// Honest status only. Nothing is shown as connected until it has been verified.
app.get('/api/integrations/status', auth, wrap((req) => ({
  viasocket: { keysPresent: !!(process.env.VIASOCKET_ORG_ID && process.env.VIASOCKET_PROJECT_ID && process.env.VIASOCKET_EMBED_SECRET), verified: false, state: 'waiting_for_plan_approval' },
  slack: { state: 'not_connected' },
  keka: { state: 'not_connected', chosen: S.mergeSettings(JSON.parse(req.ws.settings_json || '{}')).peopleSource === 'keka' },
  m91: { configured: !!req.ws.m91_link, channel: req.ws.m91_channel || null }
})));

// ---------- scheduled job (Embarko schedules call this with CRON_SECRET) ----------
app.get('/tasks/hourly', async (req, res) => {
  if (!process.env.CRON_SECRET || req.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) return res.sendStatus(401);
  let n = 0;
  const alertReports = [];
  for (const ws of db.prepare('SELECT * FROM workspaces').all()) {
    const settings = settingsOf(ws);
    const cur = currentWeek(ws);
    for (const w of [cur, addDays(cur, -7)]) {
      for (const u of db.prepare('SELECT id FROM users WHERE workspace_id = ? AND active = 1').all(ws.id)) {
        const c = computeWeek(ws, settings, u.id, w);
        db.prepare('INSERT OR REPLACE INTO weekly_scores VALUES (?,?,?,?,?,?,?,?,?)').run(ws.id, u.id, w, c.score, JSON.stringify(c.quality), c.coins, c.alignment, c.pending, now());
        n += 1;
      }
    }
    // Flag (not yet send) blockers past the escalation threshold. Sending to M91 waits for its setup.
    db.prepare(`UPDATE blockers SET escalated = 1 WHERE workspace_id = ? AND resolved_at IS NULL AND escalated = 0 AND raised_at <= ?
      AND item_id IN (SELECT id FROM items WHERE rank IS NOT NULL AND rank <= ?)`).run(ws.id, new Date(Date.now() - settings.blockerEscalationHours * 3600e3).toISOString(), settings.secondRaterRanks);
  }
  for (const ws of db.prepare('SELECT * FROM workspaces WHERE m91_link IS NOT NULL').all()) {
    try { const r = await alerts.sweep(ws); alertReports.push(`${r.raised} raised, ${r.answered} answered, ${r.closed} closed${r.errors.length ? `, ${r.errors.length} errors` : ''}`); } catch (e) { alertReports.push(`error ${e.code || e.message}`); }
  }
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
  db.prepare('DELETE FROM idempotency WHERE created_at < ?').run(new Date(Date.now() - 7 * 864e5).toISOString());
  db.prepare('DELETE FROM m91_callbacks WHERE at < ?').run(new Date(Date.now() - 30 * 864e5).toISOString());
  res.send(`Scores refreshed for ${n} person-weeks. Alerts: ${alertReports.join('; ') || 'no workspace has phone alerts'}`);
});

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html', maxAge: '5m' }));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const status = err.status || (err.type === 'entity.parse.failed' ? 400 : 500);
  if (status >= 500) console.error('error', req.method, req.path, err.message);
  res.status(status).json({ error: status >= 500 ? 'Something went wrong' : err.message });
});

module.exports = { app, helpers: { mondayOf, addDays, localDate } };

