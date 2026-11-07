'use client';
// Settings: how scoring, people and alerts work in this workspace. Admins only (the server checks).
import { useState } from 'react';
import { useApp } from '@/components/AppState';
import { Head } from '@/components/ui';
import PhoneAlertsCard from '@/components/settings/PhoneAlertsCard';
import { api } from '@/lib/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const SOURCES = [['manual', 'Invite links', 'Managers invite people one by one. Leave is added in the app.'], ['csv', 'CSV upload', 'Export from Keka, Excel or any HR tool and upload it under People. Nothing stays connected.'], ['keka', 'Keka sync', 'Read automatically every night, only the fields ticked below. Needs setup under Integrations.']];
const HR = [['reportingLine', 'Reporting line (who reports to whom)'], ['department', 'Department'], ['jobTitle', 'Job title (used as level)'], ['leave', 'Leave days (not available from Keka yet: import a CSV)'], ['phone', 'Mobile number (for serious alerts)']];
const opt = { margin: 'var(--space-75) 0', color: 'var(--text)' };

export default function SettingsPage() {
  const { me, loadMe, toast } = useApp();
  const s = me.settings;
  const ws = me.workspace;
  const [source, setSource] = useState(s.peopleSource);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0); // remounts the form with the saved values

  const submit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.currentTarget).entries());
    const settings = {
      rankWeights: f.rankWeights.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)),
      quality: { done_well: Number(f.q_done_well), needs_fixes: Number(f.q_needs_fixes), redo: Number(f.q_redo) },
      secondRaterRanks: Number(f.secondRaterRanks), stretchBonus: Number(f.stretchBonus), coinsPerWeek: Number(f.coinsPerWeek), maxCoinsPerPerson: Number(f.maxCoinsPerPerson),
      workingDays: DAYS.map((_, i) => (f[`wd${i}`] ? i : null)).filter((x) => x !== null), blockerEscalationHours: Number(f.blockerEscalationHours),
      peopleSource: f.peopleSource || 'manual',
      managersAddTeam: !!f.managersAddTeam,
      hrFields: Object.fromEntries(['reportingLine', 'department', 'jobTitle', 'leave', 'phone'].map((k) => [k, !!f[`hr_${k}`]])),
    };
    setBusy(true); setErr('');
    try { await api('PUT', '/api/settings', { name: f.name, timezone: f.timezone, allowed_domain: f.allowed_domain, settings }); await loadMe(); toast('Saved'); setVersion((v) => v + 1); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };

  return (
    <>
      <Head eyebrow="Manage" title="Settings" sub="How scoring, people and alerts work in this workspace." />
      <form className="form settings" id="sform" key={version} onSubmit={submit}>
        <section className="card sect"><h3>Company</h3><p className="small muted">Basic details for this workspace.</p>
          <label>Company name</label><input name="name" defaultValue={ws.name} required />
          <label>Time zone</label><input name="timezone" defaultValue={ws.timezone} />
          <label>Only allow emails from this domain</label><input name="allowed_domain" defaultValue={ws.allowed_domain || ''} placeholder="yourcompany.com" />
        </section>
        <section className="card sect"><h3>How the score works</h3><p className="small muted">The weights and quality multipliers behind every score. Everyone can read these on the “How we score” page.</p>
          <label>Rank weights in % (#1 first, must add up to 100)</label><input name="rankWeights" defaultValue={s.rankWeights.join(', ')} />
          <div className="inline">
            <div><label>Done well ×</label><input name="q_done_well" type="number" step="0.05" min="0" max="1" defaultValue={s.quality.done_well} /></div>
            <div><label>Needs fixes ×</label><input name="q_needs_fixes" type="number" step="0.05" min="0" max="1" defaultValue={s.quality.needs_fixes} /></div>
            <div><label>Redo ×</label><input name="q_redo" type="number" step="0.05" min="0" max="1" defaultValue={s.quality.redo} /></div>
          </div>
          <div className="inline">
            <div><label>Second rater for ranks #1 to #</label><input name="secondRaterRanks" type="number" min="0" max="10" defaultValue={s.secondRaterRanks} /></div>
            <div><label>Stretch bonus (0–1)</label><input name="stretchBonus" type="number" step="0.05" min="0" max="1" defaultValue={s.stretchBonus} /></div>
          </div>
        </section>
        <section className="card sect"><h3>Coins and working days</h3><p className="small muted">Coins are thanks between colleagues. They sit beside the score and never change it.</p>
          <div className="inline">
            <div><label>Coins per week</label><input name="coinsPerWeek" type="number" min="0" max="100" defaultValue={s.coinsPerWeek} /></div>
            <div><label>Max coins to one person</label><input name="maxCoinsPerPerson" type="number" min="1" defaultValue={s.maxCoinsPerPerson} /></div>
          </div>
          <label>Working days</label>
          <div className="row">{DAYS.map((d, i) => <label key={d} style={{ margin: 0 }}><input type="checkbox" name={`wd${i}`} defaultChecked={s.workingDays.includes(i)} style={{ width: 'auto' }} /> {d}</label>)}</div>
        </section>
        <section className="card sect"><h3>Who adds people</h3>
          <label style={opt}><input type="radio" name="managersAddTeam" value="1" defaultChecked={!!s.managersAddTeam} style={{ width: 'auto' }} /> <b>Managers add their own team</b> <span className="small muted">Admins add managers/TLs; each manager adds, moves and offboards people in their team.</span></label>
          <label style={opt}><input type="radio" name="managersAddTeam" value="" defaultChecked={!s.managersAddTeam} style={{ width: 'auto' }} /> <b>Only admins</b> <span className="small muted">Managers rank and rate their team but cannot add or remove people.</span></label>
        </section>
        <section className="card sect"><h3>People &amp; leave source</h3><p className="small muted">Choose where people, reporting lines and leave come from. You can change this any time.</p>
          {SOURCES.map(([v, t, h]) => <label key={v} style={opt}><input type="radio" name="peopleSource" value={v} defaultChecked={s.peopleSource === v} onChange={() => setSource(v)} style={{ width: 'auto' }} /> <b>{t}</b> <span className="small muted">{h}</span></label>)}
          <div id="hrf" style={source === 'keka' ? undefined : { display: 'none' }}>
            <label>Fields Keka may share</label>
            {HR.map(([k, t]) => <label key={k} style={{ margin: 'var(--space-50) 0', color: 'var(--text)' }}><input type="checkbox" name={`hr_${k}`} defaultChecked={!!s.hrFields[k] && k !== 'leave'} disabled={k === 'leave'} style={{ width: 'auto' }} /> {t}</label>)}
            <p className="small muted">Never read, whatever is ticked: salary, payroll, bank, tax, documents, attendance.</p>
          </div>
        </section>
        <section className="card sect"><h3>Alerts</h3>
          <label>Escalate blockers on top priorities after (hours)</label><input name="blockerEscalationHours" type="number" min="1" max="168" defaultValue={s.blockerEscalationHours} />
        </section>
        <div className="savebar"><p className="err" id="serr">{err}</p><button className="primary" disabled={busy}>Save settings</button></div>
      </form>
      <PhoneAlertsCard />
    </>
  );
}
