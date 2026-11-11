import { Suspense } from 'react';
import './styles/style.css';
import './styles/system.css';
import './styles/home.css';
import './styles/app.css';
import { AppProvider } from '@/components/AppState';

const SITE = 'https://proof-of-impact.embarko.app';
export const metadata = {
  metadataBase: new URL(SITE),
  title: 'Cairn · Measure what mattered',
  description: 'Cairn: measure what mattered. A weekly priority stack, rated by the people who used the work.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', siteName: 'Cairn', url: SITE, title: 'Cairn: measure what mattered',
    description: 'Each week a manager ranks the few priorities that matter. People deliver them with proof, the people who used the work rate them, and everyone gets one fair score.',
    images: [{ url: '/og.png', width: 1200, height: 630, alt: 'Cairn: measure the value of work, not the number of tasks.' }],
  },
  twitter: { card: 'summary_large_image', title: 'Cairn: measure what mattered', description: 'One fair score per week, against your own ranked priorities, rated by the people who used the work.', images: ['/og.png'] },
};
export const viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#4f46e5' }, { media: '(prefers-color-scheme: dark)', color: '#0B0D17' }],
};

// Applies the saved light/dark choice before the first paint, so the page never flashes.
const themeScript = 'try{var t=localStorage.getItem("cairn-theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}';

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <Suspense fallback={<div id="app"><p className="boot">Loading…</p></div>}>
          <AppProvider>{children}</AppProvider>
        </Suspense>
      </body>
    </html>
  );
}
