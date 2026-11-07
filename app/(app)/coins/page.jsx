'use client';
// Coins: thank people whose work helped you. Coins sit beside the score and never change it.
import { useMemo, useState } from 'react';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Empty, Head } from '@/components/ui';
import { api, fmtTime, idem } from '@/lib/client';

export default function CoinsPage() {
  const { me, toast } = useApp();
  const { data, error, reload } = useScreen(() => Promise.all([api('GET', '/api/coins'), api('GET', '/api/directory')]));
  const [err, setErr] = useState('');
  const key = useMemo(() => idem(), [data]); // one key per form, so a double submit sends once
  if (!data) return <ScreenStatus error={error} />;
  const [c, dir] = data;
  const submit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.currentTarget).entries());
    try { await api('POST', '/api/coins', { ...fd, coins: Number(fd.coins) }, { idem: key }); toast('Coins sent'); setErr(''); reload(); } catch (x) { setErr(x.message); }
  };
  return (
    <>
      <Head eyebrow="Recognition" title="Coins" sub={<>Thank people whose work helped you. You have <b>{c.remaining}</b> left this week, at most {c.maxPerPerson} to one person.</>} />
      <form className="card form" id="coinform" onSubmit={submit} key={key}>
        <label>To</label>
        <select name="to_id" required>{dir.people.filter((p) => p.id !== me.user.id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.department ? ` · ${p.department}` : ''}</option>)}</select>
        <label>Coins</label><input name="coins" type="number" min="1" max={c.maxPerPerson} defaultValue="1" required />
        <label>What did they do for you?</label><input name="reason" required maxLength={300} />
        <p className="err" id="coinerr">{err}</p><button className="primary">Give coins</button>
      </form>
      <h2>Received</h2>
      <div className="card">{c.received.length ? <ul>{c.received.map((x, k) => <li key={k}><span className="coinic" />{x.coins} from {x.from_name}: &quot;{x.reason}&quot; <span className="small muted">{fmtTime(x.created_at)}</span></li>)}</ul>
        : <Empty title="No coins yet" text="When a colleague thanks you, it shows up here. Coins sit beside your score and never change it." />}</div>
      <h2>Given</h2>
      <div className="card">{c.given.length ? <ul>{c.given.map((x, k) => <li key={k}><span className="coinic" />{x.coins} to {x.to_name}: &quot;{x.reason}&quot;</li>)}</ul>
        : <Empty title="Nothing given yet" text="Thank someone whose work helped you, using the form above." />}</div>
    </>
  );
}
