// Integrations screen: connect Slack and Keka through viaSocket, test them for real, and see their true status.
// Admin only. Nothing is reported as working until a real call has succeeded.
const viasocket = require('./viasocket');
const slackMod = require('./slack');
const kekaMod = require('./keka');

function init(ctx) {
  const { app, auth, adminOnly, wrap, bad, db, now, audit, settingsOf, getWs } = ctx;
  const vs = viasocket.create({ db, now });
  const slack = slackMod.create({ ...ctx, vs });
  const keka = kekaMod.create({ ...ctx, vs, slack });

  const friendly = (e) => {
    if (e instanceof viasocket.VsError) {
      if (e.code === 'NOT_CONFIGURED') return 'viaSocket is not set up on the server yet.';
      return e.message;
    }
    return null;
  };
  const guard = (fn) => async (req, res, next) => {
    try { const out = await fn(req, res); if (out !== undefined) res.json(out); } catch (e) {
      const m = friendly(e);
      if (m) return next(bad(m));
      next(e);
    }
  };
  const knownApp = (a) => (viasocket.APPS[a] ? a : null);

  // The Connect window needs a signed token for this company, and the apps' service and action ids.
  app.get('/api/viasocket/token', auth, adminOnly, guard(async (req) => {
    const slugs = String(req.query.apps || '').split(',').filter(Boolean).filter(knownApp);
    if (!slugs.length) throw bad('Choose slack or keka');
    return vs.tokenFor(req.ws.id, slugs);
  }));

  // The Connect window said "connected": check with viaSocket, enable once, keep the ids encrypted.
  app.post('/api/viasocket/connected', auth, adminOnly, guard(async (req) => {
    const a = knownApp(req.body && req.body.app);
    if (!a) throw bad('Choose slack or keka');
    const r = await vs.connect(req.ws.id, a, req.body.authId, req.user.id);
    audit(req.ws.id, req.user.id, 'integration.connected', 'integration', a, { reconnected: r.reconnected });
    return { ok: true };
  }));

  app.post('/api/integrations/:app/disconnect', auth, adminOnly, guard(async (req) => {
    const a = knownApp(req.params.app);
    if (!a) throw bad('Unknown app');
    await vs.disconnect(req.ws.id, a);
    audit(req.ws.id, req.user.id, 'integration.disconnected', 'integration', a, null);
    return { ok: true };
  }));

  // A real test to the person who clicked: look themselves up in Slack, then send themselves one DM.
  const lastTest = new Map();
  const throttle = (key) => { if (Date.now() - (lastTest.get(key) || 0) < 20e3) throw bad('Wait a few seconds between tests'); lastTest.set(key, Date.now()); };

  app.post('/api/integrations/slack/test', auth, adminOnly, guard(async (req) => {
    throttle(`slack:${req.ws.id}`);
    if (!vs.connected(req.ws.id, 'slack')) throw bad('Connect Slack first');
    db.prepare('UPDATE users SET slack_id = NULL, slack_checked_at = NULL WHERE id = ?').run(req.user.id);
    const sid = await slack.slackIdFor(req.ws, getUser(req));
    if (!sid) throw bad(`Slack has nobody with your work email (${req.user.email}), so the test cannot reach you. Use the same email in Slack as here.`);
    await slack.dm(req.ws, sid, `Test from ${require('./brand').NAME}: Slack messages work. Nothing needs doing.`);
    vs.markVerified(req.ws.id, 'slack');
    audit(req.ws.id, req.user.id, 'integration.tested', 'integration', 'slack', null);
    return { ok: true, message: 'Sent you a direct message in Slack. Check that it arrived.' };
  }));
  const getUser = (req) => db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  app.post('/api/integrations/slack/match', auth, adminOnly, guard(async (req) => {
    if (!vs.connected(req.ws.id, 'slack')) throw bad('Connect Slack first');
    return { ok: true, ...(await slack.matchPeople(req.ws)) };
  }));

  // A read-only test: ask Keka for the person who clicked.
  app.post('/api/integrations/keka/test', auth, adminOnly, guard(async (req) => {
    throttle(`keka:${req.ws.id}`);
    if (!vs.connected(req.ws.id, 'keka')) throw bad('Connect Keka first');
    const out = await vs.run(req.ws.id, 'keka', 'employees', { mode: 'specific', find_by: 'name_email', search_name_email: req.user.email, select_response_fields: ['id', 'displayName', 'email'] });
    let found = null;
    try { found = kekaMod.employeesFrom(out).length; } catch { /* Keka answered, in a shape we do not read yet */ }
    vs.markVerified(req.ws.id, 'keka');
    audit(req.ws.id, req.user.id, 'integration.tested', 'integration', 'keka', { found });
    return { ok: true, found };
  }));

  app.post('/api/integrations/keka/sync', auth, adminOnly, guard(async (req) => {
    const r = await keka.sync(req.ws, { dryRun: !!(req.body && req.body.dryRun), trigger: 'manual', actorId: req.user.id });
    if (r.skipped) throw bad(r.skipped);
    if (!r.ok) throw bad(r.error);
    return r;
  }));

  app.get('/api/integrations/status', auth, adminOnly, wrap((req) => {
    const s = settingsOf(req.ws);
    return {
      viasocket: { keysPresent: viasocket.keysPresent() },
      ai: { keyPresent: !!process.env.GEMINI_API_KEY, on: s.aiHelper !== false },
      mail: { configured: require('./mail').configured(), from: process.env.MAIL_FROM ? String(process.env.MAIL_FROM).replace(/^.*<|>.*$/g, '') : null },
      slack: { ...vs.status(req.ws.id, 'slack'), ...(vs.connected(req.ws.id, 'slack') ? { coverage: slack.coverage(req.ws), recent: slack.recent(req.ws) } : {}), messages: s.slackMessages },
      keka: { ...vs.status(req.ws.id, 'keka'), chosen: s.peopleSource === 'keka', fields: s.hrFields, requested: kekaMod.fieldsFor(s.hrFields), runs: keka.lastRuns(req.ws) },
      m91: { configured: !!req.ws.m91_link, channel: req.ws.m91_channel || null }
    };
  }));

  // Hourly: scheduled Slack messages, the outbox, and the nightly Keka sync. Failures never stop the others.
  async function hourly(date = new Date()) {
    const out = [];
    for (const ws of db.prepare('SELECT * FROM workspaces').all()) {
      try {
        if (vs.connected(ws.id, 'slack')) {
          const q = slack.scheduled(ws, date);
          const f = await slack.flush(ws);
          out.push(`slack ${q.queued} queued, ${f.sent} sent${f.failed ? `, ${f.failed} failed` : ''}`);
        }
        if (vs.connected(ws.id, 'keka')) {
          const k = await keka.nightly(getWs(ws.id), date);
          out.push(k.skipped ? `keka ${k.skipped}` : k.ok ? `keka +${k.created} ~${k.updated} moved ${k.moved} left ${k.offboarded}` : `keka failed`);
        }
      } catch (e) { out.push(`error ${e.code || 'unknown'}`); }
    }
    slack.purge();
    return out;
  }

  return { vs, slack, keka, hourly };
}

module.exports = { init };
