'use client';
// Team: each person against their own ranked priorities, plus department and rater patterns.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, Head, Ph } from '@/components/ui';
import WeekPick from '@/components/week/WeekPick';
import { addDays, api, fmtWeek, scoreText } from '@/lib/client';

export default function TeamPage() {
  const week = useSearchParams().get('week') || '';
  const { data: t, error } = useScreen(() => api('GET', `/api/team${week ? `?week=${encodeURIComponent(week)}` : ''}`), [week]);
  if (!t) return <ScreenStatus error={error} />;
  const nav = (n) => `/team?week=${addDays(t.week, n)}`;
  return (
    <>
      <Head eyebrow="Manager view" title="Team" sub={`${fmtWeek(t.week)} · each person against their own ranked priorities`}
        right={<><Link className="btn" href={nav(-7)}><Ph name="arrow-left" />Previous</Link><WeekPick week={t.week} /><Link className="btn" href={nav(7)}>Next<Ph name="arrow-right" /></Link></>} />
      <div className="card tablewrap"><table><thead><tr><th>Name</th><th>Level</th><th>Department</th><th className="num">Score</th><th className="num">Quality</th><th className="num">Coins</th><th className="num">Alignment</th><th>Flags</th></tr></thead><tbody>
        {t.people.length ? t.people.map((p) => (
          <tr key={p.id}>
            <td><div className="who"><Avatar name={p.name} pic={p.avatar} /><Link href={`/week?user=${encodeURIComponent(p.id)}&week=${t.week}`}>{p.name}</Link></div></td>
            <td>{p.level || ''}</td><td>{p.department || ''}</td>
            <td className="num"><b>{scoreText(p.score)}</b>{p.score !== null && <span className="sbar"><i style={{ width: `${p.score}%` }} /></span>}{p.pending ? <> <span className="pill">{p.pending} unrated</span></> : null}</td>
            <td className="num">{p.qualityPct === null ? '–' : `${p.qualityPct}%`}</td>
            <td className="num">{p.coins}</td><td className="num">{p.alignment === null ? '–' : `${p.alignment}%`}</td>
            <td>{!p.locked && <span className="pill warn">not locked</span>}{p.openBlockers ? <span className="pill bad">{p.openBlockers} blocked</span> : null}{p.onLeave ? <span className="pill">{p.onLeave}d leave</span> : null}</td>
          </tr>
        )) : <tr><td colSpan={8} className="muted">Nobody reports to you yet. Invite people from People.</td></tr>}
      </tbody></table></div>
      <h2>By department</h2>
      <div className="card tablewrap"><table><thead><tr><th>Department</th><th className="num">People</th><th className="num">Average score</th><th className="num">Open blockers</th></tr></thead><tbody>
        {t.departments.map((d) => <tr key={d.department}><td>{d.department}</td><td className="num">{d.people}</td><td className="num">{scoreText(d.avgScore)}</td><td className="num">{d.blockers}</td></tr>)}
      </tbody></table></div>
      <h2>How each rater rates (last 4 weeks)</h2><p className="small muted">Makes harsh or generous patterns visible, so ratings can be compared fairly.</p>
      <div className="card tablewrap"><table><thead><tr><th>Rater</th><th className="num">Done well</th><th className="num">Needs fixes</th><th className="num">Redo</th></tr></thead><tbody>
        {t.raters.length ? t.raters.map((r, k) => <tr key={k}><td>{r.name}</td><td className="num">{r.done_well}</td><td className="num">{r.needs_fixes}</td><td className="num">{r.redo}</td></tr>) : <tr><td colSpan={4} className="muted">No ratings yet.</td></tr>}
      </tbody></table></div>
    </>
  );
}
