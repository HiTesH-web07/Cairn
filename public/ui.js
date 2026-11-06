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
    slack: 'M14 10a2 2 0 1 1 0-4 2 2 0 0 1 0 4zM10 10H4M14 10v6M10 14a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM10 14v6M18 14a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM18 14h2'
  };
  const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${P[name] || P.how}"/></svg>`;
  const logo = () => '<span class="logo"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17l5-6 4 4 7-9"/></svg></span>';
  // A score ring that draws itself. r = 34 in an 80 box.
  function ring(score, extra = '') {
    const c = 2 * Math.PI * 34;
    const v = score === null || score === undefined ? 0 : Math.max(0, Math.min(100, score));
    return `<svg class="ring ${extra}" viewBox="0 0 80 80" aria-hidden="true"><circle class="ring-bg" cx="40" cy="40" r="34"/><circle class="ring-fg" cx="40" cy="40" r="34" style="--c:${c};--final:${c * (1 - v / 100)};stroke-dasharray:${c};stroke-dashoffset:${c * (1 - v / 100)}"/></svg>`;
  }
  window.UI = { icon, logo, ring };
})();
