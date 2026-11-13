'use client';
// Home: explains the app in about 30 seconds, mostly through motion.
// The markup is plain JSX and CSS animation; one effect runs the step players and scroll reveals.
import { Fragment, useEffect, useRef } from 'react';
import Link from 'next/link';
import { Logo, Ph, ThemeButton, brand } from './ui';

// One plain example drives every demo on this page. Fictional people and company.
const EX = {
  label: 'Product', person: 'Riya Shah', first: 'Riya', mgr: 'Amit', role: 'Engineer', rater2: 'Sonal',
  t1: 'Ship the new onboarding flow', t2: 'Write the help guide for it', t3: 'Fix the sign in timeout bug', s1: 'Onboarding flow', s2: 'Help guide', s3: 'Sign in bug',
  n1: 'Replied to 40 emails', n2: 'Fixed a typo', n3: 'Joined 12 meetings', n4: 'Updated the wiki', proof: 'github.com/acme/app/pull/231',
  coin: '3 coins from Aman: “covered my on call shift”', blocker: 'Waiting on API keys for 4h',
};
const X = ({ k }) => <span data-ex={k}>{EX[k]}</span>;
const heroSr = (e) => `Example week for ${e.first}, ${e.role}. Three ranked priorities worth 35, 25 and 20 points were delivered and rated: ${e.t1}, ${e.t2} and ${e.t3}. ${e.first} earned 70 of 80 points, a score of 88 out of 100. Everything else is logged and earns zero.`;

const STEPS = [
  { n: 1, t: 'Promise', d: 'Your manager ranks your top priorities for the week and locks them. #1 is worth the most.' },
  { n: 2, t: 'Prove', d: 'You deliver with a link or a note that shows the result. No proof, no credit.' },
  { n: 3, t: 'Rate', d: 'The people who used your work say Done well, Needs fixes or Redo. Top priorities get two raters.' },
  { n: 4, t: 'Score', d: 'One score out of 100 against your own list, with the coins your colleagues gave you beside it.' },
];

// Existing product facts only: these answers also feed the FAQ structured data.
const FAQ = [
  ['Does Cairn track my screen or time?', 'No. There are no screenshots, no time tracking and no activity monitoring, ever. It only looks at the work you deliver and how it was rated.'],
  ['What if I only get small tasks this week?', 'Nothing is lost. The score compares what you delivered with your own plan, so delivering every small task well scores 100.'],
  ['Who rates my work?', 'Your manager rates it, and for your top priorities a second person does too, so one opinion cannot decide. Needs fixes and Redo always come with a reason.'],
  ['What if I disagree with a rating?', 'Raise a dispute. The rater\'s manager decides, and both views and the decision are kept on record.'],
  ['Does AI score anyone?', 'No. Ask Cairn is an optional helper that explains a score in plain words, using only what the person can already see. It never scores or rates anyone, and an admin can switch it off.'],
  ['How do we add our people?', 'Invite them with a link, upload a CSV, or sync from Keka. Managers can add and look after their own team, and people who leave are marked as left with their history kept.'],
  ['Do we have to use Slack?', 'No. With Slack connected, people get private messages such as a morning reminder and rating requests. Nothing is ever posted in channels.'],
  ['What about leave and blocked work?', 'Leave days lower what is expected that week, and work blocked by someone else is not held against you.'],
  ['Can everyone see how the score works?', 'Yes. The formula and the weights are open to everyone in the workspace.'],
];
const TAGLINE = 'Measure what mattered, not how busy anyone looked. One fair score for every team, rated by the people who used the work.';
const NAV_LINKS = [['hp-how', 'How it works'], ['hp-vs', "Why it's different"], ['hp-fair', 'Fairness'], ['hp-where', 'Where you work']];
const TASKS = ['Answered a Slack thread', 'Renamed a file', 'Updated a ticket', 'Joined a standup', 'Tidied the board', 'Sent a reminder', 'Reordered tabs', 'Replied "thanks"', 'Cleared notifications', 'Moved a meeting'];

function Scenes() {
  return (
    <>
      <div className="sc sc1" data-sc="0">
        <div className="sc-title"><X k="mgr" /> ranks <X k="first" />&apos;s week · <X k="role" /></div>
        <div className="rk st" style={{ '--y': '90px', '--dl': '.1s' }}><b>#1</b><span><X k="t1" /></span><em>35%</em></div>
        <div className="rk" style={{ '--y': '-50px', '--dl': '.25s' }}><b>#2</b><span><X k="t2" /></span><em>25%</em></div>
        <div className="rk" style={{ '--y': '-50px', '--dl': '.4s' }}><b>#3</b><span><X k="t3" /> · Stretch</span><em>20%</em></div>
        <div className="lock"><Ph name="lock-simple" />Week locked. Nobody can quietly change it.</div>
        <div className="dm sc-pop" style={{ '--dl': '1.8s' }}><span className="av">PI</span><div><p><b>Your week is ready, <X k="first" />.</b> Your #1: <X k="t1" /> (35% of your score).</p><small>Slack · private message</small></div></div>
      </div>
      <div className="sc sc2" data-sc="1">
        <div className="sc-title"><X k="first" /> delivers the #1 priority</div>
        <div className="sc-card sc-pop">
          <h4><X k="t1" /></h4>
          <div className="st-wrap"><span className="pill p1">In progress</span><span className="pill good p2">Delivered</span></div>
          <div className="proof"><Ph name="link-simple" /><span><X k="proof" /></span><small>proof added</small></div>
        </div>
        <div className="btn-fake">Deliver with proof</div>
        <div className="nope sc-pop" style={{ '--dl': '1.4s' }}><Ph name="x" />No link or note? It can&apos;t be marked delivered.</div>
      </div>
      <div className="sc sc3" data-sc="2">
        <div className="sc-title">Two people rate it</div>
        <div className="rt">
          <div className="rater sc-pop"><span className="av">A</span><div><b><X k="mgr" /></b> <small>the manager</small><div className="opts"><span className="pick" style={{ '--dl': '.6s' }}>Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
          <div className="rater sc-pop" style={{ '--dl': '.25s' }}><span className="av">S</span><div><b><X k="rater2" /></b> <small>used the work</small><div className="opts"><span className="pick" style={{ '--dl': '1.1s' }}>Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
        </div>
        <div className="done"><Ph name="check-circle" />Rated by 2 people</div>
        <div className="dm sc-pop" style={{ '--dl': '.5s' }}><span className="av">PI</span><div><p><b><X k="first" /> delivered “<X k="t1" />”.</b> Rate it: proof attached.</p><small>Slack · sent to both raters</small></div></div>
      </div>
      <div className="sc sc4" data-sc="3">
        <div className="sc-title"><X k="first" />&apos;s week</div>
        <div className="sg sc-pop">
          <div className="big"><strong data-count="88">88</strong><small>/ 100</small></div>
          <div className="mini">
            <div style={{ '--dl': '.2s' }}><span>Priorities</span><i style={{ '--w': '88%', '--dl': '.2s' }} /></div>
            <div style={{ '--dl': '.5s' }}><span>Quality</span><i style={{ '--w': '75%', '--dl': '.5s' }} /></div>
            <div style={{ '--dl': '.8s' }}><span>Alignment</span><i style={{ '--w': '60%', '--dl': '.8s' }} /></div>
          </div>
        </div>
        <div className="coin"><span className="coinic" /><X k="coin" /></div>
        <div className="muted small sc-pop" style={{ '--dl': '1.7s' }}>Coins sit beside the score. They are never added to it.</div>
      </div>
    </>
  );
}

export default function Home({ signedIn }) {
  const root = useRef(null);
  const words = TAGLINE.trim().split(/\s+/);

  useEffect(() => { document.title = 'Cairn · Measure what mattered'; }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return undefined;
    const timers = []; const observers = []; const cleanups = [];
    const raf = (f) => { const id = requestAnimationFrame(f); return id; };
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const countUp = (node, to, ms) => {
      if (reduce) { node.textContent = to; return; }
      const t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / ms); node.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) raf(step); };
      raf(step);
    };
    const listen = (node, ev, fn) => { node.addEventListener(ev, fn); cleanups.push(() => node.removeEventListener(ev, fn)); };

    // ---- navigation: floating bar, full-height mobile menu, current section ----
    const nv = el.querySelector('.nv-wrap');
    const toggle = el.querySelector('.nv-toggle');
    const menu = el.querySelector('#nv-menu');
    const desktop = matchMedia('(min-width: 861px)');
    menu.setAttribute('inert', '');
    const setMenu = (open, returnFocus = true) => {
      nv.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      document.documentElement.classList.toggle('nv-lock', open);
      if (open) { menu.removeAttribute('inert'); timers.push(setTimeout(() => menu.querySelector('a, button')?.focus(), 60)); }
      else { menu.setAttribute('inert', ''); if (returnFocus && menu.contains(document.activeElement)) toggle.focus(); }
    };
    listen(toggle, 'click', () => setMenu(!nv.classList.contains('open')));
    const onKey = (e) => { if (e.key === 'Escape' && nv.classList.contains('open')) setMenu(false); };
    const onSize = () => { if (desktop.matches && nv.classList.contains('open')) setMenu(false, false); };
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onSize);
    cleanups.push(() => { document.removeEventListener('keydown', onKey); desktop.removeEventListener('change', onSize); document.documentElement.classList.remove('nv-lock'); });

    // in-page links scroll smoothly
    el.querySelectorAll('[data-go]').forEach((a) => listen(a, 'click', (e) => {
      e.preventDefault();
      const wasOpen = nv.classList.contains('open');
      if (wasOpen) setMenu(false, false);
      const t = document.getElementById(a.dataset.go);
      if (t) timers.push(setTimeout(() => t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), wasOpen ? 80 : 0));
    }));

    // a quiet change once the page has scrolled: the bar gets a firmer surface
    const sv = new IntersectionObserver((en) => nv.classList.toggle('scrolled', !en[0].isIntersecting), { threshold: 0 });
    sv.observe(el.querySelector('#nv-sentinel')); observers.push(sv);

    // current section in the navigation
    const spy = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      el.querySelectorAll('[data-spy]').forEach((a) => { if (a.dataset.spy === en.target.id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    }), { rootMargin: '-35% 0px -60% 0px' });
    NAV_LINKS.forEach(([id]) => { const t = document.getElementById(id); if (t) spy.observe(t); });
    observers.push(spy);

    // why it's different: a short race as it scrolls into view
    const dv = el.querySelector('#dv');
    if (dv) {
      const q = (sel) => dv.querySelector(sel);
      const dots = [...dv.querySelectorAll('.dv-dots i')]; const slabs = [...dv.querySelectorAll('.dv-slabs li')];
      const n1 = q('[data-dv-tasks]'); const n2 = q('[data-dv-tasks2]'); const s1 = q('[data-dv-s1]'); const s2 = q('[data-dv-s2]');
      const m1 = q('[data-dv-m1]'); const m2 = q('[data-dv-m2]'); const still = q('[data-dv-still]'); const win = q('[data-dv-win]');
      let dts = [];
      const clearDv = () => { dts.forEach(clearTimeout); dts = []; };
      const at = (fn, ms) => dts.push(setTimeout(fn, ms));
      const tween = (node, from, to, ms) => {
        if (reduce) { node.textContent = to; return; }
        const t0 = performance.now();
        const step = (t) => { const p = Math.min(1, (t - t0) / ms); node.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) raf(step); };
        raf(step);
      };
      const final = () => {
        dots.forEach((d) => d.classList.add('on')); slabs.forEach((l) => l.classList.add('on'));
        n1.textContent = '50'; n2.textContent = '3'; s1.textContent = '25'; s2.textContent = '88';
        m1.style.setProperty('--m', '.25'); m2.style.setProperty('--m', '.88'); still.classList.add('on'); win.classList.add('on');
      };
      const reset = () => {
        clearDv(); dots.forEach((d) => d.classList.remove('on')); slabs.forEach((l) => l.classList.remove('on'));
        [n1, n2, s1, s2].forEach((n) => { n.textContent = '0'; });
        m1.style.setProperty('--m', '0'); m2.style.setProperty('--m', '0'); still.classList.remove('on'); win.classList.remove('on');
      };
      const play = () => {
        reset(); if (reduce) { final(); return; }
        dots.forEach((d, i) => at(() => d.classList.add('on'), i < 24 ? i * 45 : 1800 + (i - 24) * 35));
        tween(n1, 0, 24, 1100); at(() => tween(n1, 24, 50, 900), 1800);
        at(() => { m1.style.setProperty('--m', '.25'); tween(s1, 0, 25, 700); }, 500);
        at(() => still.classList.add('on'), 2800);
        slabs.forEach((l, i) => at(() => l.classList.add('on'), 3300 + i * 450));
        at(() => { tween(n2, 0, 3, 900); }, 3300);
        at(() => { m2.style.setProperty('--m', '.88'); tween(s2, 0, 88, 1300); }, 3500);
        at(() => win.classList.add('on'), 4900);
      };
      // plays every time it scrolls into view, and resets once it is out of view
      let running = false;
      const dio = new IntersectionObserver((en) => {
        const r = en[0].intersectionRatio;
        if (r >= 0.45 && !running) { running = true; play(); } else if (r < 0.05 && running) { running = false; reset(); }
      }, { threshold: [0, 0.05, 0.45] });
      dio.observe(dv); observers.push(dio);
      cleanups.push(clearDv);
    }

    // tagline: each word turns from muted to full colour, in reading order, as it crosses the trigger line
    const tws = [...el.querySelectorAll('[data-words] .tw')];
    if (reduce) tws.forEach((w) => w.classList.add('on'));
    else {
      const tio = new IntersectionObserver((entries) => {
        entries.filter((e) => e.isIntersecting).sort((a, b) => tws.indexOf(a.target) - tws.indexOf(b.target)).forEach((e, k) => {
          e.target.style.transitionDelay = `${Math.min(k * 40, 400)}ms`; e.target.classList.add('on'); tio.unobserve(e.target);
        });
      }, { rootMargin: '0px 0px -30% 0px' });
      tws.forEach((w) => tio.observe(w)); observers.push(tio);
    }

    // the same questions, as structured data for search and answer engines
    const ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'faq-ld';
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    document.getElementById('faq-ld')?.remove(); document.head.appendChild(ld);
    cleanups.push(() => document.getElementById('faq-ld')?.remove());

    // hero: the score counts up once the rows have landed
    const heroNum = el.querySelector('[data-hero-score]');
    if (heroNum && !reduce) { heroNum.textContent = '0'; timers.push(setTimeout(() => countUp(heroNum, 88, 1300), 1000)); }

    // The score walkthrough: five steps that play by themselves, one caption each.
    const sx = el.querySelector('#sx');
    if (sx) {
      const CAPS = [
        'Your manager ranks your top priorities for the week. Up to five. Anything not ranked is not scored.',
        'Each rank is worth a share of the score. #1 is worth the most, so it is the one to get right.',
        'You deliver with proof, and the people who used the work rate it. Done well counts in full. Needs fixes counts half.',
        'Everything else you did is still logged, but it is worth 0. More tasks never mean a higher score.',
        'Score = points earned divided by points possible. 70 ÷ 80 = 88 out of 100.',
      ];
      const DURS = [1800, 1800, 3400, 2200, 3200];
      const dots = [...sx.querySelectorAll('.sx-dot')];
      const earnEl = sx.querySelector('[data-earn]');
      const numEl = sx.querySelector('[data-n]');
      const capEl = sx.querySelector('[data-cap]');
      const noEl = sx.querySelector('[data-stepno]');
      const gaugeEl = sx.querySelector('[data-gauge]');
      let inView = false; const hoverSx = false; let tms = [];
      const clear = () => { tms.forEach(clearTimeout); tms = []; };
      const later = (fn, ms) => tms.push(setTimeout(fn, ms));
      const bump = (n, cls = 'bump') => { n.classList.remove(cls); void n.offsetWidth; n.classList.add(cls); };
      const goTo = (i) => {
        clear(); sx.dataset.s = String(i);
        dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('done', k < i); d.style.setProperty('--dur', `${DURS[i]}ms`); });
        capEl.textContent = CAPS[i]; noEl.textContent = `${i + 1} / 5`;
        gaugeEl.style.setProperty('--g', i === 4 ? '0.88' : '0');
        const set = (n, v) => { if (n) { n.textContent = v; bump(n); } };
        if (i < 2) { earnEl.textContent = '0'; numEl.textContent = '?'; }
        if (i === 2) { numEl.textContent = '?'; earnEl.textContent = '0'; later(() => set(earnEl, '35'), 1000); later(() => set(earnEl, '60'), 1350); later(() => set(earnEl, '70'), 1700); }
        if (i === 3) { earnEl.textContent = '70'; numEl.textContent = '?'; }
        if (i === 4) { earnEl.textContent = '70'; countUp(numEl, 88, 800); }
        numEl.classList.toggle('dim', i < 4);
        if (!reduce && inView && !hoverSx) later(() => goTo((i + 1) % 5), DURS[i]);
      };
      // play mode: rate each priority yourself, then try to game it with tasks
      let play = false;
      const rows = [...sx.querySelectorAll('.sx-row[data-w]')];
      const eqSpans = sx.querySelectorAll('.sx-eq span');
      const loggedEl = sx.querySelector('[data-logged]');
      const chipsEl = sx.querySelector('.sx-chips');
      const sameEl = sx.querySelector('[data-same]');
      const modeBtns = [...sx.querySelectorAll('[data-mode]')];
      const MULT = { well: 1, fix: 0.5, redo: 0 };
      const LABEL = { well: ['Done well', 'good'], fix: ['Needs fixes', 'warn'], redo: ['Redo', 'bad'] };
      let logged = 3; let shown = 0;
      const tween = (n, to, ms) => {
        const from = parseInt(n.textContent, 10) || 0;
        if (reduce || from === to) { n.textContent = to; return; }
        const t0 = performance.now();
        const f = (t) => { const p = Math.min(1, (t - t0) / ms); n.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) raf(f); };
        raf(f);
      };
      const recompute = () => {
        let sum = 0;
        rows.forEach((r) => {
          const qv = r.dataset.q; const w = +r.dataset.w; const pts = Math.round(w * MULT[qv]);
          sum += pts;
          r.style.setProperty('--fn', String(MULT[qv]));
          const pill = r.querySelector('.p-c'); pill.className = `pill ${LABEL[qv][1]} p-c`; pill.textContent = LABEL[qv][0];
          r.querySelector('.sx-earn').textContent = `+${pts}`;
          r.querySelectorAll('.sx-rate button').forEach((b) => b.classList.toggle('on', b.dataset.q === qv));
        });
        const score = Math.round((sum / 80) * 100);
        tween(earnEl, sum, 500); eqSpans[0].textContent = sum; tween(numEl, score, 700);
        gaugeEl.style.setProperty('--g', String(score / 100));
        bump(earnEl);
        return score;
      };
      const setMode = (m) => {
        const on = m === 'play';
        modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
        if (on === play) { if (!on) goTo(0); return; }
        play = on; clear();
        sx.classList.toggle('play', on);
        if (on) {
          sx.classList.add('paused'); sx.dataset.s = '4'; numEl.classList.remove('dim');
          dots.forEach((d) => d.classList.remove('on')); noEl.textContent = 'Your turn';
          capEl.textContent = 'Tap a rating on each priority and watch the score move. Then press “Log 10 more tasks” to try to game it.';
          recompute();
        } else {
          rows.forEach((r) => { r.dataset.q = r.dataset.q0; });
          chipsEl.querySelectorAll('.extra').forEach((c) => c.remove()); logged = 3; shown = 0; loggedEl.textContent = '3';
          sx.classList.remove('paused'); sameEl.classList.remove('show'); gaugeEl.style.setProperty('--g', '0');
          recompute(); goTo(0);
        }
      };
      rows.forEach((r) => {
        r.dataset.q = r.dataset.q0;
        r.querySelectorAll('.sx-rate button').forEach((b) => listen(b, 'click', () => {
          r.dataset.q = b.dataset.q; if (!play) setMode('play'); else recompute(); bump(r.querySelector('.sx-earn'));
        }));
      });
      modeBtns.forEach((b) => listen(b, 'click', () => setMode(b.dataset.mode)));
      listen(sx.querySelector('[data-spam]'), 'click', () => {
        if (!play) setMode('play');
        const before = numEl.textContent;
        for (let i = 0; i < 10; i++) {
          logged += 1; shown += 1;
          if (shown <= 24) {
            const c = document.createElement('span'); c.className = 'extra'; c.style.setProperty('--k', i * 0.05);
            c.append(TASKS[(logged + i) % TASKS.length]); const em = document.createElement('em'); em.textContent = '0 pts'; c.append(em);
            chipsEl.appendChild(c);
          }
        }
        loggedEl.textContent = logged; bump(loggedEl);
        numEl.textContent = before; sameEl.classList.remove('show'); void sameEl.offsetWidth; sameEl.classList.add('show');
        bump(numEl, 'shake');
      });
      dots.forEach((d, i) => listen(d, 'click', () => { if (play) setMode('auto'); goTo(i); }));
      const sxv = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== inView) { inView = v; if (play) return; if (v) goTo(reduce ? 4 : 0); else clear(); } }, { threshold: 0.12 });
      sxv.observe(sx); observers.push(sxv);
      cleanups.push(clear);
      goTo(reduce ? 4 : 0);
    }

    // Where you work: a three-step setup journey that plays by itself
    const wk = el.querySelector('#wk');
    if (wk) {
      const tabs = [...wk.querySelectorAll('.wk-tab')]; const WD = 6500; let wc = 0; let wvis = false; const wh = false; let wt = null;
      const wgo = (i) => {
        clearTimeout(wt); wc = i; wk.dataset.s = String(i);
        tabs.forEach((t, k) => { t.classList.toggle('on', k === i); t.classList.toggle('done', k < i); t.style.setProperty('--dur', `${WD}ms`); t.setAttribute('aria-selected', k === i); });
        wk.classList.toggle('paused', wh || !wvis || reduce);
        if (!reduce && wvis && !wh) wt = setTimeout(() => wgo((i + 1) % 3), WD);
      };
      tabs.forEach((t, i) => listen(t, 'click', () => wgo(i)));
      const wv = new IntersectionObserver((en) => { const v = en[0].isIntersecting; if (v === wvis) return; wvis = v; wgo(v && !reduce ? 0 : wc); }, { threshold: 0.15 });
      wv.observe(wk); observers.push(wv); cleanups.push(() => clearTimeout(wt));
      wgo(0);
    }

    // reveal on scroll
    const rv = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); rv.unobserve(en.target); } }), { threshold: 0.18 });
    el.querySelectorAll('.reveal').forEach((n) => rv.observe(n));
    observers.push(rv);

    // the step player
    const box = el.querySelector('#hpSteps');
    const btns = [...box.querySelectorAll('.hp-step')];
    const scs = [...box.querySelectorAll('.sc')];
    const DUR = 3000;
    let cur = 0; let visible = false; const hover = false;
    let stepTimers = [];
    const schedule = () => {
      stepTimers.forEach(clearTimeout); stepTimers = [];
      box.classList.toggle('paused', hover || !visible || reduce);
      if (reduce || hover || !visible) return;
      stepTimers.push(setTimeout(() => show((cur + 1) % STEPS.length), DUR)); // eslint-disable-line no-use-before-define
    };
    const show = (i) => {
      cur = i;
      const stepCap = el.querySelector('.hp-stepcap'); if (stepCap) stepCap.textContent = STEPS[i].d;
      btns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
      scs.forEach((s, k) => s.classList.toggle('on', k === i));
      box.style.setProperty('--dur', `${DUR}ms`);
      if (i === 3) countUp(scs[3].querySelector('[data-count]'), 88, 1500);
      schedule();
    };
    btns.forEach((b, i) => listen(b, 'click', () => show(i)));
    const vis = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== visible) { visible = v; if (v) show(cur); else schedule(); } }, { threshold: 0.2 });
    vis.observe(box); observers.push(vis);
    cleanups.push(() => stepTimers.forEach(clearTimeout));
    show(0);

    return () => {
      timers.forEach(clearTimeout);
      cleanups.forEach((f) => f());
      observers.forEach((o) => o.disconnect());
    };
  }, [signedIn]);

  const primary = (lg) => (signedIn
    ? <Link className={`btn primary${lg ? ' btn-lg' : ''}`} href="/week">Open my week</Link>
    : <Link className={`btn primary${lg ? ' btn-lg' : ''}`} href="/signup">Create a workspace</Link>);
  const signIn = () => (signedIn ? null : <Link className="btn ghost" href="/signin">Sign in</Link>);

  return (
    <div className="hp" ref={root} key={signedIn ? 'in' : 'out'}>
      <div id="nv-sentinel" aria-hidden="true" />
      <header className="nv-wrap">
        <nav className="nv" aria-label="Main">
          <Link className="nv-brand" href="/home" aria-label={`${brand.name}, home`}><Logo /><span>{brand.name}</span></Link>
          <div className="nv-links">{NAV_LINKS.map(([id, t], i) => <a key={id} className="nv-link" href="/home" data-go={id} data-spy={id} style={{ '--i': i }}>{t}</a>)}</div>
          <div className="nv-actions"><ThemeButton />{signIn()}{primary()}</div>
          <button className="nv-toggle" type="button" aria-expanded="false" aria-controls="nv-menu" aria-label="Open menu"><span /><span /><span /></button>
        </nav>
        <div className="nv-menu" id="nv-menu" aria-label="Menu">
          <div className="nv-menu-in">
            {NAV_LINKS.map(([id, t], i) => <a key={id} className="nv-mlink" href="/home" data-go={id} data-spy={id} style={{ '--i': i }}>{t}<Ph name="arrow-right" /></a>)}
            <div className="nv-mactions" style={{ '--i': NAV_LINKS.length }}>{signIn()}{primary()}</div>
            <div className="nv-mtheme" style={{ '--i': NAV_LINKS.length + 1 }}><span>Light or dark</span><ThemeButton /></div>
          </div>
        </div>
      </header>

      <main id="home-main">
        <section className="hero hp-wrap" aria-labelledby="hero-h1">
          <div className="hero-copy">
            <p className="hero-eyebrow"><span aria-hidden="true" />Measure value, not busyness</p>
            <h1 className="hero-h1" id="hero-h1"><span className="nb">Measure the value</span> <span className="nb">of work,</span> <span className="nb">not the number</span> <span className="nb">of tasks.</span></h1>
            <p className="hero-sub">Each week your manager picks the few things that matter most. You deliver them with proof, the people who used your work rate them, and you get one fair score.</p>
            <div className="hero-cta">{primary(true)}<button className="btn ghost btn-lg" data-go="hp-how" type="button">See how it works<Ph name="arrow-down" /></button></div>
            <ul className="hero-proof"><li><Ph name="check-circle" />No screenshots or time tracking</li><li><Ph name="check-circle" />Task count never counts</li><li><Ph name="check-circle" />Every rating has a reason</li></ul>
          </div>
          <div className="hv">
            <p className="sr-only" data-sr="hero">{heroSr(EX)}</p>
            <div className="hv-card" aria-hidden="true">
              <div className="hv-head"><div><span className="hv-k">My Week</span><span className="hv-who"><X k="person" /> · Nov 2 to Nov 8</span></div><span className="pill good hv-lock"><Ph name="lock-simple" />Locked by <X k="mgr" /></span></div>
              <div className="hv-label"><span>Top priorities</span><span>Worth</span></div>
              <ol className="hv-rows">
                {[['1', 't1', 35, 100, 'Done well', 'good'], ['2', 't2', 25, 71, 'Done well', 'good'], ['3', 't3', 20, 57, 'Needs fixes', 'warn']].map((r, i) => (
                  <li key={r[0]} className="hv-row" style={{ '--i': i }}><b className="hv-rk">{r[0]}</b><div className="hv-main"><span className="hv-t"><X k={r[1]} /></span><div className="hv-bar"><i style={{ '--w': `${r[3]}%` }} /></div></div><span className="hv-w">{r[2]}</span><span className={`pill ${r[5]}`}>{r[4]}</span></li>
                ))}
              </ol>
              <div className="hv-label hv-label2"><span>Logged, not scored</span><span>0 pts</span></div>
              <div className="hv-noise">{['n1', 'n2', 'n3', 'n4'].map((k, i) => <span key={k} style={{ '--i': i + 3 }}><X k={k} /></span>)}</div>
              <div className="hv-score" style={{ '--i': 6 }}>
                <div className="hv-sum"><span className="hv-k">Points</span><span className="hv-eq"><b>70</b> of 80</span></div>
                <div className="hv-num"><b data-hero-score="">88</b><span>/ 100</span><small>against their own list</small></div>
              </div>
            </div>
          </div>
        </section>

        <section className="hp-sec" id="hp-stack"><div className="hp-wrap">
          <div className="hp-kicker reveal">The score</div>
          <h2 className="hp-h2 reveal">Watch one week become one number.</h2>
          <p className="hp-sub reveal">This is <X k="first" />&apos;s week. Follow it from the manager&apos;s plan to the final score: no formulas to read, just watch.</p>
          <div className="sx reveal" id="sx" data-s="0">
            <div className="sx-board">
              <div className="sx-head"><span><X k="first" />&apos;s priorities this week</span><span>Worth</span></div>
              {[['#1', 't1', 35, 100, 'Done well', 35], ['#2', 't2', 25, 100, 'Done well', 25], ['#3', 't3', 20, 50, 'Needs fixes', 10]].map((r, k) => {
                const q0 = r[3] === 100 ? 'well' : 'fix';
                return (
                  <div key={r[0]} className="sx-row" data-w={r[2]} data-q0={q0} style={{ '--k': k, '--w': r[2], '--fn': r[3] / 100 }}>
                    <b className={`sx-rk${k === 0 ? ' r1' : ''}`}>{r[0]}</b>
                    <div className="sx-main"><div className="sx-title"><X k={r[1]} /></div>
                      <div className="sx-line"><div className="sx-track"><i className="fill" /></div><span className="worth">{r[2]} pts</span></div>
                      <div className="sx-rate" role="group" aria-label={`Rate ${EX[r[1]]}`}>{[['well', 'Done well'], ['fix', 'Needs fixes'], ['redo', 'Redo']].map((qq) => <button key={qq[0]} type="button" data-q={qq[0]} className={q0 === qq[0] ? 'on' : undefined}>{qq[1]}</button>)}</div></div>
                    <div className="sx-state"><span className="pill p-a">Planned</span><span className="pill warn p-b">Delivered</span><span className={`pill ${r[3] === 100 ? 'good' : 'warn'} p-c`}>{r[4]}</span></div>
                    <div className="sx-earn">+{r[5]}</div>
                  </div>
                );
              })}
              {[4, 5].map((n) => <div key={n} className="sx-row sx-empty"><b className="sx-rk">#{n}</b><div className="sx-main"><div className="sx-title">Empty slot</div><div className="sx-line"><div className="sx-track dashed" /></div></div><div className="sx-state"><span className="pill">Not ranked</span></div><div /></div>)}
              <div className="sx-else"><div className="lab">Everything else <X k="first" /> did</div>
                <div className="sx-chips"><span style={{ '--k': 0 }}><X k="n1" /><em>0 pts</em></span><span style={{ '--k': 1 }}><X k="n2" /><em>0 pts</em></span><span style={{ '--k': 2 }}><X k="n3" /><em>0 pts</em></span></div>
                <div className="sx-spam"><button type="button" className="btn sm" data-spam="">+ Log 10 more tasks</button><span className="sx-logged">Tasks logged: <b data-logged="">3</b></span><span className="sx-same" data-same="">Score unchanged</span></div></div>
            </div>
            <aside className="sx-score">
              <div><div className="sx-lab">Points earned</div><div className="sx-earned"><b data-earn="">0</b><span>of 80 possible</span></div></div>
              <div className="sx-eq"><span>70</span><i>÷</i><span>80</span><i>=</i></div>
              <div><div className="sx-lab"><X k="first" />&apos;s score</div><div className="sx-num"><b data-n="">?</b><small>/ 100</small></div></div>
            </aside>
            <div className="sx-gauge" aria-hidden="true"><i data-gauge="" /></div>
            <div className="sx-modes" role="group" aria-label="Mode"><button type="button" className="on" data-mode="auto">Watch it play</button><button type="button" data-mode="play">Try it yourself</button></div>
            <div className="sx-cap"><span className="sx-step" data-stepno="">1 / 5</span><p data-cap="" /></div>
            <div className="sx-dots" role="tablist">{['Rank', 'Weigh', 'Deliver & rate', 'The rest', 'Score'].map((t, i) => <button key={t} type="button" role="tab" className={`sx-dot${i === 0 ? ' on' : ''}`} data-i={i}><i /><span>{i + 1}. {t}</span></button>)}</div>
          </div>
        </div></section>

        <section className="hp-sec alt" id="hp-how"><div className="hp-wrap">
          <div className="hp-kicker reveal">How it works</div>
          <h2 className="hp-h2 reveal">Four steps, every week.</h2>
          <p className="hp-sub reveal">Click a step, or just watch. It plays by itself.</p>
          <div className="hp-steps reveal" id="hpSteps">
            <div className="hp-stepnav" role="tablist">{STEPS.map((s, i) => <button key={s.n} className={`hp-step${i === 0 ? ' on' : ''}`} role="tab" data-i={i} type="button"><span className="n">{s.n}</span><span><b>{s.t}</b><span className="t">{s.d}</span></span><i className="pb" /></button>)}</div>
            <p className="hp-stepcap" aria-live="polite" />
            <div className="hp-stage" aria-live="polite"><Scenes /></div>
          </div>
        </div></section>

        <section className="hp-sec" id="hp-vs"><div className="hp-wrap">
          <div className="hp-kicker reveal">Why it&apos;s different</div>
          <h2 className="hp-h2 reveal">Doing more doesn&apos;t score more.</h2>
          <p className="hp-sub reveal">Fifty small tasks can&apos;t beat two things that mattered. Only the ranked priorities are scored.</p>
          <div className="dv reveal" id="dv">
            <p className="sr-only">A busy week: fifty small things logged, only the number three priority delivered, a score of 25 out of 100. A focused week: three priorities delivered, a score of 88 out of 100.</p>
            <article className="dv-lane dv-busy" aria-hidden="true">
              <header><h3>A busy week</h3><p>Lots of small things, one priority delivered.</p></header>
              <div className="dv-viz"><div className="dv-dots">{Array.from({ length: 50 }, (_, i) => <i key={i} />)}</div><p className="dv-cap">Each small thing earns 0 points.</p></div>
              <div className="dv-stats">
                <div><span className="dv-k">Tasks logged</span><b className="dv-n" data-dv-tasks="">0</b></div>
                <div className="dv-score"><span className="dv-k">Score</span><b className="dv-n dv-big" data-dv-s1="">0</b><span className="dv-of">/ 100</span></div>
              </div>
              <div className="dv-meter"><i data-dv-m1="" /></div>
              <p className="dv-chip" data-dv-still=""><Ph name="minus-circle" />Still 25. More tasks, same score.</p>
            </article>
            <article className="dv-lane dv-focus" aria-hidden="true">
              <header><h3>A focused week</h3><p>Three priorities, all delivered.</p></header>
              <div className="dv-viz"><ol className="dv-slabs">{[['1', 's1', 'Done well', 'good'], ['2', 's2', 'Done well', 'good'], ['3', 's3', 'Needs fixes', 'warn']].map((r) => <li key={r[0]}><b>{r[0]}</b><span><X k={r[1]} /></span><em className={`pill ${r[3]}`}>{r[2]}</em></li>)}</ol></div>
              <div className="dv-stats">
                <div><span className="dv-k">Tasks logged</span><b className="dv-n" data-dv-tasks2="">0</b></div>
                <div className="dv-score"><span className="dv-k">Score</span><b className="dv-n dv-big dv-win-n" data-dv-s2="">0</b><span className="dv-of">/ 100</span></div>
              </div>
              <div className="dv-meter"><i data-dv-m2="" /></div>
              <p className="dv-chip ok" data-dv-win=""><Ph name="check-circle" />Fewer tasks, higher score.</p>
            </article>
          </div>
        </div></section>

        <section className="hp-sec tag" id="hp-tag" aria-label="What Cairn is for"><div className="hp-wrap">
          <p className="tag-text" data-words="" aria-label={words.join(' ')}>{words.map((w, i) => <Fragment key={i}>{i > 0 && ' '}<span className="tw" aria-hidden="true">{w}</span></Fragment>)}</p>
        </div></section>

        <section className="hp-sec alt" id="hp-fair"><div className="hp-wrap">
          <div className="hp-kicker reveal">Fairness</div>
          <h2 className="hp-h2 reveal">Built so one opinion can&apos;t decide.</h2>
          <p className="hp-sub reveal">Everyone is measured against their own list, rated in the open, and able to push back.</p>
          <div className="fair">
            <div className="fair-feature reveal">
              <h3>Fair at every level</h3>
              <p>An intern&apos;s #1 counts as much as a senior&apos;s. Everyone is scored out of 100 against their own ranked list.</p>
              <div className="fair-bars" aria-label="An intern and a senior, both scored 92 out of 100">
                <div><span>Intern</span><div className="fb"><i style={{ '--w': 0.92 }} /></div><b>92</b></div>
                <div><span>Senior</span><div className="fb"><i style={{ '--w': 0.92 }} /></div><b>92</b></div>
              </div>
            </div>
            <ul className="fair-list">
              <li className="reveal"><Ph name="eye" /><div><h3>Two sets of eyes</h3><p>Top priorities need a second rater, so one opinion can&apos;t decide. Every &quot;Needs fixes&quot; comes with a reason.</p></div></li>
              <li className="reveal" style={{ '--rd': '.1s' }}><Ph name="scales" /><div><h3>Disagree? Say so</h3><p>Dispute a rating and the rater&apos;s manager decides. Both views stay on record.</p></div></li>
              <li className="reveal" style={{ '--rd': '.2s' }}><Ph name="calendar-check" /><div><h3>Life happens</h3><p>Leave days lower what&apos;s expected. Work blocked by others isn&apos;t held against you.</p></div></li>
            </ul>
          </div>
        </div></section>

        <section className="hp-sec alt" id="hp-m91"><div className="hp-wrap m91">
          <div className="m91-copy">
            <div className="hp-kicker reveal">Phone alerts · powered by M91</div>
            <h2 className="hp-h2 reveal">When work is stuck and needs a human.</h2>
            <p className="hp-sub reveal">Cairn notifies the right person&apos;s phone so they can unblock, decide or act, and keeps ringing until somebody responds.</p>
            <ul className="m91-list reveal">
              <li><Ph name="warning-circle" /><div><b>Blocked on a top priority</b><span>The manager&apos;s phone rings until someone takes it.</span></div></li>
              <li><Ph name="clock-counter-clockwise" /><div><b>Work nobody has rated</b><span>A nudge before the week&apos;s score goes stale.</span></div></li>
              <li><Ph name="scales" /><div><b>A dispute stuck for days</b><span>Goes up a level, and the phone with it.</span></div></li>
            </ul>
            <p className="m91-note reveal">Serious events only. Everything else stays in Slack.</p>
          </div>
          <div className="m91-stage reveal" aria-hidden="true">
            <div className="m91-tl"><span style={{ '--k': 0 }}>10:02 · <X k="first" /> is blocked on #1</span><span style={{ '--k': 1 }}>10:03 · Phone rings for <X k="mgr" /></span><span style={{ '--k': 2 }}>10:03 · Still ringing…</span><span style={{ '--k': 3 }}>10:05 · <X k="mgr" /> taps “I&apos;ll unblock it”</span></div>
            <div className="m91-phone"><div className="waves"><i /><i /><i /></div>
              <div className="m91-card"><small>CAIRN · URGENT</small><b><X k="first" /> is blocked on #1</b><span><X k="blocker" /></span>
                <div className="bt"><i>I&apos;ll unblock it</i><i>Seen</i></div></div>
              <div className="m91-ok"><Ph name="check-circle" /><b>Answered</b><span>Ringing stopped</span></div></div>
          </div>
        </div></section>

        <section className="hp-sec" id="hp-where"><div className="hp-wrap">
          <div className="hp-kicker reveal">Where you work</div>
          <h2 className="hp-h2 reveal">Set up in minutes. Then it lives in Slack.</h2>
          <p className="hp-sub reveal">Three steps for an admin, and nothing new to learn for everyone else.</p>
          <div className="wk reveal" id="wk" data-s="0">
            <div className="wk-tabs" role="tablist">
              {[['Connect your tools', 'One click for Slack, Keka and the phone alert. We only read what you tick.'], ['Bring your people', 'Import a CSV, sync from Keka or share invite links. Managers add their own team.'], ['Work arrives in Slack', 'A private message each morning, rating requests and a weekly summary. Nothing in channels.']].map((t, i) => <button key={t[0]} type="button" role="tab" className={`wk-tab${i === 0 ? ' on' : ''}`} data-i={i}><span className="n">{i + 1}</span><b>{t[0]}</b><span className="d">{t[1]}</span><i /></button>)}
            </div>
            <div className="wk-stage" aria-live="polite">
              <div className="wk-p wk-p0"><div className="wk-title">Integrations · admin</div>
                {[['Slack', 'Private messages to your team', '#4a154b', 'S'], ['Keka', 'Read people and teams, never salary', '#ef4d5e', 'K'], ['M91', 'Phone rings for serious events', '#0d9488', 'M']].map((c, k) => <div key={c[0]} className="wk-conn" style={{ '--k': k }}><span className="lg" style={{ background: c[2] }}>{c[3]}</span><div><b>{c[0]}</b><small>{c[1]}</small></div><div className="wk-btn"><span className="b1">Connect</span><span className="b2">✓ Connected</span></div></div>)}
                <p className="wk-note">Connections are stored encrypted. You can disconnect any of them at any time.</p></div>
              <div className="wk-p wk-p1"><div className="wk-title">People · 12 added</div>
                <div className="wk-src"><span>CSV</span><span>Keka sync</span><span>Invite link</span></div>
                <div className="wk-org">
                  {[['Meera Iyer', 'Founder', 'l0'], ['Amit Verma', 'Team lead · Product', 'l1'], ['Riya Shah', 'Engineer · reports to Amit', 'l2'], ['Dev Patel', 'Designer · reports to Amit', 'l2'], ['Neha Rao', 'Marketer · reports to Meera', 'l1']].map((p, k) => <div key={p[0]} className={`wk-per ${p[2]}`} style={{ '--k': k }}><span className="avatar" style={{ background: `hsl(${k * 63 + 230} 65% 52%)` }}>{p[0][0]}</span><div><b>{p[0]}</b><small>{p[1]}</small></div>{k === 4 && <em>+ 7 more</em>}</div>)}
                </div></div>
              <div className="wk-p wk-p2"><div className="wk-title">Slack · direct messages</div>
                <div className="wk-slack">
                  <div className="wk-msg" style={{ '--k': 0 }}><span className="av">C</span><div><p><b>Good morning <X k="first" />.</b> Your #1 this week: <b><X k="t1" /></b>.</p><small>Mon · 10:00</small><div className="bt"><i className="go">Open my week</i><i>Mark delivered</i></div></div></div>
                  <div className="wk-msg me" style={{ '--k': 1 }}><span className="av">R</span><div><p>Delivered, with the launch checklist attached.</p><small>Thu · 16:20</small></div></div>
                  <div className="wk-msg" style={{ '--k': 2 }}><span className="av">C</span><div><p><b><X k="mgr" /> rated it: Done well.</b> You earned 35 of 80 points this week so far.</p><small>Fri · 11:05</small></div></div>
                </div></div>
            </div>
          </div>
        </div></section>

        <section className="hp-sec alt" id="hp-faq"><div className="hp-wrap faq">
          <div className="faq-head"><div className="hp-kicker reveal">Questions</div><h2 className="hp-h2 reveal">Questions people ask before they start.</h2><p className="hp-sub reveal">Short answers, in plain words.</p></div>
          <div className="faq-list reveal">{FAQ.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
        </div></section>

        <section className="hp-wrap hp-final"><div className="box reveal"><div><h2>See your own week in two minutes.</h2><p>Create a workspace, invite your team, and rank the first week. No setup call needed.</p></div>
          {signedIn ? <Link className="btn btn-lg" href="/week">Open my week</Link> : <Link className="btn btn-lg" href="/signup">Create a workspace</Link>}</div></section>
      </main>
      <footer className="hp-end"><div className="hp-wrap">
        <div className="hp-fgrid">
          <div className="hp-fbrand"><Link className="brand" href="/home"><Logo />{brand.name}</Link>
            <p>{brand.tagline} A weekly priority stack, rated by the people who used the work, for every team in the company.</p>
            <div className="hp-tags"><span>No screenshots</span><span>No time tracking</span><span>Open formula</span></div></div>
          <div><h4>Product</h4><ul><li><a href="/home" data-go="hp-how">How it works</a></li><li><a href="/home" data-go="hp-vs">Why it&apos;s different</a></li><li><a href="/home" data-go="hp-fair">Fairness</a></li><li><a href="/home" data-go="hp-where">Where you work</a></li></ul></div>
          <div><h4>{signedIn ? 'Your workspace' : 'Get started'}</h4><ul>{signedIn
            ? <><li><Link href="/week">My Week</Link></li><li><Link href="/how">How we score</Link></li><li><Link href="/team">Team</Link></li></>
            : <><li><Link href="/signup">Create a workspace</Link></li><li><Link href="/signin">Sign in</Link></li></>}</ul></div>
          <div><h4>Our promises</h4><ul className="hp-pledge">{['No screenshots, ever', 'Task count never counts', 'Every rating has a reason', 'AI never scores anyone'].map((t) => <li key={t}><Ph name="check" />{t}</li>)}</ul></div>
        </div>
        <div className="hp-fbar"><span className="stones"><Logo />© {new Date().getFullYear()} {brand.name}</span><span>{brand.tagline}</span></div>
      </div></footer>
    </div>
  );
}
