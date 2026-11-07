'use client';
// Scorecard: one person's score, quality, coins, alignment and the last five weeks.
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Head, Ring, Stack } from '@/components/ui';
import { api, fmtWeek, scoreText } from '@/lib/client';

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
        <div className="tile has-ring"><div><div className="k">1. Did what mattered most?</div><div className="v">{scoreText(c.score)}</div><div className="s">priority score out of 100{c.pending ? ` · ${c.pending} waiting for rating` : ''}</div></div><Ring score={c.score} /></div>
        <div className="tile"><div className="k">2. Was it done well?</div><div className="v">{rated ? `${c.quality.done_well}/${rated}` : '–'}</div><div className="s">rated Done well</div></div>
        <div className="tile"><div className="k">3. Did others value it?</div><div className="v"><span className="coinic" />{c.coins}</div><div className="s">coins from colleagues</div></div>
        <div className="tile"><div className="k">Alignment</div><div className="v">{c.alignment === null ? '–' : `${c.alignment}%`}</div><div className="s">linked to the level above</div></div>
      </div>
      <div className="card"><div className="row spread" style={{ marginBottom: 'var(--space-100)' }}><h2 style={{ margin: 0 }}>This week&apos;s stack</h2></div>
        <Stack items={c.breakdown.map((b) => ({ rank: b.rank, title: `#${b.rank}`, status: b.status, mult: b.multiplier }))} settings={me.settings} /></div>
      <div className="card"><h3>Last 5 weeks</h3><div className="bars">{s.trend.map((t) => <div key={t.week}><span style={{ height: `${t.score || 0}px` }} />{scoreText(t.score)}<br />{t.week.slice(5)}</div>)}</div></div>
      <div className="card"><h3>What was delivered this week</h3>{s.changed.length ? <ul>{s.changed.map((x, k) => <li key={k}>{x.rank ? `#${x.rank} ` : ''}{x.title} {x.proof_url && <>· <a href={x.proof_url} target="_blank" rel="noopener noreferrer">proof</a></>}</li>)}</ul> : <p className="muted">Nothing delivered yet.</p>}</div>
      <div className="card"><h3>Why colleagues gave coins</h3>{s.coinNotes.length ? <ul>{s.coinNotes.map((n, k) => <li key={k}><span className="coinic" />{n.coins} from {n.from_name}: &quot;{n.reason}&quot;</li>)}</ul> : <p className="muted">None this week.</p>}</div>
      <p className="small"><Link href="/how">How is this calculated?</Link> · Task count never counts.</p>
    </>
  );
}
