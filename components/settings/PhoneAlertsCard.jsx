'use client';
// Phone alerts through M91: connect a channel, test that phones ring, choose when people are asked.
import { useEffect, useState } from 'react';
import { useApp } from '@/components/AppState';
import { Ph, brand } from '@/components/ui';
import { api } from '@/lib/client';

const ANSWERS = { blockers: "I'll unblock it · Blocked by others · Seen", unrated: "I'll rate it today · Seen", unranked: "I'll rank today · Seen", disputes: "I'll decide today · Seen" };

export default function PhoneAlertsCard() {
  const { loadMe, toast, run } = useApp();
  const [a, setA] = useState(null);
  const [link, setLink] = useState('');
  const [linkErr, setLinkErr] = useState('');
  const [testOut, setTestOut] = useState('');
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let live = true;
    api('GET', '/api/alerts/setup').then((r) => live && setA(r)).catch((e) => live && toast(e.message));
    return () => { live = false; };
  }, [tick, toast]);

  if (!a) return <div className="card form" id="alertsCard"><p className="muted">Loading phone alerts…</p></div>;

  const test = (e) => run(e, async () => {
    try {
      const r = await api('POST', '/api/alerts/test', {});
      if (!r.delivered) { setTestOut('Sent, but it reached nobody: people in the channel still need to install M91 and accept the invite.'); return; }
      setTestOut(`Ringing ${r.delivered} phone${r.delivered === 1 ? '' : 's'}${r.unregistered ? ` (${r.unregistered} not set up yet)` : ''}. Tap "It rang" on a phone…`);
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const s = await api('GET', `/api/alerts/test/${encodeURIComponent(r.alertId)}`);
        if (s.answered || s.responses) { setTestOut(`Answered on a phone${s.answered ? `: "${s.answered}"` : ''}. Phone alerts work.`); return; }
        if (s.status === 'RESOLVED') { setTestOut('Closed on a phone. Phone alerts work.'); return; }
      }
      setTestOut('No answer yet. Check that a phone in the channel rang.');
    } catch (x) { setTestOut(x.message); }
  });
  const saveMoments = (form) => run(null, async () => {
    const alertMoments = Object.fromEntries([...form.querySelectorAll('[data-moment]')].map((x) => [x.dataset.moment, x.checked]));
    await api('PUT', '/api/settings', { settings: { alertMoments } });
    await loadMe();
    toast('Saved');
  });

  return (
    <div className="card" id="alertsCard">
      <div className="m91-layout">
        <div className="m91-left">
          <h2 style={{ marginTop: 0 }}>Phone alerts</h2>
          <p className="small">{brand.name} rings your managers&apos; phones when someone is stuck on a top priority, or when work is waiting on them for days.</p>
          <ol className="small" style={{ marginBottom: 0 }}>
            <li>Install M91: <a href="https://apps.apple.com/app/id6759090472" target="_blank" rel="noopener">App Store</a> · <a href="https://play.google.com/store/apps/details?id=com.msg91.m91" target="_blank" rel="noopener">Google Play</a></li>
            <li>In the app, create a channel and add the managers and TLs who should answer.</li>
            <li>Tap the paper plane on that channel, copy the link and paste it here.</li>
          </ol>
          <p className="small muted" style={{ marginTop: 'var(--space-200)' }}>Alerts name the person they are for. Everyone in the channel needs M91 installed and the invite accepted.</p>
        </div>
        <div className="m91-right">
          {a.configured ? (
            <>
              <p className="ok-line" style={{ marginTop: 0 }}><Ph name="check-circle" />Connected to <b>{a.channel}</b></p>
              <div className="row">
                <button type="button" id="testAlert" className="primary" onClick={test}>Ring our phones to test</button>
                <button type="button" id="dropAlert" className="ghost danger" onClick={(e) => run(e, async () => { if (confirm('Stop phone alerts?')) { await api('DELETE', '/api/alerts/link'); reload(); } })}>Disconnect</button>
              </div>
              <p className="small" id="testOut">{testOut}</p>
            </>
          ) : (
            <>
              <label htmlFor="m91link">Channel link</label>
              <div className="inline">
                <input id="m91link" placeholder="Paste the link from M91" autoComplete="off" value={link} onChange={(e) => setLink(e.target.value)} />
                <button type="button" className="primary" id="saveLink" style={{ flex: '0 0 auto' }} onClick={(e) => run(e, async () => { try { setLinkErr(''); await api('POST', '/api/alerts/link', { link }); toast('Connected'); reload(); } catch (x) { setLinkErr(x.message); } })}>Connect</button>
              </div>
              <p className="err" id="linkErr">{linkErr}</p>
            </>
          )}
          <h3 style={{ marginTop: 'var(--space-300)' }}>You&apos;ll be asked when…</h3>
          <div onChange={(e) => { if (e.target.closest('[data-moment]')) saveMoments(e.currentTarget); }}>
            {a.moments.map((x) => (
              <label key={x.key} style={{ margin: 'var(--space-50) 0', color: 'var(--text)' }}><input type="checkbox" data-moment={x.key} defaultChecked={!!x.on} style={{ width: 'auto' }} /> {x.text} <span className="small muted">→ {ANSWERS[x.key]}</span></label>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
