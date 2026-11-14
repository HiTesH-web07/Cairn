// viaSocket: one connection per company (the company is the "user" viaSocket knows).
// An admin connects Slack and Keka once from the Integrations screen. The ids viaSocket gives back
// (auth_id and script_id) are credentials: stored encrypted on the server, never sent to a browser,
// never logged. Every call here goes through the viasocket-apps package.
const { ViaSocket } = require('viasocket-apps');
const { seal, open } = require('./secrets');

// Keys and versions are copied from each action's page (viasocket.com/docs/<app>/<action>.md), never typed from memory.
// connect() checks them against the live listing before anything runs.
const APPS = {
  slack: {
    name: 'Slack',
    actions: {
      lookup: { key: 'Get_User_Information', version: 'v9' },
      dm: { key: 'Send_Direct_Message', version: 'v3' },
      getChannels: { key: 'List_all_Public_Channels', version: 'v1' },
      getPrivateChannels: { key: 'List_all_Private_Channels', version: 'v1' }
    }
  },
  keka: {
    name: 'Keka',
    actions: {
      employees: { key: 'Find_Employees', version: 'v36' }
    }
  }
};

class VsError extends Error {
  constructor(code, message, status) { super(message); this.code = code; this.status = status; }
}

// Messages from viaSocket or the apps may carry links or opaque ids: never keep those.
const scrub = (msg) => String(msg || '').replace(/https?:\/\/\S+/g, '[link]').replace(/[A-Za-z0-9_-]{24,}/g, '[id]').slice(0, 300);

let injected = null; // tests put a stand-in here
let real = null;
const setClientForTests = (c) => { injected = c; };
const keysPresent = () => !!(process.env.VIASOCKET_ORG_ID && process.env.VIASOCKET_PROJECT_ID && process.env.VIASOCKET_EMBED_SECRET);
function client() {
  if (injected) return injected;
  if (!keysPresent()) throw new VsError('NOT_CONFIGURED', 'The viaSocket keys are missing on the server');
  if (!real) real = new ViaSocket({ orgId: process.env.VIASOCKET_ORG_ID, projectId: process.env.VIASOCKET_PROJECT_ID, secret: process.env.VIASOCKET_EMBED_SECRET });
  return real;
}

function create({ db, now }) {
  db.exec(`CREATE TABLE IF NOT EXISTS vs_connections (
    workspace_id TEXT NOT NULL, app TEXT NOT NULL, auth_id TEXT NOT NULL, script_id TEXT NOT NULL,
    connected_by TEXT, connected_at TEXT NOT NULL, verified_at TEXT, last_error TEXT, last_error_at TEXT, confirmed_at TEXT,
    PRIMARY KEY (workspace_id, app))`);

  const row = (wsId, app) => db.prepare('SELECT * FROM vs_connections WHERE workspace_id = ? AND app = ?').get(wsId, app);
  const connected = (wsId, app) => !!row(wsId, app);

  // Decrypted ids, for server-side calls only.
  function conn(wsId, app) {
    const r = row(wsId, app);
    if (!r) return null;
    return { ...r, authId: open(r.auth_id), scriptId: open(r.script_id) };
  }

  // What the Integrations screen may see: never the ids.
  function status(wsId, app) {
    const r = row(wsId, app);
    if (!r) return { connected: false };
    return { connected: true, connectedAt: r.connected_at, verifiedAt: r.verified_at, lastError: r.last_error, lastErrorAt: r.last_error_at, confirmedAt: r.confirmed_at };
  }

  // The browser needs a signed token for this company, and each app's service id and action ids for the consent window.
  async function tokenFor(wsId, slugs) {
    const user = client().user(wsId);
    const serviceIds = {};
    const actionIds = {};
    for (const slug of slugs) {
      const list = await user.listActions(slug);
      serviceIds[slug] = list.serviceId || await user.serviceIdFor(slug);
      const wanted = Object.values(APPS[slug].actions).map((a) => a.key);
      actionIds[slug] = list.actions.filter((a) => wanted.includes(a.key)).map((a) => a.actionId);
    }
    return { token: await user.token(), serviceIds, actionIds };
  }

  // After the Connect window says "connected": confirm with viaSocket that this company really has that connection,
  // check our pinned action versions still exist, enable the app once, and keep the ids encrypted.
  async function connect(wsId, app, authId, actorId) {
    const def = APPS[app];
    if (!def) throw new VsError('UNKNOWN_APP', 'Unknown app');
    if (typeof authId !== 'string' || !authId || authId.length > 300) throw new VsError('BAD_AUTH', 'That connection id is not valid');
    const user = client().user(wsId);
    const list = await user.listConnections();
    if (!list.some((c) => c && String(c.id) === authId)) throw new VsError('NOT_YOURS', 'viaSocket does not list that connection for your company. Try connecting again.');
    const { actions } = await user.listActions(app);
    for (const a of Object.values(def.actions)) {
      const found = actions.find((x) => x.key === a.key);
      if (!found) throw new VsError('ACTION_MISSING', `${def.name} no longer offers "${a.key}". Please tell support.`);
      if (!(found.versions || []).some((v) => String(v.version).toLowerCase() === a.version)) throw new VsError('VERSION_MISSING', `${def.name} changed "${a.key}" and ${a.version} is gone. Please tell support.`);
    }
    let scriptId = await user.findEnabled(app);
    if (scriptId) await user.enableFlow(scriptId); // found paused: resume rather than enable twice
    else scriptId = (await user.enable(app, authId)).scriptId;
    const old = row(wsId, app);
    db.prepare(`INSERT INTO vs_connections (workspace_id, app, auth_id, script_id, connected_by, connected_at) VALUES (?,?,?,?,?,?)
      ON CONFLICT (workspace_id, app) DO UPDATE SET auth_id = excluded.auth_id, script_id = excluded.script_id, connected_by = excluded.connected_by, connected_at = excluded.connected_at,
      verified_at = NULL, last_error = NULL, last_error_at = NULL`).run(wsId, app, seal(authId), seal(scriptId), actorId, now());
    return { reconnected: !!old };
  }

  // Disconnect: pause the flow first (a flow on a revoked connection fails), revoke, then delete the flow.
  async function disconnect(wsId, app) {
    const c = conn(wsId, app);
    if (!c) return { already: true };
    const user = client().user(wsId);
    try { await user.setFlowStatus(c.scriptId, 2); } catch { /* already gone */ }
    await user.revokeConnection(c.authId);
    try { await user.deleteFlow(c.scriptId); } catch { /* already gone */ }
    db.prepare('DELETE FROM vs_connections WHERE workspace_id = ? AND app = ?').run(wsId, app);
    return { ok: true };
  }

  // Run one of our pinned actions for this company. Records the last error (scrubbed) or clears it.
  async function run(wsId, app, which, input) {
    const c = conn(wsId, app);
    if (!c) throw new VsError('NOT_CONNECTED', `${APPS[app].name} is not connected`);
    const a = APPS[app].actions[which];
    try {
      const out = await client().runAction(c.scriptId, a.key, input, { version: a.version });
      db.prepare('UPDATE vs_connections SET last_error = NULL, last_error_at = NULL WHERE workspace_id = ? AND app = ?').run(wsId, app);
      return out;
    } catch (e) {
      const msg = scrub((e && e.body && e.body.errorMsg && e.body.errorMsg.message) || (e && e.message));
      db.prepare('UPDATE vs_connections SET last_error = ?, last_error_at = ? WHERE workspace_id = ? AND app = ?').run(msg, now(), wsId, app);
      throw new VsError('ACTION_FAILED', msg, e && e.status);
    }
  }

  const markVerified = (wsId, app) => db.prepare('UPDATE vs_connections SET verified_at = ?, last_error = NULL, last_error_at = NULL WHERE workspace_id = ? AND app = ?').run(now(), wsId, app);
  const confirm = (wsId, app) => db.prepare('UPDATE vs_connections SET confirmed_at = COALESCE(confirmed_at, ?) WHERE workspace_id = ? AND app = ?').run(now(), wsId, app);

  // Programmatic Slack subscription management (Phase 2).
  // Uses webhook mode: viaSocket POSTs to our ingest endpoint, we handle routing.
  async function subscribeSlack(wsId, channelIds, webhookUrl) {
    const c = conn(wsId, 'slack');
    if (!c) throw new VsError('NOT_CONNECTED', 'Slack is not connected');
    const user = client().user(wsId);
    const channelList = Array.isArray(channelIds) ? channelIds.filter(Boolean) : [];
    const inputData = channelList.length ? { channel_id: channelList } : {};
    try {
      const sub = await user.subscribe('slack', 'New_Message', {
        authId: c.authId,
        inputData,
        webhook: webhookUrl,
        meta: { cairn_workspace_id: wsId }
      });
      return sub;
    } catch (e) {
      const msg = scrub((e && e.message) || 'subscribe failed');
      throw new VsError('SUBSCRIBE_FAILED', msg, e && e.status);
    }
  }

  // create-first, delete-after: if the new subscribe call fails, old subscription is untouched.
  async function rebuildSubscription(wsId, channelIds, webhookUrl) {
    const r = db.prepare('SELECT subscription_script_id FROM vs_connections WHERE workspace_id = ? AND app = ?').get(wsId, 'slack');
    const oldScriptId = r && r.subscription_script_id;
    let sub;
    try {
      sub = await subscribeSlack(wsId, channelIds, webhookUrl);
    } catch (e) {
      db.prepare('UPDATE vs_connections SET subscription_error = ?, subscription_error_at = ? WHERE workspace_id = ? AND app = ?')
        .run(scrub(e.message), now(), wsId, 'slack');
      throw e;
    }
    db.prepare(`UPDATE vs_connections SET
      subscription_script_id = ?, subscription_channels_json = ?,
      subscription_updated_at = ?, subscription_error = NULL, subscription_error_at = NULL
      WHERE workspace_id = ? AND app = ?`)
      .run(sub.scriptId, JSON.stringify(channelIds), now(), wsId, 'slack');
    if (oldScriptId && oldScriptId !== sub.scriptId) {
      try { await client().user(wsId).setFlowStatus(oldScriptId, 0); } catch (e2) {
        console.error('viasocket: could not delete old subscription', scrub(e2.message));
      }
    }
    return sub;
  }

  return { APPS, connected, status, tokenFor, connect, disconnect, run, markVerified, confirm, subscribeSlack, rebuildSubscription };
}

module.exports = { create, APPS, VsError, scrub, setClientForTests, keysPresent };
