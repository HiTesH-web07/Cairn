'use client';
import { useApp } from '@/components/AppState';
import Home from '@/components/Home';

export default function HomePage() {
  const { me } = useApp();
  return <Home signedIn={!!me} />;
}
