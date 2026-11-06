// Every phone-alert moment, end to end, against a stand-in for M91 (no real phone rings in tests).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-m91-'));
process.env.CRON_SECRET = 'test-cron';
process.env.RATE_LIMIT_MAX = '1000';
process.env.APP_SECRET = 'test-app-secret-0123456789';
process.env.APP_URL = 'https://impact.example.com';

// ---- fake M91 ----
const TOKEN = 'tok_TESTtestTEST1234';
const LINK = `https://m91-api.msg91.com/s/${TOKEN}`;
const m = { alerts: new Map(), sent: [], closed: [], n: 0, channelEmpty: false };
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (!u.startsWith('https://m91-api.msg91.com/')) return realFetch(url, opts);
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  if (!u.startsWith(LINK)) return json(401, { success: false, error: { code: 'INVALID_SENDER_TOKEN', message: 'Invalid sender token' } });
  const rest = u.slice(LINK.length);
  const body = opts.body ? JSON.parse(opts.body) : null;
  if (opts.method === 'GET' && rest === '') {
    assert.ok(!u.includes('?'), 'a GET with a query would raise an alert');
    return json(200, { success: true, data: { ok: true, channel: { id: 'c1', name: 'Team leads', visibility: 'PRIVATE' }, sender: { id: 's', label: 'Owner' } } });
  }
  if (opts.method === 'POST' && rest === '') {
    if (m.channelEmpty) return json(409, { success: false, error: { code: 'CHANNEL_EMPTY', message: 'empty', details: { unregistered: ['91999'] } } });
    for (const k of Object.keys(body)) assert.ok(['title', 'description', 'severity', 'responseOptions', 'callbackUrl', 'isAutoClose', 'customId', 'other', 'attachments'].includes(k), `unknown field ${k}`);
    assert.ok(body.title.length >= 5 && body.title.length <= 2000);
    assert.ok(Array.isArray(body.responseOptions) && body.responseOptions.length >= 2, 'two or more answers');
    for (const o of body.responseOptions) assert.ok(o.label.length <= 24, `label too long: ${o.label}`);
    const open = body.customId && [...m.alerts.values()].find((a) => a.customId === body.customId && a.status !== 'RESOLVED');
    if (open) return json(200, { success: true, data: { _id: open._id, delivered: 0, deduplicated: true } });
    const _id = `a${++m.n}`;
    m.alerts.set(_id, { _id, ...body, status: 'OPEN', decision: null, responses: [] });
    m.sent.push(body);
    return json(201, { success: true, data: { _id, delivered: 2, unregistered: [] } });
  }
  if (opts.method === 'POST' && rest === '/close') {
    const a = [...m.alerts.values()].find((x) => x.customId === body.customId);
    if (!a) return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'none' } });
    if (a.status === 'RESOLVED') return json(403, { success: false, error: { code: 'FORBIDDEN', message: 'already_resolved' } });
    a.status = 'RESOLVED';
    m.closed.push(body.customId);
    return json(200, { success: true, data: { _id: a._id, status: 'RESOLVED' } });
  }
  if (opts.method === 'GET' && rest.startsWith('/alerts/')) {
    const id = decodeURIComponent(rest.slice(8));
    const a = [...m.alerts.values()].reverse().find((x) => x.customId === id) || m.alerts.get(id);
    if (!a) return json(404, { success: false, error: { code: 'NOT_FOUND', message: 'none' } });
    return json(200, { success: true, data: { _id: a._id, customId: a.customId, status: a.status, decision: a.decision, responses: a.responses, pending: 1 } });
  }
  return json(404, { success: false, error: { code: 'NOT_FOUND' } });
};
function answer(customId, label, note = null) {
  const a = [...m.alerts.values()].reverse().find((x) => x.customId === customId);
  const opt = a.responseOptions.find((o) => o.label === label);
  a.responses.push({ label, effect: opt.effect, at: new Date().toISOString(), by: 'u1', note, attachments: [] });
  if (opt.effect === 'SHARED') a.decision = { label, effect: 'SHARED', at: new Date().toISOString(), by: 'u1' };
  return a;
}

const { app } = require('../src/server');
const db = require('../src/db');
let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await realFetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, text };
  };
}
const PW = 'correct-horse-9';
async function join(inviter, email, role, reports_to) {
  const inv = await inviter('POST', '/api/invites', { email, role, reports_to });
  const c = client();
  await c('POST', `/api/invites/${inv.body.link.split('/join/')[1]}/accept`, { name: email.split('@')[0], password: PW });
  return { c, id: (await c('GET', '/api/me')).body.user.id };
}
const hourly = () => realFetch(`${base}/tasks/hourly`, { headers: { authorization: 'Bearer test-cron' } }).then((r) => r.text());
const ago = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const callback = (wsId, customId, extra = {}) => realFetch(`${base}/api/m91/callback/${wsId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ event: 'answered', alert: { customId }, ...extra }) });

test('phone alerts: setup, every moment, answers, closing and re-arming', async () => {
  const admin = client();
  await admin('POST', '/api/auth/signup', { company: 'AlertCo', name: 'Founder', email: 'f@alert.co', password: PW, timezone: 'Asia/Kolkata' });
  const me = (await admin('GET', '/api/me')).body;
  const wsId = me.workspace.id;
  const tl = await join(admin, 'tl@alert.co', 'manager', me.user.id);
  const riya = await join(tl.c, 'riya@alert.co', 'member', tl.id);

  // Nothing rings before a link is added
  assert.match(await hourly(), /no workspace has phone alerts/);

  // Setup: bad links refused, a link with ?title= is stripped (never fetched as-is), channel name shown
  assert.equal((await admin('POST', '/api/alerts/link', { link: 'https://example.com/s/abc' })).status, 400);
  assert.match((await admin('POST', '/api/alerts/link', { link: 'https://m91-api.msg91.com/s/wrongtoken123' })).body.error, /wrong or was deleted/);
  assert.equal((await tl.c('POST', '/api/alerts/link', { link: LINK })).status, 403);
  const ok = await admin('POST', '/api/alerts/link', { link: `${LINK}?title=Should+not+ring&severity=CRITICAL` });
  assert.equal(ok.body.channel, 'Team leads');
  assert.equal(m.sent.length, 0, 'connecting raised nothing');
  // The link never comes back to a browser
  for (const url of ['/api/alerts/setup', '/api/me', '/api/integrations/status', '/api/incidents', '/api/audit']) assert.ok(!(await admin('GET', url)).text.includes(TOKEN), url);
  assert.ok(!db.prepare('SELECT m91_link FROM workspaces WHERE id = ?').get(wsId).m91_link.includes(TOKEN), 'stored encrypted');

  // Test alert: LOW, two answers, closes itself
  const t = await admin('POST', '/api/alerts/test', {});
  assert.equal(t.body.delivered, 2);
  assert.equal(m.sent[0].severity, 'LOW');
  assert.equal(m.sent[0].isAutoClose, true);
  assert.equal((await admin('POST', '/api/alerts/test', {})).status, 400, 'one test a minute');
  m.sent.length = 0;

  // ---- Moment 1: blocker on a #1 priority ----
  const it = (await riya.c('POST', '/api/items', { title: 'Gmail plug launch' })).body.id;
  const it2 = (await riya.c('POST', '/api/items', { title: 'Docs' })).body.id;
  await tl.c('POST', '/api/stacks/rank', { user_id: riya.id, order: [{ item_id: it }, { item_id: it2 }] });
  await tl.c('POST', '/api/stacks/lock', { user_id: riya.id });
  const bl = (await riya.c('POST', `/api/items/${it}/block`, { description: 'Waiting for API keys' })).body.id;
  await hourly();
  assert.equal(m.sent.filter((s) => s.customId === `blocker-${bl}`).length, 0, 'not before the threshold');
  db.prepare('UPDATE blockers SET raised_at = ? WHERE id = ?').run(ago(5), bl);
  await hourly();
  const sent = m.sent.find((s) => s.customId === `blocker-${bl}`);
  assert.ok(sent, 'raised after 4h');
  assert.equal(sent.severity, 'MEDIUM');
  assert.match(sent.title, /riya is blocked on their #1 priority \(for tl\)/);
  assert.equal(sent.callbackUrl, `https://impact.example.com/api/m91/callback/${wsId}`);
  assert.deepEqual(sent.responseOptions.map((o) => o.effect), ['SHARED', 'SHARED', 'PERSONAL']);
  const before = m.sent.length;
  await hourly();
  assert.equal(m.sent.length, before, 'a repeat raises nothing new');
  // Answer from the phone: "I'll unblock it" -> recorded on the blocker, alert stays until it is solved
  answer(`blocker-${bl}`, "I'll unblock it");
  assert.equal((await callback(wsId, `blocker-${bl}`, { response: { by: { name: 'Amit' } }, idempotencyKey: 'k1' })).status, 200);
  assert.equal(db.prepare('SELECT claimed_by FROM blockers WHERE id = ?').get(bl).claimed_by, 'Amit');
  assert.equal((await callback(wsId, `blocker-${bl}`, { idempotencyKey: 'k1' })).status, 200, 'same callback twice is fine');
  assert.ok(!m.closed.includes(`blocker-${bl}`));
  // Solving it in the app closes the alert
  await riya.c('POST', `/api/blockers/${bl}/resolve`, {});
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(m.closed.includes(`blocker-${bl}`), 'closed when solved');
  // A new blocker re-arms; "Blocked by others" from the phone protects the score and closes it
  const bl2 = (await riya.c('POST', `/api/items/${it}/block`, { description: 'Vendor outage' })).body.id;
  db.prepare('UPDATE blockers SET raised_at = ? WHERE id = ?').run(ago(6), bl2);
  await hourly();
  answer(`blocker-${bl2}`, 'Blocked by others', 'vendor is down');
  await hourly(); // read-back works without a callback too
  assert.equal(db.prepare('SELECT status FROM items WHERE id = ?').get(it).status, 'blocked_external');
  assert.ok(m.closed.includes(`blocker-${bl2}`));

  // ---- Moment 2: delivered work waiting for its rating ----
  await riya.c('POST', `/api/items/${it2}/deliver`, { proof_note: 'Published' });
  db.prepare('UPDATE items SET delivered_at = ? WHERE id = ?').run(ago(60), it2);
  await hourly();
  const rate = m.sent.find((s) => s.customId === `rate-${it2}`);
  assert.equal(rate.severity, 'LOW');
  assert.match(rate.title, /^tl: riya's work has waited 2 days/);
  answer(`rate-${it2}`, "I'll rate it today");
  await callback(wsId, `rate-${it2}`, { idempotencyKey: 'k2' });
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'alert.answered'").get());
  await tl.c('POST', `/api/items/${it2}/rate`, { quality: 'done_well' });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(m.closed.includes(`rate-${it2}`), 'closed once rated');

  // ---- Moment 3: a team without a locked week (today is past Monday afternoon in tests' weeks) ----
  const aman = await join(tl.c, 'aman@alert.co', 'member', tl.id);
  await hourly();
  const rankAlert = m.sent.find((s) => s.customId && s.customId.startsWith(`rank-${tl.id}-`));
  const isLate = !!rankAlert;
  if (isLate) {
    assert.match(rankAlert.title, /tl: 1 person on your team has no locked week/);
    const a1 = (await aman.c('POST', '/api/items', { title: 'x' })).body.id;
    await tl.c('POST', '/api/stacks/rank', { user_id: aman.id, order: [{ item_id: a1 }] });
    await tl.c('POST', '/api/stacks/lock', { user_id: aman.id });
    await new Promise((r) => setTimeout(r, 200));
    assert.ok(m.closed.includes(rankAlert.customId), 'closed once every week is locked');
  }

  // ---- Moment 4: a dispute waiting for a decision ----
  const ratingId = db.prepare('SELECT id FROM ratings WHERE item_id = ?').get(it2).id;
  const dp = (await riya.c('POST', `/api/ratings/${ratingId}/dispute`, { reason: 'Please look again' })).body.id;
  db.prepare('UPDATE disputes SET created_at = ? WHERE id = ?').run(ago(50), dp);
  await hourly();
  const dAlert = m.sent.find((s) => s.customId === `dispute-${dp}`);
  assert.match(dAlert.title, /^Founder: riya disputes a rating/);
  await admin('POST', `/api/disputes/${dp}/resolve`, { decision: 'upheld', note: 'Fair rating' });
  await new Promise((r) => setTimeout(r, 200));
  assert.ok(m.closed.includes(`dispute-${dp}`));

  // ---- An admin can switch a moment off ----
  await admin('PUT', '/api/settings', { settings: { alertMoments: { blockers: false } } });
  const bl3 = (await riya.c('POST', `/api/items/${it}/block`, { description: 'again' })).body.id;
  db.prepare("UPDATE items SET status = 'planned' WHERE id = ?").run(it);
  db.prepare('UPDATE blockers SET raised_at = ? WHERE id = ?').run(ago(9), bl3);
  await hourly();
  assert.ok(!m.sent.find((s) => s.customId === `blocker-${bl3}`), 'switched off');

  // Callback for an unknown workspace does nothing
  assert.equal((await callback('ws_nope', 'x')).status, 204);
  // Every alert ever sent had two or more answers and a customId (except the self-closing test)
  for (const s of m.sent) assert.ok(s.customId || s.isAutoClose);
});
