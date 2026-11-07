'use client';
// Who is signed in, the toast line and form dialogs, shared by every screen.
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/client';

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

export function AppProvider({ children }) {
  const router = useRouter();
  const [me, setMe] = useState(undefined); // undefined = still checking, null = signed out
  const [pending, setPending] = useState(0);
  const [toastMsg, setToastMsg] = useState('');
  const [dialog, setDialog] = useState(null);
  const toastTimer = useRef(null);

  const loadMe = useCallback(async () => {
    const m = await api('GET', '/api/me');
    setMe(m);
    try { setPending((await api('GET', '/api/ratings/pending')).items.length); } catch { setPending(0); }
    return m;
  }, []);
  const refreshSession = useCallback(async () => {
    try {
      if ((await api('GET', '/api/session')).signedIn) return await loadMe();
    } catch { /* not signed in */ }
    setMe(null);
    return null;
  }, [loadMe]);
  useEffect(() => { refreshSession(); }, [refreshSession]);
  useEffect(() => {
    const out = () => { setMe(null); router.replace('/signin'); };
    window.addEventListener('cairn:signedout', out);
    return () => window.removeEventListener('cairn:signedout', out);
  }, [router]);

  const toast = useCallback((msg) => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 2600);
  }, []);
  /** Runs an action, disabling its button meanwhile, and shows any error as a toast. */
  const run = useCallback(async (e, fn) => {
    const btn = e && e.currentTarget;
    if (btn) btn.disabled = true;
    try { await fn(); } catch (err) { toast(err.message); } finally { if (btn) btn.disabled = false; }
  }, [toast]);
  /**
   * Opens a form dialog. `body` is JSX with named fields; `onSubmit(values)` saves them.
   * The dialog stays open and shows the error if saving fails.
   */
  const modal = useCallback((body, onSubmit, opts = {}) => setDialog({ body, onSubmit, opts, key: Date.now() }), []);

  const value = { me, setMe, pending, setPending, loadMe, refreshSession, toast, run, modal };
  return (
    <Ctx.Provider value={value}>
      {children}
      {dialog && <FormDialog key={dialog.key} {...dialog} onClose={() => setDialog(null)} />}
      <div id="toast" role="status" aria-live="polite" className={toastMsg ? 'on' : ''}>{toastMsg}</div>
    </Ctx.Provider>
  );
}

function FormDialog({ body, onSubmit, opts, onClose }) {
  const ref = useRef(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget).entries());
    setBusy(true); setErr('');
    try { await onSubmit(values); ref.current?.close(); } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  return (
    <dialog ref={ref} onClose={onClose} className={opts.className}>
      <form method="dialog" onSubmit={submit}>
        {body}
        <p className="err">{err}</p>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button value="cancel" type="button" onClick={() => ref.current?.close()}>Cancel</button>
          <button className="primary" value="ok" disabled={busy}>{opts.submitLabel || 'Save'}</button>
        </div>
      </form>
    </dialog>
  );
}
