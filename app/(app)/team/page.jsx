'use client';
// Team: each person against their own ranked priorities, plus AI briefing, inline rating, and 1-on-1 prep links.
import { useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, Head, Ph } from '@/components/ui';
import WeekPick from '@/components/week/WeekPick';
import { addDays, api, fmtWeek, scoreText } from '@/lib/client';

export default function TeamPage() {
  const week = useSearchParams().get('week') || '';
  const { data: t, error, reload } = useScreen(() => api('GET', `/api/team${week ? `?week=${encodeURIComponent(week)}` : ''}`), [week]);
  if (!t) return <ScreenStatus error={error} />;
  const nav = (n) => `/team?week=${addDays(t.week, n)}`;
  return (
    <>
      <Head eyebrow="Manager view" title="Team" sub={`${fmtWeek(t.week)} · each person against their own ranked priorities`}
        right={<><Link className="btn" href={nav(-7)}><Ph name="arrow-left" />Previous</Link><WeekPick week={t.week} /><Link className="btn" href={nav(7)}>Next<Ph name="arrow-right" /></Link></>} />

      <AiBriefing week={t.week} />

      <div className="card tablewrap"><table><thead><tr><th>Name</th><th>Level</th><th>Department</th><th className="num">Score</th><th className="num">Quality</th><th className="num">Coins</th><th className="num">Alignment</th><th>Flags</th><th></th></tr></thead><tbody>
        {t.people.length ? t.people.map((p) => (
          <PersonRow key={p.id} p={p} week={t.week} onRated={reload} />
        )) : <tr><td colSpan={9} className="muted">Nobody reports to you yet. Invite people from People.</td></tr>}
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

function AiBriefing({ week }) {
  const { me } = useApp();
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  if (!me?.ai) return null;
  const load = async () => {
    setLoading(true); setError(null);
    try {
      const r = await api('GET', `/api/team/briefing${week ? `?week=${encodeURIComponent(week)}` : ''}`);
      setBriefing(r.briefing);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };
  if (briefing) return (
    <div className="card" style={{ borderLeft: '3px solid var(--accent)', marginBottom: 'var(--space-150)' }}>
      <div className="row spread" style={{ marginBottom: 'var(--space-75)' }}>
        <div className="eyebrow">Your team in 30 seconds · written by Cairn</div>
        <button className="ghost small" onClick={() => setBriefing(null)}>✕</button>
      </div>
      <div style={{ whiteSpace: 'pre-line', fontSize: '0.9rem', lineHeight: 1.6 }}>{briefing}</div>
    </div>
  );
  return (
    <div style={{ marginBottom: 'var(--space-150)' }}>
      <button className="ghost" onClick={load} disabled={loading}>
        {loading ? 'Cairn is reading your team…' : '✨ Get 30-second AI briefing'}
      </button>
      {error && <span className="small" style={{ color: 'var(--err)', marginLeft: 8 }}>{error}</span>}
    </div>
  );
}

const QUALITY_LABELS = { done_well: 'Done well', needs_fixes: 'Needs fixes', redo: 'Redo' };
const QUALITY_CLS = { done_well: 'good', needs_fixes: 'warn', redo: 'bad' };

function PersonRow({ p, week, onRated }) {
  const { run, toast } = useApp();
  const [expanded, setExpanded] = useState(false);
  const [pendingItems, setPendingItems] = useState(null);
  const [loadingItems, setLoadingItems] = useState(false);
  const noteRefs = useRef({});

  const loadPending = async () => {
    if (pendingItems) { setExpanded(!expanded); return; }
    setLoadingItems(true);
    try {
      const r = await api('GET', '/api/ratings/pending');
      const mine = r.items.filter((it) => it.owner.id === p.id);
      setPendingItems(mine);
      setExpanded(true);
    } finally { setLoadingItems(false); }
  };

  const rate = async (e, itemId, quality) => {
    if (quality !== 'done_well') {
      const note = noteRefs.current[itemId]?.value;
      if (!note) { toast('Add a note for Needs fixes or Redo'); return; }
    }
    await run(e, async () => {
      await api('POST', `/api/items/${itemId}/rate`, { quality, note: noteRefs.current[itemId]?.value || undefined }, { idem: `rate-${itemId}` });
      toast('Rating saved');
      setPendingItems(null);
      setExpanded(false);
      onRated();
    });
  };

  return (
    <>
      <tr>
        <td><div className="who"><Avatar name={p.name} pic={p.avatar} /><Link href={`/week?user=${encodeURIComponent(p.id)}&week=${week}`}>{p.name}</Link></div></td>
        <td>{p.level || ''}</td><td>{p.department || ''}</td>
        <td className="num"><b>{scoreText(p.score)}</b>{p.score !== null && <span className="sbar"><i style={{ width: `${p.score}%` }} /></span>}{p.pending ? <> <span className="pill warn" style={{ cursor: 'pointer' }} onClick={loadPending}>{loadingItems ? '…' : `${p.pending} to rate`}</span></> : null}</td>
        <td className="num">{p.qualityPct === null ? '–' : `${p.qualityPct}%`}</td>
        <td className="num">{p.coins}</td><td className="num">{p.alignment === null ? '–' : `${p.alignment}%`}</td>
        <td>{!p.locked && <span className="pill warn">not locked</span>}{p.openBlockers ? <span className="pill bad">{p.openBlockers} blocked</span> : null}{p.onLeave ? <span className="pill">{p.onLeave}d leave</span> : null}</td>
        <td><Link className="ghost small" href={`/oneonone/${p.id}`} title="1-on-1 prep">1:1</Link></td>
      </tr>
      {expanded && pendingItems && pendingItems.length > 0 && (
        <tr>
          <td colSpan={9} style={{ padding: '0 0 12px 0', background: 'var(--surface-alt)' }}>
            <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {pendingItems.map((it) => (
                <div key={it.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  <div style={{ flex: 1 }}>
                    <b className="small">{it.title}</b>
                    <span className="small muted"> · #{it.rank} · {it.weight}%</span>
                    {it.proof_url && <div className="small"><a href={it.proof_url} target="_blank" rel="noopener noreferrer">{it.proof_url}</a></div>}
                    {it.proof_note && <div className="small muted">{it.proof_note}</div>}
                    <textarea ref={(el) => { noteRefs.current[it.id] = el; }} placeholder="Note (required for Needs fixes / Redo)" className="note" style={{ marginTop: 6 }} />
                  </div>
                  <div className="row" style={{ gap: 6, flexShrink: 0 }}>
                    <button className="q q-good small" onClick={(e) => rate(e, it.id, 'done_well')}>Done well</button>
                    <button className="q q-warn small" onClick={(e) => rate(e, it.id, 'needs_fixes')}>Needs fixes</button>
                    <button className="q q-bad small" onClick={(e) => rate(e, it.id, 'redo')}>Redo</button>
                  </div>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
      {expanded && pendingItems && pendingItems.length === 0 && (
        <tr><td colSpan={9} className="small muted" style={{ padding: '8px 0' }}>Nothing waiting for your rating from {p.name}.</td></tr>
      )}
    </>
  );
}
