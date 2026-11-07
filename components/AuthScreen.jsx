'use client';
// Sign in, create a workspace, join from an invite, forgot password and set a new password.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp } from './AppState';
import { CairnArt, Logo, Ph, brand } from './ui';
import { api } from '@/lib/client';

/** A password field with a show / hide button. */
function Password(props) {
  const [show, setShow] = useState(false);
  const ref = useRef(null);
  return (
    <div className="pw">
      <input ref={ref} {...props} type={show ? 'text' : 'password'} />
      <button type="button" className="pw-eye" aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} onClick={() => { setShow(!show); ref.current?.focus(); }}>
        {show
          ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
          : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></svg>}
      </button>
    </div>
  );
}

const POINTS = [['Ranked, not counted', "Only your manager's top five priorities score."], ['Rated in the open', 'Two raters on the biggest work, with reasons.'], ['Open formula', 'Everyone can read how the score works.']];
const formValues = (e) => Object.fromEntries(new FormData(e.currentTarget).entries());

export default function AuthScreen({ mode, token }) {
  const { me, loadMe } = useApp();
  const router = useRouter();
  const params = useSearchParams();
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [choose, setChoose] = useState(null); // workspaces to pick from when one email is in several
  const [sentMsg, setSentMsg] = useState('');
  const [invite, setInvite] = useState(null);
  const [recErr, setRecErr] = useState('');
  const tz = typeof Intl !== 'undefined' ? Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' : 'UTC';

  // Already signed in: sign in and sign up go straight to the week.
  useEffect(() => { if (me && (mode === 'signin' || mode === 'signup')) router.replace('/week'); }, [me, mode, router]);
  useEffect(() => {
    if (mode !== 'join') return;
    api('GET', `/api/invites/${encodeURIComponent(token)}`).then(setInvite).catch((e) => setErr(e.message));
  }, [mode, token]);

  const submit = async (e) => {
    e.preventDefault();
    const fd = formValues(e);
    setBusy(true); setErr('');
    try {
      if (mode === 'forgot') { const r = await api('POST', '/api/auth/forgot', fd); setSentMsg(r.message); return; }
      if (mode === 'reset') {
        if (fd.password !== fd.again) throw new Error('The two passwords are not the same');
        await api('POST', `/api/auth/reset/${encodeURIComponent(token)}`, { password: fd.password });
        router.replace('/signin?reset=1'); return;
      }
      if (mode === 'signup') await api('POST', '/api/auth/signup', fd);
      else if (mode === 'join') await api('POST', `/api/invites/${encodeURIComponent(token)}/accept`, fd);
      else {
        const r = await api('POST', '/api/auth/login', fd);
        if (r.chooseWorkspace) { setChoose(r.chooseWorkspace); return; }
      }
      await loadMe();
      router.replace('/week');
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const recover = async (e) => {
    e.preventDefault();
    setRecErr('');
    try {
      const r = await api('POST', '/api/auth/recover', formValues(e));
      if (r.chooseWorkspace) { setRecErr('That email is in more than one workspace. Use a different email, or ask an admin of the workspace for a link.'); return; }
      router.push(r.link);
    } catch (x) { setRecErr(x.message); }
  };

  const label = { signup: 'Create workspace', join: 'Join', forgot: 'Send reset link', reset: 'Save new password', signin: 'Sign in' }[mode];
  let fields;
  if (mode === 'signup') fields = (<>
    <label htmlFor="a-company">Company name</label><input id="a-company" name="company" required maxLength={120} />
    <label htmlFor="a-name">Your name</label><input id="a-name" name="name" required maxLength={120} />
    <label htmlFor="a-email">Work email</label><input id="a-email" name="email" type="email" required autoComplete="email" />
    <label htmlFor="a-pw">Password (10+ characters)</label><Password id="a-pw" name="password" minLength={10} required autoComplete="new-password" />
    <label htmlFor="a-dom">Only allow emails from this domain (optional)</label><input id="a-dom" name="allowed_domain" placeholder="yourcompany.com" />
    <label htmlFor="a-tz">Time zone</label><input id="a-tz" name="timezone" defaultValue={tz} />
  </>);
  else if (mode === 'join') fields = (<>
    {invite && <p>You&apos;re invited to <b>{invite.workspace}</b> as {invite.email}.</p>}
    <label htmlFor="a-name">Your name</label><input id="a-name" name="name" required maxLength={120} />
    <label htmlFor="a-pw">Choose a password (10+ characters)</label><Password id="a-pw" name="password" minLength={10} required autoComplete="new-password" />
  </>);
  else if (mode === 'forgot') fields = (<>
    <p className="small muted">Enter your work email. If it has an account, we send a reset link as a Slack message when Slack is connected. Otherwise ask your admin or manager for a link.</p>
    <label htmlFor="a-email">Work email</label><input id="a-email" name="email" type="email" required autoComplete="email" />
  </>);
  else if (mode === 'reset') fields = (<>
    <p className="small muted">Choose a new password. This signs you out everywhere else.</p>
    <label htmlFor="a-pw">New password (10+ characters)</label><Password id="a-pw" name="password" minLength={10} required autoComplete="new-password" />
    <label htmlFor="a-pw2">Type it again</label><Password id="a-pw2" name="again" minLength={10} required autoComplete="new-password" />
  </>);
  else fields = (<>
    <label htmlFor="a-email">Email</label><input id="a-email" name="email" type="email" required autoComplete="email" />
    <label className="pwlab" htmlFor="a-pw">Password <Link href="/forgot" className="forgot">Forgot password?</Link></label><Password id="a-pw" name="password" required autoComplete="current-password" />
    {params.get('reset') && <p className="notice ok">Password updated. Sign in with your new password.</p>}
    {choose && <><label htmlFor="a-ws">Workspace</label><select id="a-ws" name="workspace_id">{choose.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></>}
  </>);

  return (
    <div id="app">
      <div className="auth2">
        <aside className="auth-art" aria-hidden="true">
          <div className="auth-art-in"><CairnArt /><h2>Measure what mattered.</h2>
            <ul>{POINTS.map(([t, d]) => <li key={t}><Ph name="check-circle" /><div><b>{t}</b><span>{d}</span></div></li>)}</ul>
          </div>
        </aside>
        <div className="auth">
          <Link className="back" href="/home"><Ph name="arrow-left" />Back to home</Link>
          <Link className="brand" href="/home"><Logo />{brand.name}</Link>
          <p className="muted">{brand.tagline} Measure the value of work, not the number of tasks.</p>
          {(mode === 'signin' || mode === 'signup') && (
            <div className="tabs">
              <button className={mode === 'signin' ? 'on' : ''} onClick={() => router.push('/signin')}>Sign in</button>
              <button className={mode === 'signup' ? 'on' : ''} onClick={() => router.push('/signup')}>Create a workspace</button>
            </div>
          )}
          {mode === 'forgot' && <h2 className="auth-h">Forgot your password?</h2>}
          {mode === 'reset' && <h2 className="auth-h">Set a new password</h2>}
          {sentMsg ? (
            <div className="card"><p className="notice ok">{sentMsg}</p><Link className="btn" href="/signin">Back to sign in</Link></div>
          ) : (
            <form className="card" id="authform" onSubmit={submit}>
              {fields}
              <p className="err" id="autherr">{err}</p>
              <button className="primary" disabled={busy}>{label}</button>
              {(mode === 'forgot' || mode === 'reset') && <Link className="back back-center" href="/signin"><Ph name="arrow-left" />Back to sign in</Link>}
            </form>
          )}
          {mode === 'forgot' && (
            <details className="recover"><summary>I run this server: use my recovery key</summary>
              <form onSubmit={recover}>
                <label htmlFor="r-email">Email of the locked-out account</label><input id="r-email" name="email" type="email" required />
                <label htmlFor="r-key">Recovery key</label><Password id="r-key" name="key" required autoComplete="off" />
                <p className="err">{recErr}</p>
                <button className="primary">Get a reset link</button>
              </form>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
