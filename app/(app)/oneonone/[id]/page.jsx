'use client';
// 1-on-1 prep: last 4 weeks of work, open blockers, retros, and coin history for one report.
import Link from 'next/link';
import { use } from 'react';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, Head, Ph } from '@/components/ui';
import { api, fmtWeek, scoreText } from '@/lib/client';

export default function OneOnOnePage({ params }) {
  const { id } = use(params);
  const { data, error } = useScreen(() => api('GET', `/api/people/${id}/oneonone`), [id]);
  if (!data) return <ScreenStatus error={error} />;
  const { person, weeks, blockers, retros, coins } = data;
  return (
    <>
      <Head
        eyebrow="1-on-1 prep"
        title={person.name}
        sub="Last 4 weeks · open blockers · retrospectives"
        right={<Link className="btn" href="/team"><Ph name="arrow-left" />Back to Team</Link>}
      />
      <div className="grid" style={{ '--cols': 2 }}>
        <div className="card">
          <div className="eyebrow">Person</div>
          <div className="who" style={{ marginTop: 'var(--space-75)' }}>
            <Avatar name={person.name} pic={person.avatar} size="lg" />
            <div>
              <b>{person.name}</b>
              {person.level && <div className="small muted">{person.level}</div>}
              {person.department && <div className="small muted">{person.department}</div>}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="eyebrow">Coins received (last 4 weeks)</div>
          <div style={{ fontSize: '2rem', fontWeight: 700, marginTop: 'var(--space-75)' }}>{coins.total}</div>
          <div className="small muted">{coins.breakdown.map((c) => `${c.week}: ${c.coins}`).join(' · ') || 'No coins yet'}</div>
        </div>
      </div>

      <h2>Week-by-week trend</h2>
      <div className="card tablewrap">
        <table>
          <thead><tr><th>Week</th><th className="num">Score</th><th className="num">Done well</th><th className="num">Needs fixes</th><th className="num">Redo</th><th className="num">Coins</th><th>Flags</th></tr></thead>
          <tbody>
            {weeks.map((w) => (
              <tr key={w.week}>
                <td><Link href={`/week?user=${encodeURIComponent(id)}&week=${w.week}`}>{fmtWeek(w.week)}</Link></td>
                <td className="num"><b>{scoreText(w.score)}</b></td>
                <td className="num">{w.done_well}</td>
                <td className="num">{w.needs_fixes}</td>
                <td className="num">{w.redo}</td>
                <td className="num">{w.coins}</td>
                <td>{!w.locked && <span className="pill warn">not locked</span>}{w.pending > 0 && <span className="pill">{w.pending} pending</span>}</td>
              </tr>
            ))}
            {weeks.length === 0 && <tr><td colSpan={7} className="muted">No weeks yet.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Open blockers</h2>
      {blockers.length ? (
        <div className="card">
          {blockers.map((b) => (
            <div key={b.id} style={{ borderTop: '1px solid var(--border)', paddingTop: 'var(--space-100)', marginTop: 'var(--space-100)' }} className="first-no-border">
              <div><b className="small">{b.item_title}</b> <span className="pill warn">Week {b.week}</span></div>
              <p className="small muted" style={{ margin: '4px 0 0' }}>{b.description}</p>
            </div>
          ))}
        </div>
      ) : <p className="muted small card">No open blockers.</p>}

      <h2>Recent retrospectives</h2>
      {retros.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-100)' }}>
          {retros.map((r) => (
            <div key={r.week_start} className="card">
              <div className="eyebrow" style={{ marginBottom: 'var(--space-75)' }}>{fmtWeek(r.week_start)}</div>
              {r.went_well && <p className="small"><b>Went well:</b> {r.went_well}</p>}
              {r.slowed_down && <p className="small"><b>Slowed down:</b> {r.slowed_down}</p>}
              {r.do_differently && <p className="small"><b>Do differently:</b> {r.do_differently}</p>}
            </div>
          ))}
        </div>
      ) : <p className="muted small card">No retrospectives yet.</p>}
    </>
  );
}
