'use strict';
// Shared pieces: line icons, the logo mark and the score ring.
(function () {
  const P = {
    home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
    week: 'M8 2v4M16 2v4M3 9h18M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM9 15l2 2 4-4',
    rate: 'M22 11.1V12a10 10 0 1 1-5.9-9.1M22 4L12 14l-3-3',
    team: 'M17 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM21 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    score: 'M3 3v18h18M7 15l4-4 3 3 5-6',
    coins: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v10M9.5 9.5h4a1.5 1.5 0 0 1 0 3h-3a1.5 1.5 0 0 0 0 3h4',
    disputes: 'M12 3v18M5 7l7-4 7 4M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z',
    incidents: 'M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
    people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6',
    integrations: 'M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0V8zM12 18v4',
    settings: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6',
    audit: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
    profile: 'M20 21a8 8 0 0 0-16 0M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
    how: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01',
    link: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10zM9 12l2 2 4-4',
    eye: 'M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    scale: 'M12 3v18M5 7l7-4 7 4M5 7l-3 7a3 3 0 0 0 6 0L5 7zM19 7l-3 7a3 3 0 0 0 6 0l-3-7z',
    sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
    check: 'M20 6L9 17l-5-5',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    star: 'M12 2l3 6.3 7 .9-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 7-.9z',
    slack: 'M14 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM10 10H4M14 10v6M10 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10 14v6M18 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 14h2'
  };
  const brand = { name: 'Cairn', tagline: 'Measure what mattered.' };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name] || P.how}"/></svg>`;
  // The mark: three stones, biggest at the bottom, like a priority stack and like the cairns that mark a path.
  const stones = (a = 1) => `<ellipse cx="16" cy="24.2" rx="11.6" ry="5.1" transform="rotate(-3 16 24)" fill="#fff" fill-opacity="${.96 * a}"/><ellipse cx="16.9" cy="15.4" rx="8.1" ry="4.3" transform="rotate(4 17 15)" fill="#fff" fill-opacity="${.82 * a}"/><ellipse cx="15.5" cy="8.3" rx="5.1" ry="3.5" transform="rotate(-6 15 8)" fill="#fff" fill-opacity="${.64 * a}"/>`;
  const logo = () => `<span class="logo"><svg viewBox="0 0 32 32" aria-hidden="true">${stones()}</svg></span>`;
  const favicon = () => "data:image/svg+xml," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='#4f46e5'/><stop offset='.55' stop-color='#8b5cf6'/><stop offset='1' stop-color='#ec4899'/></linearGradient></defs><rect width='32' height='32' rx='9' fill='url(#g)'/>${stones()}</svg>`);
  const cairn = (cls = '') => `<svg class="cairn-art ${cls}" viewBox="0 0 120 100" aria-hidden="true"><ellipse cx="60" cy="82" rx="42" ry="14" fill="currentColor" opacity=".9"/><ellipse cx="63" cy="52" rx="30" ry="12" fill="currentColor" opacity=".6"/><ellipse cx="58" cy="26" rx="18" ry="9.5" fill="currentColor" opacity=".38"/><circle cx="96" cy="14" r="3" fill="currentColor" opacity=".25"/><circle cx="20" cy="30" r="2" fill="currentColor" opacity=".2"/></svg>`;
  // A score ring that draws itself. Colour follows the score. r = 34 in an 80 box.
  function ring(score, extra = '') {
    const c = 2 * Math.PI * 34;
    const has = score !== null && score !== undefined;
    const v = has ? Math.max(0, Math.min(100, score)) : 0;
    const tone = !has ? 's-none' : v >= 85 ? 's-good' : v >= 60 ? 's-ok' : 's-low';
    return `<svg class="ring ${tone} ${extra}" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="34"/><circle class="ring-fg" cx="40" cy="40" r="34" style="--c:${c};--final:${c * (1 - v / 100)};stroke-dasharray:${c};stroke-dashoffset:${c * (1 - v / 100)}"/></svg>`;
  }
  // Twelve ready-made avatars for people who would rather not upload a photo.
  const PRESET_BG = ['#4f46e5,#8b5cf6', '#8b5cf6,#ec4899', '#0d9488,#4f46e5', '#f59e0b,#ec4899', '#059669,#0d9488', '#2563eb,#8b5cf6', '#ec4899,#f59e0b', '#7c3aed,#2563eb', '#0ea5e9,#059669', '#db2777,#7c3aed', '#16a34a,#f59e0b', '#475569,#4f46e5'];
  const PRESET_ART = [
    '<ellipse cx="12" cy="18" rx="7" ry="2.6"/><ellipse cx="12" cy="12.5" rx="5" ry="2.3"/><ellipse cx="12" cy="7.6" rx="3" ry="1.9"/>',
    '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
    '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    '<path d="M3 19 9.5 7l4 7 2.5-4L21 19z"/>',
    '<path d="M5 19C5 10 11 5 19 5c0 8-5 14-14 14zM5 19 13 11"/>',
    '<path d="M13 3 5 13h6l-1 8 8-10h-6z"/>',
    '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    '<path d="M3 9c3-3 5 3 9 0s6 3 9 0M3 15c3-3 5 3 9 0s6 3 9 0"/>',
    '<path d="m12 3 8 9-8 9-8-9z"/>',
    '<circle cx="9" cy="9" r="3.2"/><circle cx="16" cy="10" r="2.4"/><path d="M3.5 19c.8-3.4 3-5 5.5-5s4.7 1.6 5.5 5M14 15c2.4-.3 4.7.8 6 4"/>',
    '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
    '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.4A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>'
  ];
  const presetAvatar = (i, size = '') => `<span class="avatar ${size} preset" style="background:linear-gradient(135deg,${PRESET_BG[i]})" aria-hidden="true"><svg viewBox="0 0 24 24">${PRESET_ART[i]}</svg></span>`;
  // A round avatar: a picture or ready-made avatar when the person chose one, otherwise their initial on a colour taken from the name.
  function avatar(name, size = '', pic = null) {
    if (typeof pic === 'string' && pic.startsWith('/api/avatar/')) return `<span class="avatar ${size} has-img" aria-hidden="true"><img src="${pic}" alt="" loading="lazy"></span>`;
    if (typeof pic === 'string' && /^preset:\d+$/.test(pic) && PRESET_BG[Number(pic.slice(7))]) return presetAvatar(Number(pic.slice(7)), size);
    const n = String(name || '?').trim();
    let h = 0;
    for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
    const esc = (t) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    return `<span class="avatar ${size}" style="--h:${h}" aria-hidden="true">${esc(n.charAt(0).toUpperCase())}</span>`;
  }
  // An empty state with a little illustration, instead of a bare line of grey text.
  const empty = (title, text, action = '') => `<div class="empty">${cairn()}<h3>${title}</h3><p>${text}</p>${action}</div>`;

  // The stack meter: one slab per rank, as wide as its weight. Filled by how well it was rated.
  function stack(items, settings, size = '') {
    const weights = settings.rankWeights;
    const q = settings.quality;
    const byRank = new Map(items.filter((i) => i.rank).map((i) => [i.rank, i]));
    const seg = weights.map((w, k) => {
      const it = byRank.get(k + 1);
      let cls = 'none';
      let fill = 0;
      let tip = `#${k + 1}: nothing ranked`;
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
      return `<div class="seg ${cls}" style="--w:${w};--k:${k};--fill:${fill}%" title="${esc(tip)}"><i></i><span class="n">#${k + 1}</span><span class="wt">${w}</span></div>`;
    }).join('');
    return `<div class="stack ${size}" role="img" aria-label="Priority stack">${seg}</div><div class="legend"><span class="l-full">Done well</span><span class="l-half">Needs fixes</span><span class="l-wait">Waiting for rating</span><span class="l-miss">Missed or redo</span></div>`;
  }
  // A page head: a small label, the title, a one-line explanation, and actions on the right.
  const head = (eyebrow, title, sub = '', right = '') => `<header class="ph"><div>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}<h1>${title}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${right ? `<div class="ph-r">${right}</div>` : ''}</header>`;
  const skeleton = () => '<div class="sk-wrap" aria-hidden="true"><div class="sk" style="height:34px;width:34%"></div><div class="sk" style="height:16px;width:52%;margin-top:.8rem"></div><div class="sk-grid"><div class="sk"></div><div class="sk"></div><div class="sk"></div><div class="sk"></div></div><div class="sk" style="height:230px;margin-top:1rem"></div></div>';
  const THEME_KEY = 'cairn-theme';
  const sysDark = () => matchMedia('(prefers-color-scheme: dark)').matches;
  const curTheme = () => document.documentElement.dataset.theme || (sysDark() ? 'dark' : 'light');
  // Phosphor icon (MIT). Takes its colour from the text around it.
  const ph = (name, cls = '') => `<svg class="ph-i ${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${(window.PH || {})[name] || ''}</svg>`;
  const themeBtn = (id) => `<button type="button" class="theme-btn" data-theme-toggle${id ? ` id="${id}"` : ''} aria-label="Switch between light and dark" title="Light / dark">${ph('sun', 'sun')}${ph('moon', 'moon')}</button>`;
  const applyTheme = (t) => { document.documentElement.dataset.theme = t; const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = t === 'dark' ? '#181818' : '#4f46e5'; };
  try { const s = localStorage.getItem(THEME_KEY); if (s === 'light' || s === 'dark') applyTheme(s); } catch (e) { /* storage blocked: follow the system */ }
  document.addEventListener('click', (e) => {
    if (!e.target.closest('[data-theme-toggle]')) return;
    const next = curTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch (err) { /* not saved */ }
  });
  window.UI = { ph, themeBtn, brand, icon, logo, ring, avatar, presetAvatar, PRESET_COUNT: PRESET_BG.length, empty, cairn, favicon , stack, head, skeleton };
})();
