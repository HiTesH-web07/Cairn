'use client';
// A calendar to jump to any week. Any day works: the server snaps it to that week's Monday.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { addDays } from '@/lib/client';

export default function WeekPick({ week }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const t = new Date();
  const today = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const onChange = (e) => {
    if (!e.target.value) return;
    const q = new URLSearchParams(params.toString());
    q.set('week', e.target.value);
    router.push(`${pathname}?${q}`);
  };
  return (
    <label className="wk-pick" title="Pick any date to jump to its week">
      <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></svg>
      <span>Pick week</span>
      <input type="date" key={week} defaultValue={week} max={addDays(today, 60)} aria-label="Pick a week" onChange={onChange} />
    </label>
  );
}
