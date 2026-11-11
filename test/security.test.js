// Security regression tests: admin takeover, owner protection, incident visibility.
// Every request goes straight to the API, the way an attacker would send it (the UI hides nothing that matters here).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-sec-'));
process.env.DATA_DIR = dir;
process.env.RATE_LIMIT_MAX = '1000';
const { app } = require('../server/server');
const db = require('../server/db');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

const PW = 'correct-horse-9';
function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
}
async function join(inviter, email, role, reports_to) {
  const inv = await inviter('POST', '/api/invites', { email, role, reports_to });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const c = client();
  assert.equal((await c('POST', `/api/invites/${inv.body.link.split('/join/')[1]}/accept`, { name: email.split('@')[0], password: PW })).status, 200);
  return { c, id: (await c('GET', '/api/me')).body.user.id };
}
const user = (id) => db.prepare('SELECT role, active, reports_to FROM users WHERE id = ?').get(id);

// One company:  owner ─┬─ admin
//                      ├─ manager M ─┬─ employee E
//                      │             └─ employee E2
//                      └─ manager M2 ── employee F
let owner, ownerId, admin, M, E, E2, M2, F;
test.before(async () => {
  owner = client();
  assert.equal((await owner('POST', '/api/auth/signup', { company: 'SecCo', name: 'Olga Owner', email: 'olga@sec.co', password: PW, timezone: 'UTC' })).status, 200);
  ownerId = (await owner('GET', '/api/me')).body.user.id;
  admin = await join(owner, 'ada@sec.co', 'admin', ownerId);
  M = await join(owner, 'max@sec.co', 'manager', ownerId);
  M2 = await join(owner, 'mia@sec.co', 'manager', ownerId);
  E = await join(M.c, 'eve@sec.co', 'member', M.id);
  E2 = await join(M.c, 'eli@sec.co', 'member', M.id);
  F = await join(M2.c, 'fay@sec.co', 'member', M2.id);
});

// ---------------- admin privileges ----------------
test('an employee cannot promote themselves or anyone else to admin or owner', async () => {
  for (const role of ['admin', 'owner', 'manager']) {
    assert.equal((await E.c('PATCH', `/api/people/${E.id}`, { role })).status, 403, `self -> ${role}`);
    assert.equal((await E.c('PATCH', `/api/people/${E2.id}`, { role })).status, 403, `other -> ${role}`);
  }
  assert.equal((await E.c('POST', '/api/invites', { email: 'sneak@sec.co', role: 'admin' })).status, 403);
  assert.equal((await E.c('POST', '/api/people/import', { rows: [{ email: 'eve@sec.co', role: 'admin' }] })).status, 403);
  assert.equal(user(E.id).role, 'member');
  assert.equal(user(E2.id).role, 'member');
});

test('a manager cannot make admins, change an admin, or get a sign-in link for one', async () => {
  assert.equal((await M.c('PATCH', `/api/people/${E.id}`, { role: 'admin' })).status, 403);
  assert.equal((await M.c('POST', '/api/invites', { email: 'x1@sec.co', role: 'admin', reports_to: M.id })).status, 403);
  assert.equal((await M.c('PATCH', `/api/people/${admin.id}`, { role: 'member' })).status, 403);
  assert.equal((await M.c('PATCH', `/api/people/${admin.id}`, { active: false })).status, 403);
  assert.equal((await M.c('POST', `/api/people/${admin.id}/reset-link`, {})).status, 403);
  assert.equal((await M.c('POST', `/api/people/${admin.id}/offboard`, {})).status, 403);
  assert.equal(user(admin.id).role, 'admin');
  assert.equal(user(admin.id).active, 1);
});

test('the reactivate takeover is closed: an active admin cannot be pulled under a manager, then reset', async () => {
  // The original attack: re-parent an active admin under yourself with "reactivate", then ask for their reset link.
  const r = await M.c('POST', `/api/people/${admin.id}/reactivate`, { reports_to: M.id });
  assert.ok([400, 403].includes(r.status), JSON.stringify(r.body));
  assert.equal(user(admin.id).reports_to, ownerId, 'admin was not moved');
  assert.equal((await M.c('POST', `/api/people/${admin.id}/reset-link`, {})).status, 403);
  // Same attack on the owner and on an active member of someone else's team.
  assert.ok([400, 403].includes((await M.c('POST', `/api/people/${ownerId}/reactivate`, { reports_to: M.id })).status));
  assert.ok([400, 403].includes((await M.c('POST', `/api/people/${F.id}/reactivate`, { reports_to: M.id })).status));
  assert.equal(user(F.id).reports_to, M2.id);
  // Even when an admin really did report to a manager, the manager still cannot reset or re-invite them.
  db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(M.id, admin.id);
  try {
    assert.equal((await M.c('POST', `/api/people/${admin.id}/reset-link`, {})).status, 403);
    assert.equal((await M.c('PATCH', `/api/people/${admin.id}`, { reports_to: M.id })).status, 403);
  } finally { db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(ownerId, admin.id); }
});

test('a manager cannot get an invite link for a not-yet-joined admin in their team', async () => {
  const inv = await owner('POST', '/api/invites', { email: 'pending-admin@sec.co', role: 'admin', reports_to: M.id });
  assert.equal(inv.status, 200);
  const pending = db.prepare("SELECT id FROM users WHERE email = 'pending-admin@sec.co'").get().id;
  assert.equal((await M.c('POST', `/api/people/${pending}/invite-link`, {})).status, 403);
  assert.equal((await admin.c('POST', `/api/people/${pending}/invite-link`, {})).status, 200); // admins still can
});

test('reactivate only brings back people who left, by an admin or their former manager', async () => {
  assert.equal((await M.c('POST', `/api/people/${E2.id}/offboard`, {})).status, 200);
  assert.equal(user(E2.id).active, 0);
  assert.equal((await M2.c('POST', `/api/people/${E2.id}/reactivate`, { reports_to: M2.id })).status, 403); // not M2's former person
  assert.equal((await E.c('POST', `/api/people/${E2.id}/reactivate`, {})).status, 403);
  const back = await M.c('POST', `/api/people/${E2.id}/reactivate`, { reports_to: M.id });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(user(E2.id).active, 1);
  assert.equal((await M.c('POST', `/api/people/${E2.id}/reactivate`, {})).status, 400); // already active
});

test('admins keep their normal powers', async () => {
  assert.equal((await admin.c('PATCH', `/api/people/${E.id}`, { role: 'manager' })).status, 200);
  assert.equal(user(E.id).role, 'manager');
  assert.equal((await admin.c('PATCH', `/api/people/${E.id}`, { role: 'member' })).status, 200);
  assert.equal((await admin.c('POST', `/api/people/${E.id}/reset-link`, {})).status, 200);
  assert.equal((await admin.c('PATCH', `/api/people/${F.id}`, { department: 'Ops' })).status, 200);
  // An admin may still promote someone to admin and back (the existing policy).
  assert.equal((await admin.c('PATCH', `/api/people/${F.id}`, { role: 'admin' })).status, 200);
  assert.equal((await admin.c('PATCH', `/api/people/${F.id}`, { role: 'member' })).status, 200);
  // A manager still looks after their own team.
  assert.equal((await M.c('PATCH', `/api/people/${E.id}`, { department: 'Product' })).status, 200);
  assert.equal((await M.c('POST', `/api/people/${E.id}/reset-link`, {})).status, 200);
});

// ---------------- owner protection ----------------
test('nobody but an owner can deactivate, move, demote or remove the owner', async () => {
  for (const c of [E.c, M.c, admin.c]) {
    assert.equal((await c('PATCH', `/api/people/${ownerId}`, { active: false })).status, 403);
    assert.equal((await c('PATCH', `/api/people/${ownerId}`, { reports_to: M.id })).status, 403);
    assert.equal((await c('PATCH', `/api/people/${ownerId}`, { role: 'member' })).status, 403);
    assert.equal((await c('POST', `/api/people/${ownerId}/offboard`, {})).status, 403);
    assert.equal((await c('POST', `/api/people/${ownerId}/reset-link`, {})).status, 403);
  }
  assert.equal((await admin.c('PATCH', `/api/people/${admin.id}`, { role: 'owner' })).status, 403); // no self-crowning
  assert.equal((await admin.c('PATCH', `/api/people/${E.id}`, { role: 'owner' })).status, 403);
  const o = user(ownerId);
  assert.deepEqual([o.role, o.active, o.reports_to], ['owner', 1, null]);
});

test('a file import cannot move, bring back or demote the owner, and an empty role never demotes anyone', async () => {
  const moved = await admin.c('POST', '/api/people/import', { rows: [{ email: 'olga@sec.co', manager_email: 'max@sec.co' }] });
  assert.equal(moved.body.ok, false);
  assert.match(JSON.stringify(moved.body.errors), /only an owner can change an owner/);
  assert.equal(user(ownerId).reports_to, null);
  // Re-importing people without a role column keeps admins and managers as they are.
  const keep = await admin.c('POST', '/api/people/import', { rows: [{ email: 'max@sec.co', department: 'Eng' }, { email: 'ada@sec.co', department: 'Ops' }] });
  assert.equal(keep.status, 200, JSON.stringify(keep.body));
  assert.equal(user(M.id).role, 'manager');
  assert.equal(user(admin.id).role, 'admin');
  // A manager cannot touch an admin row in a file either.
  db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(M.id, admin.id);
  try {
    const r = await M.c('POST', '/api/people/import', { rows: [{ email: 'ada@sec.co', role: 'member' }] });
    assert.equal(r.body.ok, false);
    assert.equal(user(admin.id).role, 'admin');
  } finally { db.prepare('UPDATE users SET reports_to = ? WHERE id = ?').run(ownerId, admin.id); }
});

test('the last owner cannot be deactivated even by an owner, and normal deactivation still works', async () => {
  const second = await join(owner, 'otto@sec.co', 'admin', ownerId);
  assert.equal((await owner('PATCH', `/api/people/${second.id}`, { role: 'owner' })).status, 200);
  assert.equal((await second.c('PATCH', `/api/people/${ownerId}`, { active: false })).status, 200); // an owner may remove another owner
  assert.equal((await owner('GET', '/api/me')).status, 401);
  assert.equal((await second.c('PATCH', `/api/people/${ownerId}`, { active: true })).status, 200);
  assert.equal((await second.c('PATCH', `/api/people/${second.id}`, { active: false })).status, 400); // not yourself
  // A normal leaver: an admin deactivates an employee, and a manager offboards their own report.
  const temp = await join(M.c, 'tim@sec.co', 'member', M.id);
  assert.equal((await admin.c('PATCH', `/api/people/${temp.id}`, { active: false })).status, 200);
  assert.equal(user(temp.id).active, 0);
  const temp2 = await join(M.c, 'tia@sec.co', 'member', M.id);
  assert.equal((await M.c('POST', `/api/people/${temp2.id}/offboard`, {})).status, 200);
});

// ---------------- incident visibility ----------------
test('incidents: employees see nothing, managers see their team only, admins see everything', async () => {
  const ws = db.prepare("SELECT id FROM workspaces WHERE name = 'SecCo'").get().id;
  const add = (id, ownerIdOf, title) => db.prepare("INSERT INTO incidents (id, workspace_id, custom_id, kind, severity, title, owner_id, status, raised_at) VALUES (?,?,?,?,?,?,?,'open',?)")
    .run(id, ws, id, 'blocker', 'MEDIUM', title, ownerIdOf, new Date().toISOString());
  add('in_m', M.id, 'Eve is blocked on her #1 priority (for Max)');
  add('in_m2', M2.id, 'Fay is blocked on her #1 priority (for Mia)');
  add('in_none', null, 'Olga is blocked on her #1 priority');

  // An employee with no team: refused, by list and with any query string.
  for (const url of ['/api/incidents', '/api/incidents?id=in_m', '/api/incidents?q=blocked&format=csv']) {
    const r = await E.c('GET', url);
    assert.equal(r.status, 403, url);
    assert.ok(!JSON.stringify(r.body).includes('blocked on'), url);
  }
  // There is no detail, search or export route; guessing one gives a plain 404 with nothing in it.
  for (const url of ['/api/incidents/in_m', '/api/incidents/in_m2/export', '/api/incidents/search?q=Eve']) {
    const r = await E.c('GET', url);
    assert.equal(r.status, 404, url);
    assert.ok(!JSON.stringify(r.body).includes('blocked on'), url);
  }
  // A manager sees only their own team's incidents: no leak across teams.
  const m = await M.c('GET', '/api/incidents');
  assert.equal(m.status, 200);
  assert.deepEqual(m.body.incidents.map((i) => i.id).sort(), ['in_m']);
  const m2 = await M2.c('GET', '/api/incidents');
  assert.deepEqual(m2.body.incidents.map((i) => i.id).sort(), ['in_m2']);
  // Admins and the owner see all of them.
  for (const c of [admin.c, owner]) {
    const a = await c('GET', '/api/incidents');
    assert.equal(a.status, 200);
    assert.deepEqual(a.body.incidents.map((i) => i.id).sort(), ['in_m', 'in_m2', 'in_none']);
  }
  // Signed out: refused.
  assert.equal((await client()('GET', '/api/incidents')).status, 401);
});

test('incidents: overdue blockers are limited to the manager\'s own team', async () => {
  const ws = db.prepare("SELECT id FROM workspaces WHERE name = 'SecCo'").get().id;
  const old = new Date(Date.now() - 48 * 3600e3).toISOString();
  const mk = (uid, title) => {
    const it = `it_${title.replace(/\W/g, '')}`;
    db.prepare("INSERT INTO items (id, workspace_id, user_id, week_start, rank, title, created_by, created_at, updated_at) VALUES (?,?,?,?,1,?,?,?,?)").run(it, ws, uid, '2026-11-02', title, uid, old, old);
    db.prepare('INSERT INTO blockers (id, workspace_id, item_id, user_id, description, raised_at) VALUES (?,?,?,?,?,?)').run(`bl_${it}`, ws, it, uid, `${title} blocker`, old);
  };
  mk(E.id, 'Eve secret work');
  mk(F.id, 'Fay secret work');
  const m = await M.c('GET', '/api/incidents');
  assert.deepEqual(m.body.blockersOverThreshold.map((b) => b.title), ['Eve secret work']);
  assert.ok(!JSON.stringify(m.body).includes('Fay secret'));
  const a = await admin.c('GET', '/api/incidents');
  assert.deepEqual(a.body.blockersOverThreshold.map((b) => b.title).sort(), ['Eve secret work', 'Fay secret work']);
});
