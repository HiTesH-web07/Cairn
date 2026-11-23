'use client';
// Company: transparency board. Everyone — intern to CEO — can see everyone's
// weekly focus and score. Daily logs and ratings are not shown here.
import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from '@/components/AppState';
import { ScreenStatus, useScreen } from '@/components/AppShell';
import { Avatar, Head, Ph } from '@/components/ui';
import WeekPick from '@/components/week/WeekPick';
import { addDays, api, fmtWeek, scoreText } from '@/lib/client';

const STATUS_CLS = { delivered: 'good', in_progress: 'warn', missed: 'bad', blocked_external: 'bad' };

function PersonCard({ p, isMe }) {
  return (
    <article className={`co-card${isMe ? ' me' : ''}`}>
      <div className="co-top">
        <Avatar name={p.name} pic={p.avatar} />
        <div className="co-id">
          <b>{p.name}{isMe && <span className="co-you">You</span>}</b>
          <span className="co-sub">{p.level || 'No level'}{p.role !== 'member' && <> · {p.role}</>}</span>
        </div>
        <div className="co-score" title="Priority score out of 100">
          <b>{scoreText(p.score)}</b>
          {p.score !== null && <span className="sbar"><i style={{ width: `${p.score}%` }} /></span>}
          {p.pending ? <span className="co-pend">{p.pending} pending</span> : null}
        </div>
      </div>
      <div className="co-focus">
        {p.focus.length ? p.focus.map((f) => (
          <span key={f.rank} className={`co-chip${f.private ? ' priv' : ''}`} title={f.status}>
            <i className="co-rank">{f.rank}</i>
            {f.private && <Ph name="lock-simple" />}
            <span>{f.title}</span>
            <i className={`co-dot ${STATUS_CLS[f.status] || ''}`} />
          </span>
        )) : <span className="small muted">No focus set this week</span>}
      </div>
    </article>
  );
}

function Team({ g, me, defaultOpen, mine }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`co-team${mine ? ' own' : ''}`}>
      <button type="button" className="co-thead" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Ph name="caret-down" className={open ? 'co-caret open' : 'co-caret'} />
        <h2>{g.department}{mine && <span className="co-mine">Your team</span>}</h2>
        <span className="co-gmeta">{g.count} {g.count === 1 ? 'person' : 'people'}{g.avgScore !== null && <> · avg <b>{g.avgScore}</b></>}</span>
      </button>
      {open && (
        <div className="co-grid">
          {g.people.map((p) => <PersonCard key={p.id} p={p} isMe={p.id === me} />)}
        </div>
      )}
    </section>
  );
}

export default function CompanyPage() {
  const week = useSearchParams().get('week') || '';
  const [q, setQ] = useState('');
  const { data, error } = useScreen(() => api('GET', `/api/company${week ? `?week=${encodeURIComponent(week)}` : ''}`), [week]);
  if (!data) return <ScreenStatus error={error} />;
  const nav = (n) => `/company?week=${addDays(data.week, n)}`;
  const needle = q.trim().toLowerCase();
  const self = data.people.find((p) => p.id === data.me);
  const ownDept = self ? (self.department || 'No team') : null;
  const groups = data.groups
    .map((g) => ({ ...g, people: g.people.filter((p) => !needle || p.name.toLowerCase().includes(needle) || (p.department || '').toLowerCase().includes(needle) || (p.level || '').toLowerCase().includes(needle)) }))
    .filter((g) => g.people.length)
    // Your own team first; the rest stay alphabetical.
    .sort((a, b) => (a.department === ownDept ? -1 : b.department === ownDept ? 1 : 0));
  const searching = needle.length > 0;

  return (
    <>
      <Head eyebrow="Transparency" title="Company" sub={`${fmtWeek(data.week)} · everyone's focus and score, intern to CEO`}
        right={<><a className="btn" href={nav(-7)}><Ph name="arrow-left" />Previous</a><WeekPick week={data.week} /><a className="btn" href={nav(7)}>Next<Ph name="arrow-right" /></a></>} />

      <div className="co-tools">
        <div className="co-search"><Ph name="eye" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, team or level" aria-label="Search people" /></div>
        <span className="small muted">{data.total} {data.total === 1 ? 'person' : 'people'} · {data.groups.length} {data.groups.length === 1 ? 'team' : 'teams'}</span>
      </div>

      {groups.length === 0 && <div className="card"><p className="muted">No one matches &quot;{q}&quot;.</p></div>}

      {groups.map((g) => (
        <Team key={g.department} g={g} me={data.me} mine={g.department === ownDept} defaultOpen={searching || g.department === ownDept} />
      ))}
      <p className="small muted">Transparency is part of Cairn: everyone sees everyone&apos;s focus and score — your team is shown first, and you can open any other team. Daily work and ratings stay within the reporting line. A priority marked private shows as &quot;Private priority&quot; outside that person&apos;s team.</p>
    </>
  );
}
