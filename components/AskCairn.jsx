'use client';
// Ask Cairn: an AI chatbot (Gemini, on the server) that explains your own week, score and team.
// It answers from your data only and never scores anyone.
import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useApp } from './AppState';
import { RichText } from './ui';
import { api } from '@/lib/client';

export default function AskCairn() {
  const { me } = useApp();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]); // { role: 'me' | 'bot', text, error?, waiting? }
  const [q, setQ] = useState('');
  const turns = useRef([]);
  const input = useRef(null);
  const log = useRef(null);
  const mgr = me.reports > 0;
  const chips = ['Why is my score what it is?', 'What should I do next?', 'Is anything of mine blocked or waiting?'].concat(mgr ? ['Who in my team needs help this week?'] : []);

  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, []);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [msgs]);

  const send = async (text) => {
    if (!text.trim()) return;
    setQ('');
    setMsgs((m) => [...m, { role: 'me', text }, { role: 'bot', waiting: true }]);
    let reply;
    try {
      const r = await api('POST', '/api/ask', { question: text, history: turns.current.slice(-6), week: params.get('week') || undefined });
      turns.current.push({ role: 'user', text }, { role: 'model', text: r.answer });
      reply = { role: 'bot', text: r.answer };
    } catch (e) { reply = { role: 'bot', text: e.message, error: true }; }
    setMsgs((m) => [...m.slice(0, -1), reply]);
  };

  return (
    <>
      <button id="askFab" className={`ask-fab ${open ? 'on' : ''}`} aria-expanded={open} aria-controls="askPanel" onClick={() => setOpen(!open)}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg><span>Ask Cairn</span>
      </button>
      <section id="askPanel" className="ask-panel" hidden={!open} aria-label="Ask Cairn">
        <header><div><b>Ask Cairn</b><small>Explains your week. Never scores anyone.</small></div><button className="ghost" aria-label="Close" onClick={() => setOpen(false)}>×</button></header>
        <div className="ask-log" ref={log} aria-live="polite">
          <div className="ask-msg bot"><p>Hi {me.user.name.split(' ')[0]}. Ask me about your score, your week or {mgr ? 'your team' : 'what to do next'}.</p></div>
          {msgs.length === 0 && <div className="ask-chips">{chips.map((c) => <button type="button" className="ask-chip" key={c} onClick={() => send(c)}>{c}</button>)}</div>}
          {msgs.map((m, k) => (
            <div key={k} className={`ask-msg ${m.role}`}>
              {m.waiting ? <p className="typing-dots"><i /><i /><i /></p> : m.error ? <p className="err">{m.text}</p> : m.role === 'bot' ? <RichText text={m.text} /> : <p>{m.text}</p>}
            </div>
          ))}
        </div>
        <form onSubmit={(e) => { e.preventDefault(); send(q); }}>
          <input ref={input} maxLength={400} placeholder="Ask in your own words…" autoComplete="off" aria-label="Your question" value={q} onChange={(e) => setQ(e.target.value)} />
          <button className="primary">Ask</button>
        </form>
        <p className="ask-foot">AI-written explanation from your own data. Check anything important with your manager.</p>
      </section>
    </>
  );
}
