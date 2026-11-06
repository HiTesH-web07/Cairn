'use strict';
// Home: an editorial page that explains the app in about 30 seconds, mostly through motion.
// Plain HTML and CSS animation. The only script is the step player, scroll reveals and a count-up.
(function () {
  const { icon, logo, brand } = window.UI;
  let timers = [];
  let observers = [];

  const STEPS = [
    { n: '01', t: 'Promise', d: 'Your manager ranks your top priorities for the week and locks them. #1 is worth the most.' },
    { n: '02', t: 'Prove', d: 'You deliver with a link or a note that shows the result. No proof, no credit.' },
    { n: '03', t: 'Rate', d: 'The people who used your work say Done well, Needs fixes or Redo. Top priorities get two raters.' },
    { n: '04', t: 'Score', d: 'One score out of 100 against your own list, with the coins your colleagues gave you beside it.' }
  ];
  const TICKER = ['No screenshots', 'No time tracking', 'Task count never counts', 'Two raters on top work', 'Every rating has a reason', 'AI never scores anyone', 'Open formula'];

  const scenes = () => `
    <div class="sc" data-sc="0">
      <div class="sc-title">Amit ranks Riya's week</div>
      <div class="rk st" style="--y:90px;--dl:.1s"><b>1</b><span>Gmail plug launch</span><em>35%</em></div>
      <div class="rk" style="--y:-50px;--dl:.25s"><b>2</b><span>Write the help docs</span><em>25%</em></div>
      <div class="rk" style="--y:-50px;--dl:.4s"><b>3</b><span>OAuth refresh (stretch)</span><em>20%</em></div>
      <div class="lock">Week locked</div>
      <div class="dm sc-pop" style="--dl:2.6s"><span class="av">C</span><div><p><b>Your week is ready, Riya.</b> Your #1: Gmail plug launch (35% of your score).</p><small>Slack · private message</small></div></div>
    </div>
    <div class="sc" data-sc="1">
      <div class="sc-title">Riya delivers her #1</div>
      <div class="wk sc-pop">
        <h4>Gmail plug launch</h4>
        <div class="st-wrap"><span class="pill p1">In progress</span><span class="pill good p2">Delivered</span></div>
        <div class="proof">${icon('link')}<span>github.com/acme/gmail-plug/pull/231</span><small>PROOF ADDED</small></div>
      </div>
      <div class="btn-fake">Deliver with proof</div>
      <div class="nope sc-pop" style="--dl:2s">No link or note? It can't be marked delivered.</div>
    </div>
    <div class="sc" data-sc="2">
      <div class="sc-title">Two people rate it</div>
      <div class="rt">
        <div class="rater sc-pop"><span class="av">A</span><div><b>Amit</b> <small>HER MANAGER</small><div class="opts"><span class="pick" style="--dl:1s">Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
        <div class="rater sc-pop" style="--dl:.25s"><span class="av">S</span><div><b>Sonal</b> <small>USED THE PLUG</small><div class="opts"><span class="pick" style="--dl:1.7s">Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
      </div>
      <div class="done">Rated by 2 people</div>
      <div class="dm sc-pop" style="--dl:.8s"><span class="av">C</span><div><p><b>Riya delivered "Gmail plug launch".</b> Rate it: proof attached.</p><small>Slack · sent to both raters</small></div></div>
    </div>
    <div class="sc" data-sc="3">
      <div class="sc-title">Riya's week</div>
      <div class="sg sc-pop">
        <div class="big"><span data-count="88">88</span><small>OUT OF 100</small></div>
        <div class="mini">
          <div style="--dl:.2s"><span>Priorities</span><i style="--w:88%;--dl:.2s"></i></div>
          <div style="--dl:.5s"><span>Quality</span><i style="--w:75%;--dl:.5s"></i></div>
          <div style="--dl:.8s"><span>Alignment</span><i style="--w:60%;--dl:.8s"></i></div>
        </div>
      </div>
      <div class="coin">3 coins from Aman: "helped me debug the plug"</div>
      <div class="muted small sc-pop" style="--dl:2.4s">Coins sit beside the score. They are never added to it.</div>
    </div>`;

  const slabs = [['#1', 'Gmail plug launch', 35, '100%'], ['#2', 'Write the help docs', 25, '71%'], ['#3', 'OAuth refresh (stretch)', 20, '57%'], ['#4', 'Update the FAQ', 12, '34%'], ['#5', 'Competitor notes', 8, '23%']];

  function html({ signedIn }) {
    const year = new Date().getFullYear();
    const cta = signedIn
      ? '<a class="btn blaze" href="#/week">Open my week</a>'
      : '<a class="btn ghost plain" href="#/signin">Sign in</a><a class="btn blaze" href="#/signup">Get started</a>';
    return `<div class="hp">
    <header class="hp-nav"><div class="hp-wrap">
      <a class="brand" href="#/home">${logo()}${brand.name}</a>
      <nav class="hp-links" aria-label="Sections"><a data-go="hp-how">How it works</a><a data-go="hp-vs">Different</a><a data-go="hp-fair">Fair</a><a data-go="hp-where">Where</a></nav>
      <div class="hp-cta">${cta}</div>
    </div></header>

    <section class="hp-wrap hp-hero">
      <div>
        <div class="hp-kick"><i></i>Work, weighed</div>
        <h1 class="hp-h1">Measure what <em>mattered</em>, not how busy you looked.</h1>
        <p class="hp-lead">Each week your manager picks the few things that matter most. You deliver them with proof, the people who used your work rate them, and you get one fair score.</p>
        <div class="hp-btns">${signedIn ? '<a class="btn blaze" href="#/week">Open my week</a>' : '<a class="btn blaze" href="#/signup">Start free</a>'}<button class="ghost" data-go="hp-how" type="button">See how it works ↓</button></div>
        <div class="hp-facts"><span>No screenshots</span><span>No time tracking</span><span>Task count never counts</span></div>
      </div>
      <div class="spec" aria-hidden="true">
        <div class="spec-h"><span>Riya · This week</span><span>Locked by Amit</span></div>
        <div class="spec-b">
          <div class="slab-col"><i class="flag"></i>${slabs.map((s, k) => `<div class="slab${k === 0 ? '' : ' ln'}" style="--w:${s[3]};--k:${k}"><em>${s[0]}</em></div>`).join('')}</div>
          <div class="slab-list">${slabs.map((s, k) => `<div style="--k:${k}"><span>${s[1]}</span><small>${s[2]}%</small></div>`).join('')}</div>
          <div class="spec-f"><div><div class="lab">Score</div><div class="score-big">88<small>/100</small></div></div>
            <div><div class="dust">${Array.from({ length: 14 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</div><div class="lab" style="text-align:right;margin-top:.4rem">Everything else: 0</div></div></div>
        </div>
      </div>
    </section>

    <div class="hp-ticker" aria-hidden="true"><div>${[...TICKER, ...TICKER].map((t) => `<span>${t}</span>`).join('')}</div></div>

    <section class="hp-sec" id="hp-how"><div class="hp-wrap">
      <div class="hp-head reveal"><div><div class="hp-no"><b>01</b> — How it works</div><h2 class="hp-h2">Four steps, <em>every week</em>.</h2></div><p class="hp-sub">Click a step, or just watch. It plays by itself.</p></div>
      <div class="hp-steps reveal" id="hpSteps">
        <div class="hp-stepnav" role="tablist">${STEPS.map((s, i) => `<button class="hp-step${i === 0 ? ' on' : ''}" role="tab" data-i="${i}" type="button"><span class="n">${s.n}</span><b>${s.t}</b><span class="t">${s.d}</span><i class="pb"></i></button>`).join('')}</div>
        <div class="hp-stage" aria-live="polite">${scenes()}</div>
      </div>
    </div></section>

    <section class="hp-sec" id="hp-vs"><div class="hp-wrap">
      <div class="hp-head reveal"><div><div class="hp-no"><b>02</b> — Why it's different</div><h2 class="hp-h2">Doing more doesn't <em>score</em> more.</h2></div><p class="hp-sub">Fifty small tasks can't beat two things that mattered. Only the ranked priorities are scored.</p></div>
      <div class="hp-vs reveal">
        <div class="vs"><h3>A busy week</h3><div class="tag">24 small things logged</div>
          <div class="vs-dots">${Array.from({ length: 24 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</div>
          <div class="muted small" style="margin-bottom:1rem">Delivered only #3 of the top priorities.</div>
          <div class="vs-score"><strong>25</strong><small>/ 100</small></div></div>
        <div class="vs"><h3>A focused week</h3><div class="tag">3 priorities, all delivered</div>
          <div class="vs-cards"><div style="--k:0"><span>#1 Gmail plug launch</span><em>Done well</em></div><div style="--k:1"><span>#2 Help docs</span><em>Done well</em></div><div style="--k:2"><span>#3 OAuth</span><em>Fixes</em></div></div>
          <div class="muted small" style="margin-bottom:1rem">Same hours. Different result.</div>
          <div class="vs-score"><strong>88</strong><small>/ 100</small></div></div>
      </div>
    </div></section>

    <section class="hp-sec" id="hp-fair"><div class="hp-wrap">
      <div class="hp-head reveal"><div><div class="hp-no"><b>03</b> — Fairness</div><h2 class="hp-h2">One opinion can't <em>decide</em>.</h2></div><p class="hp-sub">Everyone is measured against their own list, rated in the open, and able to push back.</p></div>
      <div class="hp-cards">
        <div class="hc reveal"><span class="ico">i</span><div><h3>Fair at every level</h3><p>An intern's #1 counts as much as a senior's. Everyone is scored out of 100 against their own ranked list.</p>
          <div class="dbl"><div><span>INTERN</span><i style="--w:92%"></i><span>92</span></div><div><span>SENIOR</span><i style="--w:92%"></i><span>92</span></div></div></div></div>
        <div class="hc reveal" style="--rd:.1s"><span class="ico">ii</span><div><h3>Two sets of eyes</h3><p>Top priorities need a second rater, so one opinion can't decide. Every "Needs fixes" comes with a reason.</p></div></div>
        <div class="hc reveal"><span class="ico">iii</span><div><h3>Disagree? Say so</h3><p>Dispute a rating and the rater's manager decides. Both views stay on record, and the history can't be edited.</p></div></div>
        <div class="hc reveal" style="--rd:.1s"><span class="ico">iv</span><div><h3>Life happens</h3><p>Leave days lower what's expected. Work blocked by others isn't held against you.</p></div></div>
      </div>
    </div></section>

    <section class="hp-sec" id="hp-where"><div class="hp-wrap">
      <div class="hp-head reveal"><div><div class="hp-no"><b>04</b> — Where you work</div><h2 class="hp-h2">It meets your team <em>where they are</em>.</h2></div><p class="hp-sub">Nobody has to live in another tool.</p></div>
      <div class="hp-where reveal">
        <div class="hw"><div class="lab">Slack</div><h3>Private messages</h3><p>Your #1 in the morning, rating requests, a weekly team summary. Nothing in channels.</p>
          <div class="demo"><div class="dm"><span class="av">C</span><div><p><b>Good morning Riya.</b> Your #1 to deliver: Gmail plug launch.</p><small>Today · 10:00</small></div></div><div class="typing" aria-hidden="true"><i></i><i></i><i></i></div></div></div>
        <div class="hw"><div class="lab">Phone alerts</div><h3>Rings until someone answers</h3><p>Stuck on a top priority for hours? A phone rings until a manager takes it.</p>
          <div class="demo"><div class="alert"><b>Riya is blocked on #1</b>Waiting on API keys for 4h<div class="bt"><i>I'll unblock it</i><i>Seen</i></div></div></div></div>
        <div class="hw"><div class="lab">Your people</div><h3>Bring the org chart</h3><p>Invite by link, import a CSV from any HR tool, or sync from Keka. Managers look after their own team.</p>
          <div class="demo"><div class="csv"><div style="--k:0">email,name,role,manager</div><div style="--k:1">amit@co.com,Amit,manager,</div><div style="--k:2">riya@co.com,Riya,member,amit@co.com</div><div style="--k:3">sonal@co.com,Sonal,member,amit@co.com</div></div>
          <div class="chips" style="margin-top:.7rem"><span>CSV</span><span>Keka</span><span>Invite link</span></div></div></div>
      </div>
    </div></section>

    <section class="hp-wrap hp-close reveal"><h2>Weigh the <em>week</em>.</h2>
      ${signedIn ? '<a class="btn blaze" href="#/week" style="padding:.9rem 1.6rem;font-size:1.05rem">Open my week</a>' : '<a class="btn blaze" href="#/signup" style="padding:.9rem 1.6rem;font-size:1.05rem">Create a workspace</a>'}
      <p class="muted small" style="margin-top:1rem;font-family:var(--mono)">Two minutes: your company, your team, this week.</p></section>

    <footer class="hp-end"><div class="hp-wrap">
      <div class="hp-fgrid">
        <div class="hp-fbrand"><a class="brand" href="#/home">${logo()}${brand.name}</a><p>${brand.tagline} A weekly priority stack, rated by the people who used the work, for every team in the company.</p></div>
        <div><h4>Product</h4><ul><li><a data-go="hp-how">How it works</a></li><li><a data-go="hp-vs">Why it's different</a></li><li><a data-go="hp-fair">Fairness</a></li><li><a data-go="hp-where">Where you work</a></li></ul></div>
        <div><h4>${signedIn ? 'Workspace' : 'Start'}</h4><ul>${signedIn
          ? '<li><a href="#/week">My Week</a></li><li><a href="#/how">How we score</a></li><li><a href="#/team">Team</a></li>'
          : '<li><a href="#/signup">Create a workspace</a></li><li><a href="#/signin">Sign in</a></li>'}</ul></div>
        <div><h4>Promises</h4><ul class="hp-pledge"><li>No screenshots, ever</li><li>Task count never counts</li><li>Every rating has a reason</li><li>AI never scores anyone</li></ul></div>
      </div>
      <div class="hp-giant" aria-hidden="true">${brand.name}<em>.</em></div>
      <div class="hp-fbar"><span>© ${year} ${brand.name}</span><span>${brand.tagline}</span></div>
    </div></footer>
    </div>`;
  }

  function countUp(el, to, ms) {
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) { if (el) el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function render(root, opts) {
    destroy();
    root.innerHTML = html(opts);
    const el = root.querySelector('.hp');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.go);
      if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }));

    const rv = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); rv.unobserve(en.target); } }), { threshold: 0.15 });
    el.querySelectorAll('.reveal').forEach((n) => rv.observe(n));
    observers.push(rv);

    const box = el.querySelector('#hpSteps');
    const btns = [...box.querySelectorAll('.hp-step')];
    const scs = [...box.querySelectorAll('.sc')];
    const DUR = 6500;
    let cur = 0;
    let visible = false;
    let hover = false;
    const show = (i) => {
      cur = i;
      btns.forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
      scs.forEach((s, k) => s.classList.toggle('on', k === i));
      box.style.setProperty('--dur', `${DUR}ms`);
      if (i === 3) countUp(scs[3].querySelector('[data-count]'), 88, 1500);
      schedule();
    };
    function schedule() {
      timers.forEach(clearTimeout); timers = [];
      box.classList.toggle('paused', hover || !visible || reduce);
      if (reduce || hover || !visible) return;
      timers.push(setTimeout(() => show((cur + 1) % STEPS.length), DUR));
    }
    btns.forEach((b, i) => b.addEventListener('click', () => show(i)));
    box.addEventListener('mouseenter', () => { hover = true; schedule(); });
    box.addEventListener('mouseleave', () => { hover = false; schedule(); });
    const vis = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== visible) { visible = v; if (v) show(cur); else schedule(); } }, { threshold: 0.3 });
    vis.observe(box);
    observers.push(vis);
    show(0);
  }

  function destroy() {
    timers.forEach(clearTimeout); timers = [];
    observers.forEach((o) => o.disconnect()); observers = [];
  }

  window.Home = { render, destroy };
})();
