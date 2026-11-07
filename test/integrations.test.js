// Slack messages and the Keka sync, end to end, against a stand-in for viaSocket (no real Slack or Keka is touched).
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-int-'));
process.env.CRON_SECRET = 'test-cron';
process.env.RATE_LIMIT_MAX = '1000';
process.env.APP_SECRET = 'test-app-secret-0123456789';
process.env.APP_URL = 'https://impact.example.com';
process.env.VIASOCKET_ORG_ID = '1'; process.env.VIASOCKET_PROJECT_ID = 'p'; process.env.VIASOCKET_EMBED_SECRET = 'SECRET-EMBED-VALUE-123';

const vsmod = require('../server/viasocket');
const keka = require('../server/keka');

// ---- stand-in viaSocket ----
const slackIds = { 'f@int.co': 'U0FOUNDER1', 'tl@int.co': 'U0TLTLTL01', 'riya@int.co': 'U0RIYARIYA' };
const F = { dms: [], lookups: 0, failDm: 0, conns: {}, enabled: {}, kekaCalls: [], keka: { Working: [], Relieved: [] }, kekaShape: 'array', revoked: [] };
const ACTIONS = {
  slack: [{ key: 'Get_User_Information', actionId: 'rowtstp3fqlh', versions: [{ version: 'V9' }] }, { key: 'Send_Direct_Message', actionId: 'rowovgwtt9u4', versions: [{ version: 'V3' }] }],
  keka: [{ key: 'Find_Employees', actionId: 'row3t7jeu3w8', versions: [{ version: 'V36' }] }]
};
vsmod.setClientForTests({
  user: (id) => ({
    token: async () => `embedtoken-for-${id}`,
    serviceIdFor: async (slug) => `svc_${slug}`,
    listActions: async (slug) => ({ serviceId: `svc_${slug}`, actions: ACTIONS[slug] }),
    listConnections: async () => F.conns[id] || [],
    findEnabled: async (slug) => F.enabled[`${id}:${slug}`] || null,
    enable: async (slug) => { F.enabled[`${id}:${slug}`] = `script_${slug}_SECRETSCRIPTID_${id}`; return { scriptId: F.enabled[`${id}:${slug}`] }; },
    enableFlow: async () => ({}), setFlowStatus: async () => ({}), deleteFlow: async () => ({}), revokeConnection: async (a) => { F.revoked.push(a); }
  }),
  runAction: async (scriptId, key, input, opts) => {
    if (key === 'Get_User_Information') { F.lookups += 1; const id = slackIds[input.email]; return id ? { id } : { message: 'User not found' }; }
    if (key === 'Send_Direct_Message') {
      if (F.failDm > 0) { F.failDm -= 1; throw Object.assign(new Error('slack said no at https://flow.sokt.io/func/scriSECRETSCRIPTID1234567890'), { status: 400 }); }
      F.dms.push({ scriptId, input, version: opts.version }); return { ok: true, ts: '1.2', channel: 'D1' };
    }
    if (key === 'Find_Employees') {
      F.kekaCalls.push({ input, version: opts.version });
      if (input.mode === 'specific') return F.kekaShape === 'weird' ? { hello: 1 } : [{ id: 'k0', displayName: 'Founder', email: input.search_name_email }];
      if (F.kekaShape === 'weird') return { surprise: true };
      const all = F.keka[input.filters.employmentStatus[0]];
      const slice = all.slice((input.pageNumber - 1) * input.pageSize, input.pageNumber * input.pageSize);
      return F.kekaShape === 'wrapped' ? { data: slice, totalRecords: all.length } : slice;
    }
    throw new Error(`unexpected action ${key}`);
  }
});

const { app, integ } = require('../server/server');
const db = require('../server/db');
const realFetch = global.fetch;
let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, url, body) => {
    const res = await realFetch(base + url, { method, headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await res.text(); let json; try { json = JSON.parse(text); } catch { json = text; }
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
const wait = (ms = 150) => new Promise((r) => setTimeout(r, ms));
const wsRow = (id) => db.prepare('SELECT * FROM workspaces WHERE id = ?').get(id);
const connect = async (admin, wsId, app, authId) => { F.conns[wsId] = [...(F.conns[wsId] || []), { id: authId }]; return admin('POST', '/api/viasocket/connected', { app, authId }); };

test('connecting Slack: admin only, checked with viaSocket, ids kept encrypted and never shown', async () => {
  const admin = client();
  await admin('POST', '/api/auth/signup', { company: 'IntCo', name: 'Founder', email: 'f@int.co', password: PW, timezone: 'Asia/Kolkata' });
  const me = (await admin('GET', '/api/me')).body;
  const wsId = me.workspace.id;
  const tl = await join(admin, 'tl@int.co', 'manager', me.user.id);
  assert.equal((await tl.c('GET', '/api/viasocket/token?apps=slack')).status, 403);
  assert.equal((await tl.c('POST', '/api/viasocket/connected', { app: 'slack', authId: 'x' })).status, 403);
  assert.equal((await admin('GET', '/api/viasocket/token?apps=gmail')).status, 400);
  const tok = (await admin('GET', '/api/viasocket/token?apps=slack,keka')).body;
  assert.equal(tok.token, `embedtoken-for-${wsId}`, 'the company is the viaSocket user');
  assert.deepEqual(tok.serviceIds, { slack: 'svc_slack', keka: 'svc_keka' });
  assert.deepEqual(tok.actionIds.slack.sort(), ['rowovgwtt9u4', 'rowtstp3fqlh']);
  assert.ok(!JSON.stringify(tok).includes('SECRET-EMBED-VALUE'), 'the signing secret never reaches the browser');
  // A connection viaSocket does not list for this company is refused
  assert.equal((await admin('POST', '/api/viasocket/connected', { app: 'slack', authId: 'someone-elses-auth' })).status, 400);
  assert.equal((await connect(admin, wsId, 'slack', 'auth_1_svc_slack')).status, 200);
  const st = (await admin('GET', '/api/integrations/status')).body;
  assert.equal(st.slack.connected, true);
  assert.equal(st.slack.verifiedAt, null, 'connected is not tested');
  for (const url of ['/api/integrations/status', '/api/me', '/api/audit', '/api/people']) {
    const t = (await admin('GET', url)).text;
    assert.ok(!t.includes('SECRETSCRIPTID') && !t.includes('auth_1_svc_slack') && !t.includes('SECRET-EMBED'), url);
  }
  const stored = db.prepare('SELECT * FROM vs_connections WHERE workspace_id = ?').get(wsId);
  assert.ok(!stored.script_id.includes('SECRETSCRIPTID') && !stored.auth_id.includes('auth_1'), 'stored encrypted');
  // The test sends one real DM to the person who clicked
  const t1 = await admin('POST', '/api/integrations/slack/test', {});
  assert.equal(t1.status, 200);
  assert.equal(F.dms.at(-1).input.userId, 'U0FOUNDER1');
  assert.equal(F.dms.at(-1).version, 'v3');
  assert.ok((await admin('GET', '/api/integrations/status')).body.slack.verifiedAt);
  assert.equal((await admin('POST', '/api/integrations/slack/test', {})).status, 400, 'throttled');
});

test('Slack messages: rating requests, locked weeks, schedule, once-only, toggles, retries', async () => {
  F.dms.length = 0;
  const admin = client();
  await admin('POST', '/api/auth/signup', { company: 'MsgCo', name: 'Founder', email: 'f@int.co', password: PW, timezone: 'Asia/Kolkata' });
  const me = (await admin('GET', '/api/me')).body;
  const wsId = me.workspace.id;
  const tl = await join(admin, 'tl@int.co', 'manager', me.user.id);
  const riya = await join(tl.c, 'riya@int.co', 'member', tl.id);
  const aman = await join(tl.c, 'aman@int.co', 'member', tl.id); // not in Slack
  await connect(admin, wsId, 'slack', 'auth_2_svc_slack');
  const WEEK = '2026-11-02';

  const a = (await riya.c('POST', '/api/items', { title: 'Gmail plug launch', week: WEEK })).body.id;
  const b = (await aman.c('POST', '/api/items', { title: 'Docs', week: WEEK })).body.id;
  await tl.c('POST', '/api/stacks/rank', { user_id: riya.id, week: WEEK, order: [{ item_id: a }] });
  await tl.c('POST', '/api/stacks/rank', { user_id: aman.id, week: WEEK, order: [{ item_id: b }] });
  // Lock: the member gets their #1
  await tl.c('POST', '/api/stacks/lock', { user_id: riya.id, week: WEEK });
  await tl.c('POST', '/api/stacks/lock', { user_id: aman.id, week: WEEK });
  await wait();
  const locked = F.dms.find((d) => d.input.content.includes('Your week is ready'));
  assert.equal(locked.input.userId, 'U0RIYARIYA');
  assert.match(locked.input.content, /Gmail plug launch/);
  assert.match(locked.input.content, /35%/);
  assert.equal(F.dms.filter((d) => d.input.content.includes('Docs')).length, 0, 'aman is not in Slack: skipped, no guess');
  assert.equal(db.prepare("SELECT status FROM slack_outbox WHERE key LIKE 'locked:%' AND user_id = ?").get(aman.id).status, 'skipped');
  assert.equal(locked.input.bot_details.bot_name, require('../server/brand').NAME);
  assert.equal(locked.input.isScheduledMessage, 'no');

  // Delivery: main rater (tl) and second rater (tl's manager) are asked, privately, once
  F.dms.length = 0;
  const key = { 'idempotency-key': 'd1' };
  await riya.c('POST', `/api/items/${a}/deliver`, { proof_url: 'https://github.com/x/pr/1' });
  await wait();
  const rate = F.dms.filter((d) => d.input.content.includes('delivered'));
  assert.deepEqual(rate.map((d) => d.input.userId).sort(), ['U0FOUNDER1', 'U0TLTLTL01']);
  assert.match(rate[0].input.content, /https:\/\/impact\.example\.com\/rate/);
  assert.match(rate[0].input.content, /github\.com\/x\/pr\/1/);
  await riya.c('POST', `/api/items/${a}/deliver`, { proof_url: 'https://github.com/x/pr/1' });
  await wait();
  assert.equal(F.dms.filter((d) => d.input.content.includes('delivered')).length, 2, 'delivering again sends nothing new');
  assert.equal(db.prepare("SELECT COUNT(*) c FROM slack_outbox WHERE text NOT IN ('[sent]','[not sent]')").get().c, 0, 'message text is not kept after sending');
  assert.ok(!F.dms.some((d) => d.scriptId !== `script_slack_SECRETSCRIPTID_${wsId}`), 'always the company\'s own connection');

  // On a schedule (Monday 10:30 IST): plan for managers, morning for people with a locked week; once only
  F.dms.length = 0;
  const ws = wsRow(wsId);
  const mon = new Date('2026-11-02T05:00:00Z'); // 10:30 in Kolkata
  const q1 = integ.slack.scheduled(ws, mon);
  await integ.slack.flush(ws);
  const texts = F.dms.map((d) => `${d.input.userId}: ${d.input.content}`);
  assert.ok(!texts.some((t) => t.startsWith('U0TLTLTL01') && t.includes('Plan this week')), 'both people on the TL\'s team already have a locked week');
  assert.ok(texts.some((t) => t.startsWith('U0FOUNDER1') && t.includes('Plan this week')), 'the founder has not locked the TL\'s week');
  assert.ok(!texts.some((t) => t.startsWith('U0RIYARIYA') && t.includes('Good morning')), 'riya already delivered her only priority: nothing to remind');
  assert.equal(db.prepare("SELECT status FROM slack_outbox WHERE key LIKE 'morning:%'").get().status, 'skipped', 'aman has work to deliver but is not in Slack');
  assert.equal(integ.slack.scheduled(ws, mon).queued, 0, 'the same morning is never queued twice');
  assert.equal(q1.queued, 2);
  // A person with no locked week: the manager is asked to plan
  const sam = await join(tl.c, 'sam@int.co', 'member', tl.id);
  F.dms.length = 0;
  integ.slack.scheduled(ws, new Date('2026-11-02T04:00:00Z')); // 09:30 IST
  await integ.slack.flush(ws);
  assert.ok(F.dms.some((d) => d.input.userId === 'U0TLTLTL01' && /Plan this week.*1 person on your team has no locked week/.test(d.input.content)));
  // Evening: only people with undelivered ranked work; on leave: nothing
  F.dms.length = 0;
  const b2 = (await riya.c('POST', '/api/items', { title: 'Second thing', week: WEEK })).body.id;
  await tl.c('POST', '/api/stacks/rank', { user_id: riya.id, week: WEEK, reason: 'add', order: [{ item_id: a }, { item_id: b2 }] });
  integ.slack.scheduled(ws, new Date('2026-11-03T14:00:00Z')); // Tue 19:30 IST
  await integ.slack.flush(ws);
  assert.ok(F.dms.some((d) => d.input.userId === 'U0RIYARIYA' && /Add the proof/.test(d.input.content)));
  F.dms.length = 0;
  await riya.c('POST', '/api/leave', { days: ['2026-11-04'] });
  integ.slack.scheduled(ws, new Date('2026-11-04T04:45:00Z')); // Wed morning, on leave
  await integ.slack.flush(ws);
  assert.ok(!F.dms.some((d) => d.input.userId === 'U0RIYARIYA'), 'no morning message on a leave day');
  // Weekend: nothing. Friday evening: digest to the manager, no task counts
  F.dms.length = 0;
  assert.equal(integ.slack.scheduled(ws, new Date('2026-11-07T05:00:00Z')).queued, 0);
  integ.slack.scheduled(ws, new Date('2026-11-06T13:00:00Z')); // Fri 18:30 IST
  await integ.slack.flush(ws);
  const dig = F.dms.find((d) => d.input.userId === 'U0TLTLTL01' && d.input.content.includes('Your team this week'));
  assert.ok(dig);
  assert.match(dig.input.content, /riya: /);
  assert.ok(!/tasks?\b|count/i.test(dig.input.content));
  assert.ok(!F.dms.some((d) => d.input.content.includes('Your team this week') && d.input.userId === 'U0RIYARIYA'), 'members get no team digest');

  // A message type can be switched off
  await admin('PUT', '/api/settings', { settings: { slackMessages: { rating: false } } });
  F.dms.length = 0;
  const c3 = (await aman.c('POST', '/api/items', { title: 'More', week: WEEK })).body.id;
  await tl.c('POST', '/api/stacks/rank', { user_id: aman.id, week: WEEK, reason: 'r', order: [{ item_id: b }, { item_id: c3 }] });
  await aman.c('POST', `/api/items/${b}/deliver`, { proof_note: 'done' });
  await wait();
  assert.equal(F.dms.filter((d) => d.input.content.includes('delivered')).length, 0);

  // A failing DM retries, then stops after 4 tries, and the message text is dropped
  await admin('PUT', '/api/settings', { settings: { slackMessages: { rating: true } } });
  F.dms.length = 0;
  const d1 = (await riya.c('POST', '/api/items', { title: 'Retry me', week: WEEK })).body.id;
  await tl.c('POST', '/api/stacks/rank', { user_id: riya.id, week: WEEK, reason: 'r', order: [{ item_id: a }, { item_id: b2 }, { item_id: d1 }] });
  F.failDm = 100;
  await riya.c('POST', `/api/items/${d1}/deliver`, { proof_note: 'x' });
  await wait();
  for (let i = 0; i < 5; i++) await integ.slack.flush(ws);
  const row = db.prepare("SELECT status, attempts, text, last_error FROM slack_outbox WHERE key LIKE ?").get(`rate:${d1}:${tl.id}`);
  assert.equal(row.status, 'failed');
  assert.equal(row.text, '[not sent]');
  assert.ok(!/SECRETSCRIPTID|https?:/.test(row.last_error), `scrubbed: ${row.last_error}`);
  F.failDm = 0;
  const st = (await admin('GET', '/api/integrations/status')).body.slack;
  assert.ok(st.lastError && !/SECRETSCRIPTID/.test(st.lastError));
  assert.ok(st.coverage.inSlack >= 2 && st.coverage.notFound.includes('aman'));

  // Disconnect revokes and forgets
  assert.equal((await admin('POST', '/api/integrations/slack/disconnect', {})).status, 200);
  assert.equal(F.revoked.includes('auth_2_svc_slack'), true);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM vs_connections WHERE workspace_id = ?').get(wsId).c, 0);
  F.dms.length = 0;
  await riya.c('POST', `/api/items/${b2}/deliver`, { proof_note: 'y' });
  await wait();
  assert.equal(F.dms.length, 0, 'not connected: nothing is sent');
});

test('Keka sync: only ticked fields, preview is exact, leavers need an explicit status, nothing is guessed', async () => {
  const admin = client();
  await admin('POST', '/api/auth/signup', { company: 'KekaCo', name: 'Founder', email: 'f@int.co', password: PW, timezone: 'Asia/Kolkata', allowed_domain: 'int.co' });
  const me = (await admin('GET', '/api/me')).body;
  const wsId = me.workspace.id;
  const mgr = await join(admin, 'lead@int.co', 'manager', me.user.id);
  const old = await join(mgr.c, 'old@int.co', 'member', mgr.id);
  const kid = await join(old.c === undefined ? mgr.c : mgr.c, 'kid@int.co', 'member', mgr.id);
  await connect(admin, wsId, 'keka', 'auth_k_svc_keka');
  await connect(admin, wsId, 'slack', 'auth_ks_svc_slack');
  const E = (id, name, email, mgrEmail, title, dept) => ({ id, displayName: name, email, jobTitle: { title }, reportsTo: mgrEmail ? { id: `m-${mgrEmail}`, email: mgrEmail } : undefined, groups: [{ id: 'g', title: dept, groupType: 2 }, { id: 'l', title: 'Mumbai office', groupType: 5 }], mobilePhone: '+91 98000 11111', personalEmail: 'secret@home.com', dateOfBirth: '1990-01-01' });
  F.keka.Working = [
    E('k1', 'Lead Person', 'lead@int.co', 'f@int.co', 'Team Lead', 'ISE'),
    E('k2', 'Newbie', 'new@int.co', 'lead@int.co', 'Intern', 'ISE'),
    E('k3', 'Kid', 'kid@int.co', 'lead@int.co', 'Junior', 'ISE'),
    E('k4', 'Outsider', 'x@gmail.com', 'lead@int.co', 'Intern', 'ISE')
  ];
  F.keka.Relieved = [{ id: 'k9', email: 'old@int.co' }, { id: 'k0', email: 'f@int.co' }];

  // Chosen in Settings first
  assert.equal((await admin('POST', '/api/integrations/keka/sync', { dryRun: true })).status, 400);
  await admin('PUT', '/api/settings', { settings: { peopleSource: 'keka', hrFields: { phone: false } } });
  // Test: read-only, asks for the admin only, minimal fields
  const t = await admin('POST', '/api/integrations/keka/test', {});
  assert.equal(t.body.found, 1);
  assert.deepEqual(F.kekaCalls.at(-1).input.select_response_fields, ['id', 'displayName', 'email']);
  F.kekaCalls.length = 0;

  // Preview: exact numbers, nothing saved, nothing sent
  const usersBefore = db.prepare('SELECT COUNT(*) c FROM users WHERE workspace_id = ?').get(wsId).c;
  const dryDms = F.dms.length;
  const dry = await admin('POST', '/api/integrations/keka/sync', { dryRun: true });
  assert.equal(dry.status, 200, JSON.stringify(dry.body));
  assert.equal(dry.body.created, 1);
  assert.equal(dry.body.offboarded, 1);
  assert.ok(dry.body.held.some((s) => s.includes('x@gmail.com')), 'outside the company domain');
  assert.ok(dry.body.held.some((s) => s.includes('f@int.co') && /owner/.test(s)), 'an owner is never removed by a feed');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE workspace_id = ?').get(wsId).c, usersBefore);
  assert.equal(db.prepare("SELECT active FROM users WHERE email = 'old@int.co'").get().active, 1);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM slack_outbox WHERE workspace_id = ?').get(wsId).c, 0);
  // Privacy: only the allow-list, only the ticked fields, in every call made
  const asked = F.kekaCalls.map((c) => c.input.select_response_fields);
  for (const f of asked) for (const x of f) assert.ok(keka.ALLOWED_FIELDS.includes(x), `asked for ${x}`);
  assert.ok(!asked.flat().some((x) => /personalEmail|dateOfBirth|mobilePhone|salary|bank|pay|tax/i.test(x)), 'phone was not ticked');
  assert.deepEqual(asked[0], ['id', 'employeeNumber', 'displayName', 'email', 'reportsTo.id', 'reportsTo.email', 'groups', 'jobTitle.title']);
  assert.deepEqual(F.kekaCalls[0].input.filters.employmentStatus, ['Working']);
  assert.equal(F.kekaCalls[0].version, 'v36');

  // The first run must be by hand
  const nightlyFirst = await integ.keka.nightly(wsRow(wsId), new Date('2026-11-06T22:30:00Z')); // 04:00 IST
  assert.match(nightlyFirst.skipped, /first sync by hand/);

  // Real sync
  const real = await admin('POST', '/api/integrations/keka/sync', {});
  assert.equal(real.body.ok, true);
  const people = (await admin('GET', '/api/people')).body.people;
  const by = Object.fromEntries(people.map((p) => [p.email, p]));
  assert.equal(by['new@int.co'].joined, false, 'new people start as invited');
  assert.equal(by['new@int.co'].level, 'Intern');
  assert.equal(by['new@int.co'].department, 'ISE', 'the department, not the office');
  assert.equal(by['new@int.co'].reports_to, by['lead@int.co'].id);
  assert.equal(by['new@int.co'].phone, null, 'phone was not ticked');
  assert.equal(by['lead@int.co'].level, 'Team Lead');
  assert.equal(by['lead@int.co'].role, 'manager', 'roles are never changed by Keka');
  assert.ok(!by['x@gmail.com']);
  assert.equal(by['kid@int.co'].reports_to, by['lead@int.co'].id);
  // The leaver is gone, their history stays, the owner is untouched
  assert.equal((await admin('GET', '/api/people/former')).body.people.some((p) => p.email === 'old@int.co'), true);
  assert.equal(by['f@int.co'].active, true);
  // The new person is welcomed in Slack only if Slack knows them (here it does not)
  await wait();
  assert.equal(db.prepare("SELECT status FROM slack_outbox WHERE key LIKE 'join:%'").get().status, 'skipped');
  // The audit log says it happened
  assert.ok(db.prepare("SELECT 1 FROM audit_log WHERE action = 'people.synced' AND workspace_id = ?").get(wsId));

  // Nightly now runs once a day, in the quiet hours only
  F.kekaCalls.length = 0;
  assert.match((await integ.keka.nightly(wsRow(wsId), new Date('2026-11-06T09:00:00Z'))).skipped, /quiet hours/);
  assert.match((await integ.keka.nightly(wsRow(wsId), new Date())).skipped || 'ran', /quiet hours|already synced today|ran/);

  // Safety: an empty answer, an answer in an unknown shape, a loop and a flood of leavers change nothing wrong
  const count = () => db.prepare('SELECT COUNT(*) c FROM users WHERE workspace_id = ? AND active = 1').get(wsId).c;
  const before = count();
  F.keka.Working = [];
  assert.equal((await admin('POST', '/api/integrations/keka/sync', {})).status, 400);
  F.kekaShape = 'weird';
  F.keka.Working = [E('k1', 'Lead', 'lead@int.co', null, 'Lead', 'ISE')];
  const weird = await admin('POST', '/api/integrations/keka/sync', {});
  assert.equal(weird.status, 400);
  assert.match(weird.body.error, /Nothing was changed/);
  F.kekaShape = 'wrapped';
  assert.equal(count(), before);
  // Keka says lead reports to new, and new reports to lead: the second is refused
  F.keka.Working = [E('k1', 'Lead Person', 'lead@int.co', 'new@int.co', 'Team Lead', 'ISE'), E('k2', 'Newbie', 'new@int.co', 'lead@int.co', 'Intern', 'ISE')];
  F.keka.Relieved = [];
  const loop = await admin('POST', '/api/integrations/keka/sync', {});
  assert.ok(loop.body.held.some((s) => /loop/.test(s)) || loop.body.moved <= 1);
  const ids = Object.fromEntries((await admin('GET', '/api/people')).body.people.map((p) => [p.email, p]));
  assert.ok(!(ids['lead@int.co'].reports_to === ids['new@int.co'].id && ids['new@int.co'].reports_to === ids['lead@int.co'].id), 'no loop');
  // More than 10 leavers in one run: only 10, the rest wait for a human
  const bulk = [];
  for (let i = 0; i < 12; i++) { const j = await join(admin, `p${i}@int.co`, 'member', me.user.id); bulk.push(`p${i}@int.co`); }
  F.keka.Working = [E('k1', 'Lead Person', 'lead@int.co', null, 'Team Lead', 'ISE')];
  F.keka.Relieved = bulk.map((e, i) => ({ id: `b${i}`, email: e }));
  const flood = await admin('POST', '/api/integrations/keka/sync', {});
  assert.equal(flood.body.offboarded, 10);
  assert.ok(flood.body.held.some((s) => /more than 10/.test(s)));
  // Pagination: 450 people arrive in three pages, a stuck page does not loop forever
  F.keka.Working = Array.from({ length: 450 }, (_, i) => E(`n${i}`, `Person ${i}`, `person${i}@int.co`, 'lead@int.co', 'Junior', 'ISE'));
  F.keka.Relieved = [];
  F.kekaCalls.length = 0;
  const big = await admin('POST', '/api/integrations/keka/sync', { dryRun: true });
  assert.equal(big.body.created, 450);
  assert.deepEqual(F.kekaCalls.filter((c) => c.input.filters.employmentStatus[0] === 'Working').map((c) => c.input.pageNumber), [1, 2, 3]);
  // The sync history is visible, without any id
  const status = (await admin('GET', '/api/integrations/status')).body.keka;
  assert.ok(status.runs.length >= 3 && status.requested.includes('jobTitle.title'));
  assert.ok(!JSON.stringify(status).includes('SECRETSCRIPTID'));
});

test('keka field list never includes anything outside the allow-list', () => {
  const every = keka.fieldsFor({ reportingLine: true, department: true, jobTitle: true, leave: true, phone: true });
  for (const f of every) assert.ok(keka.ALLOWED_FIELDS.includes(f));
  assert.deepEqual(keka.fieldsFor({ reportingLine: false, department: false, jobTitle: false, leave: true, phone: false }), ['id', 'employeeNumber', 'displayName', 'email']);
});
