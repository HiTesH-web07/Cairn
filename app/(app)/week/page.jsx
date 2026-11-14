'use client';
// My Week: the ranked priorities, the stack meter, delivery, blockers and ratings for one person's week.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, CairnArt, Empty, Icon, Ph, Ring, Stack } from '@/components/ui';
import WeekPick from '@/components/week/WeekPick';
import RankEditor from '@/components/week/RankEditor';
import RetroModal from '@/components/RetroModal';
import { QCLASS, QUALITY, STATUS, addDays, api, fmtTime, fmtWeek, idem, scoreText } from '@/lib/client';

export default function WeekPage() {
  const params = useSearchParams();
  const user = params.get('user') || '';
  const week = params.get('week') || '';
  const { data, error, reload } = useScreen(async () => {
    const q = new URLSearchParams();
    if (user) q.set('user', user);
    if (week) q.set('week', week);
    const w = await api('GET', `/api/week?${q}`);
    const dir = w.canRank ? await api('GET', '/api/directory') : { people: [] };
    const retroQ = new URLSearchParams({ week: w.week });
    if (user) retroQ.set('user', user);
    const retro = await api('GET', `/api/retrospective?${retroQ}`).catch(() => ({ retro: null }));
    return { w, people: dir.people, retro: retro.retro };
  }, [user, week]);
  if (!data) return <ScreenStatus error={error} />;
  return <Week w={data.w} people={data.people} user={user} reload={reload} retroExisting={data.retro} />;
}

function Week({ w, people, user, reload, retroExisting }) {
  const { me, toast, run, modal } = useApp();
  const [ranking, setRanking] = useState(false);
  const [showRetro, setShowRetro] = useState(false);

  // Auto-prompt for retrospective on Friday if week is locked and user hasn't filled it yet.
  useEffect(() => {
    const dayOfWeek = new Date().getDay(); // 0=Sun, 5=Fri
    if (w.isSelf && w.locked && dayOfWeek === 5 && !retroExisting) {
      const key = `retro_prompted_${w.week}`;
      if (!localStorage.getItem(key)) {
        localStorage.setItem(key, '1');
        setShowRetro(true);
      }
    }
  }, [w.isSelf, w.locked, w.week, retroExisting]);
  const ranked = w.items.filter((i) => i.rank).sort((a, b) => a.rank - b.rank);
  const unranked = w.items.filter((i) => !i.rank);
  const weights = me.settings.rankWeights;
  const nav = (n) => `/week?${new URLSearchParams({ ...(user ? { user } : {}), week: addDays(w.week, n) })}`;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const dispute = (e, ratingId) => {
    e.preventDefault();
    modal(<><h3>Dispute this rating</h3><p className="small muted">It goes to the rater&apos;s manager. Both opinions stay on record.</p><label>Why is it unfair?</label><textarea name="reason" required /></>,
      async (fd) => { await api('POST', `/api/ratings/${ratingId}/dispute`, fd, { idem: idem() }); toast('Dispute sent'); });
  };
  const deliver = (id) => {
    const key = idem();
    modal(<><h3>Deliver</h3><p className="small muted">Show the result. A link is best (PR, doc, campaign report, published plug).</p>
      <label>How much did you complete?</label>
      <select name="delivery_fraction"><option value="1">100% — fully done</option><option value="0.75">75% — mostly done</option><option value="0.5">50% — half done</option><option value="0.25">25% — started</option></select>
      <label>Proof link</label><input name="proof_url" type="url" placeholder="https://" /><label>Or a note</label><textarea name="proof_note" /></>,
      async (fd) => { await api('POST', `/api/items/${id}/deliver`, { ...fd, delivery_fraction: Number(fd.delivery_fraction) }, { idem: key }); toast('Delivered. Your raters were asked.'); reload(); });
  };
  const confirmDelivery = (it) => {
    const df = it.delivery_fraction != null ? it.delivery_fraction : 1;
    modal(<><h3>Confirm delivery</h3><p className="small muted">{it.title}</p><p className="small">Proposed: <b>{Math.round(df * 100)}%</b> by {w.person.name}</p>
      <label>Your assessment</label>
      <select name="delivery_fraction" defaultValue={String(df)}><option value="1">100%</option><option value="0.75">75%</option><option value="0.5">50%</option><option value="0.25">25%</option><option value="0">0%</option></select>
      <label>Reason (required if overriding)</label><textarea name="reason" /></>,
      async (fd) => { await api('POST', `/api/items/${it.id}/confirm-delivery`, { delivery_fraction: Number(fd.delivery_fraction), reason: fd.reason || undefined }); toast('Delivery confirmed'); reload(); });
  };
  const block = (id) => {
    const key = idem();
    modal(<><h3>What is blocking you?</h3><label>Describe it</label><textarea name="description" required /></>,
      async (fd) => { await api('POST', `/api/items/${id}/block`, fd, { idem: key }); toast('Your manager can see this now'); reload(); });
  };
  const link = (id) => modal(<><h3>Which team priority does this support?</h3><select name="parent_item_id">{w.parentOptions.map((p) => <option key={p.id} value={p.id}>#{p.rank} {p.title}</option>)}</select></>,
    async (fd) => { await api('PATCH', `/api/items/${id}`, fd); reload(); });
  const addWork = () => {
    const key = idem();
    modal(<><h3>Add work</h3><label>Title (a result, not an activity)</label><input name="title" required maxLength={200} placeholder="e.g. 20 users connect the Gmail plug" />
      <label>Details</label><textarea name="details" />
      <label>Type</label><select name="kind"><option value="work">Planned work</option><option value="unplanned">Unplanned work</option><option value="helping">Helping others</option></select>
      {w.parentOptions.length > 0 && <><label>Supports a team priority</label><select name="parent_item_id"><option value="">–</option>{w.parentOptions.map((p) => <option key={p.id} value={p.id}>#{p.rank} {p.title}</option>)}</select></>}</>,
    async (fd) => { await api('POST', '/api/items', { ...fd, user_id: w.person.id, week: w.week, parent_item_id: fd.parent_item_id || undefined }, { idem: key }); reload(); });
  };
  const addLeave = () => modal(<><h3>Add a leave day</h3><label>Date</label><input type="date" name="day" required /></>, async (fd) => { await api('POST', '/api/leave', { days: [fd.day] }); reload(); });

  const itemRow = (it) => {
    const statusCls = it.status === 'delivered' ? 'good' : it.status === 'missed' ? 'bad' : it.status === 'blocked_external' ? 'warn' : '';
    const openBlocker = it.blockers.find((b) => !b.resolved_at);
    const parent = w.parentOptions.find((p) => p.id === it.parent_item_id);
    const acts = [];
    if (it.mine && it.status !== 'delivered') {
      if (it.status === 'planned') acts.push(<button key="start" onClick={(e) => run(e, async () => { await api('PATCH', `/api/items/${it.id}`, { status: 'in_progress' }); reload(); })}>Start</button>);
      acts.push(<button key="deliver" className="primary" onClick={() => deliver(it.id)}>Deliver</button>);
      if (!openBlocker) acts.push(<button key="block" onClick={() => block(it.id)}>I&apos;m blocked</button>);
      if (it.status !== 'missed') acts.push(<button key="missed" className="ghost" onClick={(e) => run(e, async () => { await api('PATCH', `/api/items/${it.id}`, { status: 'missed' }); reload(); })}>Missed</button>);
    }
    if (w.canRank && !it.mine && it.status === 'delivered' && !it.delivery_confirmed_by) acts.push(<button key="confirm" onClick={() => confirmDelivery(it)}>Confirm delivery</button>);
    if (openBlocker && (it.mine || w.canRank)) acts.push(<button key="unblock" onClick={(e) => run(e, async () => { await api('POST', `/api/blockers/${openBlocker.id}/resolve`, {}); reload(); })}>Blocker solved</button>);
    if (openBlocker && w.canRank && !it.mine) acts.push(<button key="external" onClick={(e) => run(e, async () => { if (confirm('Mark as blocked by others? It will not count against this person.')) { await api('POST', `/api/blockers/${openBlocker.id}/resolve`, { external: true }); reload(); } })}>Blocked by others</button>);
    if ((it.mine || w.canRank) && w.parentOptions.length && !it.parent_item_id) acts.push(<button key="link" className="ghost" onClick={() => link(it.id)}>Link to team priority</button>);
    if (!it.rank && (it.mine || w.canRank)) acts.push(<button key="delete" className="ghost danger" onClick={(e) => run(e, async () => { if (confirm('Remove this item?')) { await api('DELETE', `/api/items/${it.id}`); reload(); } })}>Remove</button>);
    return (
      <div className="item" key={it.id}>
        <div className={`rank ${it.rank ? `r${Math.min(it.rank, 3)}` : ''}`}>{it.rank ? <>#{it.rank}<small>{weights[it.rank - 1]}%</small></> : '–'}</div>
        <div>
          <h3>{it.title} {it.stretch && <span className="pill acc star">Stretch</span>}</h3>
          <div>
            <span className={`pill ${statusCls}`}>{STATUS[it.status]}</span>
            {it.kind !== 'work' && <span className="pill">{it.kind === 'helping' ? 'Helping others' : 'Unplanned'}</span>}
            {parent && <span className="pill"><Ph name="arrow-up-right" />Supports: {parent.title}</span>}
          </div>
          {it.details && <p className="small muted">{it.details}</p>}
          {it.status === 'delivered' && it.delivery_fraction != null && it.delivery_fraction < 1 && <span className="pill">{Math.round(it.delivery_fraction * 100)}% delivered</span>}
          {it.status === 'delivered' && it.delivery_confirmed_by && <span className="pill good">Confirmed</span>}
          {(it.proof_url || it.proof_note) && <p className="small">Proof ({it.proof_source || 'self-reported'}): {it.proof_url && <><a href={it.proof_url} target="_blank" rel="noopener noreferrer">{it.proof_url}</a> </>}{it.proof_note || ''}</p>}
          {openBlocker && <p className="small" style={{ color: 'var(--warn)' }}>Blocked: {openBlocker.description} · since {fmtTime(openBlocker.raised_at)}{openBlocker.claimed_by ? ` · ${openBlocker.claimed_by} is on it` : openBlocker.escalated ? ' · escalated' : ''}</p>}
          {it.ratings.length ? (
            <div>{it.ratings.map((r) => <span key={r.id}><span className={`pill ${QCLASS[r.quality]}`} title={r.note || ''}>{r.rater}: {QUALITY[r.quality]}</span>{it.mine && <> <a href="#" className="small" onClick={(e) => dispute(e, r.id)}>dispute</a></>} </span>)}</div>
          ) : it.status === 'delivered' ? <p className="small muted">Waiting for rating</p> : null}
        </div>
        <div className="actions">{acts}</div>
      </div>
    );
  };

  return (
    <>
      <div className="hello">
        <CairnArt />
        <div className="who">
          {!w.isSelf && <Avatar name={w.person.name} size="lg" pic={w.person.avatar} />}
          <div><h1>{w.isSelf ? `${greet}, ${me.user.name.split(' ')[0]}` : `${w.person.name}'s week`}</h1><p>{w.isSelf ? 'My Week · ' : ''}{fmtWeek(w.week)}{w.manager ? ` · ranked by ${w.manager.name}` : ''}</p></div>
        </div>
        <div className="row"><Link className="btn" href={nav(-7)}><Ph name="arrow-left" />Previous</Link><WeekPick week={w.week} /><Link className="btn" href={nav(7)}>Next<Ph name="arrow-right" /></Link></div>
      </div>
      <div className="grid">
        <div className="tile has-ring"><div><span className="tile-ico t-acc"><Icon name="score" /></span><div className="k">Priority score</div><div className="v">{w.scoreLow != null ? `${w.scoreLow} – ${w.scoreHigh}` : scoreText(w.score)}</div><div className="s">{w.pending ? `${w.pending} rating${w.pending > 1 ? 's' : ''} pending` : 'out of 100'}</div></div><Ring score={w.scoreLow != null ? w.scoreHigh : w.score} /></div>
        <div className="tile"><span className="tile-ico t-good"><Icon name="check" /></span><div className="k">Quality</div><div className="v">{w.quality.done_well}<span className="small muted"> / {w.quality.done_well + w.quality.needs_fixes + w.quality.redo}</span></div><div className="s">rated &quot;Done well&quot;</div></div>
        <div className="tile"><span className="tile-ico t-warn"><Icon name="coins" /></span><div className="k">Coins received</div><div className="v">{w.coins}</div><div className="s">shown beside the score, never added</div></div>
        <div className="tile"><span className="tile-ico t-teal"><Icon name="link" /></span><div className="k">Alignment</div><div className="v">{w.alignment === null ? '–' : `${w.alignment}%`}</div><div className="s">of priority weight linked upward</div></div>
      </div>
      <div className="card"><div className="row spread" style={{ marginBottom: 'var(--space-100)' }}><h2 style={{ margin: 0 }}>Your stack</h2><span className="small muted">Each slab is as wide as its weight</span></div><Stack items={ranked} settings={me.settings} /></div>
      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Ranked priorities {w.locked ? <span className="pill good">🔒 Locked</span> : <span className="pill warn">Not locked yet</span>}</h2>
          <div className="row">{w.canRank && <>
            <button className="primary" onClick={() => setRanking(true)}>{w.locked ? 'Change ranking' : 'Rank this week'}</button>
            {!w.locked && ranked.length > 0 && <button onClick={(e) => run(e, async () => { await api('POST', '/api/stacks/lock', { user_id: w.person.id, week: w.week }, { idem: idem() }); toast('Week locked'); reload(); })}>Lock week</button>}
          </>}</div>
        </div>
        {ranked.length ? ranked.map(itemRow) : <Empty title="Nothing ranked yet" text={w.canRank ? 'Add work below, then rank the top items. The first one counts the most.' : 'Your manager has not ranked this week yet. Add what you plan to work on below.'} />}
      </div>
      {w.disagreements && w.disagreements.length > 0 && (
        <div className="card" style={{ borderLeft: '3px solid var(--warn)' }}>
          <h3 style={{ margin: 0, color: 'var(--warn)' }}>Rater disagreement</h3>
          <p className="small muted">The following items have significantly different ratings from the two raters. Please discuss and resolve.</p>
          {w.disagreements.map((d) => <p key={d.item_id} className="small">#{d.rank} {d.title}: {d.ratings.map((r) => `${r.rater_name} → ${QUALITY[r.quality]}`).join(' vs ')}</p>)}
        </div>
      )}
      {unranked.filter((i) => i.kind !== 'work').length > 0 && (
        <div className="card">
          <h2 style={{ margin: 0 }}>Unplanned contributions</h2>
          <p className="small muted">Recognised separately. These do not affect the priority score.</p>
          {unranked.filter((i) => i.kind !== 'work').map(itemRow)}
        </div>
      )}
      <div className="card">
        <div className="row spread"><h2 style={{ margin: 0 }}>Not ranked <span className="small muted">(logged, earns 0)</span></h2>
          {(w.isSelf || w.canRank) && <button onClick={addWork}>+ Add work</button>}</div>
        {unranked.filter((i) => i.kind === 'work').length ? unranked.filter((i) => i.kind === 'work').map(itemRow) : <p className="muted small">Nothing here.</p>}
      </div>
      {w.leave.days.length > 0 && <p className="small muted">Leave this week: {w.leave.days.join(', ')} (expectations reduced to {w.leave.available} of {w.leave.working} working days)</p>}
      {w.isSelf && <button className="ghost small" onClick={addLeave}>Add a leave day</button>}
      {w.isSelf && (
        <div style={{ marginTop: 'var(--space-100)' }}>
          <button className="ghost small" onClick={() => setShowRetro(true)}>
            {retroExisting ? '✏️ Edit retrospective' : '📝 Add weekly retrospective'}
          </button>
          {retroExisting && (
            <details className="card" style={{ marginTop: 'var(--space-100)' }}>
              <summary className="small muted" style={{ cursor: 'pointer' }}>Retrospective · {w.week}</summary>
              <p className="small"><b>Went well:</b> {retroExisting.went_well || '–'}</p>
              <p className="small"><b>Slowed down:</b> {retroExisting.slowed_down || '–'}</p>
              <p className="small"><b>Do differently:</b> {retroExisting.do_differently || '–'}</p>
            </details>
          )}
        </div>
      )}
      {ranking && <RankEditor w={w} people={people} onClose={() => setRanking(false)} onSaved={reload} />}
      {showRetro && <RetroModal week={w.week} existing={retroExisting} onClose={() => { setShowRetro(false); reload(); }} />}
    </>
  );
}
