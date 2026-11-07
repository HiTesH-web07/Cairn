'use client';
// "/" shows the home page to visitors and My Week to people who are signed in.
// Old links in the form /#/join/abc are forwarded to /join/abc.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/components/AppState';
import Home from '@/components/Home';

export default function Root() {
  const { me } = useApp();
  const router = useRouter();
  useEffect(() => {
    if (location.hash.startsWith('#/')) { router.replace(location.hash.slice(1) || '/'); return; }
    if (me) router.replace('/week');
  }, [me, router]);
  if (me === undefined || me) return <div id="app"><p className="boot">Loading…</p></div>;
  return <Home signedIn={false} />;
}
