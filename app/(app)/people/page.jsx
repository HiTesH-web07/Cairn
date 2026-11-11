'use client';
// People: everyone in the workspace and who they report to. Add, edit, import, offboard, bring back.
import Link from 'next/link';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, Head } from '@/components/ui';
import { openImport } from '@/components/people/ImportDialog';
import { api, canAddPeople, downloadCsv, idem, isAdmin } from '@/lib/client';

// Info dialogs open after the previous dialog has finished closing.
const later = (fn) => setTimeout(fn, 80);
const LinkBox = ({ value }) => <input readOnly value={value} onClick={(e) => e.currentTarget.select()} />;

export default function PeoplePage() {
  const app = useApp();
  const { me: state, modal, toast, run } = app;
  const { data, error, reload } = useScreen(() => Promise.all([api('GET', '/api/people'), api('GET', '/api/directory'), api('GET', '/api/people/former')]));
  if (!data) return <ScreenStatus error={error} />;
  const [p, dir, former] = data;
  const byId = Object.fromEntries(dir.people.map((x) => [x.id, x.name]));
  const admin = isAdmin(state);
  const adder = canAddPeople(state);
  const me = state.user.id;
  const src = state.settings.peopleSource;
  const team = p.people; // admins: everyone; managers: themselves and their team

  const managerOptions = (exclude) => (admin ? dir.people : team).filter((x) => x.id !== exclude).map((x) => <option key={x.id} value={x.id}>{x.name}</option>);

  const resetLink = (e, u) => run(e, async () => {
    const r = await api('POST', `/api/people/${u.id}/reset-link`, {});
    modal(<><h3>Password reset link</h3><p className="small muted">Send this to them privately. It works once and expires in 24 hours. Opening it lets them choose a new password and signs them out everywhere else.</p><LinkBox value={location.origin + r.link} /></>, async () => {});
  });
  const inviteLink = (e, u) => run(e, async () => {
    const r = await api('POST', `/api/people/${u.id}/invite-link`, {});
    modal(<><h3>New invite link</h3><p className="small muted">The old link no longer works. This one expires in 30 days.</p><LinkBox value={location.origin + r.link} /></>, async () => {});
  });
  const offboard = (u) => {
    const reports = team.filter((x) => x.reports_to === u.id);
    modal(<><h3>{u.name} left the company</h3><p className="small">They can no longer sign in. Their past work, ratings and coins stay on record.</p>
      {reports.length ? <><label>Their {reports.length} team member(s) now report to</label><select name="new_manager_id" defaultValue={u.reports_to || me}>{managerOptions(u.id)}</select></> : <p className="small muted">Nobody reports to them.</p>}</>,
    async (fd) => { await api('POST', `/api/people/${u.id}/offboard`, fd, { idem: idem() }); toast(`${u.name} marked as left`); reload(); });
  };
  const bringBack = (u) => modal(<><h3>Bring back {u.name}</h3><label>Reports to</label><select name="reports_to" defaultValue={me}>{managerOptions()}</select></>,
    async (fd) => { await api('POST', `/api/people/${u.id}/reactivate`, fd); toast('Welcome back'); reload(); });
  const edit = (u) => {
    const roles = admin ? ['member', 'manager', 'admin', 'owner'] : ['member', 'manager'];
    modal(<><h3>Edit {u.name}</h3><label>Role</label><select name="role" defaultValue={u.role}>{roles.map((r) => <option key={r}>{r}</option>)}</select>
      <label>Reports to (moving teams)</label><select name="reports_to" defaultValue={u.reports_to || ''}>{admin && <option value="">Nobody (top)</option>}{managerOptions(u.id)}</select>
      <div className="inline"><div><label>Level</label><input name="level" defaultValue={u.level || ''} /></div><div><label>Department</label><input name="department" defaultValue={u.department || ''} /></div></div>
      <label>Phone for serious alerts (country code, no +)</label><input name="phone" defaultValue={u.phone || ''} /></>,
    async (fd) => { await api('PATCH', `/api/people/${u.id}`, { ...fd, reports_to: fd.reports_to || null }); toast('Saved'); reload(); });
  };
  const invite = () => {
    const key = idem();
    modal(<><h3>Add a person</h3><label>Work email</label><input name="email" type="email" required /><label>Name</label><input name="name" maxLength={120} />
      <label>Role</label><select name="role"><option value="member">Member</option><option value="manager">Manager / TL (can add their own team)</option>{admin && <option value="admin">Admin</option>}</select>
      <label>Reports to</label><select name="reports_to" defaultValue={me}>{managerOptions()}</select>
      <div className="inline"><div><label>Level</label><input name="level" placeholder="Intern, Junior, Senior…" /></div><div><label>Department</label><input name="department" placeholder="ISE, Marketing…" /></div></div></>,
    async (fd) => {
      const r = await api('POST', '/api/invites', fd, { idem: key });
      const link = location.origin + r.link;
      reload();
      later(() => modal(<><h3>Invite link</h3><p className="small muted">Send this link to them. It works once and expires in 14 days.</p><LinkBox value={link} /></>, async () => {}));
    });
  };
  const importPeople = () => openImport(modal, {
    title: 'Import people', endpoint: '/api/people/import',
    help: <>Columns: <code>email, name, role, level, department, manager_email, phone</code>. Role is member or manager{admin ? ' (or admin)' : ''}. Existing people are updated, not duplicated. People without a manager in the file report to you. Any other column, such as salary, is ignored.</>,
    template: [['email', 'name', 'role', 'level', 'department', 'manager_email', 'phone'], ['tl@yourcompany.com', 'Amit', 'manager', 'Lead', 'ISE', '', '919876543210'], ['riya@yourcompany.com', 'Riya', 'member', 'Intern', 'ISE', 'tl@yourcompany.com', '']],
    pick: (r) => ({ email: r.email, name: r.name, role: r.role, level: r.level, department: r.department, manager_email: r.manager_email || r.manager || r.reports_to, phone: r.phone }),
    done: (res) => {
      reload();
      if (res.links && res.links.length) {
        const rowsOut = [['email', 'name', 'invite_link'], ...res.links.map((l) => [l.email, l.name, location.origin + l.link])];
        later(() => modal(<><h3>{res.new} new, {res.updated} updated</h3><p className="small muted">New people need their own link to set a password. Links work once and expire in 30 days.</p><button type="button" id="dl" onClick={() => downloadCsv('invite-links.csv', rowsOut)}>Download invite links (CSV)</button></>, async () => {}));
      } else toast(`${res.updated} people updated`);
    },
  });
  const importLeave = () => openImport(modal, {
    title: 'Import leave', endpoint: '/api/leave/import', noDryRun: true,
    help: <>Columns: <code>email, date</code> with one row per day off, dates as YYYY-MM-DD. Expectations for those weeks go down automatically.</>,
    template: [['email', 'date'], ['riya@yourcompany.com', '2026-11-12']],
    pick: (r) => ({ email: r.email, date: r.date }),
    done: (res) => toast(`${res.imported} leave days added`),
  });

  const rowActs = (u) => {
    // Same rule as the server: an owner is changed only by an owner, an admin only by an admin.
    if (u.id === me || !adder || (u.role === 'owner' && state.user.role !== 'owner') || (u.role === 'admin' && !admin)) return null;
    return (
      <>
        <button onClick={() => edit(u)}>Edit</button>{' '}
        {!u.joined ? <button onClick={(e) => inviteLink(e, u)}>New invite link</button> : <button onClick={(e) => resetLink(e, u)}>Reset password</button>}{' '}
        <button className="ghost danger" onClick={() => offboard(u)}>Left the company</button>
      </>
    );
  };

  return (
    <>
      <Head eyebrow="Manage" title="People" sub="Everyone in the workspace, and who they report to."
        right={adder && <><button id="importp" onClick={importPeople}>Import (CSV)</button><button id="importl" onClick={importLeave}>Import leave (CSV)</button><button className="primary" id="invite" onClick={invite}>+ Add person</button></>} />
      <p className="small muted">{admin
        ? <>Add your managers and TLs; {state.settings.managersAddTeam ? 'each of them adds and looks after their own team' : 'only admins add people in this workspace'}. People come from: <b>{src === 'keka' ? 'Keka sync' : src === 'csv' ? 'CSV upload' : 'invite links'}</b> · <Link href="/settings">Settings</Link></>
        : adder ? 'Add the people in your team. You can update, move within your team, or mark people who left.' : 'Ask your manager or an admin to add or change people.'}</p>
      <div className="card tablewrap"><table><thead><tr><th>Name</th><th>Role</th><th>Level</th><th>Department</th><th>Reports to</th><th>Phone</th>{adder && <th />}</tr></thead><tbody>
        {team.map((u) => (
          <tr key={u.id}><td><div className="who"><Avatar name={u.name} pic={u.avatar} /><div><Link href={`/week?user=${encodeURIComponent(u.id)}`}>{u.name}</Link> {!u.joined && <span className="pill warn">invited</span>}<small>{u.email}</small></div></div></td>
            <td>{u.role}</td><td>{u.level || ''}</td><td>{u.department || ''}</td><td>{byId[u.reports_to] || '–'}</td><td>{u.phone || ''}</td>
            {adder && <td><div className="actions">{rowActs(u)}</div></td>}</tr>
        ))}
      </tbody></table></div>
      {former.people.length > 0 && <>
        <h2>Former people</h2><p className="small muted">They cannot sign in. Their past weeks, ratings and coins stay on record.</p>
        <div className="card tablewrap"><table><tbody>
          {former.people.map((u) => <tr key={u.id}><td><div className="who"><Avatar name={u.name} pic={u.avatar} /><div>{u.name}<small>{u.email}</small></div></div></td><td>{u.level || ''}</td><td>{u.department || ''}</td><td>{adder && <button onClick={() => bringBack(u)}>Bring back</button>}</td></tr>)}
        </tbody></table></div>
      </>}
      <p className="small muted">New joiners: add them here or by CSV. Leavers: &quot;Left the company&quot; moves their team to a new manager. Team changes: Edit, then Reports to.</p>
    </>
  );
}
