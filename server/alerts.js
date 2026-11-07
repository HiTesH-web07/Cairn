// The moments where a person must act but may not be looking at the app.
// Each one: raised by the hourly sweep, answered from the phone, closed when its condition clears.
//
// 1. A #1/#2 priority has been blocked for hours -> the manager: I'll unblock it · Blocked by others · Seen
// 2. Delivered work has waited 2 days for its rating -> the rater: I'll rate it today · Seen
// 3. A manager's team has no locked week by Monday afternoon -> the manager: I'll rank today · Seen
// 4. A dispute has waited 2 days for a decision -> the decider: I'll decide today · Seen
const m91 = require('./m91');

const MOMENTS = {
  blockers: 'Someone is blocked on a #1 or #2 priority',
  unrated: 'Delivered work has waited 2 days for a rating',
  unranked: 'A team has no locked week by Monday afternoon',
  disputes: 'A disputed rating has waited 2 days for a decision'
};
const DAY = 864e5;

function init(ctx) {
  const { db, now, audit, userIn, currentWeek, localDate, settingsOf } = ctx;
  const appUrl = () => process.env.APP_URL || (process.env.APP_NAME ? `https://${process.env.APP_NAME}.embarko.app` : null);

  // ALTERs are idempotent: ignore "duplicate column".
  for (const sql of [
    'ALTER TABLE workspaces ADD COLUMN m91_link TEXT',
    'ALTER TABLE workspaces ADD COLUMN m91_channel TEXT',
    'ALTER TABLE incidents ADD COLUMN entity_id TEXT',
    'ALTER TABLE incidents ADD COLUMN decision_label TEXT',
    'ALTER TABLE incidents ADD COLUMN answered_by TEXT',
    'ALTER TABLE incidents ADD COLUMN answer_note TEXT',
    'ALTER TABLE incidents ADD COLUMN delivered INTEGER',
    'ALTER TABLE blockers ADD COLUMN claimed_by TEXT'
  ]) { try { db.exec(sql); } catch { /* exists */ } }
  db.exec('CREATE TABLE IF NOT EXISTS m91_callbacks (key TEXT PRIMARY KEY, at TEXT NOT NULL)');

  const linkOf = (ws) => (ws.m91_link ? m91.open(ws.m91_link) : null);
  const enabled = (ws, moment) => ((settingsOf(ws).alertMoments || {})[moment] !== false);
  const hoursAgo = (iso) => Math.round((Date.now() - Date.parse(iso)) / 3600e3);
  const short = (t, n = 120) => (t.length > n ? `${t.slice(0, n - 1)}…` : t);

  // ---------- conditions: what is true right now ----------
  function conditions(ws) {
    const s = settingsOf(ws);
    const out = [];
    const url = appUrl();
    if (enabled(ws, 'blockers')) {
      const rows = db.prepare(`SELECT b.*, i.title, i.rank, i.user_id AS owner_id FROM blockers b JOIN items i ON i.id = b.item_id JOIN users u ON u.id = b.user_id
        WHERE b.workspace_id = ? AND b.resolved_at IS NULL AND u.active = 1 AND i.status != 'delivered' AND i.rank IS NOT NULL AND i.rank <= 2 AND b.raised_at <= ?`)
        .all(ws.id, new Date(Date.now() - s.blockerEscalationHours * 3600e3).toISOString());
      for (const b of rows) {
        const owner = userIn(ws.id, b.owner_id);
        const mgr = owner.reports_to ? userIn(ws.id, owner.reports_to) : null;
        out.push({
          customId: `blocker-${b.id}`, kind: 'blocker', entityId: b.id, ownerId: mgr ? mgr.id : null, severity: 'MEDIUM',
          title: `${owner.name} is blocked on their #${b.rank} priority${mgr ? ` (for ${mgr.name})` : ''}`,
          description: short(`"${b.title}" has been blocked for ${hoursAgo(b.raised_at)}h: ${b.description}`, 1500) + (url ? `\nOpen: ${url}/week?user=${owner.id}` : ''),
          responseOptions: [
            { label: "I'll unblock it", effect: 'SHARED' },
            { label: 'Blocked by others', effect: 'SHARED', optional: ['note'] },
            { label: 'Seen', effect: 'PERSONAL' }
          ]
        });
      }
    }
    if (enabled(ws, 'unrated')) {
      const items = db.prepare(`SELECT i.* FROM items i JOIN users u ON u.id = i.user_id WHERE i.workspace_id = ? AND i.status = 'delivered' AND u.active = 1
        AND i.delivered_at <= ? AND NOT EXISTS (SELECT 1 FROM ratings r WHERE r.item_id = i.id AND r.rater_role = 'primary')`).all(ws.id, new Date(Date.now() - 2 * DAY).toISOString());
      for (const it of items) {
        const owner = userIn(ws.id, it.user_id);
        const rater = owner.reports_to ? userIn(ws.id, owner.reports_to) : null;
        if (!rater || !rater.active) continue;
        out.push({
          customId: `rate-${it.id}`, kind: 'rating', entityId: it.id, ownerId: rater.id, severity: 'LOW',
          title: `${rater.name}: ${owner.name}'s work has waited ${Math.floor(hoursAgo(it.delivered_at) / 24)} days for your rating`,
          description: short(`"${it.title}"${it.rank ? ` (ranked #${it.rank})` : ''}. Their score cannot count it until it is rated.`, 1500) + (url ? `\nRate it: ${url}/rate` : ''),
          responseOptions: [{ label: "I'll rate it today", effect: 'SHARED' }, { label: 'Seen', effect: 'PERSONAL' }]
        });
      }
    }
    if (enabled(ws, 'unranked')) {
      const week = currentWeek(ws);
      const today = localDate(ws.timezone);
      const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: ws.timezone, hour: '2-digit', hour12: false }).format(new Date()));
      const late = today > week || hour >= 14; // Monday 14:00 local or later
      if (late) {
        const rows = db.prepare(`SELECT u.reports_to AS mgr, COUNT(*) n FROM users u WHERE u.workspace_id = ? AND u.active = 1 AND u.pw_hash IS NOT NULL AND u.reports_to IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM stacks s WHERE s.workspace_id = u.workspace_id AND s.user_id = u.id AND s.week_start = ? AND s.locked_at IS NOT NULL)
          GROUP BY u.reports_to`).all(ws.id, week);
        for (const r of rows) {
          const mgr = userIn(ws.id, r.mgr);
          if (!mgr || !mgr.active) continue;
          out.push({
            customId: `rank-${mgr.id}-${week}`, kind: 'ranking', entityId: mgr.id, ownerId: mgr.id, severity: 'LOW',
            title: `${mgr.name}: ${r.n} ${r.n === 1 ? 'person on your team has' : 'people on your team have'} no locked week yet`,
            description: 'Until you rank and lock their top priorities, their work this week cannot be scored.' + (url ? `\nRank: ${url}/team` : ''),
            responseOptions: [{ label: "I'll rank today", effect: 'SHARED' }, { label: 'Seen', effect: 'PERSONAL' }]
          });
        }
      }
    }
    if (enabled(ws, 'disputes')) {
      const rows = db.prepare(`SELECT d.*, r.rater_id, i.title, i.user_id AS owner_id FROM disputes d JOIN ratings r ON r.id = d.rating_id JOIN items i ON i.id = r.item_id
        WHERE d.workspace_id = ? AND d.status = 'open' AND d.created_at <= ?`).all(ws.id, new Date(Date.now() - 2 * DAY).toISOString());
      for (const d of rows) {
        const rater = userIn(ws.id, d.rater_id);
        const decider = rater && rater.reports_to ? userIn(ws.id, rater.reports_to) : null;
        const owner = userIn(ws.id, d.owner_id);
        out.push({
          customId: `dispute-${d.id}`, kind: 'dispute', entityId: d.id, ownerId: decider ? decider.id : null, severity: 'LOW',
          title: `${decider ? `${decider.name}: ` : ''}${owner.name} disputes a rating and is waiting for your decision`,
          description: short(`"${d.title}": "${d.reason}"`, 1500) + (url ? `\nDecide: ${url}/disputes` : ''),
          responseOptions: [{ label: "I'll decide today", effect: 'SHARED' }, { label: 'Seen', effect: 'PERSONAL' }]
        });
      }
    }
    return out;
  }

  // ---------- answers: every one changes something in the app ----------
  // nameHint: the responder's name from a callback (display only; the decision itself is always read back from M91).
  function apply(ws, inc, alert, nameHint) {
    const d = alert && alert.decision;
    if (!d || inc.decision_label) return false; // no SHARED answer yet, or already applied
    const resp = (alert.responses || []).find((r) => r.label === d.label && r.effect === 'SHARED') || {};
    const by = String(nameHint || resp.name || (d.by && d.by.name) || 'someone in the alert channel').slice(0, 120);
    db.transaction(() => {
      db.prepare('UPDATE incidents SET decision_label = ?, answered_by = ?, answer_note = ?, acknowledged_at = ?, status = ? WHERE id = ?')
        .run(d.label, by, resp.note || null, d.at || now(), 'answered', inc.id);
      if (inc.kind === 'blocker') {
        const bl = db.prepare('SELECT * FROM blockers WHERE id = ?').get(inc.entity_id);
        if (bl && !bl.resolved_at) {
          if (d.label === 'Blocked by others') {
            db.prepare('UPDATE blockers SET resolved_at = ?, claimed_by = ? WHERE id = ?').run(now(), by, bl.id);
            db.prepare("UPDATE items SET status = 'blocked_external', updated_at = ? WHERE id = ? AND status != 'delivered'").run(now(), bl.item_id);
          } else db.prepare('UPDATE blockers SET claimed_by = ? WHERE id = ?').run(by, bl.id);
        }
      }
      audit(ws.id, null, 'alert.answered', 'incident', inc.id, { kind: inc.kind, answer: d.label, by, note: resp.note || null });
    })();
    return true;
  }

  // ---------- the sweep: raise what is new, read back answers, close what cleared ----------
  async function sweep(ws, { raise = true } = {}) {
    const link = linkOf(ws);
    if (!link) return { skipped: 'no link' };
    const report = { raised: 0, closed: 0, answered: 0, errors: [] };
    const live = raise ? conditions(ws) : null;
    const liveIds = live ? new Set(live.map((c) => c.customId)) : null;
    // 'dismissed' = closed in M91 without a button: treated as "Seen", never re-rung while the same problem lasts.
    const open = db.prepare("SELECT * FROM incidents WHERE workspace_id = ? AND status IN ('open','answered','dismissed')").all(ws.id);
    for (const inc of open) {
      try {
        const stillTrue = liveIds ? liveIds.has(inc.custom_id) : isStillTrue(ws, inc);
        if (!stillTrue) {
          await m91.close(link, inc.custom_id);
          db.prepare("UPDATE incidents SET status = 'closed', closed_at = ? WHERE id = ?").run(now(), inc.id);
          report.closed += 1;
          continue;
        }
        if (!inc.decision_label && inc.status !== 'dismissed') {
          const a = await m91.read(link, inc.custom_id);
          if (apply(ws, inc, a)) report.answered += 1;
          else if (a.status === 'RESOLVED') {
            db.prepare("UPDATE incidents SET status = 'dismissed', acknowledged_at = COALESCE(acknowledged_at, ?) WHERE id = ?").run(a.resolvedAt || now(), inc.id);
            audit(ws.id, null, 'alert.dismissed', 'incident', inc.id, { kind: inc.kind });
          }
          if (inc.kind === 'blocker' && a.decision && a.decision.label === 'Blocked by others') {
            await m91.close(link, inc.custom_id);
            db.prepare("UPDATE incidents SET status = 'closed', closed_at = ? WHERE id = ?").run(now(), inc.id);
            report.closed += 1;
          }
        }
      } catch (e) { report.errors.push(`${inc.kind}: ${e.code || e.message}`); }
    }
    if (live) {
      const known = new Set(db.prepare("SELECT custom_id FROM incidents WHERE workspace_id = ? AND status IN ('open','answered','dismissed')").all(ws.id).map((r) => r.custom_id));
      for (const c of live) {
        if (known.has(c.customId)) continue;
        try {
          const cb = appUrl() && appUrl().startsWith('https://') ? `${appUrl()}/api/m91/callback/${ws.id}` : undefined;
          const r = await m91.send(link, { title: c.title, description: c.description, severity: c.severity, customId: c.customId, responseOptions: c.responseOptions, ...(cb ? { callbackUrl: cb } : {}) });
          db.prepare(`INSERT INTO incidents (id, workspace_id, custom_id, kind, severity, title, owner_id, status, provider_alert_id, raised_at, entity_id, delivered)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT (workspace_id, custom_id) DO UPDATE SET status = 'open', raised_at = excluded.raised_at, closed_at = NULL,
            decision_label = NULL, answered_by = NULL, answer_note = NULL, acknowledged_at = NULL, delivered = excluded.delivered, title = excluded.title`)
            .run(`in_${r._id}`, ws.id, c.customId, c.kind, c.severity, c.title, c.ownerId, 'open', r._id, now(), c.entityId, r.delivered || 0);
          audit(ws.id, null, 'alert.raised', 'incident', c.customId, { kind: c.kind, delivered: r.delivered || 0 });
          report.raised += 1;
        } catch (e) { report.errors.push(`${c.kind}: ${e.code || e.message}`); }
      }
    }
    return report;
  }

  // Cheap check used after a write, to close alerts whose condition just cleared.
  function isStillTrue(ws, inc) {
    if (inc.kind === 'blocker') {
      const b = db.prepare('SELECT b.resolved_at, i.status, u.active FROM blockers b JOIN items i ON i.id = b.item_id JOIN users u ON u.id = b.user_id WHERE b.id = ?').get(inc.entity_id);
      return !!(b && !b.resolved_at && b.status !== 'delivered' && b.active);
    }
    if (inc.kind === 'rating') return !db.prepare("SELECT 1 FROM ratings WHERE item_id = ? AND rater_role = 'primary'").get(inc.entity_id) && !!db.prepare("SELECT 1 FROM items WHERE id = ? AND status = 'delivered'").get(inc.entity_id);
    if (inc.kind === 'dispute') return !!db.prepare("SELECT 1 FROM disputes WHERE id = ? AND status = 'open'").get(inc.entity_id);
    if (inc.kind === 'ranking') return conditions(ws).some((c) => c.customId === inc.custom_id);
    return true;
  }

  return { MOMENTS, conditions, sweep, apply, linkOf };
}

module.exports = { init, MOMENTS };
