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
  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // The mark: three stones, the top one painted blaze orange, the way a trail is marked.
  const logo = () => '<span class="logo"><svg viewBox="0 0 32 32" aria-hidden="true"><rect class="st" x="2" y="21" width="28" height="8" rx="4"/><rect class="st" x="7" y="12" width="18" height="8" rx="4"/><rect class="top" x="11.5" y="3" width="9" height="8" rx="4"/></svg></span>';
  const favicon = () => 'data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'><rect width='32' height='32' rx='7' fill='#17150f'/><rect x='5' y='21' width='22' height='6' rx='3' fill='#f3efe6'/><rect x='8.5' y='13' width='15' height='6' rx='3' fill='#f3efe6'/><rect x='12' y='5' width='8' height='6' rx='3' fill='#ff5a1f'/></svg>");
  const cairn = (cls = '') => `<svg class="cairn-art ${cls}" viewBox="0 0 120 100" aria-hidden="true"><rect class="st" x="8" y="66" width="104" height="26" rx="13"/><rect class="st" x="28" y="36" width="64" height="26" rx="13"/><rect class="top" x="46" y="8" width="28" height="24" rx="12"/></svg>`;
  // A score ring, kept for compatibility; the app now shows the stack meter instead.
  function ring(score, extra = '') {
    const c = 2 * Math.PI * 34;
    const v = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
    return `<svg class="ring ${extra}" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="34"/><circle class="ring-fg" cx="40" cy="40" r="34" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - v / 100)}"/></svg>`;
  }
  // A square avatar: initial on an earthy colour taken from the name, so a person always looks the same.
  function avatar(name, size = '') {
    const n = String(name || '?').trim();
    let h = 0;
    for (const ch of n) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `<span class="avatar ${size}" style="--h:${h}" aria-hidden="true">${esc(n.charAt(0).toUpperCase())}</span>`;
  }
  const empty = (title, text, action = '') => `<div class="empty">${cairn()}<h3>${title}</h3><p>${text}</p>${action}</div>`;
  // The stack meter: one slab per rank, as wide as its weight. Filled by how well it was rated.
  function stack(items, settings) {
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
      return `<div class="seg ${cls} ${k === 0 ? 'top' : ''}" style="--w:${w};--k:${k};--fill:${fill}%" title="${esc(tip)}"><i></i><span class="n">#${k + 1}</span><span class="wt">${w}</span></div>`;
    }).join('');
    return `<div class="stack" role="img" aria-label="Priority stack">${seg}</div><div class="legend"><span class="l-full">Done well</span><span class="l-half">Needs fixes</span><span class="l-wait">Waiting for rating</span><span class="l-miss">Missed or redo</span></div>`;
  }
  // A page head: a small mono line, the big serif title, then a rule.
  const head = (eyebrow, title, right = '') => `<header class="ph"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${right ? `<div class="ph-r">${right}</div>` : ''}</header>`;
  window.UI = { brand, icon, logo, ring, avatar, empty, cairn, favicon, stack, head };
})();
