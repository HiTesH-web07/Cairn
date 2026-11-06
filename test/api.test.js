const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'impact-'));
process.env.DATA_DIR = dir;
process.env.CRON_SECRET = 'test-cron';
const { app } = require('../src/server');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => server.close());

function client() {
  let cookie = '';
  return async (method, url, body, headers = {}) => {
    const res = await fetch(base + url, {
      method, headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', cookie, ...headers },
      body: body ? JSON.stringify(body) : undefined
    });
    const sc = res.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json, headers: res.headers };
  };
}
const PW = 'correct-horse-9';

async function join(inviter, email, role, reports_to, level, department) {
  const inv = await inviter('POST', '/api/invites', { email, role, reports_to, level, department });
  assert.equal(inv.status, 200, JSON.stringify(inv.body));
  const token = inv.body.link.split('/join/')[1];
  const c = client();
  const r = await c('POST', `/api/invites/${token}/accept`, { name: email.split('@')[0], password: PW });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const me = await c('GET', '/api/me');
  return { c, id: me.body.user.id };
}

test('full flow: hierarchy, ranking, delivery, ratings, scores, privacy', async () => {
  const founder = client();
  assert.equal((await founder('POST', '/api/auth/signup', { company: 'Acme', name: 'Founder', email: 'f@acme.com', password: PW, timezone: 'Asia/Kolkata', allowed_domain: 'acme.com' })).status, 200);
  const fid = (await founder('GET', '/api/me')).body.user.id;

  // CSRF header required
  const noHdr = await fetch(base + '/api/items', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(noHdr.status, 403);

  // Domain restriction
  assert.equal((await founder('POST', '/api/invites', { email: 'x@other.com' })).status, 400);

  // Founder -> Senior -> TL -> Member, plus a sibling member
  const senior = await join(founder, 'senior@acme.com', 'manager', fid, 'Senior', 'ISE');
  const tl = await join(senior.c, 'tl@acme.com', 'manager', senior.id, 'Lead', 'ISE');
  const riya = await join(tl.c, 'riya@acme.com', 'member', tl.id, 'Intern', 'ISE');
  const aman = await join(tl.c, 'aman@acme.com', 'member', tl.id, 'Junior', 'ISE');

  // Hierarchy loop is refused
  assert.equal((await founder('PATCH', `/api/people/${senior.id}`, { reports_to: riya.id })).status, 400);

  // Privacy: a member cannot see a sibling; a TL sees the team; senior sees two levels down
  assert.equal((await riya.c('GET', `/api/week?user=${aman.id}`)).status, 403);
  assert.equal((await tl.c('GET', `/api/week?user=${aman.id}`)).status, 200);
  assert.equal((await senior.c('GET', `/api/week?user=${riya.id}`)).status, 200);
  assert.equal((await riya.c('GET', '/api/people')).body.people.length, 1);

  // Alignment: TL has a priority; Riya links to it
  const tlItem = (await senior.c('POST', '/api/items', { user_id: tl.id, title: 'Ship HubSpot plug' })).body.id;
  await senior.c('POST', '/api/stacks/rank', { user_id: tl.id, order: [{ item_id: tlItem }] });

  // Riya proposes work; she cannot rank it herself
  const a = (await riya.c('POST', '/api/items', { title: 'Write Create Contact action', parent_item_id: tlItem })).body.id;
  const b = (await riya.c('POST', '/api/items', { title: 'Docs for the plug' })).body.id;
  const c3 = (await riya.c('POST', '/api/items', { title: 'Stretch: OAuth refresh', })).body.id;
  const extra = (await riya.c('POST', '/api/items', { title: 'Small thing 1', kind: 'unplanned' })).body.id;
  assert.equal((await riya.c('POST', '/api/stacks/rank', { user_id: riya.id, order: [{ item_id: a }] })).status, 403);
  // Aman cannot add items for Riya
  assert.equal((await aman.c('POST', '/api/items', { user_id: riya.id, title: 'x' })).status, 403);

  // TL ranks and locks
  assert.equal((await tl.c('POST', '/api/stacks/rank', { user_id: riya.id, order: [{ item_id: a }, { item_id: b }, { item_id: c3, stretch: true }] })).status, 200);
  assert.equal((await tl.c('POST', '/api/stacks/lock', { user_id: riya.id })).status, 200);
  // Locked: change needs a reason; ranked items cannot be edited by the member
  assert.equal((await tl.c('POST', '/api/stacks/rank', { user_id: riya.id, order: [{ item_id: b }] })).status, 400);
  assert.equal((await riya.c('PATCH', `/api/items/${a}`, { title: 'easier' })).status, 400);

  // Delivery needs proof, and only the owner delivers
  assert.equal((await riya.c('POST', `/api/items/${a}/deliver`, {})).status, 400);
  assert.equal((await tl.c('POST', `/api/items/${a}/deliver`, { proof_note: 'x' })).status, 403);
  assert.equal((await riya.c('POST', `/api/items/${a}/deliver`, { proof_url: 'javascript:alert(1)' })).status, 400);
  // Idempotent delivery
  const k = { 'idempotency-key': 'deliver-a-1' };
  const d1 = await riya.c('POST', `/api/items/${a}/deliver`, { proof_url: 'https://github.com/acme/pr/1' }, k);
  const d2 = await riya.c('POST', `/api/items/${a}/deliver`, { proof_url: 'https://github.com/acme/pr/1' }, k);
  assert.equal(d1.status, 200);
  assert.equal(d2.headers.get('idempotent-replay'), 'true');
  await riya.c('POST', `/api/items/${b}/deliver`, { proof_note: 'Published 2 docs' });
  await riya.c('POST', `/api/items/${extra}/deliver`, { proof_note: 'done' });

  // Pending ratings: TL is primary for both; senior is second rater for #1 and #2
  const tlPending = (await tl.c('GET', '/api/ratings/pending')).body.items.map((i) => i.id);
  assert.ok(tlPending.includes(a) && tlPending.includes(b));
  const srPending = (await senior.c('GET', '/api/ratings/pending')).body.items;
  assert.ok(srPending.find((i) => i.id === a && i.as === 'second'));
  assert.equal((await aman.c('POST', `/api/items/${a}/rate`, { quality: 'done_well' })).status, 403);
  assert.equal((await riya.c('POST', `/api/items/${a}/rate`, { quality: 'done_well' })).status, 403);
  // Needs fixes needs a note
  assert.equal((await tl.c('POST', `/api/items/${b}/rate`, { quality: 'needs_fixes' })).status, 400);

  await tl.c('POST', `/api/items/${a}/rate`, { quality: 'done_well' });
  let wk = (await riya.c('GET', '/api/week')).body;
  assert.equal(wk.pending, 2, 'rank 1 waits for the second rater, rank 2 for any rating');
  await senior.c('POST', `/api/items/${a}/rate`, { quality: 'done_well' });
  await tl.c('POST', `/api/items/${b}/rate`, { quality: 'needs_fixes', note: 'Add screenshots' });
  await senior.c('POST', `/api/items/${b}/rate`, { quality: 'done_well' });
  wk = (await riya.c('GET', '/api/week')).body;
  // possible 60 (stretch missed excluded), earned 35 + 25*0.75 = 53.75 -> 90
  assert.equal(wk.pending, 0);
  assert.equal(wk.score, 90);
  assert.equal(wk.alignment, Math.round((35 / 80) * 100));
  assert.equal(JSON.stringify(wk).includes('taskCount'), false);

  // Dispute goes to the rater's manager (senior), not the rater
  const ratingId = wk.items.find((i) => i.id === b).ratings.find((r) => r.quality === 'needs_fixes').id;
  assert.equal((await aman.c('POST', `/api/ratings/${ratingId}/dispute`, { reason: 'x' })).status, 403);
  const dp = (await riya.c('POST', `/api/ratings/${ratingId}/dispute`, { reason: 'Screenshots were in the doc' })).body.id;
  assert.equal((await tl.c('POST', `/api/disputes/${dp}/resolve`, { decision: 'changed', new_quality: 'done_well', note: 'ok' })).status, 403);
  assert.equal((await senior.c('POST', `/api/disputes/${dp}/resolve`, { decision: 'changed', new_quality: 'done_well', note: 'Checked, they were there' })).status, 200);
  wk = (await riya.c('GET', '/api/week')).body;
  assert.equal(wk.score, 100);

  // Coins: no self, cap per person, weekly budget
  assert.equal((await riya.c('POST', '/api/coins', { to_id: riya.id, coins: 1, reason: 'me' })).status, 400);
  assert.equal((await aman.c('POST', '/api/coins', { to_id: riya.id, coins: 4, reason: 'helped me' })).status, 400);
  assert.equal((await aman.c('POST', '/api/coins', { to_id: riya.id, coins: 3, reason: 'helped me debug' })).status, 201);
  assert.equal((await aman.c('POST', '/api/coins', { to_id: riya.id, coins: 1, reason: 'again' })).status, 400);
  const card = (await tl.c('GET', `/api/scorecard?user=${riya.id}`)).body;
  assert.equal(card.current.coins, 3);
  assert.equal(card.trend.length, 5);

  // Team view and rater spread
  const team = (await senior.c('GET', '/api/team')).body;
  assert.ok(team.people.find((p) => p.id === riya.id).score === 100);
  assert.ok(team.raters.length >= 1);
  assert.equal((await riya.c('GET', '/api/team')).body.people.length, 0);

  // Leave reduces the expectation for Aman
  const am1 = (await aman.c('POST', '/api/items', { title: 'One thing' })).body.id;
  const am2 = (await aman.c('POST', '/api/items', { title: 'Other thing' })).body.id;
  await tl.c('POST', '/api/stacks/rank', { user_id: aman.id, order: [{ item_id: am1 }, { item_id: am2 }] });
  await aman.c('POST', `/api/items/${am1}/deliver`, { proof_note: 'done' });
  await tl.c('POST', `/api/items/${am1}/rate`, { quality: 'done_well' });
  await senior.c('POST', `/api/items/${am1}/rate`, { quality: 'done_well' });
  const before = (await aman.c('GET', '/api/week')).body.score;
  const wkStart = (await aman.c('GET', '/api/me')).body.week;
  const H = require('../src/server').helpers;
  await aman.c('POST', '/api/leave', { days: [H.addDays(wkStart, 0), H.addDays(wkStart, 1)] });
  const after = (await aman.c('GET', '/api/week')).body.score;
  assert.ok(after > before, `${after} > ${before}`);

  // Workspace isolation
  const other = client();
  await other('POST', '/api/auth/signup', { company: 'Other', name: 'O', email: 'o@other.com', password: PW });
  assert.equal((await other('GET', `/api/week?user=${riya.id}`)).status, 403);
  assert.equal((await other('POST', `/api/items/${a}/rate`, { quality: 'done_well' })).status, 404);
  assert.equal((await other('GET', '/api/people')).body.people.length, 1);

  // Audit is append-only
  const db = require('../src/db');
  assert.throws(() => db.prepare('DELETE FROM audit_log').run(), /append-only/);
  assert.ok((await founder('GET', '/api/audit')).body.entries.length > 10);

  // Scheduled job needs the secret
  assert.equal((await fetch(base + '/tasks/hourly')).status, 401);
  const job = await fetch(base + '/tasks/hourly', { headers: { authorization: 'Bearer test-cron' } });
  assert.equal(job.status, 200);

  // Login and logout
  const again = client();
  assert.equal((await again('POST', '/api/auth/login', { email: 'riya@acme.com', password: 'wrong-password' })).status, 401);
  assert.equal((await again('POST', '/api/auth/login', { email: 'riya@acme.com', password: PW })).status, 200);
  assert.equal((await again('GET', '/api/me')).status, 200);
  await again('POST', '/api/auth/logout');
  assert.equal((await again('GET', '/api/me')).status, 401);
});

test('people import from a CSV, with dry run, validation, hierarchy and leave', async () => {
  const admin = client();
  await admin('POST', '/api/auth/signup', { company: 'CsvCo', name: 'Boss', email: 'boss@csv.co', password: PW, allowed_domain: 'csv.co' });
  const rows = [
    { email: 'head@csv.co', name: 'Head', role: 'manager', level: 'Senior', department: 'ISE', manager_email: 'boss@csv.co' },
    { email: 'tl@csv.co', name: 'TL', role: 'TL', level: 'Lead', department: 'ISE', manager_email: 'head@csv.co', phone: '+91 98765 43210' },
    { email: 'intern@csv.co', name: 'Intern', level: 'Intern', department: 'ISE', manager_email: 'tl@csv.co' }
  ];
  // Errors are reported per line and nothing is saved
  const badRun = await admin('POST', '/api/people/import', { rows: [...rows, { email: 'x@other.com', name: 'X' }, { email: 'y@csv.co', name: 'Y', manager_email: 'ghost@csv.co' }] });
  assert.equal(badRun.body.ok, false);
  assert.deepEqual(badRun.body.errors.map((e) => e.line), [5, 6]);
  assert.equal((await admin('GET', '/api/people')).body.people.length, 1);
  // Loop detection
  const loop = await admin('POST', '/api/people/import', { rows: [{ email: 'a@csv.co', name: 'A', manager_email: 'b@csv.co' }, { email: 'b@csv.co', name: 'B', manager_email: 'a@csv.co' }] });
  assert.ok(loop.body.errors.some((e) => e.errors.some((m) => /loop/.test(m))));
  // Dry run then real import
  const dry = await admin('POST', '/api/people/import', { rows, dryRun: true });
  assert.equal(dry.body.ok, true);
  assert.equal(dry.body.new, 3);
  assert.equal((await admin('GET', '/api/people')).body.people.length, 1);
  const done = await admin('POST', '/api/people/import', { rows });
  assert.equal(done.body.links.length, 3);
  const people = (await admin('GET', '/api/people')).body.people;
  const byEmail = Object.fromEntries(people.map((p) => [p.email, p]));
  assert.equal(byEmail['intern@csv.co'].reports_to, byEmail['tl@csv.co'].id);
  assert.equal(byEmail['tl@csv.co'].role, 'manager');
  assert.equal(byEmail['tl@csv.co'].phone, '919876543210');
  assert.equal(byEmail['intern@csv.co'].joined, false);
  // Not joined yet: cannot sign in; invite link lets them set a password, keeping the reporting line
  const intern = client();
  assert.equal((await intern('POST', '/api/auth/login', { email: 'intern@csv.co', password: PW })).status, 401);
  const token = done.body.links.find((l) => l.email === 'intern@csv.co').link.split('/join/')[1];
  assert.equal((await intern('POST', `/api/invites/${token}/accept`, { name: 'Intern R', password: PW })).status, 200);
  const me = (await intern('GET', '/api/me')).body.user;
  assert.equal(me.reports_to, byEmail['tl@csv.co'].id);
  // Re-import updates instead of duplicating
  const again = await admin('POST', '/api/people/import', { rows: [{ email: 'intern@csv.co', level: 'Junior', manager_email: 'tl@csv.co' }] });
  assert.equal(again.body.updated, 1);
  assert.equal((await admin('GET', '/api/people')).body.people.length, 4);
  // Members cannot import
  assert.equal((await intern('POST', '/api/people/import', { rows })).status, 403);
  // Leave import
  const lv = await admin('POST', '/api/leave/import', { rows: [{ email: 'intern@csv.co', date: '2026-11-10' }, { email: 'nobody@csv.co', date: '2026-11-10' }] });
  assert.equal(lv.body.ok, false);
  assert.equal((await admin('POST', '/api/leave/import', { rows: [{ email: 'intern@csv.co', date: '2026-11-10' }] })).body.imported, 1);
  // Source setting: only known fields, never salary
  assert.equal((await admin('PUT', '/api/settings', { settings: { peopleSource: 'keka', hrFields: { salary: true } } })).status, 400);
  assert.equal((await admin('PUT', '/api/settings', { settings: { peopleSource: 'csv', hrFields: { leave: false } } })).status, 200);
});
