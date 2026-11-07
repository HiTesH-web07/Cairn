'use client';
// Rate Work: everything waiting for this person's rating.
import { useEffect, useRef } from 'react';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, Empty, Head } from '@/components/ui';
import { api } from '@/lib/client';

export default function RatePage() {
  const { setPending } = useApp();
  const { data, error, reload } = useScreen(() => api('GET', '/api/ratings/pending'));
  useEffect(() => { if (data) setPending(data.items.length); }, [data, setPending]);
  return (
    <>
      <Head eyebrow="Review" title="Rate work" sub="Rate the result, not the person. Needs fixes and Redo need a note." />
      {!data ? <ScreenStatus error={error} />
        : data.items.length ? data.items.map((it) => <RateCard key={it.id} it={it} reload={reload} />)
          : <div className="card"><Empty title="All caught up" text="Nothing is waiting for your rating. New work appears here as soon as someone delivers it." /></div>}
    </>
  );
}

function RateCard({ it, reload }) {
  const { run, toast } = useApp();
  const note = useRef(null);
  const rate = (e, quality) => run(e, async () => {
    await api('POST', `/api/items/${it.id}/rate`, { quality, note: note.current.value || undefined }, { idem: `rate-${it.id}` });
    toast('Rating saved');
    reload();
  });
  return (
    <div className="card">
      <div className="who" style={{ alignItems: 'flex-start' }}>
        <Avatar name={it.owner.name} size="lg" pic={it.owner.avatar} />
        <div style={{ flex: 1 }}>
          <div className="row spread"><div><h3>{it.title}</h3>
            <p className="small muted">{it.owner.name}{it.owner.level ? ` · ${it.owner.level}` : ''} · {it.rank ? `ranked #${it.rank} (${it.weight}%)` : 'not ranked'}{it.stretch ? ' · Stretch' : ''} · you are the {it.as === 'primary' ? 'main' : 'second'} rater</p></div></div>
          {it.details && <p className="small">{it.details}</p>}
          <p>Proof: {it.proof_url && <><a href={it.proof_url} target="_blank" rel="noopener noreferrer">{it.proof_url}</a> </>}{it.proof_note || ''}</p>
          <label>Note (required for Needs fixes and Redo)</label><textarea className="note" ref={note} />
          <div className="row" style={{ marginTop: 'var(--space-75)' }}>
            <button className="q q-good" onClick={(e) => rate(e, 'done_well')}><i />Done well</button>
            <button className="q q-warn" onClick={(e) => rate(e, 'needs_fixes')}><i />Needs fixes</button>
            <button className="q q-bad" onClick={(e) => rate(e, 'redo')}><i />Redo</button>
          </div>
        </div>
      </div>
    </div>
  );
}
