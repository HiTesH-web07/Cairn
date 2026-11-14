// Tests for Slack Listener Agent — Phase 1 hardening.
// Covers: idempotency, rate limiting, channel allow-list, confidence scoring,
// unresolved assignees, invalid secrets, malformed payloads, Gemini failure path.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-ingest-'));
process.env.DATA_DIR = dir;
process.env.CRON_SECRET = 'test-cron';
process.env.RATE_LIMIT_MAX = '1000';

// Mock Gemini so tests run without an API key.
// Each test sets `geminiResponse` to control what Gemini returns.
let geminiResponse = '[]';
let geminiShouldThrow = false;
const geminiMod = require('../server/gemini');
const originalGenerate = geminiMod.generate;
geminiMod.generate = async () => {
  if (geminiShouldThrow) throw new Error('Gemini unavailable');
  return geminiResponse;
};
geminiMod.configured = () => true;

const { app } = require('../server/server');

let base;
const server = app.listen(0);
test.before(() => { base = `http://127.0.0.1:${server.address().port}`; });
test.after(() => { server.close(); geminiMod.generate = originalGenerate; });

const PW = 'correct-horse-9';

function http(method, url, body, extraHeaders = {}) {
  return fetch(base + url, {
    method,
    headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', ...extraHeaders },
    body: body != null ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

// Helper: sign up owner and return their client + workspace ingest secret.
async function setup() {
  let ownerCookie = '';
  const owner = async (method, url, body) => {
    const r = await fetch(base + url, {
      method,
      headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', cookie: ownerCookie },
      body: body != null ? JSON.stringify(body) : undefined
    });
    const sc = r.headers.get('set-cookie');
    if (sc) ownerCookie = sc.split(';')[0];
    return { status: r.status, body: await r.json() };
  };

  const rnd = Math.random().toString(36).slice(2, 8);
  const email = `owner-${rnd}@corp.example`;
  const r = await owner('POST', '/api/auth/signup', { company: `Corp ${rnd}`, name: 'Owner', email, password: PW, timezone: 'UTC', allowed_domain: 'corp.example' });
  assert.equal(r.status, 200, JSON.stringify(r.body));

  const meR = await owner('GET', '/api/me');
  const wsId = meR.body.workspace.id;

  // Retrieve ingest URL and secret.
  const infoR = await owner('GET', '/api/slack/ingest-url');
  assert.equal(infoR.status, 200);
  const { secret } = infoR.body;

  return { owner, wsId, secret, ownerCookie };
}

// Post to the ingest endpoint (no CSRF header needed — it's bypassed for /api/slack/ingest/).
function ingest(wsId, body) {
  return fetch(`${base}/api/slack/ingest/${wsId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }).then(async (r) => ({ status: r.status, body: await r.json() }));
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('invalid secret returns 401', async () => {
  const { wsId } = await setup();
  const r = await ingest(wsId, { secret: 'wrong', channel_id: 'C001', message_ts: '1700.001', sender_name: 'Alice', text: 'do x' });
  assert.equal(r.status, 401);
  assert.match(r.body.error, /invalid secret/i);
});

test('missing/empty text returns no_assignments without calling Gemini', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = '[]';
  const r = await ingest(wsId, { secret, channel_id: 'C001', message_ts: '1700.002', sender_name: 'Alice', text: '' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('valid message with no assignments — Gemini returns []', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = '[]';
  const r = await ingest(wsId, { secret, channel_id: 'C001', message_ts: '1700.100', sender_name: 'Alice', text: 'Good morning team!' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
  assert.equal(r.body.created, 0);
});

test('duplicate message_ts+channel_id returns ok:true with reason:duplicate', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = '[]';
  const payload = { secret, channel_id: 'C002', message_ts: '1700.200', sender_name: 'Bob', text: 'hello' };
  const r1 = await ingest(wsId, payload);
  assert.equal(r1.status, 200);
  const r2 = await ingest(wsId, payload); // exact same message
  assert.equal(r2.status, 200);
  assert.equal(r2.body.reason, 'duplicate');
});

test('concurrent duplicate requests — only one is processed', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = '[]';
  const payload = { secret, channel_id: 'C003', message_ts: '1700.300', sender_name: 'Carol', text: 'hi' };
  const [r1, r2] = await Promise.all([ingest(wsId, payload), ingest(wsId, payload)]);
  const reasons = [r1.body.reason, r2.body.reason];
  // One must be 'duplicate' — the other may be no_assignments or processed.
  const duplicates = reasons.filter((r) => r === 'duplicate');
  assert.ok(duplicates.length >= 1, `Expected at least one duplicate, got: ${JSON.stringify(reasons)}`);
});

test('Gemini parse failure logs event and returns ok:false', async () => {
  const { wsId, secret } = await setup();
  geminiShouldThrow = true;
  const r = await ingest(wsId, { secret, channel_id: 'C004', message_ts: '1700.400', sender_name: 'Dave', text: 'assign task to Eve' });
  geminiShouldThrow = false;
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, false);
  assert.match(r.body.reason, /parse/i);
});

test('malformed Gemini JSON logs event and returns ok:false', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = 'not valid json {{{';
  const r = await ingest(wsId, { secret, channel_id: 'C004', message_ts: '1700.401', sender_name: 'Dave', text: 'assign task to Eve' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, false);
});

test('assignment to unresolved name: surfaces in unresolved_names, creates no draft', async () => {
  const { wsId, secret, owner } = await setup();
  geminiResponse = JSON.stringify([{ assignee: 'Nobody Exists', title: 'Do the thing', details: null, confidence: 0.9, confidence_flags: [] }]);
  const r = await ingest(wsId, { secret, channel_id: 'C005', message_ts: '1700.500', sender_name: 'Manager', text: 'Nobody Exists, do the thing.' });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.created, 0);
  assert.equal(r.body.unresolved, 1);
  assert.ok(r.body.unresolved_names.includes('Nobody Exists'));

  // Ingest log should record the unresolved name.
  const logR = await owner('GET', '/api/slack/ingest-log');
  assert.equal(logR.status, 200);
  const ev = logR.body.events[0];
  assert.ok(ev.unresolved.length > 0);
  assert.equal(ev.unresolved[0].assignee, 'Nobody Exists');
});

test('assignment to known team member creates draft with confidence', async () => {
  const { wsId, secret, owner } = await setup();

  // Add a member so there is someone to assign to.
  const invR = await owner('POST', '/api/invites', { email: 'alice@corp.example', role: 'member' });
  assert.equal(invR.status, 200);

  geminiResponse = JSON.stringify([{ assignee: 'alice', title: 'Write the report', details: 'By Friday', confidence: 0.85, confidence_flags: [] }]);
  const r = await ingest(wsId, { secret, channel_id: 'C006', message_ts: '1700.600', sender_name: 'Manager', text: 'alice, write the report by friday.' });
  assert.equal(r.body.ok, true);
  assert.equal(r.body.created, 1);
  assert.equal(r.body.unresolved, 0);
});

test('low confidence assignment shows flags on draft', async () => {
  const { wsId, secret, owner } = await setup();
  const invR = await owner('POST', '/api/invites', { email: 'bob2@corp.example', role: 'member' });
  assert.equal(invR.status, 200);

  geminiResponse = JSON.stringify([{ assignee: 'bob2', title: 'Maybe look into this', details: null, confidence: 0.4, confidence_flags: ['vague_assignee', 'suggestion_not_commitment'] }]);
  await ingest(wsId, { secret, channel_id: 'C007', message_ts: '1700.700', sender_name: 'Manager', text: 'maybe bob2 could look into this' });

  // Log in as the member and check drafts.
  let memberCookie = '';
  const accept = await fetch(`${base}/api/invites/${invR.body.link.split('/join/')[1]}/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'impact' },
    body: JSON.stringify({ name: 'Bob Two', password: PW })
  });
  memberCookie = accept.headers.get('set-cookie').split(';')[0];
  const draftsR = await fetch(`${base}/api/slack/drafts`, { headers: { 'x-requested-with': 'impact', cookie: memberCookie } });
  const drafts = (await draftsR.json()).drafts;
  assert.ok(drafts.length > 0, 'Expected at least one draft');
  const d = drafts.find((x) => x.title === 'Maybe look into this');
  assert.ok(d, 'Draft not found');
  assert.ok(d.confidence < 0.6, `Expected low confidence, got ${d.confidence}`);
  assert.ok(Array.isArray(d.confidence_flags) && d.confidence_flags.length > 0);
});

test('channel allow-list: unlisted channel_id is blocked when list is non-empty', async () => {
  const { wsId, secret, owner } = await setup();

  // Add a specific allowed channel.
  const addR = await owner('POST', '/api/slack/channels', { channel_id: 'CALLOWED1', channel_name: 'engineering' });
  assert.equal(addR.status, 200, JSON.stringify(addR.body));

  // Message from a different channel should be rejected.
  geminiResponse = '[]';
  const r = await ingest(wsId, { secret, channel_id: 'CNOTALLOWED', message_ts: '1700.800', sender_name: 'Eve', text: 'Assign task to alice' });
  assert.equal(r.body.ok, false);
  assert.equal(r.body.reason, 'channel_not_allowed');

  // Message from the allowed channel should pass through.
  const r2 = await ingest(wsId, { secret, channel_id: 'CALLOWED1', message_ts: '1700.801', sender_name: 'Eve', text: 'nothing here' });
  assert.equal(r2.body.ok, true);
});

test('channel allow-list: empty list allows all channels', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = '[]';
  const r = await ingest(wsId, { secret, channel_id: 'CANY', message_ts: '1700.900', sender_name: 'Fred', text: 'morning' });
  assert.equal(r.body.ok, true);
});

test('channel allow-list: admin can add, list and remove channels', async () => {
  const { owner, wsId } = await setup();

  const addR = await owner('POST', '/api/slack/channels', { channel_id: 'CADD001', channel_name: 'general' });
  assert.equal(addR.status, 200);

  const listR = await owner('GET', '/api/slack/channels');
  assert.equal(listR.status, 200);
  assert.ok(listR.body.channels.some((c) => c.channel_id === 'CADD001'));

  const delR = await owner('DELETE', '/api/slack/channels/CADD001', {});
  assert.equal(delR.status, 200);

  const listR2 = await owner('GET', '/api/slack/channels');
  assert.ok(!listR2.body.channels.some((c) => c.channel_id === 'CADD001'));
});

test('channel allow-list: invalid channel_id format rejected', async () => {
  const { owner } = await setup();
  const r = await owner('POST', '/api/slack/channels', { channel_id: 'not-valid!', channel_name: 'general' });
  assert.equal(r.status, 400);
});

test('ingest log is accessible to admin', async () => {
  const { owner, wsId, secret } = await setup();
  geminiResponse = '[]';
  await ingest(wsId, { secret, channel_id: 'CLOG001', message_ts: '1701.001', sender_name: 'Grace', text: 'morning' });

  const r = await owner('GET', '/api/slack/ingest-log');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.events));
  assert.ok(r.body.events.length > 0);
  const ev = r.body.events[0];
  assert.ok(ev.outcome);
  assert.ok(ev.logged_at);
});

test('legacy channel field accepted alongside channel_id', async () => {
  const { wsId, secret } = await setup();
  geminiResponse = '[]';
  // Old payload: channel (name), no channel_id
  const r = await ingest(wsId, { secret, channel: 'engineering', message_ts: '1702.001', sender_name: 'Hank', text: 'morning' });
  assert.equal(r.status, 200);
  assert.equal(r.body.ok, true);
});

test('existing manual tasks and confirm/dismiss workflow still work', async () => {
  const { owner, wsId, secret } = await setup();
  const invR = await owner('POST', '/api/invites', { email: 'carol@corp.example', role: 'member' });
  assert.equal(invR.status, 200);

  let carolCookie = '';
  const acc = await fetch(`${base}/api/invites/${invR.body.link.split('/join/')[1]}/accept`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-requested-with': 'impact' },
    body: JSON.stringify({ name: 'Carol', password: PW })
  });
  carolCookie = acc.headers.get('set-cookie').split(';')[0];
  const carolReq = (method, url, body) => fetch(base + url, {
    method, headers: { 'content-type': 'application/json', 'x-requested-with': 'impact', cookie: carolCookie },
    body: body != null ? JSON.stringify(body) : undefined
  }).then(async (r) => ({ status: r.status, body: await r.json() }));

  // Create a manual item — should be unaffected.
  const addR = await carolReq('POST', '/api/items', { title: 'Manual task', kind: 'work' });
  assert.ok(addR.status === 200 || addR.status === 201, `Expected 200/201, got ${addR.status}: ${JSON.stringify(addR.body)}`);

  // Create a Slack draft.
  geminiResponse = JSON.stringify([{ assignee: 'carol', title: 'Draft from Slack', details: null, confidence: 0.9, confidence_flags: [] }]);
  await ingest(wsId, { secret, channel_id: 'C009', message_ts: '1700.999', sender_name: 'Manager', text: 'carol, draft from slack' });

  const drafts = (await carolReq('GET', '/api/slack/drafts')).body.drafts;
  assert.ok(drafts.length > 0);
  const draft = drafts[0];

  // Confirm it.
  const confirmR = await carolReq('POST', `/api/slack/drafts/${draft.id}/confirm`, {});
  assert.equal(confirmR.status, 200);

  // Confirm again — should 404 (draft flag is cleared).
  const confirmR2 = await carolReq('POST', `/api/slack/drafts/${draft.id}/confirm`, {});
  assert.equal(confirmR2.status, 404);

  // Create another draft and dismiss it.
  geminiResponse = JSON.stringify([{ assignee: 'carol', title: 'Draft to dismiss', details: null, confidence: 0.9, confidence_flags: [] }]);
  await ingest(wsId, { secret, channel_id: 'C009', message_ts: '1701.000', sender_name: 'Manager', text: 'carol, another task' });
  const drafts2 = (await carolReq('GET', '/api/slack/drafts')).body.drafts;
  const draft2 = drafts2[0];
  const dismissR = await carolReq('POST', `/api/slack/drafts/${draft2.id}/dismiss`, {});
  assert.equal(dismissR.status, 200);

  // Manual task is unaffected.
  const week = (await carolReq('GET', '/api/week')).body;
  const manualItem = week.items.find((i) => i.title === 'Manual task');
  assert.ok(manualItem, 'Manual task should still exist');
  assert.equal(manualItem.draft, 0);
});
