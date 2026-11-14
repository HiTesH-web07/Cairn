'use client';
// Scorecard: one person's score, quality, coins, alignment and the last five weeks.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Head, Ring, Stack } from '@/components/ui';
import { api, fmtWeek, scoreText, QUALITY } from '@/lib/client';

export default function ScorePage() {
  const { me } = useApp();
  const user = useSearchParams().get('user') || '';
  const { data: s, error } = useScreen(() => api('GET', `/api/scorecard${user ? `?user=${encodeURIComponent(user)}` : ''}`), [user]);
  if (!s) return <ScreenStatus error={error} />;
  const c = s.current;
  const rated = c.quality.done_well + c.quality.needs_fixes + c.quality.redo;
  return (
    <>
      <Head eyebrow="Results" title={`${s.person.name} · Scorecard`} sub={`${fmtWeek(s.week)}${s.person.level ? ` · ${s.person.level}` : ''}`} />
      <div className="grid">
        <div className="tile has-ring"><div><div className="k">1. Did what mattered most?</div><div className="v">{c.scoreLow != null ? `${c.scoreLow} – ${c.scoreHigh}` : scoreText(c.score)}</div><div className="s">{c.pending ? `${c.pending} rating${c.pending > 1 ? 's' : ''} pending · score will land in this range` : 'priority score out of 100'}</div></div><Ring score={c.scoreLow != null ? c.scoreHigh : c.score} /></div>
        <div className="tile"><div className="k">2. Was it done well?</div><div className="v">{rated ? `${c.quality.done_well}/${rated}` : '–'}</div><div className="s">rated Done well</div></div>
        <div className="tile"><div className="k">3. Did others value it?</div><div className="v"><span className="coinic" />{c.coins}</div><div className="s">coins from colleagues</div></div>
        <div className="tile"><div className="k">Alignment</div><div className="v">{c.alignment === null ? '–' : `${c.alignment}%`}</div><div className="s">linked to the level above</div></div>
        {s.consistencyBonus > 0 && <div className="tile"><div className="k">Consistency bonus</div><div className="v">+{s.consistencyBonus}</div><div className="s">≤10pt spread over 4 weeks</div></div>}
      </div>
      <div className="card"><div className="row spread" style={{ marginBottom: 'var(--space-100)' }}><h2 style={{ margin: 0 }}>This week&apos;s stack</h2></div>
        <Stack items={c.breakdown.map((b) => ({ rank: b.rank, title: `#${b.rank}`, status: b.status, mult: b.multiplier }))} settings={me.settings} /></div>
      <div className="card"><h3>Last 5 weeks</h3><div className="bars">{s.trend.map((t, i) => <div key={t.week} style={{ '--bar-k': i }}><span style={{ height: `${t.score || 0}%` }} /><span style={{ color: 'var(--muted)', fontSize: 11 }}>{scoreText(t.score)}</span><span style={{ color: 'var(--muted)', fontSize: 10 }}>{t.week.slice(5)}</span></div>)}</div></div>
      {c.disagreements && c.disagreements.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--warn)' }}>
          <h3 style={{ margin: 0, color: 'var(--warn)' }}>Rater disagreement</h3>
          <p className="small muted">These items have significantly different ratings. Please discuss and resolve.</p>
          {c.disagreements.map((d) => <p key={d.item_id} className="small">#{d.rank} {d.title}: {d.ratings.map((r) => `${r.rater_name} → ${QUALITY[r.quality]}`).join(' vs ')}</p>)}
        </div>
      )}
      <div className="card"><h3>What was delivered this week</h3>{s.changed.length ? <ul>{s.changed.map((x, k) => <li key={k}>{x.rank ? `#${x.rank} ` : ''}{x.title} {x.proof_url && <>· <a href={x.proof_url} target="_blank" rel="noopener noreferrer">proof</a></>}</li>)}</ul> : <p className="muted">Nothing delivered yet.</p>}</div>
      <div className="card"><h3>Why colleagues gave coins</h3>{s.coinNotes.length ? <ul>{s.coinNotes.map((n, k) => <li key={k}><span className="coinic" />{n.coins} from {n.from_name}: &quot;{n.reason}&quot;</li>)}</ul> : <p className="muted">None this week.</p>}</div>
      <p className="small"><Link href="/how">How is this calculated?</Link> · Task count never counts.</p>
    </>
  );
}
