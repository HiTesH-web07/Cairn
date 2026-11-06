'use strict';
// Home: explains the app in about 30 seconds, mostly through motion.
// Everything is plain HTML and CSS animation; the only script is the step player and scroll reveals.
(function () {
  const { icon, logo, ring, brand, cairn } = window.UI;
  let timers = [];
  let observers = [];

  const chips = ['Reply to emails', 'Fix a typo', 'Update the wiki', 'Join stand-up', 'Rename a file', 'Answer a ping', 'Tidy the board', 'Book a room'];

  const STEPS = [
    { n: 1, t: 'Promise', d: 'Your manager ranks your top priorities for the week and locks them. #1 is worth the most.' },
    { n: 2, t: 'Prove', d: 'You deliver with a link or a note that shows the result. No proof, no credit.' },
    { n: 3, t: 'Rate', d: 'The people who used your work say Done well, Needs fixes or Redo. Top priorities get two raters.' },
    { n: 4, t: 'Score', d: 'One score out of 100 against your own list, with the coins your colleagues gave you beside it.' }
  ];

  const scenes = () => `
    <div class="sc sc1" data-sc="0">
      <div class="sc-title">Amit ranks Riya's week · Intern</div>
      <div class="rk st" style="--y:90px;--dl:.1s"><b>#1</b><span>Gmail plug launch</span><em>35%</em></div>
      <div class="rk" style="--y:-50px;--dl:.25s"><b>#2</b><span>Write the help docs</span><em>25%</em></div>
      <div class="rk" style="--y:-50px;--dl:.4s"><b>#3</b><span>OAuth refresh ⭐ Stretch</span><em>20%</em></div>
      <div class="lock">🔒 Week locked. Nobody can quietly change it.</div>
      <div class="dm sc-pop" style="--dl:2.6s"><span class="av">PI</span><div><p><b>Your week is ready, Riya.</b> Your #1: Gmail plug launch (35% of your score).</p><small>Slack · private message</small></div></div>
    </div>
    <div class="sc sc2" data-sc="1">
      <div class="sc-title">Riya delivers her #1</div>
      <div class="wk sc-pop">
        <h4>Gmail plug launch</h4>
        <div class="st-wrap"><span class="pill p1">In progress</span><span class="pill good p2">Delivered</span></div>
        <div class="proof">${icon('link')}<span>github.com/acme/gmail-plug/pull/231</span><small>proof added</small></div>
      </div>
      <div class="btn-fake">Deliver with proof</div>
      <div class="nope sc-pop" style="--dl:2s">No link or note? It can't be marked delivered.</div>
    </div>
    <div class="sc sc3" data-sc="2">
      <div class="sc-title">Two people rate it</div>
      <div class="rt">
        <div class="rater sc-pop"><span class="av">A</span><div><b>Amit</b> <small>her manager</small><div class="opts"><span class="pick" style="--dl:1s">Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
        <div class="rater sc-pop" style="--dl:.25s"><span class="av">S</span><div><b>Sonal</b> <small>used the plug</small><div class="opts"><span class="pick" style="--dl:1.7s">Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
      </div>
      <div class="done">✓ Rated by 2 people</div>
      <div class="dm sc-pop" style="--dl:.8s"><span class="av">PI</span><div><p><b>Riya delivered "Gmail plug launch".</b> Rate it: proof attached.</p><small>Slack · sent to both raters</small></div></div>
    </div>
    <div class="sc sc4" data-sc="3">
      <div class="sc-title">Riya's week</div>
      <div class="sg sc-pop">
        <div class="big">${ring(88)}<strong data-count="88">88</strong></div>
        <div class="mini">
          <div style="--dl:.2s"><span>Priorities</span><i style="--w:88%;--dl:.2s"></i></div>
          <div style="--dl:.5s"><span>Quality</span><i style="--w:75%;--dl:.5s"></i></div>
          <div style="--dl:.8s"><span>Alignment</span><i style="--w:60%;--dl:.8s"></i></div>
        </div>
      </div>
      <div class="coin">🪙 3 coins from Aman: "helped me debug the plug"</div>
      <div class="muted small sc-pop" style="--dl:2.4s">Coins sit beside the score. They are never added to it.</div>
    </div>`;

  function html({ signedIn }) {
    const cta = signedIn
      ? '<a class="btn primary" href="#/week">Open my week</a>'
      : '<a class="btn ghost" href="#/signin">Sign in</a><a class="btn primary" href="#/signup">Get started</a>';
    return `<div class="hp">
    <header class="hp-nav"><div class="hp-wrap">
      <a class="brand" href="#/home">${logo()}${brand.name}</a>
      <nav class="hp-links" aria-label="Sections"><a data-go="hp-how">How it works</a><a data-go="hp-vs">Why it's different</a><a data-go="hp-fair">Fairness</a><a data-go="hp-where">Where you work</a></nav>
      <div class="hp-cta">${cta}</div>
    </div></header>

    <div class="hp-herowrap"><div class="hp-deco" aria-hidden="true"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i></div>
    <section class="hp-wrap hp-hero">
      <div>
        <div class="hp-eyebrow"><i></i>Measure value, not busyness</div>
        <h1 class="hp-h1">Measure the <span class="hp-grad">value</span> of work, not the number of tasks.</h1>
        <p class="hp-lead">Each week your manager picks the few things that matter most. You deliver them with proof, the people who used your work rate them, and you get one fair score.</p>
        <div class="hp-btns">${signedIn ? '<a class="btn primary" href="#/week">Open my week</a>' : '<a class="btn primary" href="#/signup">Start free</a>'}<button class="ghost" data-go="hp-how" type="button">See how it works ↓</button></div>
        <div class="hp-trust"><span>No screenshots or time tracking</span><span>Task count never counts</span><span>Every rating has a reason</span></div>
      </div>
      <div class="hp-vis" aria-hidden="true">
        <div class="hp-win">
          <div class="hp-bar"><i></i><i></i><i></i><span>My Week · Riya</span></div>
          <div class="hp-body">
            <div><div class="hp-colh">Everything you do<em>logged, earns 0</em></div>
              <div class="hp-noise">${chips.map((c, i) => `<span class="hp-chip" style="--d:${i}">${c}</span>`).join('')}</div></div>
            <div><div class="hp-colh">Top priorities<em>locked by your manager</em></div>
              <div class="hp-prio">
                <div class="hp-card" style="--i:0"><b>#1</b><span>Gmail plug launch</span><u>35%</u><s style="--i:0">Done well</s></div>
                <div class="hp-card" style="--i:1"><b>#2</b><span>Write the help docs</span><u>25%</u><s style="--i:1">Done well</s></div>
                <div class="hp-card" style="--i:2"><b>#3</b><span>OAuth refresh ⭐</span><u>20%</u><s class="w" style="--i:2">Needs fixes</s></div>
              </div></div>
            <div class="hp-score">${ring(88)}<div><strong>88</strong><small>score out of 100, against her own list</small></div></div>
          </div>
        </div>
        <div class="hp-float a">🔒 Locked by Amit</div>
        <div class="hp-float b">★ Rated by 2 people</div>
      </div>
    </section>
      <div class="hp-wrap hp-strip">
        <div class="hp-pr reveal"><span class="tile-ico t-acc">${icon('eye')}</span><div><b>No screenshots</b><span>We measure results, never screens.</span></div></div>
        <div class="hp-pr reveal" style="--rd:.08s"><span class="tile-ico t-teal">${icon('score')}</span><div><b>Task count never counts</b><span>Only ranked priorities score.</span></div></div>
        <div class="hp-pr reveal" style="--rd:.16s"><span class="tile-ico t-pink">${icon('team')}</span><div><b>Rated in the open</b><span>Two raters on top work, with reasons.</span></div></div>
        <div class="hp-pr reveal" style="--rd:.24s"><span class="tile-ico t-good">${icon('shield')}</span><div><b>An open formula</b><span>Everyone can see how the score works.</span></div></div>
      </div>
    </div>

    <section class="hp-sec" id="hp-stack"><div class="hp-wrap">
      <div class="hp-kicker reveal">The idea</div>
      <h2 class="hp-h2 reveal">Your week is a stack.</h2>
      <p class="hp-sub reveal">Your manager ranks up to five priorities. Each slab is as wide as its weight: 35, 25, 20, 12 and 8. A slab fills when the work is delivered and rated. Everything outside the stack is logged, but earns nothing.</p>
      <div class="hp-stackbox reveal">
        <div class="stack" role="img" aria-label="The five slabs of a priority stack, 35, 25, 20, 12 and 8 percent">${[35, 25, 20, 12, 8].map((w, k) => `<div class="seg full" style="--w:${w};--k:${k}"><i></i><span class="n">#${k + 1}</span><span class="wt">${w}</span></div>`).join('')}</div>
        <div class="hp-ranks"><div><b>#1 · 35%</b>The one result that matters most this week.</div><div><b>#2 · 25%</b>The next most valuable thing.</div><div><b>#3 · 20%</b>Important, but it can slip a little.</div><div><b>#4 · 12%</b>Worth doing if the top three go well.</div><div><b>#5 · 8%</b>A nice-to-have.</div></div>
      </div>
    </div></section>

    <section class="hp-sec alt" id="hp-how"><div class="hp-wrap">
      <div class="hp-kicker reveal">How it works</div>
      <h2 class="hp-h2 reveal">Four steps, every week.</h2>
      <p class="hp-sub reveal">Click a step, or just watch. It plays by itself.</p>
      <div class="hp-steps reveal" id="hpSteps">
        <div class="hp-stepnav" role="tablist">${STEPS.map((s, i) => `<button class="hp-step${i === 0 ? ' on' : ''}" role="tab" data-i="${i}" type="button"><span class="n">${s.n}</span><span><b>${s.t}</b><span class="t">${s.d}</span></span><i class="pb"></i></button>`).join('')}</div>
        <div class="hp-stage" aria-live="polite">${scenes()}</div>
      </div>
    </div></section>

    <section class="hp-sec" id="hp-vs"><div class="hp-wrap">
      <div class="hp-kicker reveal">Why it's different</div>
      <h2 class="hp-h2 reveal">Doing more doesn't score more.</h2>
      <p class="hp-sub reveal">Fifty small tasks can't beat two things that mattered. Only the ranked priorities are scored.</p>
      <div class="hp-vs">
        <div class="vs reveal"><h3>A busy week</h3><div class="tag">24 small things logged</div>
          <div class="vs-dots">${Array.from({ length: 24 }, (_, k) => `<i style="--k:${k}"></i>`).join('')}</div>
          <div class="muted small">Delivered only #3 of the top priorities.</div>
          <div class="vs-score"><strong>25</strong><small>out of 100</small></div></div>
        <div class="vs win reveal" style="--rd:.15s"><h3>A focused week</h3><div class="tag">3 priorities, all delivered</div>
          <div class="vs-cards"><div style="--k:0">#1 Gmail plug launch <em>Done well</em></div><div style="--k:1">#2 Help docs <em>Done well</em></div><div style="--k:2">#3 OAuth refresh <em style="color:var(--warn)">Needs fixes</em></div></div>
          <div class="vs-score"><strong class="hp-grad">88</strong><small>out of 100</small></div></div>
      </div>
    </div></section>

    <section class="hp-sec alt" id="hp-fair"><div class="hp-wrap">
      <div class="hp-kicker reveal">Fairness</div>
      <h2 class="hp-h2 reveal">Built so one opinion can't decide.</h2>
      <p class="hp-sub reveal">Everyone is measured against their own list, rated in the open, and able to push back.</p>
      <div class="hp-cards">
        <div class="hc reveal"><div class="ico">${icon('scale')}</div><h3>Fair at every level</h3><p>An intern's #1 counts as much as a senior's. Everyone is scored out of 100 against their own ranked list.</p>
          <div class="dbl"><div><span>Intern</span><i style="--w:92%"></i><span>92</span></div><div><span>Senior</span><i style="--w:92%"></i><span>92</span></div></div></div>
        <div class="hc reveal" style="--rd:.1s"><div class="ico">${icon('eye')}</div><h3>Two sets of eyes</h3><p>Top priorities need a second rater, so one opinion can't decide. Every "Needs fixes" comes with a reason.</p></div>
        <div class="hc reveal" style="--rd:.2s"><div class="ico">${icon('disputes')}</div><h3>Disagree? Say so</h3><p>Dispute a rating and the rater's manager decides. Both views stay on record.</p></div>
        <div class="hc reveal" style="--rd:.3s"><div class="ico">${icon('sun')}</div><h3>Life happens</h3><p>Leave days lower what's expected. Work blocked by others isn't held against you.</p></div>
      </div>
    </div></section>

    <section class="hp-sec" id="hp-where"><div class="hp-wrap">
      <div class="hp-kicker reveal">Where you work</div>
      <h2 class="hp-h2 reveal">It meets your team where they already are.</h2>
      <p class="hp-sub reveal">Nobody has to live in another tool.</p>
      <div class="hp-where">
        <div class="hw reveal"><h3>${icon('slack').replace('<svg', '<svg width="20" height="20" style="stroke:var(--accent);fill:none;stroke-width:1.9"')} Slack</h3><p>Private messages: your #1 in the morning, rating requests, a weekly team summary. Nothing in channels.</p>
          <div class="demo"><div class="dm"><span class="av">PI</span><div><p><b>Good morning Riya.</b> Your #1 to deliver: Gmail plug launch.</p><small>Today · 10:00</small></div></div><div class="typing" aria-hidden="true"><i></i><i></i><i></i></div></div></div>
        <div class="hw reveal" style="--rd:.12s"><h3>📞 Phone alerts</h3><p>Stuck on a top priority for hours? A phone rings until someone takes it.</p>
          <div class="demo"><div class="phone"><div class="waves"><i></i><i></i><i></i></div><div class="ap"><b>Riya is blocked on #1</b>Waiting on API keys for 4h<div class="bt"><i>I'll unblock it</i><i>Seen</i></div></div></div></div></div>
        <div class="hw reveal" style="--rd:.24s"><h3>${icon('people').replace('<svg', '<svg width="20" height="20" style="stroke:var(--accent);fill:none;stroke-width:1.9"')} Your people</h3><p>Invite by link, import a CSV from any HR tool, or sync from Keka. Managers add and look after their own team.</p>
          <div class="demo"><div class="csv"><div style="--k:0">email,name,role,manager</div><div style="--k:1">amit@co.com,Amit,manager,</div><div style="--k:2">riya@co.com,Riya,member,amit@co.com</div><div style="--k:3">sonal@co.com,Sonal,member,amit@co.com</div></div>
          <div class="chips" style="margin-top:.6rem"><span>CSV</span><span>Keka</span><span>Invite link</span></div></div></div>
      </div>
    </div></section>

    <section class="hp-wrap hp-final"><div class="box reveal">${cairn()}<h2>See your own week in two minutes.</h2><p>Create a workspace, invite your team, and rank the first week. No setup call needed.</p>
      ${signedIn ? '<a class="btn" href="#/week">Open my week</a>' : '<a class="btn" href="#/signup">Create a workspace</a>'}</div></section>
    <footer class="hp-end"><div class="hp-wrap">
      <div class="hp-fgrid">
        <div class="hp-fbrand"><a class="brand" href="#/home">${logo()}${brand.name}</a>
          <p>${brand.tagline} A weekly priority stack, rated by the people who used the work, for every team in the company.</p>
          <div class="hp-tags"><span>No screenshots</span><span>No time tracking</span><span>Open formula</span></div></div>
        <div><h4>Product</h4><ul><li><a data-go="hp-how">How it works</a></li><li><a data-go="hp-vs">Why it's different</a></li><li><a data-go="hp-fair">Fairness</a></li><li><a data-go="hp-where">Where you work</a></li></ul></div>
        <div><h4>${signedIn ? 'Your workspace' : 'Get started'}</h4><ul>${signedIn
          ? '<li><a href="#/week">My Week</a></li><li><a href="#/how">How we score</a></li><li><a href="#/team">Team</a></li>'
          : '<li><a href="#/signup">Create a workspace</a></li><li><a href="#/signin">Sign in</a></li>'}</ul></div>
        <div><h4>Our promises</h4><ul class="hp-pledge"><li>No screenshots, ever</li><li>Task count never counts</li><li>Every rating has a reason</li><li>AI never scores anyone</li></ul></div>
      </div>
      <div class="hp-fbar"><span class="stones">${logo()}© ${new Date().getFullYear()} ${brand.name}</span><span>${brand.tagline}</span></div>
    </div></footer>
    </div>`;
  }

  function countUp(el, to, ms) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = (t) => { const p = Math.min(1, (t - t0) / ms); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  function render(root, opts) {
    destroy();
    root.innerHTML = html(opts);
    const el = root.querySelector('.hp');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // smooth scroll for the in-page links (the URL hash belongs to the app's router)
    el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const t = document.getElementById(a.dataset.go);
      if (t) t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }));

    // reveal on scroll
    const rv = new IntersectionObserver((entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); rv.unobserve(en.target); } }), { threshold: 0.18 });
    el.querySelectorAll('.reveal').forEach((n) => rv.observe(n));
    observers.push(rv);

    // the step player
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
    const vis = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== visible) { visible = v; if (v) show(cur); else schedule(); } }, { threshold: 0.35 });
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
