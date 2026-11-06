// Slack direct messages, sent through the company's viaSocket connection.
// Every message is private (a DM to the person it is about) and goes through an outbox, so a retry or a
// repeated event never sends twice, and a Slack outage never breaks the app.
//
//   plan     a manager has people with no locked week            (first working day, morning)
//   locked   a manager locked someone's week                     (as it happens)
//   rating   someone delivered work and a rater is needed        (as it happens)
//   morning  today's #1 for people with a locked week            (working days, 10:00 local)
//   evening  a reminder to add proof for undelivered priorities  (working days, 19:00 local)
//   digest   how each direct report's week went                  (last working day, evening)
const { VsError, scrub } = require('./viasocket');

const SLACK_ID_RE = /^[UW][A-Z0-9]{6,}$/;
const BOT_NAME = 'Proof of Impact';
const DAY = 864e5;

// Slack user ids only ever come from a lookup by exact work email, and must look like a Slack id.
function slackIdFrom(out) {
  const cands = [out && out.id, out && out.user && out.user.id, out && out.data && out.data.id, out && out.data && out.data.user && out.data.user.id,
    Array.isArray(out && out.members) && out.members[0] && out.members[0].id];
  return cands.find((c) => typeof c === 'string' && SLACK_ID_RE.test(c)) || null;
}

function create(ctx) {
  const { db, now, newId, audit, userIn, settingsOf, currentWeek, addDays, dow, mondayOf, localDate, computeWeek, ancestors, vs, appUrl } = ctx;

  for (const sql of ['ALTER TABLE users ADD COLUMN slack_id TEXT', 'ALTER TABLE users ADD COLUMN slack_checked_at TEXT']) { try { db.exec(sql); } catch { /* exists */ } }
  db.exec(`CREATE TABLE IF NOT EXISTS slack_outbox (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, kind TEXT NOT NULL, key TEXT NOT NULL, text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, sent_at TEXT, last_error TEXT,
    UNIQUE (workspace_id, key))`);

  const base = () => appUrl() || '';
  const first = (u) => String(u.name || '').split(' ')[0] || 'there';
  const short = (t, n) => (String(t).length > n ? `${String(t).slice(0, n - 1)}…` : String(t));

  // ---------- who is who in Slack ----------
  async function slackIdFor(ws, u) {
    if (u.slack_id) return u.slack_id;
    if (u.slack_checked_at && Date.now() - Date.parse(u.slack_checked_at) < DAY) return null; // not found recently
    const out = await vs.run(ws.id, 'slack', 'lookup', { search_by: 'email_search', email: u.email, response_fields: ['id'] });
    const id = slackIdFrom(out);
    if (!id && !/not found/i.test(JSON.stringify(out || ''))) throw new VsError('UNREADABLE', 'Could not read the Slack user id from Slack\'s answer');
    db.prepare('UPDATE users SET slack_id = ?, slack_checked_at = ? WHERE id = ?').run(id, now(), u.id);
    return id;
  }

  async function dm(ws, slackId, text) {
    const out = await vs.run(ws.id, 'slack', 'dm', {
      userId: slackId, content: text, isScheduledMessage: 'no', bot_details: { bot_name: BOT_NAME, customIcon: false }
    });
    if (out && out.ok === false) throw new VsError('SLACK_REFUSED', scrub(out.error || out.message || 'Slack did not accept the message'));
    return out;
  }

  // ---------- the outbox ----------
  function enqueue(ws, kind, userId, key, text) {
    if (!vs.connected(ws.id, 'slack')) return false;
    if (settingsOf(ws).slackMessages[kind] === false) return false;
    const r = db.prepare('INSERT OR IGNORE INTO slack_outbox (id, workspace_id, user_id, kind, key, text, created_at) VALUES (?,?,?,?,?,?,?)').run(newId('sm'), ws.id, userId, kind, key, text, now());
    return r.changes > 0;
  }

  async function flush(ws, max = 40) {
    if (!vs.connected(ws.id, 'slack')) return { sent: 0, skipped: 0, failed: 0 };
    const rows = db.prepare("SELECT * FROM slack_outbox WHERE workspace_id = ? AND status = 'pending' AND attempts < 4 ORDER BY created_at LIMIT ?").all(ws.id, max);
    const out = { sent: 0, skipped: 0, failed: 0 };
    let strikes = 0;
    const done = (r, status, err) => db.prepare('UPDATE slack_outbox SET status = ?, text = ?, sent_at = ?, last_error = ? WHERE id = ?')
      .run(status, status === 'sent' ? '[sent]' : '[not sent]', now(), err || null, r.id); // the text may hold a private link: do not keep it
    for (const r of rows) {
      const u = userIn(ws.id, r.user_id);
      if (!u || !u.active) { done(r, 'skipped', 'person is no longer active'); out.skipped += 1; continue; }
      try {
        const sid = await slackIdFor(ws, u);
        if (!sid) { done(r, 'skipped', 'not found in Slack by work email'); out.skipped += 1; continue; }
        await dm(ws, sid, r.text);
        done(r, 'sent');
        out.sent += 1;
        strikes = 0;
      } catch (e) {
        const attempts = r.attempts + 1;
        if (attempts >= 4) { done(r, 'failed', scrub(e.message)); out.failed += 1; } else db.prepare('UPDATE slack_outbox SET attempts = ?, last_error = ? WHERE id = ?').run(attempts, scrub(e.message), r.id);
        strikes += 1;
        if (strikes >= 3) break; // something is wrong with the connection: stop, try again next hour
      }
    }
    return out;
  }
  const flushSoon = (ws) => setImmediate(() => { flush(ctx.getWs(ws.id)).catch(() => {}); });

  // ---------- as it happens ----------
  function onDelivered(ws, itemId) {
    try {
      if (!vs.connected(ws.id, 'slack')) return;
      const it = db.prepare('SELECT * FROM items WHERE workspace_id = ? AND id = ?').get(ws.id, itemId);
      if (!it || it.status !== 'delivered') return;
      const owner = userIn(ws.id, it.user_id);
      const s = settingsOf(ws);
      const raters = new Map();
      if (owner.reports_to) raters.set(owner.reports_to, 'main');
      if (it.rank && it.rank <= s.secondRaterRanks) {
        const sec = it.second_rater_id || (ancestors(owner)[1] && ancestors(owner)[1].id);
        if (sec && sec !== owner.id && !raters.has(sec)) raters.set(sec, 'second');
      }
      const proof = it.proof_url || short(it.proof_note || '', 200);
      for (const [rid, role] of raters) {
        const r = userIn(ws.id, rid);
        if (!r || !r.active) continue;
        enqueue(ws, 'rating', rid, `rate:${it.id}:${rid}`,
          `*${owner.name}* delivered "${short(it.title, 120)}"${it.rank ? ` (ranked #${it.rank})` : ''}.\nProof: ${proof}\nYou are the ${role} rater. Rate it: ${base()}/#/rate`);
      }
      flushSoon(ws);
    } catch (e) { console.error('slack onDelivered failed', e.code || e.message); }
  }

  function onLocked(ws, userId, week) {
    try {
      if (!vs.connected(ws.id, 'slack')) return;
      const u = userIn(ws.id, userId);
      const top = db.prepare('SELECT title, rank FROM items WHERE workspace_id = ? AND user_id = ? AND week_start = ? AND rank = 1').get(ws.id, userId, week);
      if (!u || !u.active || !top) return;
      const w = ctx.settingsOf(ws).rankWeights[0];
      enqueue(ws, 'locked', userId, `locked:${userId}:${week}`, `Your week is ready, ${first(u)}. Your #1: *${short(top.title, 140)}* (${w}% of your score).\n${base()}/#/week`);
      flushSoon(ws);
    } catch (e) { console.error('slack onLocked failed', e.code || e.message); }
  }

  // ---------- on a schedule (called by the hourly job; keys make every message once-only) ----------
  const parts = (tz, d) => ({ date: localDate(tz, d), hour: Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hour12: false }).format(d)) % 24 });
  const order = [1, 2, 3, 4, 5, 6, 0];

  function scheduled(ws, date = new Date()) {
    if (!vs.connected(ws.id, 'slack')) return { queued: 0 };
    const s = settingsOf(ws);
    const { date: today, hour } = parts(ws.timezone, date);
    const week = mondayOf(today);
    const days = order.filter((d) => s.workingDays.includes(d)).map((d) => (d === 0 ? addDays(week, 6) : addDays(week, d - 1)));
    if (!days.includes(today)) return { queued: 0 }; // not a working day
    const firstDay = days[0];
    const lastDay = days[days.length - 1];
    let queued = 0;
    const q = (...a) => { if (enqueue(ws, ...a)) queued += 1; };
    const people = db.prepare('SELECT * FROM users WHERE workspace_id = ? AND active = 1 AND pw_hash IS NOT NULL').all(ws.id);
    const onLeave = (id) => !!db.prepare('SELECT 1 FROM leave_days WHERE workspace_id = ? AND user_id = ? AND day = ?').get(ws.id, id, today);
    const lockedWeek = (id) => !!db.prepare('SELECT 1 FROM stacks WHERE workspace_id = ? AND user_id = ? AND week_start = ? AND locked_at IS NOT NULL').get(ws.id, id, week);
    const open = (id) => db.prepare("SELECT title, rank FROM items WHERE workspace_id = ? AND user_id = ? AND week_start = ? AND rank IS NOT NULL AND status IN ('planned','in_progress') ORDER BY rank").all(ws.id, id, week);

    if (today === firstDay && hour >= 9 && hour < 15) {
      for (const m of people) {
        const reports = people.filter((p) => p.reports_to === m.id);
        const waiting = reports.filter((p) => !lockedWeek(p.id)).length;
        if (waiting) q('plan', m.id, `plan:${m.id}:${week}`, `*Plan this week*, ${first(m)}: ${waiting === 1 ? '1 person on your team has' : `${waiting} people on your team have`} no locked week yet. Rank their top priorities: ${base()}/#/team`);
      }
    }
    if (hour >= 10 && hour < 12) {
      for (const u of people) {
        if (onLeave(u.id) || !lockedWeek(u.id)) continue;
        const items = open(u.id);
        if (items.length) q('morning', u.id, `morning:${u.id}:${today}`, `Good morning ${first(u)}. Your #${items[0].rank} to deliver: *${short(items[0].title, 140)}*.\n${base()}/#/week`);
      }
    }
    if (hour >= 19 && hour < 21) {
      for (const u of people) {
        if (onLeave(u.id) || !lockedWeek(u.id) || !open(u.id).length) continue;
        q('evening', u.id, `evening:${u.id}:${today}`, `Anything delivered today, ${first(u)}? Add the proof so it can be rated: ${base()}/#/week`);
      }
    }
    if (today === lastDay && hour >= 18 && hour < 21) {
      for (const m of people) {
        const reports = people.filter((p) => p.reports_to === m.id);
        if (!reports.length) continue;
        const lines = reports.slice(0, 25).map((p) => {
          const c = computeWeek(ws, s, p.id, week);
          return `• ${p.name}: ${c.score === null ? 'no score yet' : c.score}${c.pending ? ` (${c.pending} waiting for a rating)` : ''}`;
        });
        q('digest', m.id, `digest:${m.id}:${week}`, `*Your team this week*, ${first(m)}:\n${lines.join('\n')}\nDetails: ${base()}/#/team`);
      }
    }
    return { queued };
  }

  // ---------- for the Integrations screen ----------
  async function matchPeople(ws, max = 60) {
    const people = db.prepare('SELECT * FROM users WHERE workspace_id = ? AND active = 1 AND pw_hash IS NOT NULL AND slack_id IS NULL').all(ws.id).slice(0, max);
    let found = 0;
    for (const u of people) { try { if (await slackIdFor(ws, u)) found += 1; } catch { break; } }
    return coverage(ws, found);
  }
  function coverage(ws, justFound) {
    const all = db.prepare('SELECT id, name, slack_id, slack_checked_at FROM users WHERE workspace_id = ? AND active = 1 AND pw_hash IS NOT NULL').all(ws.id);
    return { people: all.length, inSlack: all.filter((u) => u.slack_id).length, notFound: all.filter((u) => !u.slack_id && u.slack_checked_at).map((u) => u.name), notChecked: all.filter((u) => !u.slack_id && !u.slack_checked_at).length, justFound };
  }
  function recent(ws) {
    return db.prepare("SELECT kind, status, created_at, sent_at, last_error FROM slack_outbox WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 15").all(ws.id);
  }
  function purge() { db.prepare('DELETE FROM slack_outbox WHERE created_at < ?').run(new Date(Date.now() - 30 * DAY).toISOString()); }

  return { enqueue, flush, flushSoon, onDelivered, onLocked, scheduled, slackIdFor, dm, matchPeople, coverage, recent, purge, slackIdFrom };
}

module.exports = { create, slackIdFrom };
