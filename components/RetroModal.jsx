'use client';
// Weekly retrospective: 3 questions, shown on Friday after week locks (or manually any time).
import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/client';

export default function RetroModal({ week, existing, onClose }) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const wellRef = useRef(null);
  const slowRef = useRef(null);
  const diffRef = useRef(null);

  useEffect(() => {
    if (existing) {
      if (wellRef.current) wellRef.current.value = existing.went_well || '';
      if (slowRef.current) slowRef.current.value = existing.slowed_down || '';
      if (diffRef.current) diffRef.current.value = existing.do_differently || '';
    }
    wellRef.current?.focus();
  }, [existing]);

  const save = async () => {
    setSaving(true);
    try {
      await api('POST', '/api/retrospective', {
        week,
        went_well: wellRef.current?.value || '',
        slowed_down: slowRef.current?.value || '',
        do_differently: diffRef.current?.value || '',
      });
      setSaved(true);
      setTimeout(onClose, 800);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="row spread" style={{ marginBottom: 'var(--space-150)' }}>
          <h3 style={{ margin: 0 }}>Week {week} · Retrospective</h3>
          <button className="ghost" onClick={onClose} aria-label="Close">✕</button>
        </div>
        <p className="small muted" style={{ marginTop: 0 }}>5 minutes. Answers are shown to your manager and help with 1-on-1s.</p>
        <label>What went well this week?</label>
        <textarea ref={wellRef} placeholder="e.g. Shipped the payment flow on time, good collaboration with Platform…" style={{ minHeight: 80 }} />
        <label style={{ marginTop: 'var(--space-100)' }}>What slowed you down?</label>
        <textarea ref={slowRef} placeholder="e.g. API keys from the partner took 2 days to arrive…" style={{ minHeight: 80 }} />
        <label style={{ marginTop: 'var(--space-100)' }}>What would you do differently?</label>
        <textarea ref={diffRef} placeholder="e.g. Break the task into smaller pieces earlier so the blocker is caught sooner…" style={{ minHeight: 80 }} />
        <div className="row" style={{ marginTop: 'var(--space-150)', justifyContent: 'flex-end' }}>
          <button className="ghost" onClick={onClose}>Cancel</button>
          <button className="primary" onClick={save} disabled={saving || saved}>
            {saved ? '✓ Saved' : saving ? 'Saving…' : 'Save retrospective'}
          </button>
        </div>
      </div>
    </div>
  );
}
