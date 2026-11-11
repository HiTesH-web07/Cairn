'use client';
// Shared pieces: icons, the logo mark, avatars, the score meter and the priority stack.
import { PH } from '@/lib/phosphor';

export const brand = { name: 'Cairn', tagline: 'Measure what mattered.' };

const PHMAP = { home: 'house', week: 'calendar-check', rate: 'check-circle', team: 'users-three', score: 'chart-line-up', coins: 'coins', disputes: 'scales', incidents: 'bell', people: 'user-plus', integrations: 'plugs-connected', settings: 'sliders-horizontal', audit: 'clock-counter-clockwise', how: 'question', profile: 'user-circle', link: 'link-simple', shield: 'shield-check', scale: 'scales', check: 'check', lock: 'lock-simple', star: 'star', eye: 'eye', sun: 'sun', slack: 'slack-logo' };

/** A Phosphor icon that takes its colour from the text around it. Paths are static, bundled data. */
export function Ph({ name, className = '' }) {
  return <svg className={`ph-i ${className}`} viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false" dangerouslySetInnerHTML={{ __html: PH[name] || '' }} />;
}
/** App icons by screen name (week, rate, team, ...). */
export const Icon = ({ name }) => <Ph name={PHMAP[name] || 'question'} />;

const Stones = ({ a = 1 }) => (
  <>
    <ellipse cx="16" cy="24.2" rx="11.6" ry="5.1" transform="rotate(-3 16 24)" fill="#fff" fillOpacity={0.96 * a} />
    <ellipse cx="16.9" cy="15.4" rx="8.1" ry="4.3" transform="rotate(4 17 15)" fill="#fff" fillOpacity={0.82 * a} />
    <ellipse cx="15.5" cy="8.3" rx="5.1" ry="3.5" transform="rotate(-6 15 8)" fill="#fff" fillOpacity={0.64 * a} />
  </>
);
/** The mark: three stones, biggest at the bottom, like a priority stack. */
export const Logo = () => <span className="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><Stones /></svg></span>;

/** The decorative cairn drawing used in headers and empty states. */
export const CairnArt = ({ className = '' }) => (
  <svg className={`cairn-art ${className}`} viewBox="0 0 120 100" aria-hidden="true">
    <ellipse cx="60" cy="82" rx="42" ry="14" fill="currentColor" opacity=".9" />
    <ellipse cx="63" cy="52" rx="30" ry="12" fill="currentColor" opacity=".6" />
    <ellipse cx="58" cy="26" rx="18" ry="9.5" fill="currentColor" opacity=".38" />
    <circle cx="96" cy="14" r="3" fill="currentColor" opacity=".25" />
    <circle cx="20" cy="30" r="2" fill="currentColor" opacity=".2" />
  </svg>
);

/** A flat score meter. Colour follows the score. */
export function Ring({ score, className = '' }) {
  const has = score !== null && score !== undefined;
  const v = has ? Math.max(0, Math.min(100, score)) : 0;
  const tone = !has ? 's-none' : v >= 85 ? 's-good' : v >= 60 ? 's-ok' : 's-low';
  return <div className={`meter-r ${tone} ${className}`} role="img" aria-label={has ? `${v} out of 100` : 'No score yet'}><i style={{ '--m': v / 100 }} /></div>;
}

// Twelve ready-made avatars for people who would rather not upload a photo.
const PRESET_BG = ['#4f46e5,#8b5cf6', '#8b5cf6,#ec4899', '#0d9488,#4f46e5', '#f59e0b,#ec4899', '#059669,#0d9488', '#2563eb,#8b5cf6', '#ec4899,#f59e0b', '#7c3aed,#2563eb', '#0ea5e9,#059669', '#db2777,#7c3aed', '#16a34a,#f59e0b', '#475569,#4f46e5'];
const PRESET_ART = [
  <><ellipse cx="12" cy="18" rx="7" ry="2.6" /><ellipse cx="12" cy="12.5" rx="5" ry="2.3" /><ellipse cx="12" cy="7.6" rx="3" ry="1.9" /></>,
  <><circle cx="12" cy="12" r="4" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" /></>,
  <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  <path d="M3 19 9.5 7l4 7 2.5-4L21 19z" />,
  <path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19 13 11" />,
  <path d="M13 3 5 13h6l-1 8 8-10h-6z" />,
  <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  <path d="M3 9c3-3 5 3 9 0s6 3 9 0M3 15c3-3 5 3 9 0s6 3 9 0" />,
  <path d="m12 3 8 9-8 9-8-9z" />,
  <><circle cx="9" cy="9" r="3.2" /><circle cx="16" cy="10" r="2.4" /><path d="M3.5 19c.8-3.4 3-5 5.5-5s4.7 1.6 5.5 5M14 15c2.4-.3 4.7.8 6 4" /></>,
  <><rect x="4" y="4" width="7" height="7" rx="2" /><rect x="13" y="4" width="7" height="7" rx="2" /><rect x="4" y="13" width="7" height="7" rx="2" /><rect x="13" y="13" width="7" height="7" rx="2" /></>,
  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />,
];
export const PRESET_COUNT = PRESET_BG.length;
export const PresetAvatar = ({ i, size = '' }) => (
  <span className={`avatar ${size} preset`} style={{ background: PRESET_BG[i].split(',')[0] }} aria-hidden="true"><svg viewBox="0 0 24 24">{PRESET_ART[i]}</svg></span>
);
/** A round avatar: their picture or chosen preset, otherwise their initial on a colour taken from the name. */
export function Avatar({ name, size = '', pic = null }) {
  if (typeof pic === 'string' && pic.startsWith('/api/avatar/')) return <span className={`avatar ${size} has-img`} aria-hidden="true"><img src={pic} alt="" loading="lazy" /></span>;
  if (typeof pic === 'string' && /^preset:\d+$/.test(pic) && PRESET_BG[Number(pic.slice(7))]) return <PresetAvatar i={Number(pic.slice(7))} size={size} />;
  const n = String(name || '?').trim();
  let h = 0;
  for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return <span className={`avatar ${size}`} style={{ '--h': h }} aria-hidden="true">{n.charAt(0).toUpperCase()}</span>;
}

/** An empty state with a little illustration. */
export const Empty = ({ title, text, children }) => <div className="empty"><CairnArt /><h3>{title}</h3><p>{text}</p>{children}</div>;

/** The stack meter: one slab per rank, as wide as its weight, filled by how well it was rated. */
export function Stack({ items, settings, size = '' }) {
  const weights = settings.rankWeights;
  const q = settings.quality;
  const byRank = new Map(items.filter((i) => i.rank).map((i) => [i.rank, i]));
  return (
    <>
      <div className={`stack ${size}`} role="img" aria-label="Priority stack">
        {weights.map((w, k) => {
          const it = byRank.get(k + 1);
          let cls = 'none', fill = 0, tip = `#${k + 1}: nothing ranked`;
          if (it) {
            tip = `#${k + 1}: ${it.title}`;
            const need = k + 1 <= settings.secondRaterRanks ? 2 : 1;
            const rs = it.ratings || [];
            if (it.status === 'blocked_external') cls = 'ext';
            else if (it.status === 'missed') cls = 'miss';
            else if (it.status === 'delivered') {
              if (it.mult === null || (it.mult === undefined && rs.length < need)) cls = 'wait';
              else {
                const m = it.mult !== undefined ? it.mult : rs.reduce((a, r) => a + (q[r.quality] ?? 0), 0) / rs.length;
                if (m <= 0) cls = 'miss';
                else { fill = Math.round(m * 100); cls = m >= 1 ? 'full' : 'half'; }
              }
            } else cls = 'open';
          }
          return <div key={k} className={`seg ${cls}`} style={{ '--w': w, '--k': k, '--fill': `${fill}%` }} title={tip}><i /><span className="n">#{k + 1}</span><span className="wt">{w}</span></div>;
        })}
      </div>
      <div className="legend"><span className="l-full">Done well</span><span className="l-half">Needs fixes</span><span className="l-wait">Waiting for rating</span><span className="l-miss">Missed or redo</span></div>
    </>
  );
}

/** A page head: a small label, the title, a one-line explanation and actions on the right. */
export const Head = ({ eyebrow, title, sub, right }) => (
  <header className="ph"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{sub && <p>{sub}</p>}</div>{right && <div className="ph-r">{right}</div>}</header>
);
export const Skeleton = () => (
  <div className="sk-wrap" aria-hidden="true"><div className="sk" style={{ height: 34, width: '34%' }} /><div className="sk" style={{ height: 16, width: '52%', marginTop: '.8rem' }} /><div className="sk-grid"><div className="sk" /><div className="sk" /><div className="sk" /><div className="sk" /></div><div className="sk" style={{ height: 230, marginTop: '1rem' }} /></div>
);

const THEME_KEY = 'cairn-theme';
/** Light / dark switch. The choice is kept in this browser. */
export function ThemeButton({ id }) {
  const toggle = () => {
    const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = cur === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = next === 'dark' ? '#0B0D17' : '#4f46e5';
    try { localStorage.setItem(THEME_KEY, next); } catch { /* not saved */ }
  };
  return <button type="button" className="theme-btn" id={id} onClick={toggle} aria-label="Switch between light and dark" title="Light / dark"><Ph name="sun" className="sun" /><Ph name="moon" className="moon" /></button>;
}

/** Turns the assistant's plain text (paragraphs, "- " lists, **bold**) into elements without using HTML. */
export function RichText({ text }) {
  const blocks = [];
  let list = null;
  const inline = (s, key) => s.split(/\*\*(.+?)\*\*/g).map((t, j) => (j % 2 ? <b key={`${key}-${j}`}>{t}</b> : t));
  text.split('\n').forEach((l, k) => {
    const m = /^\s*[-*•]\s+(.*)$/.exec(l);
    if (m) { if (!list) { list = []; blocks.push(<ul key={`u${k}`}>{list}</ul>); } list.push(<li key={k}>{inline(m[1], k)}</li>); return; }
    list = null;
    if (l.trim()) blocks.push(<p key={k}>{inline(l, k)}</p>);
  });
  return <>{blocks}</>;
}
