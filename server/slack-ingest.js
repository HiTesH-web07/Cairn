// Slack Listener Agent — Phase 1 hardened implementation.
// Receives messages from a viaSocket flow, extracts task assignments via Gemini,
// and creates draft items for human confirmation. Never auto-approves work.
const crypto = require('crypto');
const gemini = require('./gemini');

// Gemini prompt: returns confidence score and flags alongside each assignment.
const SYSTEM_PROMPT = `You are a task-extraction agent for a team performance tool.
Given a Slack message, identify any task assignments — where someone is explicitly asking another person (or people) to do something.
Return a JSON array of objects. Each object has:
  - "assignee": the name or @mention of the person assigned (string, as written in the message)
  - "title": a concise task title (max 120 chars, imperative verb — e.g. "Finish the API migration")
  - "details": any extra context from the message (string, optional, max 400 chars)
  - "confidence": a number 0.0–1.0. Use 1.0 for unambiguous explicit assignments. Use 0.5–0.7 for plausible but indirect assignments. Use below 0.5 for vague or uncertain ones.
  - "confidence_flags": an array of short strings explaining low confidence, e.g. ["vague_assignee", "suggestion_not_commitment", "assignee_unclear"]. Empty array when confident.

Only include explicit assignments. Casual suggestions, questions, and status updates are not assignments. If the message contains no task assignments, return [].
Return raw JSON only, no markdown, no explanation.`;

// Per-workspace in-memory rate limit: max 60 ingest calls per 10 minutes.
const RL_WINDOW_MS = 10 * 60 * 1000;
const RL_MAX = 60;
const rateLimitMap = new Map();

function checkRateLimit(wsId) {
  const now = Date.now();
  const window = (rateLimitMap.get(wsId) || []).filter((t) => now - t < RL_WINDOW_MS);
  if (window.length >= RL_MAX) return false;
  window.push(now);
  rateLimitMap.set(wsId, window);
  return true;
}

function create(ctx) {
  const { db, now, newId, audit } = ctx;

  function secretFor(wsId) {
    const ws = db.prepare('SELECT slack_ingest_secret FROM workspaces WHERE id = ?').get(wsId);
    if (ws && ws.slack_ingest_secret) return ws.slack_ingest_secret;
    const secret = crypto.randomBytes(32).toString('hex');
    db.prepare('UPDATE workspaces SET slack_ingest_secret = ? WHERE id = ?').run(secret, wsId);
    return secret;
  }

  function verifySecret(wsId, provided) {
    const ws = db.prepare('SELECT slack_ingest_secret FROM workspaces WHERE id = ?').get(wsId);
    if (!ws || !ws.slack_ingest_secret) return false;
    const a = Buffer.from(ws.slack_ingest_secret);
    const b = Buffer.from(provided || '');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  }

  // Channel allow-list helpers.
  function isChannelAllowed(wsId, channelId) {
    const count = db.prepare(
      'SELECT COUNT(*) AS n FROM slack_allowed_channels WHERE workspace_id = ?'
    ).get(wsId).n;
    if (count === 0) return true; // no list configured — allow all
    const row = db.prepare(
      'SELECT enabled FROM slack_allowed_channels WHERE workspace_id = ? AND channel_id = ?'
    ).get(wsId, channelId);
    return row && row.enabled === 1;
  }

  function listChannels(wsId) {
    return db.prepare(
      'SELECT channel_id, channel_name, enabled, added_at FROM slack_allowed_channels WHERE workspace_id = ? ORDER BY added_at'
    ).all(wsId);
  }

  function addChannel(wsId, channelId, channelName, addedBy) {
    db.prepare(
      'INSERT INTO slack_allowed_channels (workspace_id, channel_id, channel_name, enabled, added_by, added_at) VALUES (?,?,?,1,?,?) ON CONFLICT(workspace_id, channel_id) DO UPDATE SET channel_name=excluded.channel_name, enabled=1'
    ).run(wsId, channelId, channelName || null, addedBy || null, now());
  }

  function removeChannel(wsId, channelId) {
    db.prepare(
      'DELETE FROM slack_allowed_channels WHERE workspace_id = ? AND channel_id = ?'
    ).run(wsId, channelId);
  }

  // Team-channel mapping helpers (Phase 2).
  function getTeamChannel(wsId, channelId) {
    if (!channelId) return null;
    return db.prepare('SELECT * FROM slack_team_channels WHERE workspace_id = ? AND channel_id = ?').get(wsId, channelId);
  }

  function listTeamChannels(wsId) {
    return db.prepare('SELECT tc.*, u.name AS manager_name FROM slack_team_channels tc LEFT JOIN users u ON u.id = tc.manager_id WHERE tc.workspace_id = ? ORDER BY tc.added_at').all(wsId);
  }

  function addTeamChannel(wsId, channelId, channelName, managerId, addedBy) {
    const id = require('crypto').randomBytes(9).toString('base64url');
    db.prepare(`INSERT INTO slack_team_channels (id, workspace_id, channel_id, channel_name, manager_id, added_by, added_at)
      VALUES (?,?,?,?,?,?,?)`).run(`stc_${id}`, wsId, channelId, channelName || null, managerId, addedBy || null, now());
  }

  function removeTeamChannel(wsId, channelId) {
    db.prepare('DELETE FROM slack_team_channels WHERE workspace_id = ? AND channel_id = ?').run(wsId, channelId);
  }

  function allTeamChannelIds(wsId) {
    return db.prepare('SELECT channel_id FROM slack_team_channels WHERE workspace_id = ?').all(wsId).map(r => r.channel_id);
  }

  // Resolve an assignee name/mention to a workspace user.
  // Returns { user } on match, { user, outOfTeam: true } when found outside the team scope,
  // or { unresolved: nameAsWritten } when not found.
  function resolveAssignee(wsId, name, scopeIds) {
    if (!name) return { unresolved: name };
    const clean = name.replace(/^@/, '').trim().toLowerCase();
    const people = db.prepare('SELECT * FROM users WHERE workspace_id = ? AND active = 1').all(wsId);
    const match = (pool) => pool.find((p) => p.email.toLowerCase() === clean)
      || pool.find((p) => p.name.toLowerCase() === clean)
      || pool.find((p) => {
        const firstName = p.name.toLowerCase().split(' ')[0];
        return p.name.toLowerCase().startsWith(clean) || clean.startsWith(firstName);
      });
    if (scopeIds && scopeIds.length) {
      const scoped = people.filter(p => scopeIds.includes(p.id));
      const inTeam = match(scoped);
      if (inTeam) return { user: inTeam };
      const anywhere = match(people);
      if (anywhere) return { user: anywhere, outOfTeam: true };
    } else {
      const found = match(people);
      if (found) return { user: found };
    }
    return { unresolved: name };
  }

  async function parseAssignments(message, teamNames) {
    const text = `Team members: ${teamNames.join(', ')}\n\nSlack message:\n${message}`;
    const raw = await gemini.generate({
      system: SYSTEM_PROMPT,
      turns: [{ role: 'user', text }],
      maxTokens: 1000
    });
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    const parsed = JSON.parse(cleaned);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((a) => a && typeof a.assignee === 'string' && typeof a.title === 'string').map((a) => ({
      assignee: a.assignee,
      title: a.title,
      details: a.details || null,
      confidence: typeof a.confidence === 'number' ? Math.max(0, Math.min(1, a.confidence)) : null,
      confidence_flags: Array.isArray(a.confidence_flags) ? a.confidence_flags : []
    }));
  }

  function writeLog(fields) {
    const expires = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString();
    db.prepare(`INSERT OR IGNORE INTO slack_ingest_log
      (id, workspace_id, channel_id, channel_name, message_ts, sender_name, outcome, created_count, unresolved_json, error_text, message_text, team_manager_id, expires_at, logged_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
      .run(
        newId('sil'), fields.workspace_id, fields.channel_id || null, fields.channel_name || null,
        fields.message_ts || null, fields.sender_name || null,
        fields.outcome, fields.created_count || 0,
        fields.unresolved_json ? JSON.stringify(fields.unresolved_json) : null,
        fields.error_text || null,
        fields.message_text || null,
        fields.team_manager_id || null,
        expires, now()
      );
  }

  async function ingest({ wsId, channelId, channelName, messageTs, senderName, messageText, slack }) {
    // Rate limit per workspace.
    if (!checkRateLimit(wsId)) {
      return { ok: false, reason: 'rate_limited' };
    }

    const ws = db.prepare('SELECT * FROM workspaces WHERE id = ?').get(wsId);
    if (!ws) return { ok: false, reason: 'workspace not found' };

    // Message-level idempotency: check if this exact message was already processed.
    if (channelId && messageTs) {
      const existing = db.prepare(
        'SELECT id, outcome FROM slack_ingest_log WHERE workspace_id = ? AND channel_id = ? AND message_ts = ?'
      ).get(wsId, channelId, messageTs);
      if (existing) return { ok: true, reason: 'duplicate', outcome: existing.outcome };
    }

    // Phase 2: Team channel routing. If slack_team_channels has entries, use them.
    // Fall back to slack_allowed_channels (Phase 1 backward compat).
    let teamManagerId = null;
    let scopeIds = null;
    const teamChannelCount = db.prepare('SELECT COUNT(*) AS n FROM slack_team_channels WHERE workspace_id = ?').get(wsId).n;
    if (teamChannelCount > 0) {
      const teamChannel = channelId ? getTeamChannel(wsId, channelId) : null;
      if (!teamChannel) {
        writeLog({ workspace_id: wsId, channel_id: channelId, channel_name: channelName, message_ts: messageTs, sender_name: senderName, outcome: 'channel_blocked', message_text: null, team_manager_id: null });
        return { ok: false, reason: 'channel_not_in_any_team' };
      }
      teamManagerId = teamChannel.manager_id;
      const allUsers = db.prepare('SELECT id, reports_to FROM users WHERE workspace_id = ? AND active = 1').all(wsId);
      const kids = new Map();
      for (const u of allUsers) { if (!kids.has(u.reports_to)) kids.set(u.reports_to, []); kids.get(u.reports_to).push(u.id); }
      const subtree = [];
      const stack = [...(kids.get(teamManagerId) || [])];
      while (stack.length) { const id = stack.pop(); if (!subtree.includes(id)) { subtree.push(id); stack.push(...(kids.get(id) || [])); } }
      scopeIds = [teamManagerId, ...subtree];
    } else {
      if (channelId && !isChannelAllowed(wsId, channelId)) {
        writeLog({ workspace_id: wsId, channel_id: channelId, channel_name: channelName, message_ts: messageTs, sender_name: senderName, outcome: 'channel_blocked', message_text: null, team_manager_id: null });
        return { ok: false, reason: 'channel_not_allowed' };
      }
    }

    const people = db.prepare('SELECT * FROM users WHERE workspace_id = ? AND active = 1').all(wsId);
    const teamNames = people.map((p) => p.name);

    let assignments;
    try {
      assignments = await parseAssignments(messageText, teamNames);
    } catch (e) {
      console.error('slack-ingest: gemini parse failed', e.message);
      writeLog({ workspace_id: wsId, channel_id: channelId, channel_name: channelName, message_ts: messageTs, sender_name: senderName, outcome: 'parse_failed', error_text: e.message, message_text: messageText });
      return { ok: false, reason: 'parse failed', error: e.message };
    }

    if (!assignments.length) {
      writeLog({ workspace_id: wsId, channel_id: channelId, channel_name: channelName, message_ts: messageTs, sender_name: senderName, outcome: 'no_assignments', message_text: null });
      return { ok: true, created: 0, reason: 'no assignments found' };
    }

    const week = currentMonday();
    let created = 0;
    const unresolved = [];
    const appUrl = process.env.APP_URL || '';

    for (const a of assignments) {
      const resolved = resolveAssignee(wsId, a.assignee, scopeIds);

      if (resolved.unresolved) {
        unresolved.push({ assignee: a.assignee, title: a.title, confidence: a.confidence });
        continue;
      }

      const assignee = resolved.user;
      const id = newId('it');
      const t = now();
      const slackUrl = channelId && messageTs
        ? `https://slack.com/archives/${channelId}/p${messageTs.replace('.', '')}`
        : null;
      const flags = [...a.confidence_flags];
      if (resolved.outOfTeam) flags.push('out_of_team_resolution');

      db.prepare(`INSERT INTO items
        (id, workspace_id, user_id, week_start, title, details, kind, source, draft,
         draft_channel, draft_from, slack_message_ts, slack_message_url,
         confidence, confidence_flags, created_by, created_at, updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(id, wsId, assignee.id, week,
          String(a.title).slice(0, 200),
          a.details ? String(a.details).slice(0, 2000) : null,
          'work', 'slack', 1,
          channelName || channelId || null,
          senderName || null,
          messageTs || null,
          slackUrl,
          a.confidence,
          flags.length ? JSON.stringify(flags) : null,
          'system', t, t);

      audit(wsId, null, 'item.draft_created', 'item', id, {
        for: assignee.id, source: 'slack', channel_id: channelId, channel: channelName, confidence: a.confidence
      });
      created += 1;

      if (slack) {
        try {
          const ch = channelName || channelId;
          const channelDisplay = ch ? `#${String(ch).replace(/^#/, '')}` : 'Slack';
          const confidenceNote = a.confidence !== null && a.confidence < 0.6 ? ' (low confidence — please review carefully)' : '';
          const msg = `💡 A task was assigned to you in ${channelDisplay}${senderName ? ` by ${senderName}` : ''}${confidenceNote}: *${String(a.title).slice(0, 120)}*\nConfirm or dismiss it in your stack: ${appUrl}/week`;
          slack.enqueue(ws, 'morning', assignee.id, `draft:${id}`, msg);
        } catch (_) {}
      }
    }

    if (slack) { try { slack.flushSoon(ws); } catch (_) {} }

    writeLog({
      workspace_id: wsId, channel_id: channelId, channel_name: channelName,
      message_ts: messageTs, sender_name: senderName,
      outcome: 'processed', created_count: created,
      unresolved_json: unresolved.length ? unresolved : null,
      message_text: null, // not stored; only logged on parse failure for debugging
      team_manager_id: teamManagerId
    });

    return { ok: true, created, total: assignments.length, unresolved: unresolved.length, unresolved_names: unresolved.map((u) => u.assignee) };
  }

  function recentLogs(wsId, limit = 20) {
    return db.prepare(
      'SELECT id, channel_id, channel_name, message_ts, sender_name, outcome, created_count, unresolved_json, error_text, team_manager_id, logged_at FROM slack_ingest_log WHERE workspace_id = ? ORDER BY logged_at DESC LIMIT ?'
    ).all(wsId, limit).map((r) => ({
      ...r,
      unresolved: r.unresolved_json ? JSON.parse(r.unresolved_json) : []
    }));
  }

  return { secretFor, verifySecret, isChannelAllowed, listChannels, addChannel, removeChannel,
    getTeamChannel, listTeamChannels, addTeamChannel, removeTeamChannel, allTeamChannelIds,
    ingest, recentLogs };
}

function currentMonday() {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

module.exports = { create };
