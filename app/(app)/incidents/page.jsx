'use client';
// Incidents: phone alerts and work that is stuck.
import Link from 'next/link';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Head } from '@/components/ui';
import { api, fmtTime, isAdmin } from '@/lib/client';

const ST = { open: ['warn', 'Waiting'], answered: ['good', 'Answered'], dismissed: ['', 'Closed on phone'], closed: ['', 'Solved'] };

export default function IncidentsPage() {
  const { me } = useApp();
  const { data, error } = useScreen(() => Promise.all([api('GET', '/api/incidents'), api('GET', '/api/alerts/setup')]));
  if (!data) return <ScreenStatus error={error} />;
  const [r, setup] = data;
  return (
    <>
      <Head eyebrow="Review" title="Incidents" sub="Phone alerts and work that is stuck." />
      {setup.configured ? <p className="muted">Phone alerts go to <b>{setup.channel}</b>.</p>
        : <div className="notice warn">Phone alerts are not set up, so nobody is rung. {isAdmin(me) ? <><Link href="/settings">Set them up in Settings</Link>.</> : 'Ask an admin to set them up.'}</div>}
      <h2>Phone alerts</h2>
      <div className="card tablewrap"><table><thead><tr><th>When</th><th>Alert</th><th>Status</th><th>Answer</th></tr></thead><tbody>
        {r.incidents.length ? r.incidents.map((i, k) => (
          <tr key={i.id || k}><td className="small">{fmtTime(i.raised_at)}</td><td>{i.title}<div className="small muted">{i.severity} · reached {i.delivered ?? '?'} phone(s)</div></td>
            <td><span className={`pill ${(ST[i.status] || [''])[0]}`}>{(ST[i.status] || ['', i.status])[1]}</span></td>
            <td>{i.decision_label ? <>{i.decision_label} · {i.answered_by || ''}{i.answer_note && <div className="small muted">&quot;{i.answer_note}&quot;</div>}</> : '–'}</td></tr>
        )) : <tr><td colSpan={4} className="muted">No alerts yet.</td></tr>}
      </tbody></table></div>
      <h2>Blockers on top priorities, open longer than {me.settings.blockerEscalationHours}h</h2>
      <div className="card tablewrap"><table><thead><tr><th>Person</th><th>Priority</th><th>Blocker</th><th>Since</th></tr></thead><tbody>
        {r.blockersOverThreshold.length ? r.blockersOverThreshold.map((b, k) => <tr key={k}><td>{b.name}</td><td>#{b.rank} {b.title}</td><td>{b.description}</td><td>{fmtTime(b.raised_at)}</td></tr>)
          : <tr><td colSpan={4} className="muted">None.</td></tr>}
      </tbody></table></div>
    </>
  );
}
