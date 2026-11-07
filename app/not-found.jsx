'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useApp } from '@/components/AppState';
import { Logo, brand } from '@/components/ui';

export default function NotFound() {
  const { me } = useApp();
  useEffect(() => { document.title = `Page not found · ${brand.name}`; }, []);
  return (
    <main className="nf" id="main">
      <div className="nf-in">
        <Link className="nf-brand" href="/home" aria-label={`${brand.name}, home`}><Logo /><span>{brand.name}</span></Link>
        <p className="nf-code" aria-hidden="true">404</p>
        <h1>We can&apos;t find that page.</h1>
        <p>The address may be mistyped, or the page may have moved. Nothing was lost.</p>
        <div className="nf-cta">
          {me ? <Link className="btn primary btn-lg" href="/week">Open my week</Link> : <><Link className="btn primary btn-lg" href="/home">Go to the home page</Link><Link className="btn btn-lg" href="/signin">Sign in</Link></>}
        </div>
      </div>
    </main>
  );
}
