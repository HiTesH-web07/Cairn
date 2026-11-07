'use client';
// Dialog where a manager orders a person's top priorities, marks stretch items and picks second raters.
import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/components/AppState';
import { Ph } from '@/components/ui';
import { api, idem } from '@/lib/client';

export default function RankEditor({ w, people, onClose, onSaved }) {
  const { me, toast } = useApp();
  const ref = useRef(null);
  const max = me.settings.rankWeights.length;
  const second = me.settings.secondRaterRanks;
  const [order, setOrder] = useState(() => w.items.filter((i) => i.rank).sort((a, b) => a.rank - b.rank).map((i) => ({ item_id: i.id, stretch: !!i.stretch, second_rater_id: i.second_rater_id || '' })));
  const [reason, setReason] = useState('');
  const [err, setErr] = useState('');
  const title = (id) => w.items.find((i) => i.id === id).title;
  const others = people.filter((p) => p.id !== w.person.id);
  const pool = w.items.filter((i) => !order.find((o) => o.item_id === i.id) && i.status !== 'blocked_external');

  useEffect(() => { ref.current?.showModal(); }, []);
  const swap = (a, b) => setOrder((o) => { const n = [...o]; [n[a], n[b]] = [n[b], n[a]]; return n; });
  const patch = (i, p) => setOrder((o) => o.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = async () => {
    try {
      await api('POST', '/api/stacks/rank', { user_id: w.person.id, week: w.week, reason: w.locked ? reason : undefined, order: order.map((o) => ({ ...o, second_rater_id: o.second_rater_id || undefined })) }, { idem: idem() });
      ref.current?.close();
      toast('Ranking saved');
      onSaved();
    } catch (e) { setErr(e.message); }
  };

  return (
    <dialog ref={ref} onClose={onClose}>
      <h3>Rank {w.person.name}&apos;s week</h3>
      <p className="small muted">Top {max} only. #1 is worth {me.settings.rankWeights[0]}%. Items ranked #1–#{second} also get a second rater.</p>
      {order.length ? order.map((o, i) => (
        <div className="card" style={{ padding: 'var(--space-75) var(--space-100)' }} key={o.item_id}>
          <div className="row spread"><b>#{i + 1} · {title(o.item_id)}</b>
            <div className="row">
              <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => swap(i - 1, i)}><Ph name="arrow-up" /></button>
              <button type="button" aria-label="Move down" disabled={i === order.length - 1} onClick={() => swap(i, i + 1)}><Ph name="arrow-down" /></button>
              <button type="button" className="ghost danger" onClick={() => setOrder((x) => x.filter((_, k) => k !== i))}>✕</button>
            </div>
          </div>
          <div className="row small"><label style={{ margin: 0 }}><input type="checkbox" checked={o.stretch} style={{ width: 'auto' }} onChange={(e) => patch(i, { stretch: e.target.checked })} /> <span className="star-i" /> Stretch (above level: bonus, no penalty)</label></div>
          {i < second && (
            <>
              <label>Second rater (someone who uses this work; default: your own manager)</label>
              <select value={o.second_rater_id} onChange={(e) => patch(i, { second_rater_id: e.target.value })}>
                <option value="">Default</option>
                {others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </>
          )}
        </div>
      )) : <p className="muted">Nothing ranked.</p>}
      {pool.length > 0 && order.length < max && (
        <>
          <label>Add to ranking</label>
          <select value="" onChange={(e) => { if (e.target.value) setOrder((o) => [...o, { item_id: e.target.value, stretch: false, second_rater_id: '' }]); }}>
            <option value="">Choose…</option>
            {pool.map((i) => <option key={i.id} value={i.id}>{i.title}</option>)}
          </select>
        </>
      )}
      {w.locked && <><label>Reason for changing a locked week (kept in the history log)</label><input required value={reason} onChange={(e) => setReason(e.target.value)} /></>}
      <p className="err">{err}</p>
      <div className="row" style={{ justifyContent: 'flex-end' }}>
        <button type="button" onClick={() => ref.current?.close()}>Cancel</button>
        <button className="primary" type="button" onClick={save}>Save ranking</button>
      </div>
    </dialog>
  );
}
