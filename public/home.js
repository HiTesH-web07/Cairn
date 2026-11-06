'use strict';
// Home: explains the app in about 30 seconds, mostly through motion.
// Everything is plain HTML and CSS animation; the only script is the step player and scroll reveals.
(function () {
  const { icon, logo, ring, brand, cairn } = window.UI;
  let timers = [];
  let observers = [];
  let cleanups = [];

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
      <div class="rk" style="--y:-50px;--dl:.4s"><b>#3</b><span>OAuth refresh · Stretch</span><em>20%</em></div>
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
      <div class="coin"><span class="coinic"></span>3 coins from Aman: "helped me debug the plug"</div>
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
      <div class="hp-cta">${window.UI.themeBtn()}${cta}</div>
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
                <div class="hp-card" style="--i:2"><b>#3</b><span>OAuth refresh · Stretch</span><u>20%</u><s class="w" style="--i:2">Needs fixes</s></div>
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
        <div class="hp-pr reveal" style="--rd:.08s"><span class="tile-ico t-teal">${icon('score')}</span><div><b>Tasks don't count</b><span>Only ranked priorities score.</span></div></div>
        <div class="hp-pr reveal" style="--rd:.16s"><span class="tile-ico t-pink">${icon('team')}</span><div><b>Rated in the open</b><span>Two raters on top work, with reasons.</span></div></div>
        <div class="hp-pr reveal" style="--rd:.24s"><span class="tile-ico t-good">${icon('shield')}</span><div><b>An open formula</b><span>Everyone can see how the score works.</span></div></div>
      </div>
    </div>

    <section class="hp-sec" id="hp-stack"><div class="hp-wrap">
      <div class="hp-kicker reveal">The score</div>
      <h2 class="hp-h2 reveal">Watch one week become one number.</h2>
      <p class="hp-sub reveal">This is Riya's week. Follow it from the manager's plan to the final score: no formulas to read, just watch.</p>
      <div class="sx reveal" id="sx" data-s="0">
        <div class="sx-board">
          <div class="sx-head"><span>Riya's priorities this week</span><span>Worth</span></div>
          ${[['#1', 'Gmail plug launch', 35, 100, 'Done well', 35], ['#2', 'Write the help docs', 25, 100, 'Done well', 25], ['#3', 'OAuth refresh', 20, 50, 'Needs fixes', 10]].map((r, k) => `
          <div class="sx-row" data-w="${r[2]}" data-q0="${r[3] === 100 ? 'well' : 'fix'}" style="--k:${k};--w:${r[2]};--fill:${r[3]}%">
            <b class="sx-rk${k === 0 ? ' r1' : ''}">${r[0]}</b>
            <div class="sx-main"><div class="sx-title">${r[1]}</div>
              <div class="sx-line"><div class="sx-track"><i class="fill"></i></div><span class="worth">${r[2]} pts</span></div>
              <div class="sx-rate" role="group" aria-label="Rate ${r[1]}">${[['well', 'Done well'], ['fix', 'Needs fixes'], ['redo', 'Redo']].map((q) => `<button type="button" data-q="${q[0]}"${(r[3] === 100 ? 'well' : 'fix') === q[0] ? ' class="on"' : ''}>${q[1]}</button>`).join('')}</div></div>
            <div class="sx-state"><span class="pill p-a">Planned</span><span class="pill warn p-b">Delivered</span><span class="pill ${r[3] === 100 ? 'good' : 'warn'} p-c">${r[4]}</span></div>
            <div class="sx-earn">+${r[5]}</div>
          </div>`).join('')}
          ${[4, 5].map((n) => `<div class="sx-row sx-empty"><b class="sx-rk">#${n}</b><div class="sx-main"><div class="sx-title">Empty slot</div><div class="sx-line"><div class="sx-track dashed"></div></div></div><div class="sx-state"><span class="pill">Not ranked</span></div><div></div></div>`).join('')}
          <div class="sx-else"><div class="lab">Everything else Riya did</div>
            <div class="sx-chips"><span style="--k:0">Replied to 40 emails<em>0 pts</em></span><span style="--k:1">Fixed a typo<em>0 pts</em></span><span style="--k:2">Joined 12 meetings<em>0 pts</em></span></div>
            <div class="sx-spam"><button type="button" class="btn sm" data-spam>+ Log 10 more tasks</button><span class="sx-logged">Tasks logged: <b data-logged>3</b></span><span class="sx-same" data-same>Score unchanged</span></div></div>
        </div>
        <aside class="sx-score">
          <div><div class="sx-lab">Points earned</div><div class="sx-earned"><b data-earn>0</b><span>of 80 possible</span></div></div>
          <div class="sx-eq"><span>70</span><i>÷</i><span>80</span><i>=</i></div>
          <div><div class="sx-lab">Riya's score</div><div class="sx-num"><b data-n>?</b><small>/ 100</small></div></div>
        </aside>
        <div class="sx-gauge" aria-hidden="true"><i data-gauge></i></div>
        <div class="sx-modes" role="group" aria-label="Mode"><button type="button" class="on" data-mode="auto">Watch it play</button><button type="button" data-mode="play">Try it yourself</button></div>
        <div class="sx-cap"><span class="sx-step" data-stepno>1 / 5</span><p data-cap></p></div>
        <div class="sx-dots" role="tablist">${['Rank', 'Weigh', 'Deliver & rate', 'The rest', 'Score'].map((t, i) => `<button type="button" role="tab" class="sx-dot${i === 0 ? ' on' : ''}" data-i="${i}"><i></i><span>${i + 1}. ${t}</span></button>`).join('')}</div>
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

    <section class="hp-sec alt" id="hp-m91"><div class="hp-wrap m91">
      <div class="m91-copy">
        <div class="hp-kicker reveal">Phone alerts · powered by M91</div>
        <h2 class="hp-h2 reveal">When work is stuck and needs a human.</h2>
        <p class="hp-sub reveal">Cairn notifies the right person's phone so they can unblock, decide or act, and keeps ringing until somebody responds.</p>
        <ul class="m91-list reveal">
          <li><b>Blocked on a top priority</b><span>The manager's phone rings until someone takes it.</span></li>
          <li><b>Work nobody has rated</b><span>A nudge before the week's score goes stale.</span></li>
          <li><b>A dispute stuck for days</b><span>Goes up a level, and the phone with it.</span></li>
        </ul>
        <p class="m91-note reveal">Serious events only. Everything else stays in Slack.</p>
      </div>
      <div class="m91-stage reveal" aria-hidden="true">
        <div class="m91-tl"><span style="--k:0">10:02 · Riya is blocked on #1</span><span style="--k:1">10:03 · Phone rings for Amit</span><span style="--k:2">10:03 · Still ringing…</span><span style="--k:3">10:05 · Amit taps “I'll unblock it”</span></div>
        <div class="m91-phone"><div class="waves"><i></i><i></i><i></i></div>
          <div class="m91-card"><small>CAIRN · URGENT</small><b>Riya is blocked on #1</b><span>Waiting on API keys for 4h</span>
            <div class="bt"><i>I'll unblock it</i><i>Seen</i></div></div>
          <div class="m91-ok"><em>✓</em><b>Answered</b><span>Ringing stopped</span></div></div>
      </div>
    </div></section>

    <section class="hp-sec" id="hp-where"><div class="hp-wrap">
      <div class="hp-kicker reveal">Where you work</div>
      <h2 class="hp-h2 reveal">Set up in minutes. Then it lives in Slack.</h2>
      <p class="hp-sub reveal">Three steps for an admin, and nothing new to learn for everyone else.</p>
      <div class="wk reveal" id="wk" data-s="0">
        <div class="wk-tabs" role="tablist">
          ${[['Connect your tools', 'One click for Slack, Keka and the phone alert. We only read what you tick.'], ['Bring your people', 'Import a CSV, sync from Keka or share invite links. Managers add their own team.'], ['Work arrives in Slack', 'A private message each morning, rating requests and a weekly summary. Nothing in channels.']].map((t, i) => `<button type="button" role="tab" class="wk-tab${i === 0 ? ' on' : ''}" data-i="${i}"><span class="n">${i + 1}</span><b>${t[0]}</b><span class="d">${t[1]}</span><i></i></button>`).join('')}
        </div>
        <div class="wk-stage" aria-live="polite">
          <div class="wk-p wk-p0"><div class="wk-title">Integrations · admin</div>
            ${[['Slack', 'Private messages to your team', '#4a154b', 'S'], ['Keka', 'Read people and teams, never salary', '#ef4d5e', 'K'], ['M91', 'Phone rings for serious events', '#0d9488', 'M']].map((x, k) => `<div class="wk-conn" style="--k:${k}"><span class="lg" style="background:${x[2]}">${x[3]}</span><div><b>${x[0]}</b><small>${x[1]}</small></div><div class="wk-btn"><span class="b1">Connect</span><span class="b2">✓ Connected</span></div></div>`).join('')}
            <p class="wk-note">Connections are stored encrypted. You can disconnect any of them at any time.</p></div>
          <div class="wk-p wk-p1"><div class="wk-title">People · 12 added</div>
            <div class="wk-src"><span>CSV</span><span>Keka sync</span><span>Invite link</span></div>
            <div class="wk-org">
              ${[['Hitesh Ahuja', 'Founder', 'l0'], ['Amit Verma', 'Team lead · Engineering', 'l1'], ['Riya Shah', 'Engineer · reports to Amit', 'l2'], ['Sonal Gupta', 'Engineer · reports to Amit', 'l2'], ['Neha Rao', 'Marketer · reports to Hitesh', 'l1']].map((p, k) => `<div class="wk-per ${p[2]}" style="--k:${k}"><span class="avatar" style="background:hsl(${k * 63 + 230} 65% 52%)">${p[0][0]}</span><div><b>${p[0]}</b><small>${p[1]}</small></div>${k === 4 ? '<em>+ 7 more</em>' : ''}</div>`).join('')}
            </div></div>
          <div class="wk-p wk-p2"><div class="wk-title">Slack · direct messages</div>
            <div class="wk-slack">
              <div class="wk-msg" style="--k:0"><span class="av">C</span><div><p><b>Good morning Riya.</b> Your #1 this week: <b>Gmail plug launch</b>.</p><small>Mon · 10:00</small><div class="bt"><i class="go">Open my week</i><i>Mark delivered</i></div></div></div>
              <div class="wk-msg me" style="--k:1"><span class="av">R</span><div><p>Delivered, with the launch checklist attached.</p><small>Thu · 16:20</small></div></div>
              <div class="wk-msg" style="--k:2"><span class="av">C</span><div><p><b>Amit rated it: Done well.</b> You earned 35 of 80 points this week so far.</p><small>Fri · 11:05</small></div></div>
            </div></div>
        </div>
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
    // The score walkthrough: five steps that play by themselves, one caption each.
    const sx = el.querySelector('#sx');
    if (sx) {
      const CAPS = [
        "Your manager ranks your top priorities for the week. Up to five. Anything not ranked is not scored.",
        "Each rank is worth a share of the score. #1 is worth the most, so it is the one to get right.",
        "You deliver with proof, and the people who used the work rate it. Done well counts in full. Needs fixes counts half.",
        "Everything else you did is still logged, but it is worth 0. More tasks never mean a higher score.",
        "Score = points earned divided by points possible. 70 ÷ 80 = 88 out of 100."
      ];
      const DURS = [3600, 3600, 6800, 3800, 6200];
      const dots = [...sx.querySelectorAll('.sx-dot')];
      const earnEl = sx.querySelector('[data-earn]');
      const numEl = sx.querySelector('[data-n]');
      const capEl = sx.querySelector('[data-cap]');
      const noEl = sx.querySelector('[data-stepno]');
      const gaugeEl0 = sx.querySelector('[data-gauge]');
      let cur = 0; let inView = false; let hoverSx = false; let tms = [];
      const clear = () => { tms.forEach(clearTimeout); tms = []; };
      const later = (fn, ms) => tms.push(setTimeout(fn, ms));
      const goTo = (i) => {
        clear(); cur = i; sx.dataset.s = String(i);
        dots.forEach((d, k) => { d.classList.toggle('on', k === i); d.classList.toggle('done', k < i); d.style.setProperty('--dur', `${DURS[i]}ms`); });
        capEl.textContent = CAPS[i]; noEl.textContent = `${i + 1} / 5`;
        gaugeEl0.style.width = i === 4 ? '88%' : '0%';
        const set = (n, v) => { if (n) { n.textContent = v; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); } };
        if (i < 2) { earnEl.textContent = '0'; numEl.textContent = '?'; }
        if (i === 2) { numEl.textContent = '?'; earnEl.textContent = '0'; later(() => set(earnEl, '35'), 2700); later(() => set(earnEl, '60'), 3300); later(() => set(earnEl, '70'), 3900); }
        if (i === 3) { earnEl.textContent = '70'; numEl.textContent = '?'; }
        if (i === 4) { earnEl.textContent = '70'; countUp(numEl, 88, 1300); }
        numEl.classList.toggle('dim', i < 4);
        if (!reduce && inView && !hoverSx) later(() => goTo((i + 1) % 5), DURS[i]);
      };
      // Feature 1 and 2: play mode. Rate each priority yourself, then try to game it with tasks.
      let play = false;
      const rows = [...sx.querySelectorAll('.sx-row[data-w]')];
      const gaugeEl = sx.querySelector('[data-gauge]');
      const eqSpans = sx.querySelectorAll('.sx-eq span');
      const loggedEl = sx.querySelector('[data-logged]');
      const chipsEl = sx.querySelector('.sx-chips');
      const sameEl = sx.querySelector('[data-same]');
      const modeBtns = [...sx.querySelectorAll('[data-mode]')];
      const MULT = { well: 1, fix: 0.5, redo: 0 };
      const LABEL = { well: ['Done well', 'good'], fix: ['Needs fixes', 'warn'], redo: ['Redo', 'bad'] };
      const TASKS = ['Answered a Slack thread', 'Renamed a file', 'Updated a ticket', 'Joined a standup', 'Tidied the board', 'Sent a reminder', 'Reordered tabs', 'Replied "thanks"', 'Cleared notifications', 'Moved a meeting'];
      let logged = 3; let shown = 0;
      const tween = (n, to, ms) => {
        const from = parseInt(n.textContent, 10) || 0;
        if (reduce || from === to) { n.textContent = to; return; }
        const t0 = performance.now();
        const f = (t) => { const p = Math.min(1, (t - t0) / ms); n.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(f); };
        requestAnimationFrame(f);
      };
      const recompute = () => {
        let sum = 0;
        rows.forEach((r) => {
          const q = r.dataset.q; const w = +r.dataset.w; const pts = Math.round(w * MULT[q]);
          sum += pts;
          r.style.setProperty('--fill', `${MULT[q] * 100}%`);
          const pill = r.querySelector('.p-c'); pill.className = `pill ${LABEL[q][1]} p-c`; pill.textContent = LABEL[q][0];
          const e = r.querySelector('.sx-earn'); e.textContent = `+${pts}`;
          r.querySelectorAll('.sx-rate button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
        });
        const score = Math.round(sum / 80 * 100);
        tween(earnEl, sum, 500); eqSpans[0].textContent = sum; tween(numEl, score, 700);
        gaugeEl.style.width = `${score}%`;
        earnEl.classList.remove('bump'); void earnEl.offsetWidth; earnEl.classList.add('bump');
        return score;
      };
      const setMode = (m) => {
        const on = m === 'play';
        modeBtns.forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
        if (on === play) return;
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
          sx.classList.remove('paused'); sameEl.classList.remove('show'); gaugeEl.style.width = '0%';
          recompute(); goTo(0);
        }
      };
      rows.forEach((r) => { r.dataset.q = r.dataset.q0; r.querySelectorAll('.sx-rate button').forEach((b) => b.addEventListener('click', () => { r.dataset.q = b.dataset.q; if (!play) setMode('play'); else recompute(); const e = r.querySelector('.sx-earn'); e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); })); });
      modeBtns.forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
      sx.querySelector('[data-spam]').addEventListener('click', () => {
        if (!play) setMode('play');
        const before = numEl.textContent;
        for (let i = 0; i < 10; i++) {
          logged += 1; shown += 1;
          if (shown <= 24) { const c = document.createElement('span'); c.className = 'extra'; c.style.setProperty('--k', i * 0.05); c.innerHTML = `${TASKS[(logged + i) % TASKS.length]}<em>0 pts</em>`; chipsEl.appendChild(c); }
        }
        loggedEl.textContent = logged; loggedEl.classList.remove('bump'); void loggedEl.offsetWidth; loggedEl.classList.add('bump');
        numEl.textContent = before; sameEl.classList.remove('show'); void sameEl.offsetWidth; sameEl.classList.add('show');
        numEl.classList.remove('shake'); void numEl.offsetWidth; numEl.classList.add('shake');
      });
      dots.forEach((d, i) => d.addEventListener('click', () => { if (play) setMode('auto'); goTo(i); }));
      sx.addEventListener('mouseenter', () => { hoverSx = true; clear(); sx.classList.add('paused'); });
      sx.addEventListener('mouseleave', () => { hoverSx = false; if (play) return; sx.classList.remove('paused'); goTo(cur); });
      const sxv = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== inView) { inView = v; if (play) return; if (v) goTo(reduce ? 4 : 0); else clear(); } }, { threshold: 0.35 });
      sxv.observe(sx);
      observers.push(sxv);
      cleanups.push(clear);
      goTo(reduce ? 4 : 0);
    }

    // Where you work: a three-step setup journey that plays by itself
    const wk = el.querySelector('#wk');
    if (wk) {
      const tabs = [...wk.querySelectorAll('.wk-tab')]; const WD = 6500; let wc = 0; let wvis = false; let wh = false; let wt = null;
      const wgo = (i) => {
        clearTimeout(wt); wc = i; wk.dataset.s = String(i);
        tabs.forEach((t, k) => { t.classList.toggle('on', k === i); t.classList.toggle('done', k < i); t.style.setProperty('--dur', `${WD}ms`); t.setAttribute('aria-selected', k === i); });
        wk.classList.toggle('paused', wh || !wvis || reduce);
        if (!reduce && wvis && !wh) wt = setTimeout(() => wgo((i + 1) % 3), WD);
      };
      tabs.forEach((t, i) => t.addEventListener('click', () => wgo(i)));
      wk.addEventListener('mouseenter', () => { wh = true; wgo(wc); });
      wk.addEventListener('mouseleave', () => { wh = false; wgo(wc); });
      const wv = new IntersectionObserver((en) => { const v = en[0].isIntersecting; if (v === wvis) return; wvis = v; wgo(v && !reduce ? 0 : wc); }, { threshold: 0.4 });
      wv.observe(wk); observers.push(wv); cleanups.push(() => clearTimeout(wt));
      wgo(0);
    }

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
    cleanups.forEach((f) => f()); cleanups = [];
    observers.forEach((o) => o.disconnect()); observers = [];
  }

  window.Home = { render, destroy };
})();
