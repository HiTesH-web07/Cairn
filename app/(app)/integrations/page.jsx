'use client';
// Integrations: Slack, Keka, Ask Cairn, email and phone alerts. Nothing shows as working until a real test succeeds.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useApp } from '@/components/AppState';
import { useScreen, ScreenStatus } from '@/components/AppShell';
import { Head } from '@/components/ui';
import { api, fmtTime } from '@/lib/client';

// The connect window comes from viaSocket's script, loaded once on demand.
function loadConnectScript() {
  return new Promise((resolve, reject) => {
    if (window.openViasocketConnection) return resolve();
    const el = document.createElement('script');
    el.src = 'https://flow.viasocket.com/connect.js';
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load the connect window. Check your network and try again.'));
    document.head.appendChild(el);
  });
}

const MSGS = [['plan', 'Monday: managers with people who have no locked week'], ['locked', "When a manager locks someone's week: that person gets their #1"], ['rating', 'When work is delivered: the raters are asked to rate it'],
  ['morning', "Weekday mornings (10:00): today's top item, only for people with a locked week and work left"], ['evening', 'Weekday evenings (19:00): a reminder to add proof, only if work is left'], ['digest', "Last working day, evening: each manager gets their team's scores"]];
const FIELD_WORDS = { 'reportsTo.id': 'manager', 'reportsTo.email': null, groups: 'department', 'jobTitle.title': 'job title', mobilePhone: 'mobile number', employeeNumber: 'employee number', displayName: 'name', email: 'work email', id: null };

const Pill = ({ c }) => (!c.connected ? <span className="pill warn">Not connected</span> : c.verifiedAt ? <span className="pill good">Working</span> : <span className="pill warn">Connected, not tested yet</span>);

export default function IntegrationsPage() {
  const { me, setMe, loadMe, toast, run } = useApp();
  const { data: s, error, reload } = useScreen(() => api('GET', '/api/integrations/status'));
  const [out, setOut] = useState({ sl: '', ke: '', ai: '', mail: '' });
  const [kePreview, setKePreview] = useState(null); // lines of a dry run, shown with "Nothing was saved."
  const [connect, setConnect] = useState({ ready: false, error: null });
  const cs = useRef({ token: null, serviceIds: {}, actionIds: {}, current: null });
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const say = (k, t) => setOut((o) => ({ ...o, [k]: t }));

  // The popup must open straight from the click, so the token is fetched when the screen opens.
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        Object.assign(cs.current, await api('GET', '/api/viasocket/token?apps=slack,keka'));
        await loadConnectScript();
        if (live) setConnect({ ready: true, error: null });
      } catch (e) { if (live) setConnect({ ready: false, error: e.message }); }
    })();
    const onMessage = async (event) => {
      const d = event.data;
      const app = cs.current.current;
      if (!d || !app || typeof d.type !== 'string') return;
      if (d.serviceId && d.serviceId !== cs.current.serviceIds[app]) return; // another app's message
      if (d.type === 'viasocket_connection_success' && d.data && d.data.id) {
        cs.current.current = null;
        try { await api('POST', '/api/viasocket/connected', { app, authId: d.data.id }); toast(`${app === 'slack' ? 'Slack' : 'Keka'} connected. Now run the test.`); } catch (e) { toast(e.message); }
        reloadRef.current();
      } else if (d.type === 'viasocket_connection_error') {
        cs.current.current = null;
        toast((d.error && d.error.message) || 'The connection did not finish');
      } // 'viasocket_connection_closed' is not a failure: a success may still follow
    };
    window.addEventListener('message', onMessage);
    return () => { live = false; window.removeEventListener('message', onMessage); };
  }, [toast]);

  if (!s) return <ScreenStatus error={error} />;
  const sl = s.slack, ke = s.keka;
  const asked = [...new Set(ke.requested.map((f) => FIELD_WORDS[f]).filter(Boolean))];

  const openConnect = (app) => { // straight from the click: the popup would be blocked after an await
    cs.current.current = app;
    try { window.openViasocketConnection(cs.current.token, cs.current.serviceIds[app], { filteredActions: cs.current.actionIds[app], skipActionSelection: true }); } catch { cs.current.current = null; toast('Could not open the connect window'); }
  };
  const ConnectBtn = ({ app, label, primary }) => <button className={primary ? 'primary' : 'ghost'} disabled={!connect.ready} onClick={() => openConnect(app)}>{label}</button>;
  const disconnect = (e, app) => run(e, async () => { if (confirm(`Disconnect ${app === 'slack' ? 'Slack' : 'Keka'}? Messages and syncing stop.`)) { await api('POST', `/api/integrations/${app}/disconnect`, {}); reload(); } });

  const saveMessages = (form) => run(null, async () => {
    const slackMessages = Object.fromEntries([...form.querySelectorAll('[data-msg]')].map((x) => [x.dataset.msg, x.checked]));
    await api('PUT', '/api/settings', { settings: { slackMessages } });
    await loadMe();
    toast('Saved');
  });
  const toggleAi = async (e) => {
    const box = e.currentTarget, on = box.checked;
    try { await api('PUT', '/api/settings', { settings: { aiHelper: on } }); setMe(await api('GET', '/api/me')); say('ai', on ? 'Ask Cairn is on.' : 'Ask Cairn is off.'); } catch (err) { say('ai', err.message); box.checked = !on; }
  };
  const sync = async (dryRun) => {
    setKePreview(null);
    say('ke', dryRun ? 'Checking what would change…' : 'Syncing…');
    try {
      const r = await api('POST', '/api/integrations/keka/sync', { dryRun });
      const lines = [`${dryRun ? 'Would change' : 'Changed'}: ${r.created} new · ${r.updated} updated · ${r.moved} moved · ${r.offboarded} left.`, ...r.samples, ...r.held.map((h) => `Left alone: ${h}`)];
      if (dryRun) { say('ke', ''); setKePreview(lines); } else { toast('Sync finished'); say('ke', lines.join(' · ')); setTimeout(() => reloadRef.current(), 2500); }
    } catch (e) { say('ke', e.message); }
  };
  const runRow = (r) => (
    <tr key={r.id || r.started_at}>
      <td className="small">{fmtTime(r.started_at)}<div className="muted">{r.trigger}{r.dry_run ? ' · preview' : ''}</div></td>
      <td>{r.status === 'ok' ? <span className="pill good">ok</span> : r.status === 'failed' ? <span className="pill bad">failed</span> : <span className="pill">running</span>}</td>
      <td className="small">{r.summary ? `${r.summary.created} new · ${r.summary.updated} updated · ${r.summary.moved} moved · ${r.summary.offboarded} left` : r.error || ''}</td>
    </tr>
  );

  return (
    <>
      <Head eyebrow="Manage" title="Integrations" sub="Nothing here is shown as working until a real test has succeeded." />
      {!s.viasocket.keysPresent && <div className="notice warn">The viaSocket keys are missing on the server, so connecting is switched off.</div>}
      <p className="err" id="connectErr">{connect.error || ''}</p>

      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Slack</h2><Pill c={sl} /></div>
        <p>Sends private direct messages to the people each message is about: planning, ratings, reminders and the weekly team summary. Nothing is posted in channels.</p>
        {sl.lastError && <div className="notice warn">Last problem: {sl.lastError}</div>}
        <div className="row">
          {sl.connected ? (
            <>
              <button className="primary" onClick={(e) => run(e, async () => { say('sl', 'Sending…'); try { const r = await api('POST', '/api/integrations/slack/test', {}); say('sl', r.message); setTimeout(() => reloadRef.current(), 1500); } catch (x) { say('sl', x.message); } })}>Send myself a test message</button>
              <button onClick={(e) => run(e, async () => { say('sl', 'Checking…'); try { await api('POST', '/api/integrations/slack/match', {}); reload(); } catch (x) { say('sl', x.message); } })}>Check who is on Slack</button>
              <ConnectBtn app="slack" label="Reconnect" />
              <button className="ghost danger" onClick={(e) => disconnect(e, 'slack')}>Disconnect</button>
            </>
          ) : <ConnectBtn app="slack" label="Connect Slack" primary />}
        </div>
        <p className="small" id="slOut">{out.sl}</p>
        {sl.connected && sl.coverage && (
          <p className="small">{sl.coverage.inSlack} of {sl.coverage.people} people found in Slack by work email{sl.coverage.notChecked ? ` · ${sl.coverage.notChecked} not checked yet` : ''}.{sl.coverage.notFound.length ? ` Not found: ${sl.coverage.notFound.join(', ')}. They need the same email in Slack as here.` : ''}</p>
        )}
        <h3 style={{ marginTop: 'var(--space-200)' }}>Messages</h3>
        <div onChange={(e) => { if (e.target.closest('[data-msg]')) saveMessages(e.currentTarget); }}>
          {MSGS.map(([k, t]) => (
            <label key={k} style={{ margin: 'var(--space-50) 0', color: 'var(--text)' }}><input type="checkbox" data-msg={k} defaultChecked={!!sl.messages[k]} style={{ width: 'auto' }} /> {t}</label>
          ))}
        </div>
        {sl.recent && sl.recent.length > 0 && (
          <>
            <h3 style={{ marginTop: 'var(--space-200)' }}>Recent</h3>
            <div className="tablewrap"><table><tbody>
              {sl.recent.map((m, k) => <tr key={k}><td className="small">{fmtTime(m.created_at)}</td><td>{m.kind}</td><td><span className={`pill ${m.status === 'sent' ? 'good' : m.status === 'pending' ? '' : 'warn'}`}>{m.status}</span></td><td className="small muted">{m.last_error || ''}</td></tr>)}
            </tbody></table></div>
          </>
        )}
        {sl.connected && <SlackListenerSection />}
      </div>

      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Keka</h2><Pill c={ke} /></div>
        <p>Optional. Keeps people, managers, departments and job titles in step with Keka. Leavers are only removed when Keka marks them as relieved.</p>
        <p className="small">Keka is only asked for: <b>{asked.join(', ')}</b>. Never salary, payroll, bank, tax, documents, personal email, birth date or attendance. Change what is shared in <Link href="/settings">Settings</Link>.</p>
        {ke.lastError && <div className="notice warn">Last problem: {ke.lastError}</div>}
        {ke.connected && !ke.chosen && <div className="notice">This company gets people from somewhere else. To use Keka, choose <b>Keka sync</b> in <Link href="/settings">Settings → People &amp; leave source</Link>.</div>}
        <div className="row">
          {ke.connected ? (
            <>
              <button className="primary" onClick={(e) => run(e, async () => { say('ke', 'Asking Keka…'); setKePreview(null); try { const r = await api('POST', '/api/integrations/keka/test', {}); say('ke', r.found === null ? 'Keka answered.' : r.found ? 'Keka answered and found you.' : 'Keka answered but has nobody with your email.'); setTimeout(() => reloadRef.current(), 1500); } catch (x) { say('ke', x.message); } })}>Test (read-only)</button>
              {ke.chosen && (
                <>
                  <button onClick={(e) => run(e, () => sync(true))}>Preview sync</button>
                  <button onClick={(e) => run(e, async () => { if (confirm('Apply Keka\'s people to this workspace now? Use "Preview sync" first to see what changes.')) await sync(false); })}>Sync now</button>
                </>
              )}
              <ConnectBtn app="keka" label="Reconnect" />
              <button className="ghost danger" onClick={(e) => disconnect(e, 'keka')}>Disconnect</button>
            </>
          ) : <ConnectBtn app="keka" label="Connect Keka" primary />}
        </div>
        <p className="small" id="keOut">
          {kePreview ? <>{kePreview.map((l, k) => <span key={k}>{l}<br /></span>)}<b>Nothing was saved.</b></> : out.ke}
        </p>
        <p className="small muted">Leave days from Keka are not available yet. Import them as a CSV under People.{ke.confirmedAt ? ' The sync runs by itself every night.' : ke.chosen ? ' It runs by itself every night once you have run it by hand once.' : ''}</p>
        {ke.runs.length > 0 && (
          <>
            <h3 style={{ marginTop: 'var(--space-200)' }}>Recent syncs</h3>
            <div className="tablewrap"><table><tbody>{ke.runs.map(runRow)}</tbody></table></div>
          </>
        )}
      </div>

      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Ask Cairn (AI helper)</h2><span className={`pill ${s.ai.keyPresent && s.ai.on ? 'good' : 'warn'}`}>{!s.ai.keyPresent ? 'Not set up' : s.ai.on ? 'On' : 'Off'}</span></div>
        <p className="small">A chat box that explains a person&apos;s score, week and team in plain words, using only what that person can already see. It <b>never scores or rates anyone</b>, changes nothing, and what people ask is not stored.</p>
        {s.ai.keyPresent ? (
          <>
            <label style={{ margin: 'var(--space-75) 0', color: 'var(--text)' }}><input type="checkbox" id="aiToggle" defaultChecked={!!s.ai.on} onChange={toggleAi} style={{ width: 'auto' }} /> Let people in <b>{me.workspace.name}</b> use Ask Cairn</label>
            <p className="small" id="aiOut">{out.ai}</p>
          </>
        ) : <div className="notice warn">Not set up yet. The person who runs this server adds <code>GEMINI_API_KEY</code> in the app settings on Embarko.</div>}
      </div>

      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Email</h2><span className={`pill ${s.mail.configured ? 'good' : 'warn'}`}>{s.mail.configured ? 'Set up' : 'Not set up'}</span></div>
        <p className="small">Sends password reset links to people&apos;s inboxes{s.mail.from ? <>, from <b>{s.mail.from}</b></> : ''}. This is a setting of the whole server, so it works for every workspace.</p>
        {s.mail.configured ? (
          <>
            <div className="row"><button className="primary" onClick={(e) => run(e, async () => { say('mail', 'Sending…'); try { const r = await api('POST', '/api/mail/test', {}); say('mail', `Sent to ${r.to}. Check the inbox, and spam too.`); } catch (x) { say('mail', x.message); } })}>Send myself a test email</button></div>
            <p className="small" id="mailOut">{out.mail}</p>
          </>
        ) : <div className="notice warn">Not set up yet. The person who runs this server adds <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>MAIL_FROM</code> in the app settings on Embarko. Until then reset links go to Slack when Slack is connected.</div>}
      </div>

      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Phone alerts (M91)</h2><span className={`pill ${s.m91.configured ? 'good' : 'warn'}`}>{s.m91.configured ? 'Connected' : 'Not set up'}</span></div>
        <p className="small">{s.m91.configured ? <>Rings &quot;{s.m91.channel}&quot; for serious problems. Test it in <Link href="/settings">Settings</Link>.</> : <>Add your channel link in <Link href="/settings">Settings</Link>.</>}</p>
      </div>
    </>
  );
}

const OUTCOME_LABEL = { processed: 'Processed', duplicate: 'Duplicate', no_assignments: 'No tasks', parse_failed: 'AI error', channel_blocked: 'Channel blocked', rate_limited: 'Rate limited' };
const OUTCOME_PILL = { processed: 'good', duplicate: '', no_assignments: '', parse_failed: 'warn', channel_blocked: 'warn', rate_limited: 'warn' };

function SlackListenerSection() {
  const { toast } = useApp();
  const [info, setInfo] = useState(null);
  const [channels, setChannels] = useState([]);
  const [log, setLog] = useState([]);
  const [copied, setCopied] = useState('');
  const [newCid, setNewCid] = useState('');
  const [newCname, setNewCname] = useState('');
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    api('GET', '/api/slack/ingest-url').then(setInfo).catch(() => {});
    api('GET', '/api/slack/channels').then((r) => setChannels(r.channels)).catch(() => {});
    api('GET', '/api/slack/ingest-log').then((r) => setLog(r.events)).catch(() => {});
  };
  useEffect(() => { refresh(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!info) return null;
  const copy = (val, key) => { navigator.clipboard.writeText(val).then(() => { setCopied(key); setTimeout(() => setCopied(''), 2000); }); };

  const addChannel = async (e) => {
    e.preventDefault();
    if (!newCid.trim()) return;
    setAdding(true);
    try {
      await api('POST', '/api/slack/channels', { channel_id: newCid.trim().toUpperCase(), channel_name: newCname.trim() || undefined });
      setNewCid(''); setNewCname('');
      refresh();
      toast('Channel added to allow-list.');
    } catch (err) { toast(err.message); }
    setAdding(false);
  };

  const removeChannel = async (channelId) => {
    if (!confirm(`Remove channel ${channelId} from the allow-list?`)) return;
    try {
      await api('DELETE', `/api/slack/channels/${channelId}`, {});
      refresh();
      toast('Channel removed.');
    } catch (err) { toast(err.message); }
  };

  return (
    <>
      <h3 style={{ marginTop: 'var(--space-200)' }}>Slack Listener Agent</h3>
      <p className="small muted">Automatically picks up task assignments from Slack and suggests them in each person&apos;s stack. Set up a viaSocket flow: trigger on new Slack messages → POST to this webhook.</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-50)' }}>
        <label className="small">Webhook URL</label>
        <div className="row">
          <code className="small" style={{ background: 'var(--surface)', padding: '4px 8px', borderRadius: 4, flex: 1, wordBreak: 'break-all' }}>{info.url}</code>
          <button className="ghost" onClick={() => copy(info.url, 'url')}>{copied === 'url' ? '✓ Copied' : 'Copy'}</button>
        </div>
        <label className="small">Webhook Secret</label>
        <div className="row">
          <code className="small" style={{ background: 'var(--surface)', padding: '4px 8px', borderRadius: 4, flex: 1 }}>{'•'.repeat(16)}</code>
          <button className="ghost" onClick={() => copy(info.secret, 'secret')}>{copied === 'secret' ? '✓ Copied' : 'Copy secret'}</button>
        </div>
      </div>

      <details className="small muted" style={{ marginTop: 'var(--space-100)' }}>
        <summary style={{ cursor: 'pointer' }}>viaSocket flow body format</summary>
        <pre style={{ marginTop: 8, fontSize: 12 }}>{`{\n  "secret": "<paste secret here>",\n  "channel_id": "{{trigger.channel_id}}",\n  "channel_name": "{{trigger.channel_name}}",\n  "message_ts": "{{trigger.ts}}",\n  "sender_name": "{{trigger.user_name}}",\n  "text": "{{trigger.text}}"\n}`}</pre>
        <p style={{ marginTop: 4 }}><code>channel_id</code> and <code>message_ts</code> are required for duplicate prevention. Find the channel ID in Slack: right-click the channel → View channel details → scroll to bottom.</p>
      </details>

      <h4 style={{ margin: 'var(--space-200) 0 var(--space-50)' }}>Channel allow-list</h4>
      <p className="small muted" style={{ marginBottom: 'var(--space-100)' }}>
        {channels.length === 0
          ? 'No channels configured — all channels are accepted. Add at least one channel ID to restrict which channels are processed.'
          : `${channels.length} channel${channels.length === 1 ? '' : 's'} allowed. Only messages from these channels will be processed.`}
      </p>

      {channels.length > 0 && (
        <div className="tablewrap" style={{ marginBottom: 'var(--space-100)' }}>
          <table><tbody>
            {channels.map((c) => (
              <tr key={c.channel_id}>
                <td><code className="small">{c.channel_id}</code></td>
                <td className="small">{c.channel_name || <span className="muted">unnamed</span>}</td>
                <td><span className={`pill ${c.enabled ? 'good' : 'warn'}`}>{c.enabled ? 'allowed' : 'blocked'}</span></td>
                <td><button className="ghost danger small" onClick={() => removeChannel(c.channel_id)}>Remove</button></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      <form onSubmit={addChannel} style={{ display: 'flex', gap: 'var(--space-50)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label className="small">Slack channel ID <span className="muted">(e.g. C0123ABC456)</span></label>
          <input value={newCid} onChange={(e) => setNewCid(e.target.value)} placeholder="C0123ABC456" style={{ width: 180, fontFamily: 'monospace', fontSize: 13 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <label className="small">Channel name <span className="muted">(optional, display only)</span></label>
          <input value={newCname} onChange={(e) => setNewCname(e.target.value)} placeholder="engineering" style={{ width: 160, fontSize: 13 }} />
        </div>
        <button type="submit" disabled={adding || !newCid.trim()} style={{ marginBottom: 1 }}>Add channel</button>
      </form>

      {log.length > 0 && (
        <>
          <h4 style={{ margin: 'var(--space-200) 0 var(--space-50)' }}>Recent activity</h4>
          <div className="tablewrap">
            <table><thead><tr><th>Time</th><th>Channel</th><th>Sender</th><th>Outcome</th><th>Created</th><th>Unresolved</th></tr></thead>
              <tbody>
                {log.slice(0, 10).map((ev) => (
                  <tr key={ev.id}>
                    <td className="small muted">{fmtTime(ev.logged_at)}</td>
                    <td className="small">{ev.channel_name ? `#${ev.channel_name}` : ev.channel_id || '—'}</td>
                    <td className="small">{ev.sender_name || '—'}</td>
                    <td><span className={`pill ${OUTCOME_PILL[ev.outcome] || ''}`}>{OUTCOME_LABEL[ev.outcome] || ev.outcome}</span></td>
                    <td className="small">{ev.created_count || 0}</td>
                    <td className="small">{ev.unresolved && ev.unresolved.length ? <span className="muted" title={ev.unresolved.map((u) => u.assignee).join(', ')}>{ev.unresolved.length} unresolved</span> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
