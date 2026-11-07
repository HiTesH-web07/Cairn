'use client';
// History log: every change, which can never be edited or deleted.
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Head } from '@/components/ui';
import { api, fmtTime, isAdmin } from '@/lib/client';

const reasonOf = (json) => { try { return JSON.parse(json).reason || ''; } catch { return ''; } };

export default function AuditPage() {
  const { me } = useApp();
  const { data: a, error } = useScreen(() => api('GET', '/api/audit'));
  if (!a) return <ScreenStatus error={error} />;
  return (
    <>
      <Head eyebrow="Reference" title="History log" sub={`${isAdmin(me) ? 'Every change in the workspace.' : 'Your own changes.'} Entries can never be edited or deleted.`} />
      <div className="card tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
        {a.entries.map((x, k) => <tr key={k}><td className="small">{fmtTime(x.created_at)}</td><td>{x.actor || ''}</td><td><code>{x.action}</code>{x.action === 'stack.changed_after_lock' && x.detail_json ? ` · reason: ${reasonOf(x.detail_json)}` : ''}</td></tr>)}
      </tbody></table></div>
    </>
  );
}
