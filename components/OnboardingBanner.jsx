'use client';
// First-time onboarding: 4-step flow shown until the user dismisses it.
import { useState } from 'react';
import { api } from '@/lib/client';

const STEPS = [
  { emoji: '📋', day: 'Monday', title: 'Rank your week', desc: 'Your manager ranks your 5 priorities by value. #1 is worth the most.' },
  { emoji: '🔗', day: 'Tue – Thu', title: 'Deliver with proof', desc: 'When work is done, add a link (PR, doc, report) so your rater can see the result.' },
  { emoji: '⭐', day: 'Friday', title: 'Your manager rates', desc: 'Done well, Needs fixes, or Redo — based on the proof, not their memory.' },
  { emoji: '📊', day: 'Friday', title: 'Your score appears', desc: 'Score = points earned ÷ points possible. It resets every Monday. That\'s it.' },
];

export default function OnboardingBanner({ onDismiss }) {
  const [step, setStep] = useState(0);
  const dismiss = async () => {
    await api('POST', '/api/profile/onboarded').catch(() => {});
    onDismiss();
  };
  const s = STEPS[step];
  return (
    <div className="card" style={{ borderLeft: '3px solid var(--accent)', marginBottom: 'var(--space-200)' }}>
      <div className="row spread" style={{ marginBottom: 'var(--space-100)' }}>
        <div className="eyebrow">Welcome to Cairn · {step + 1} of {STEPS.length}</div>
        <button className="ghost small" onClick={dismiss} aria-label="Dismiss">✕</button>
      </div>
      <div style={{ display: 'flex', gap: 'var(--space-150)', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '2rem', lineHeight: 1 }}>{s.emoji}</div>
        <div style={{ flex: 1 }}>
          <div className="eyebrow" style={{ marginBottom: 2 }}>{s.day}</div>
          <h3 style={{ margin: '0 0 4px' }}>{s.title}</h3>
          <p className="small muted" style={{ margin: 0 }}>{s.desc}</p>
        </div>
      </div>
      <div className="row" style={{ marginTop: 'var(--space-150)', gap: 'var(--space-75)' }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
          {STEPS.map((_, i) => (
            <button key={i} onClick={() => setStep(i)} aria-label={`Step ${i + 1}`}
              style={{ width: i === step ? 20 : 8, height: 8, borderRadius: 4, border: 'none', cursor: 'pointer', padding: 0, background: i === step ? 'var(--accent)' : 'var(--border)', transition: 'width .2s' }} />
          ))}
        </div>
        {step < STEPS.length - 1
          ? <button className="primary small" onClick={() => setStep(step + 1)}>Next →</button>
          : <button className="primary small" onClick={dismiss}>Got it</button>}
      </div>
    </div>
  );
}
