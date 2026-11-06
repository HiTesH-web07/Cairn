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

  const ph = (n) => window.UI.ph(n);
  const scenes = () => `
    <div class="sc sc1" data-sc="0">
      <div class="sc-title">Amit ranks Riya's week · Intern</div>
      <div class="rk st" style="--y:90px;--dl:.1s"><b>#1</b><span>Gmail plug launch</span><em>35%</em></div>
      <div class="rk" style="--y:-50px;--dl:.25s"><b>#2</b><span>Write the help docs</span><em>25%</em></div>
      <div class="rk" style="--y:-50px;--dl:.4s"><b>#3</b><span>OAuth refresh · Stretch</span><em>20%</em></div>
      <div class="lock">${ph('lock-simple')}Week locked. Nobody can quietly change it.</div>
      <div class="dm sc-pop" style="--dl:1.8s"><span class="av">PI</span><div><p><b>Your week is ready, Riya.</b> Your #1: Gmail plug launch (35% of your score).</p><small>Slack · private message</small></div></div>
    </div>
    <div class="sc sc2" data-sc="1">
      <div class="sc-title">Riya delivers her #1</div>
      <div class="sc-card sc-pop">
        <h4>Gmail plug launch</h4>
        <div class="st-wrap"><span class="pill p1">In progress</span><span class="pill good p2">Delivered</span></div>
        <div class="proof">${ph('link-simple')}<span>github.com/acme/gmail-plug/pull/231</span><small>proof added</small></div>
      </div>
      <div class="btn-fake">Deliver with proof</div>
      <div class="nope sc-pop" style="--dl:1.4s">${ph('x')}No link or note? It can't be marked delivered.</div>
    </div>
    <div class="sc sc3" data-sc="2">
      <div class="sc-title">Two people rate it</div>
      <div class="rt">
        <div class="rater sc-pop"><span class="av">A</span><div><b>Amit</b> <small>her manager</small><div class="opts"><span class="pick" style="--dl:.6s">Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
        <div class="rater sc-pop" style="--dl:.25s"><span class="av">S</span><div><b>Sonal</b> <small>used the plug</small><div class="opts"><span class="pick" style="--dl:1.1s">Done well</span><span>Needs fixes</span><span>Redo</span></div></div></div>
      </div>
      <div class="done">${ph('check-circle')}Rated by 2 people</div>
      <div class="dm sc-pop" style="--dl:.5s"><span class="av">PI</span><div><p><b>Riya delivered "Gmail plug launch".</b> Rate it: proof attached.</p><small>Slack · sent to both raters</small></div></div>
    </div>
    <div class="sc sc4" data-sc="3">
      <div class="sc-title">Riya's week</div>
      <div class="sg sc-pop">
        <div class="big"><strong data-count="88">88</strong><small>/ 100</small></div>
        <div class="mini">
          <div style="--dl:.2s"><span>Priorities</span><i style="--w:88%;--dl:.2s"></i></div>
          <div style="--dl:.5s"><span>Quality</span><i style="--w:75%;--dl:.5s"></i></div>
          <div style="--dl:.8s"><span>Alignment</span><i style="--w:60%;--dl:.8s"></i></div>
        </div>
      </div>
      <div class="coin"><span class="coinic"></span>3 coins from Aman: "helped me debug the plug"</div>
      <div class="muted small sc-pop" style="--dl:1.7s">Coins sit beside the score. They are never added to it.</div>
    </div>`;

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
    ['Can everyone see how the score works?', 'Yes. The formula and the weights are open to everyone in the workspace.']
  ];
  const TAGLINE = 'Measure what mattered, not how busy anyone looked. One fair score for every team, rated by the people who used the work.';
  const NAV_LINKS = [['hp-how', 'How it works'], ['hp-vs', "Why it's different"], ['hp-fair', 'Fairness'], ['hp-where', 'Where you work']];

  function html({ signedIn }) {
    const ph = window.UI.ph;
    const primary = signedIn ? '<a class="btn primary" href="#/week">Open my week</a>' : '<a class="btn primary" href="#/signup">Create a workspace</a>';
    const signin = signedIn ? '' : '<a class="btn ghost" href="#/signin">Sign in</a>';
    const links = (cls) => NAV_LINKS.map(([id, t], i) => `<a class="${cls}" href="#/home" data-go="${id}" data-spy="${id}" style="--i:${i}">${t}</a>`).join('');
    return `<div class="hp">
    <div id="nv-sentinel" aria-hidden="true"></div>
    <header class="nv-wrap">
      <nav class="nv" aria-label="Main">
        <a class="nv-brand" href="#/home" aria-label="${brand.name}, home">${logo()}<span>${brand.name}</span></a>
        <div class="nv-links">${links('nv-link')}</div>
        <div class="nv-actions">${window.UI.themeBtn()}${signin}${primary}</div>
        <button class="nv-toggle" type="button" aria-expanded="false" aria-controls="nv-menu" aria-label="Open menu"><span></span><span></span><span></span></button>
      </nav>
      <div class="nv-menu" id="nv-menu" aria-label="Menu">
        <div class="nv-menu-in">
          ${NAV_LINKS.map(([id, t], i) => `<a class="nv-mlink" href="#/home" data-go="${id}" data-spy="${id}" style="--i:${i}">${t}${ph('arrow-right')}</a>`).join('')}
          <div class="nv-mactions" style="--i:${NAV_LINKS.length}">${signin}${primary}</div>
          <div class="nv-mtheme" style="--i:${NAV_LINKS.length + 1}"><span>Light or dark</span>${window.UI.themeBtn()}</div>
        </div>
      </div>
    </header>

    <main id="home-main">
    <section class="hero hp-wrap" aria-labelledby="hero-h1">
      <div class="hero-copy">
        <p class="hero-eyebrow"><span aria-hidden="true"></span>Measure value, not busyness</p>
        <h1 class="hero-h1" id="hero-h1"><span class="nb">Measure the value</span> <span class="nb">of work,</span> <span class="nb">not the number</span> <span class="nb">of tasks.</span></h1>
        <p class="hero-sub">Each week your manager picks the few things that matter most. You deliver them with proof, the people who used your work rate them, and you get one fair score.</p>
        <div class="hero-cta">${signedIn ? '<a class="btn primary btn-lg" href="#/week">Open my week</a>' : '<a class="btn primary btn-lg" href="#/signup">Create a workspace</a>'}<button class="btn ghost btn-lg" data-go="hp-how" type="button">See how it works${ph('arrow-down')}</button></div>
        <ul class="hero-proof"><li>${ph('check-circle')}No screenshots or time tracking</li><li>${ph('check-circle')}Task count never counts</li><li>${ph('check-circle')}Every rating has a reason</li></ul>
      </div>
      <div class="hv">
        <p class="sr-only">Example week for Riya. Three ranked priorities worth 35, 25 and 20 points were delivered and rated. She earned 70 of 80 points, a score of 88 out of 100. Everything else she did is logged and earns zero.</p>
        <div class="hv-card" aria-hidden="true">
          <div class="hv-head"><div><span class="hv-k">My Week</span><span class="hv-who">Riya Shah · Nov 2 to Nov 8</span></div><span class="pill good hv-lock">${ph('lock-simple')}Locked by Amit</span></div>
          <div class="hv-label"><span>Top priorities</span><span>Worth</span></div>
          <ol class="hv-rows">
            ${[['1', 'Gmail plug launch', 35, 100, 'Done well', 'good'], ['2', 'Write the help docs', 25, 71, 'Done well', 'good'], ['3', 'OAuth refresh', 20, 57, 'Needs fixes', 'warn']].map((r, i) => `
            <li class="hv-row" style="--i:${i}"><b class="hv-rk">${r[0]}</b><div class="hv-main"><span class="hv-t">${r[1]}</span><div class="hv-bar"><i style="--w:${r[3]}%"></i></div></div><span class="hv-w">${r[2]}</span><span class="pill ${r[5]}">${r[4]}</span></li>`).join('')}
          </ol>
          <div class="hv-label hv-label2"><span>Logged, not scored</span><span>0 pts</span></div>
          <div class="hv-noise">${['Replied to 40 emails', 'Fixed a typo', 'Joined 12 meetings', 'Updated the wiki'].map((c, i) => `<span style="--i:${i + 3}">${c}</span>`).join('')}</div>
          <div class="hv-score" style="--i:6">
            <div class="hv-sum"><span class="hv-k">Points</span><span class="hv-eq"><b>70</b> of 80</span></div>
            <div class="hv-num"><b data-hero-score>88</b><span>/ 100</span><small>against her own list</small></div>
          </div>
        </div>
      </div>
    </section>

    <section class="hp-sec" id="hp-stack"><div class="hp-wrap">
      <div class="hp-kicker reveal">The score</div>
      <h2 class="hp-h2 reveal">Watch one week become one number.</h2>
      <p class="hp-sub reveal">This is Riya's week. Follow it from the manager's plan to the final score: no formulas to read, just watch.</p>
      <div class="sx reveal" id="sx" data-s="0">
        <div class="sx-board">
          <div class="sx-head"><span>Riya's priorities this week</span><span>Worth</span></div>
          ${[['#1', 'Gmail plug launch', 35, 100, 'Done well', 35], ['#2', 'Write the help docs', 25, 100, 'Done well', 25], ['#3', 'OAuth refresh', 20, 50, 'Needs fixes', 10]].map((r, k) => `
          <div class="sx-row" data-w="${r[2]}" data-q0="${r[3] === 100 ? 'well' : 'fix'}" style="--k:${k};--w:${r[2]};--fn:${r[3] / 100}">
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
        <p class="hp-stepcap" aria-live="polite"></p>
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
          <div class="vs-score"><strong class="vs-win-n">88</strong><small>out of 100</small></div></div>
      </div>
    </div></section>

    <section class="hp-sec tag" id="hp-tag" aria-label="What Cairn is for"><div class="hp-wrap"><p class="tag-text" data-words>${TAGLINE}</p></div></section>

    <section class="hp-sec alt" id="hp-fair"><div class="hp-wrap">
      <div class="hp-kicker reveal">Fairness</div>
      <h2 class="hp-h2 reveal">Built so one opinion can't decide.</h2>
      <p class="hp-sub reveal">Everyone is measured against their own list, rated in the open, and able to push back.</p>
      <div class="fair">
        <div class="fair-feature reveal">
          <h3>Fair at every level</h3>
          <p>An intern's #1 counts as much as a senior's. Everyone is scored out of 100 against their own ranked list.</p>
          <div class="fair-bars" aria-label="An intern and a senior, both scored 92 out of 100">
            <div><span>Intern</span><div class="fb"><i style="--w:.92"></i></div><b>92</b></div>
            <div><span>Senior</span><div class="fb"><i style="--w:.92"></i></div><b>92</b></div>
          </div>
        </div>
        <ul class="fair-list">
          <li class="reveal">${ph('eye')}<div><h3>Two sets of eyes</h3><p>Top priorities need a second rater, so one opinion can't decide. Every "Needs fixes" comes with a reason.</p></div></li>
          <li class="reveal" style="--rd:.1s">${ph('scales')}<div><h3>Disagree? Say so</h3><p>Dispute a rating and the rater's manager decides. Both views stay on record.</p></div></li>
          <li class="reveal" style="--rd:.2s">${ph('calendar-check')}<div><h3>Life happens</h3><p>Leave days lower what's expected. Work blocked by others isn't held against you.</p></div></li>
        </ul>
      </div>
    </div></section>

    <section class="hp-sec alt" id="hp-m91"><div class="hp-wrap m91">
      <div class="m91-copy">
        <div class="hp-kicker reveal">Phone alerts · powered by M91</div>
        <h2 class="hp-h2 reveal">When work is stuck and needs a human.</h2>
        <p class="hp-sub reveal">Cairn notifies the right person's phone so they can unblock, decide or act, and keeps ringing until somebody responds.</p>
        <ul class="m91-list reveal">
          <li>${ph('warning-circle')}<div><b>Blocked on a top priority</b><span>The manager's phone rings until someone takes it.</span></div></li>
          <li>${ph('clock-counter-clockwise')}<div><b>Work nobody has rated</b><span>A nudge before the week's score goes stale.</span></div></li>
          <li>${ph('scales')}<div><b>A dispute stuck for days</b><span>Goes up a level, and the phone with it.</span></div></li>
        </ul>
        <p class="m91-note reveal">Serious events only. Everything else stays in Slack.</p>
      </div>
      <div class="m91-stage reveal" aria-hidden="true">
        <div class="m91-tl"><span style="--k:0">10:02 · Riya is blocked on #1</span><span style="--k:1">10:03 · Phone rings for Amit</span><span style="--k:2">10:03 · Still ringing…</span><span style="--k:3">10:05 · Amit taps “I'll unblock it”</span></div>
        <div class="m91-phone"><div class="waves"><i></i><i></i><i></i></div>
          <div class="m91-card"><small>CAIRN · URGENT</small><b>Riya is blocked on #1</b><span>Waiting on API keys for 4h</span>
            <div class="bt"><i>I'll unblock it</i><i>Seen</i></div></div>
          <div class="m91-ok">${ph('check-circle')}<b>Answered</b><span>Ringing stopped</span></div></div>
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

    <section class="hp-sec alt" id="hp-faq"><div class="hp-wrap faq">
      <div class="faq-head"><div class="hp-kicker reveal">Questions</div><h2 class="hp-h2 reveal">Questions people ask before they start.</h2><p class="hp-sub reveal">Short answers, in plain words.</p></div>
      <div class="faq-list reveal">${FAQ.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</div>
    </div></section>

    <section class="hp-wrap hp-final"><div class="box reveal"><div><h2>See your own week in two minutes.</h2><p>Create a workspace, invite your team, and rank the first week. No setup call needed.</p></div>
      ${signedIn ? '<a class="btn btn-lg" href="#/week">Open my week</a>' : '<a class="btn btn-lg" href="#/signup">Create a workspace</a>'}</div></section>
    </main>
    <footer class="hp-end"><div class="hp-wrap">
      <div class="hp-fgrid">
        <div class="hp-fbrand"><a class="brand" href="#/home">${logo()}${brand.name}</a>
          <p>${brand.tagline} A weekly priority stack, rated by the people who used the work, for every team in the company.</p>
          <div class="hp-tags"><span>No screenshots</span><span>No time tracking</span><span>Open formula</span></div></div>
        <div><h4>Product</h4><ul><li><a href="#/home" data-go="hp-how">How it works</a></li><li><a href="#/home" data-go="hp-vs">Why it's different</a></li><li><a href="#/home" data-go="hp-fair">Fairness</a></li><li><a href="#/home" data-go="hp-where">Where you work</a></li></ul></div>
        <div><h4>${signedIn ? 'Your workspace' : 'Get started'}</h4><ul>${signedIn
          ? '<li><a href="#/week">My Week</a></li><li><a href="#/how">How we score</a></li><li><a href="#/team">Team</a></li>'
          : '<li><a href="#/signup">Create a workspace</a></li><li><a href="#/signin">Sign in</a></li>'}</ul></div>
        <div><h4>Our promises</h4><ul class="hp-pledge">${['No screenshots, ever', 'Task count never counts', 'Every rating has a reason', 'AI never scores anyone'].map((t) => `<li>${ph('check')}${t}</li>`).join('')}</ul></div>
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
      if (open) { menu.removeAttribute('inert'); setTimeout(() => menu.querySelector('a, button')?.focus(), 60); }
      else { menu.setAttribute('inert', ''); if (returnFocus && menu.contains(document.activeElement)) toggle.focus(); }
    };
    toggle.addEventListener('click', () => setMenu(!nv.classList.contains('open')));
    const onKey = (e) => { if (e.key === 'Escape' && nv.classList.contains('open')) setMenu(false); };
    const onSize = () => { if (desktop.matches && nv.classList.contains('open')) setMenu(false, false); };
    document.addEventListener('keydown', onKey);
    desktop.addEventListener('change', onSize);
    cleanups.push(() => { document.removeEventListener('keydown', onKey); desktop.removeEventListener('change', onSize); document.documentElement.classList.remove('nv-lock'); });

    // in-page links scroll smoothly (the URL hash belongs to the app's router)
    el.querySelectorAll('[data-go]').forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const wasOpen = nv.classList.contains('open');
      if (wasOpen) setMenu(false, false);
      const t = document.getElementById(a.dataset.go);
      if (t) setTimeout(() => t.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' }), wasOpen ? 80 : 0);
    }));

    // a quiet change once the page has scrolled: the bar gets a firmer surface
    const sentinel = el.querySelector('#nv-sentinel');
    const sv = new IntersectionObserver((en) => nv.classList.toggle('scrolled', !en[0].isIntersecting), { threshold: 0 });
    sv.observe(sentinel); observers.push(sv);

    // current section in the navigation
    const spy = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      el.querySelectorAll('[data-spy]').forEach((a) => { if (a.dataset.spy === en.target.id) a.setAttribute('aria-current', 'location'); else a.removeAttribute('aria-current'); });
    }), { rootMargin: '-35% 0px -60% 0px' });
    NAV_LINKS.forEach(([id]) => { const t = document.getElementById(id); if (t) spy.observe(t); });
    observers.push(spy);

    // tagline: each word turns from muted to full colour, in reading order, as it crosses the trigger line
    const tagEl = el.querySelector('[data-words]');
    if (tagEl) {
      const words = tagEl.textContent.trim().split(/\s+/);
      tagEl.setAttribute('aria-label', words.join(' '));
      tagEl.innerHTML = words.map((w) => `<span class="tw" aria-hidden="true">${w}</span>`).join(' ');
      const tws = [...tagEl.querySelectorAll('.tw')];
      if (reduce) tws.forEach((w) => w.classList.add('on'));
      else {
        const tio = new IntersectionObserver((entries) => {
          entries.filter((e) => e.isIntersecting).sort((a, b) => tws.indexOf(a.target) - tws.indexOf(b.target)).forEach((e, k) => {
            e.target.style.transitionDelay = `${Math.min(k * 40, 400)}ms`; e.target.classList.add('on'); tio.unobserve(e.target);
          });
        }, { rootMargin: '0px 0px -30% 0px' });
        tws.forEach((w) => tio.observe(w)); observers.push(tio);
      }
    }
    // the same questions, as structured data for search and answer engines
    const ld = document.createElement('script'); ld.type = 'application/ld+json'; ld.id = 'faq-ld';
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) });
    document.getElementById('faq-ld')?.remove(); document.head.appendChild(ld);
    cleanups.push(() => document.getElementById('faq-ld')?.remove());

    // hero: the score counts up once the rows have landed
    const heroNum = el.querySelector('[data-hero-score]');
    if (heroNum && !reduce) { heroNum.textContent = '0'; const ht = setTimeout(() => countUp(heroNum, 88, 1300), 1000); cleanups.push(() => clearTimeout(ht)); }

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
      const DURS = [1800, 1800, 3400, 2200, 3200];
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
        gaugeEl0.style.setProperty('--g', i === 4 ? '0.88' : '0');
        const set = (n, v) => { if (n) { n.textContent = v; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); } };
        if (i < 2) { earnEl.textContent = '0'; numEl.textContent = '?'; }
        if (i === 2) { numEl.textContent = '?'; earnEl.textContent = '0'; later(() => set(earnEl, '35'), 1000); later(() => set(earnEl, '60'), 1350); later(() => set(earnEl, '70'), 1700); }
        if (i === 3) { earnEl.textContent = '70'; numEl.textContent = '?'; }
        if (i === 4) { earnEl.textContent = '70'; countUp(numEl, 88, 800); }
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
          r.style.setProperty('--fn', String(MULT[q]));
          const pill = r.querySelector('.p-c'); pill.className = `pill ${LABEL[q][1]} p-c`; pill.textContent = LABEL[q][0];
          const e = r.querySelector('.sx-earn'); e.textContent = `+${pts}`;
          r.querySelectorAll('.sx-rate button').forEach((b) => b.classList.toggle('on', b.dataset.q === q));
        });
        const score = Math.round(sum / 80 * 100);
        tween(earnEl, sum, 500); eqSpans[0].textContent = sum; tween(numEl, score, 700);
        gaugeEl.style.setProperty('--g', String(score / 100));
        earnEl.classList.remove('bump'); void earnEl.offsetWidth; earnEl.classList.add('bump');
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
      const sxv = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== inView) { inView = v; if (play) return; if (v) goTo(reduce ? 4 : 0); else clear(); } }, { threshold: 0.12 });
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
      const wv = new IntersectionObserver((en) => { const v = en[0].isIntersecting; if (v === wvis) return; wvis = v; wgo(v && !reduce ? 0 : wc); }, { threshold: 0.15 });
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
    const DUR = 5000;
    let cur = 0;
    let visible = false;
    let hover = false;
    const show = (i) => {
      cur = i;
      const stepCap = el.querySelector('.hp-stepcap'); if (stepCap) stepCap.textContent = STEPS[i].d;
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
    const vis = new IntersectionObserver((entries) => { const v = entries[0].isIntersecting; if (v !== visible) { visible = v; if (v) show(cur); else schedule(); } }, { threshold: 0.2 });
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
