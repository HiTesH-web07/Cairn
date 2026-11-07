'use client';
// Disputes: a disputed rating goes to the rater's manager. Both versions stay on record.
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Empty, Head } from '@/components/ui';
import { QUALITY, api, fmtTime } from '@/lib/client';

export default function DisputesPage() {
  const { modal } = useApp();
  const { data: d, error, reload } = useScreen(() => api('GET', '/api/disputes'));
  if (!d) return <ScreenStatus error={error} />;
  const decide = (id) => modal(
    <><h3>Decide this dispute</h3><label>Decision</label><select name="decision"><option value="upheld">Keep the rating</option><option value="changed">Change the rating</option></select>
      <label>New rating (if changing)</label><select name="new_quality"><option value="done_well">Done well</option><option value="needs_fixes">Needs fixes</option><option value="redo">Redo</option></select>
      <label>Why</label><textarea name="note" required /></>,
    async (fd) => { await api('POST', `/api/disputes/${id}/resolve`, fd); reload(); });
  return (
    <>
      <Head eyebrow="Review" title="Disputes" sub="A disputed rating goes to the rater's manager. The original rating and the decision are both kept." />
      {d.disputes.length ? d.disputes.map((x) => (
        <div className="card" key={x.id}>
          <div className="row spread"><h3>{x.title}</h3><span className={`pill ${x.status === 'open' ? 'warn' : 'good'}`}>{x.status}</span></div>
          <p className="small muted">{x.owner_name} disputes {x.rater_name}&apos;s rating &quot;{QUALITY[x.original_quality]}&quot; · {fmtTime(x.created_at)}</p><p>&quot;{x.reason}&quot;</p>
          {x.status !== 'open' && <p className="small">Decision: {x.status === 'changed' ? `changed to ${QUALITY[x.new_quality]}` : 'rating kept'} · &quot;{x.resolution_note}&quot;</p>}
          {x.canResolve && <button className="primary" onClick={() => decide(x.id)}>Decide</button>}
        </div>
      )) : <div className="card"><Empty title="No disputes" text="If someone thinks a rating is unfair, they can raise it here. It goes to the rater's manager, and both versions are kept." /></div>}
    </>
  );
}
