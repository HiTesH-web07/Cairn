'use client';
// The signed-in frame: side navigation, top bar on phones, the profile card and Ask Cairn.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from './AppState';
import { Avatar, Icon, Logo, Ph, Skeleton, ThemeButton, brand } from './ui';
import AskCairn from './AskCairn';
import { api, canAddPeople, isAdmin, isManager } from '@/lib/client';

const NAV = [
  ['label', 'Work'],
  ['week', 'My Week', () => true],
  ['rate', 'Rate Work', () => true],
  ['team', 'Team', isManager],
  ['score', 'Scorecard', () => true],
  ['coins', 'Coins', () => true],
  ['disputes', 'Disputes', () => true],
  ['incidents', 'Incidents', isManager],
  ['label', 'Manage'],
  ['people', 'People', (me) => isManager(me) || canAddPeople(me)],
  ['integrations', 'Integrations', isAdmin],
  ['settings', 'Settings', isAdmin],
  ['label', 'Reference'],
  ['audit', 'History log', () => true],
  ['profile', 'My profile', () => true],
  ['how', 'How we score', () => true],
  ['home', 'Home page', () => true],
];

export default function AppShell({ children }) {
  const { me, setMe, pending } = useApp();
  const router = useRouter();
  const pathname = usePathname();
  const active = pathname.split('/')[1] || 'week';
  const [open, setOpen] = useState(false);
  const mainRef = useRef(null);

  useEffect(() => { if (me === null) router.replace('/signin'); }, [me, router]);
  useEffect(() => { setOpen(false); window.scrollTo(0, 0); }, [pathname]);

  if (!me) return <div id="app"><p className="boot">Loading…</p></div>;

  const links = [];
  let label = null;
  for (const n of NAV) {
    if (n[0] === 'label') { label = n[1]; continue; }
    if (!n[2](me)) continue;
    if (label) { links.push(<div className="navlabel" key={`l-${label}`}>{label}</div>); label = null; }
    const on = n[0] === active;
    links.push(
      <Link key={n[0]} href={`/${n[0]}`} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined}>
        <Icon name={n[0]} /><span>{n[1]}</span>{n[0] === 'rate' && pending > 0 && <span className="badge">{pending}</span>}
      </Link>,
    );
  }
  const signOut = async () => { await api('POST', '/api/auth/logout'); setMe(null); router.replace('/home'); };
  const u = me.user;
  return (
    <div id="app">
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}>Skip to content</a>
      <div className="topbar">
        <button className="ghost" aria-label="Open menu" aria-expanded={open} aria-controls="side" onClick={() => setOpen(!open)}><Ph name="list" /></button>
        <b>{brand.name}</b><ThemeButton />
      </div>
      <div className="shell">
        <nav className={`side ${open ? 'open' : ''}`} id="side" aria-label="Main">
          <div className="brand-row"><Link className="brand" href="/week" title="My Week"><Logo />{brand.name}</Link><ThemeButton /></div>
          <div className="ws"><span>Workspace</span><b>{me.workspace.name}</b></div>
          {links}
          <div className="me-card">
            <Link className="me-link" href="/profile" title="My profile"><Avatar name={u.name} pic={u.avatar} /><div className="me-t"><b>{u.name}</b><span>{u.role}</span></div></Link>
            <button className="ghost" title="Sign out" aria-label="Sign out" onClick={signOut}><Ph name="sign-out" /></button>
          </div>
        </nav>
        <main id="main" tabIndex={-1} ref={mainRef}>{children}</main>
      </div>
      {me.ai && <AskCairn key={u.id} />}
    </div>
  );
}

/**
 * Loads a screen's data and shows a skeleton meanwhile. `load()` runs again whenever `deps` change
 * or the screen calls `reload()`. Errors appear in a card instead of the screen.
 */
export function useScreen(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    load().then((data) => live && setState({ data, error: null })).catch((error) => live && setState({ data: null, error }));
    return () => { live = false; };
  }, [tick, ...deps]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: () => setTick((t) => t + 1) };
}
export function ScreenStatus({ error }) {
  if (error) return <div className="card"><p className="err">{error.message}</p></div>;
  return <Skeleton />;
}
