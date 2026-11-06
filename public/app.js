'use strict';
// Cairn: single-page frontend. All data comes from the server; nothing secret lives here.

const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const QUALITY = { done_well: 'Done well', needs_fixes: 'Needs fixes', redo: 'Redo' };
const QCLASS = { done_well: 'good', needs_fixes: 'warn', redo: 'bad' };
const STATUS = { planned: 'Planned', in_progress: 'In progress', delivered: 'Delivered', missed: 'Missed', blocked_external: 'Blocked by others' };
const state = { me: null, pending: 0 };

async function api(method, url, body, opts = {}) {
  const headers = { 'x-requested-with': 'impact' };
  if (body) headers['content-type'] = 'application/json';
  if (opts.idem) headers['idempotency-key'] = opts.idem;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, credentials: 'same-origin' });
  let data = null;
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && state.me && !url.startsWith('/api/auth')) { state.me = null; location.hash = '#/signin'; throw new Error('Please sign in'); }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}
// Small CSV reader: quoted fields, commas and new lines inside quotes, first row = headers.
function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (c === '"') q = false; else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => x.trim()));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim().toLowerCase().replace(/[\s-]+/g, '_'));
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, (r[i] || '').trim()])));
}
function downloadCsv(name, rows) {
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const text = rows.map((r) => r.map(cell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
}
const idem = () => (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2) + Date.now());

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('on'), 2600);
}
async function run(btn, fn) {
  if (btn) btn.disabled = true;
  try { await fn(); } catch (e) { toast(e.message); } finally { if (btn) btn.disabled = false; }
}
function addDays(ymd, n) { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
// A calendar to jump to any week. Any day works: the server snaps it to that week's Monday.
function weekPick(week) {
  const t = new Date(); const today = new Date(t.getTime() - t.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  return `<label class="wk-pick" title="Pick any date to jump to its week"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M8 3v4M16 3v4M3 10h18"/></svg><span>Pick week</span><input type="date" data-wkpick value="${week}" max="${addDays(today, 60)}" aria-label="Pick a week"></label>`;
}
document.addEventListener('change', (e) => {
  const i = e.target.closest && e.target.closest('[data-wkpick]');
  if (!i || !i.value) return;
  const h = location.hash.split('?'); const q = new URLSearchParams(h[1] || ''); q.set('week', i.value);
  location.hash = `${h[0]}?${q}`;
});
function fmtWeek(w) { const d = new Date(`${w}T00:00:00Z`); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' – ' + new Date(`${addDays(w, 6)}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
function fmtTime(iso) { return iso ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
const scoreText = (s) => (s === null || s === undefined ? '–' : String(s));
const isAdmin = () => state.me && ['owner', 'admin'].includes(state.me.user.role);
const canAddPeople = () => isAdmin() || (state.me && state.me.user.role === 'manager' && state.me.settings.managersAddTeam);
const isManager = () => isAdmin() || (state.me && state.me.reports > 0);

function modal(html, onSubmit) {
  const d = document.createElement('dialog');
  d.innerHTML = `<form method="dialog">${html}<p class="err"></p><div class="row" style="justify-content:flex-end"><button value="cancel" type="button" data-close>Cancel</button><button class="primary" value="ok">Save</button></div></form>`;
  document.body.appendChild(d);
  d.querySelector('[data-close]').onclick = () => d.close();
  d.addEventListener('close', () => d.remove());
  d.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    const btn = d.querySelector('button.primary');
    btn.disabled = true;
    try { await onSubmit(fd, d); d.close(); } catch (err) { d.querySelector('.err').textContent = err.message; } finally { btn.disabled = false; }
  });
  d.showModal();
  return d;
}

// ---------- layout ----------
const NAV = [
  ['label', 'Work'],
  ['week', 'My Week', () => true],
  ['rate', 'Rate Work', () => true],
  ['team', 'Team', isManager],
  ['score', 'Scorecard', () => true],
  ['coins', 'Coins', () => true],
  ['disputes', 'Disputes', () => true],
  ['incidents', 'Incidents', isManager],
  ['label', 'Manage'],
  ['people', 'People', () => isManager() || canAddPeople()],
  ['integrations', 'Integrations', isAdmin],
  ['settings', 'Settings', isAdmin],
  ['label', 'Reference'],
  ['audit', 'History log', () => true],
  ['profile', 'My profile', () => true],
  ['how', 'How we score', () => true],
  ['home', 'Home page', () => true]
];
function layout(active, inner) {
  if (window.Home) window.Home.destroy();
  // A group label is shown only when something in its group is visible to this person.
  const links = [];
  let pending = null;
  for (const n of NAV) {
    if (n[0] === 'label') { pending = n[1]; continue; }
    if (!n[2]()) continue;
    if (pending) { links.push(`<div class="navlabel">${pending}</div>`); pending = null; }
    links.push(`<a href="#/${n[0]}" class="${n[0] === active ? 'on' : ''}"${n[0] === active ? ' aria-current="page"' : ''}>${UI.icon(n[0])}<span>${n[1]}</span>${n[0] === 'rate' && state.pending ? `<span class="badge">${state.pending}</span>` : ''}</a>`);
  }
  const u = state.me.user;
  $('#app').innerHTML = `<a class="skip" href="#" id="skip">Skip to content</a><div class="topbar"><button class="ghost" id="menu" aria-label="Open menu" aria-expanded="false" aria-controls="side">${UI.ph('list')}</button><b>${UI.brand.name}</b>${UI.themeBtn()}</div>
  <div class="shell"><nav class="side" id="side" aria-label="Main"><div class="brand-row"><a class="brand" href="#/week" title="My Week">${UI.logo()}${UI.brand.name}</a>${UI.themeBtn()}</div>
  <div class="ws"><span>Workspace</span><b>${esc(state.me.workspace.name)}</b></div>${links.join('')}
  <div class="me-card"><a class="me-link" href="#/profile" title="My profile">${UI.avatar(u.name, '', u.avatar)}<div class="me-t"><b>${esc(u.name)}</b><span>${esc(u.role)}</span></div></a><button class="ghost" id="signout" title="Sign out" aria-label="Sign out">${UI.ph('sign-out')}</button></div></nav><main id="main" tabindex="-1">${inner}</main></div>`;
  $('#menu').onclick = () => { const open = $('#side').classList.toggle('open'); $('#menu').setAttribute('aria-expanded', String(open)); };
  initAsk();
  $('#skip').onclick = (e) => { e.preventDefault(); $('#main').focus(); };
  $('#side').addEventListener('click', (e) => { if (e.target.closest('a[href^="#/"]')) $('#side').classList.remove('open'); });
  $('#signout').onclick = async (e) => { e.preventDefault(); await api('POST', '/api/auth/logout'); state.me = null; askTurns = []; document.getElementById('askFab')?.remove(); document.getElementById('askPanel')?.remove(); location.hash = '#/home'; };
}

// ---------- page not found ----------
function notFoundScreen() {
  if (window.Home) window.Home.destroy();
  $('#app').innerHTML = `<main class="nf" id="main"><div class="nf-in"><a class="nf-brand" href="#/home" aria-label="${UI.brand.name}, home">${UI.logo()}<span>${UI.brand.name}</span></a><p class="nf-code" aria-hidden="true">404</p><h1>We can't find that page.</h1><p>The address may be mistyped, or the page may have moved. Nothing was lost.</p>
    <div class="nf-cta">${state.me ? '<a class="btn primary btn-lg" href="#/week">Open my week</a>' : '<a class="btn primary btn-lg" href="#/home">Go to the home page</a><a class="btn btn-lg" href="#/signin">Sign in</a>'}</div></div></main>`;
  document.title = 'Page not found · ' + UI.brand.name;
}

// ---------- Ask Cairn ----------
let askTurns = [];
function askHtml(t) {
  const e = (x) => x.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const lines = e(t).split('\n'); let out = ''; let list = false;
  for (const l of lines) {
    const m = /^\s*[-*•]\s+(.*)$/.exec(l);
    if (m) { if (!list) { out += '<ul>'; list = true; } out += `<li>${m[1]}</li>`; continue; }
    if (list) { out += '</ul>'; list = false; }
    if (l.trim()) out += `<p>${l}</p>`;
  }
  if (list) out += '</ul>';
  return out.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}
function initAsk() {
  if (!state.me || !state.me.ai || document.getElementById('askFab')) return;
  const mgr = state.me.reports > 0;
  const chips = ['Why is my score what it is?', 'What should I do next?', 'Is anything of mine blocked or waiting?'].concat(mgr ? ['Who in my team needs help this week?'] : []);
  document.body.insertAdjacentHTML('beforeend', `<button id="askFab" class="ask-fab" aria-expanded="false" aria-controls="askPanel"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg><span>Ask Cairn</span></button>
  <section id="askPanel" class="ask-panel" hidden aria-label="Ask Cairn"><header><div><b>Ask Cairn</b><small>Explains your week. Never scores anyone.</small></div><button class="ghost" id="askClose" aria-label="Close">×</button></header>
    <div class="ask-log" id="askLog" aria-live="polite"><div class="ask-msg bot"><p>Hi ${esc(state.me.user.name.split(' ')[0])}. Ask me about your score, your week or ${mgr ? 'your team' : 'what to do next'}.</p></div>
    <div class="ask-chips">${chips.map((c) => `<button type="button" class="ask-chip">${esc(c)}</button>`).join('')}</div></div>
    <form id="askForm"><input id="askInput" maxlength="400" placeholder="Ask in your own words…" autocomplete="off" aria-label="Your question"><button class="primary">Ask</button></form>
    <p class="ask-foot">AI-written explanation from your own data. Check anything important with your manager.</p></section>`);
  const fab = $('#askFab'); const panel = $('#askPanel'); const log = $('#askLog'); const input = $('#askInput');
  const toggle = (open) => { panel.hidden = !open; fab.setAttribute('aria-expanded', String(open)); fab.classList.toggle('on', open); if (open) input.focus(); };
  fab.onclick = () => toggle(panel.hidden); $('#askClose').onclick = () => toggle(false);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) toggle(false); });
  const add = (cls, html) => { const d = document.createElement('div'); d.className = `ask-msg ${cls}`; d.innerHTML = html; log.appendChild(d); log.scrollTop = log.scrollHeight; return d; };
  const send = async (q) => {
    if (!q.trim()) return;
    log.querySelector('.ask-chips')?.remove();
    add('me', `<p>${esc(q)}</p>`); input.value = '';
    const wait = add('bot', '<p class="typing-dots"><i></i><i></i><i></i></p>');
    try {
      const wk = location.hash.includes('week=') ? new URLSearchParams(location.hash.split('?')[1]).get('week') : undefined;
      const r = await api('POST', '/api/ask', { question: q, history: askTurns.slice(-6), week: wk });
      askTurns.push({ role: 'user', text: q }, { role: 'model', text: r.answer });
      wait.innerHTML = askHtml(r.answer);
    } catch (e) { wait.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
    log.scrollTop = log.scrollHeight;
  };
  $('#askForm').onsubmit = (e) => { e.preventDefault(); send(input.value); };
  log.addEventListener('click', (e) => { const c = e.target.closest('.ask-chip'); if (c) send(c.textContent); });
}

// ---------- auth screens ----------
// A show/hide button on every password field.
function addPwToggles(root) {
  const eye = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  const off = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1.1M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';
  root.querySelectorAll('input[type="password"]').forEach((inp) => {
    const wrap = document.createElement('div'); wrap.className = 'pw';
    inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
    const b = document.createElement('button'); b.type = 'button'; b.className = 'pw-eye'; b.setAttribute('aria-label', 'Show password'); b.setAttribute('aria-pressed', 'false'); b.innerHTML = eye;
    b.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; b.innerHTML = show ? off : eye; b.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); b.setAttribute('aria-pressed', String(show)); inp.focus(); };
    wrap.appendChild(b);
  });
}
function authScreen(mode, extra = {}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const signup = `<label>Company name</label><input name="company" required maxlength="120">
    <label>Your name</label><input name="name" required maxlength="120">
    <label>Work email</label><input name="email" type="email" required autocomplete="email">
    <label>Password (10+ characters)</label><input name="password" type="password" minlength="10" required autocomplete="new-password">
    <label>Only allow emails from this domain (optional)</label><input name="allowed_domain" placeholder="yourcompany.com">
    <label>Time zone</label><input name="timezone" value="${esc(tz)}">`;
  const signin = `<label>Email</label><input name="email" type="email" required autocomplete="email">
    <label class="pwlab">Password <a href="#/forgot" class="forgot">Forgot password?</a></label><input name="password" type="password" required autocomplete="current-password">
    ${extra.notice ? `<p class="notice ok">${esc(extra.notice)}</p>` : ''}
    ${extra.choose ? `<label>Workspace</label><select name="workspace_id">${extra.choose.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select>` : ''}`;
  const forgot = `<p class="small muted">Enter your work email. If it has an account, we send a reset link as a Slack message when Slack is connected. Otherwise ask your admin or manager for a link.</p>
    <label>Work email</label><input name="email" type="email" required autocomplete="email">`;
  const reset = `<p class="small muted">Choose a new password. This signs you out everywhere else.</p>
    <label>New password (10+ characters)</label><input name="password" type="password" minlength="10" required autocomplete="new-password">
    <label>Type it again</label><input name="again" type="password" minlength="10" required autocomplete="new-password">`;
  const join = `<p>You're invited to <b>${esc(extra.workspace)}</b> as ${esc(extra.email)}.</p>
    <label>Your name</label><input name="name" required maxlength="120">
    <label>Choose a password (10+ characters)</label><input name="password" type="password" minlength="10" required autocomplete="new-password">`;
  if (window.Home) window.Home.destroy();
  $('#app').innerHTML = `<div class="auth2"><aside class="auth-art" aria-hidden="true"><div class="auth-art-in">${UI.cairn()}<h2>Measure what mattered.</h2><ul>${[['Ranked, not counted', "Only your manager's top five priorities score."], ['Rated in the open', 'Two raters on the biggest work, with reasons.'], ['Open formula', 'Everyone can read how the score works.']].map(([t, d]) => `<li>${UI.ph('check-circle')}<div><b>${t}</b><span>${d}</span></div></li>`).join('')}</ul></div></aside><div class="auth"><a class="back" href="#/home">${UI.ph('arrow-left')}Back to home</a><a class="brand" href="#/home">${UI.logo()}${UI.brand.name}</a>
    <p class="muted">${UI.brand.tagline} Measure the value of work, not the number of tasks.</p>
    ${mode === 'join' || mode === 'forgot' || mode === 'reset' ? '' : `<div class="tabs"><button class="${mode === 'signin' ? 'on' : ''}" onclick="location.hash='#/signin'">Sign in</button><button class="${mode === 'signup' ? 'on' : ''}" onclick="location.hash='#/signup'">Create a workspace</button></div>`}
    ${mode === 'forgot' ? '<h2 class="auth-h">Forgot your password?</h2>' : mode === 'reset' ? '<h2 class="auth-h">Set a new password</h2>' : ''}<form class="card" id="authform">${mode === 'signup' ? signup : mode === 'join' ? join : mode === 'forgot' ? forgot : mode === 'reset' ? reset : signin}<p class="err" id="autherr"></p>
    <button class="primary">${mode === 'signup' ? 'Create workspace' : mode === 'join' ? 'Join' : mode === 'forgot' ? 'Send reset link' : mode === 'reset' ? 'Save new password' : 'Sign in'}</button>${mode === 'forgot' || mode === 'reset' ? '<a class="back back-center" href="#/signin">' + UI.ph('arrow-left') + 'Back to sign in</a>' : ''}</form>${mode === 'forgot' ? '<details class="recover"><summary>I run this server: use my recovery key</summary><form id="recform"><label>Email of the locked-out account</label><input name="email" type="email" required><label>Recovery key</label><input name="key" type="password" required autocomplete="off"><p class="err" id="recerr"></p><button class="primary">Get a reset link</button></form></details>' : ''}</div></div>`;
  addPwToggles($('#authform'));
  if (mode === 'forgot') {
    addPwToggles($('#recform'));
    $('#recform').onsubmit = async (e) => {
      e.preventDefault();
      try {
        const r = await api('POST', '/api/auth/recover', Object.fromEntries(new FormData(e.target).entries()));
        if (r.chooseWorkspace) { $('#recerr').textContent = 'That email is in more than one workspace. Use a different email, or ask an admin of the workspace for a link.'; return; }
        location.hash = r.link.replace('/#', '#');
      } catch (err) { $('#recerr').textContent = err.message; }
    };
  }
  $('#authform').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (mode === 'forgot') { const r = await api('POST', '/api/auth/forgot', fd); $('#authform').innerHTML = `<p class="notice ok">${esc(r.message)}</p><a class="btn" href="#/signin">Back to sign in</a>`; return; }
      if (mode === 'reset') {
        if (fd.password !== fd.again) throw new Error('The two passwords are not the same');
        await api('POST', `/api/auth/reset/${encodeURIComponent(extra.token)}`, { password: fd.password });
        location.hash = '#/signin?reset=1'; return;
      }
      if (mode === 'signup') await api('POST', '/api/auth/signup', fd);
      else if (mode === 'join') await api('POST', `/api/invites/${extra.token}/accept`, fd);
      else {
        const r = await api('POST', '/api/auth/login', fd);
        if (r.chooseWorkspace) return authScreen('signin', { choose: r.chooseWorkspace });
      }
      await loadMe();
      location.hash = '#/week';
      route();
    } catch (err) { $('#autherr').textContent = err.message; }
  };
}

async function loadMe() {
  state.me = await api('GET', '/api/me');
  try { state.pending = (await api('GET', '/api/ratings/pending')).items.length; } catch { state.pending = 0; }
}

// ---------- My Week ----------
async function weekScreen(params) {
  const q = new URLSearchParams();
  if (params.user) q.set('user', params.user);
  if (params.week) q.set('week', params.week);
  const w = await api('GET', `/api/week?${q}`);
  const [dir] = await Promise.all([w.canRank ? api('GET', '/api/directory') : Promise.resolve({ people: [] })]);
  const ranked = w.items.filter((i) => i.rank).sort((a, b) => a.rank - b.rank);
  const unranked = w.items.filter((i) => !i.rank);
  const weights = state.me.settings.rankWeights;
  const nav = (n) => `#/week?${new URLSearchParams({ ...(params.user ? { user: params.user } : {}), week: addDays(w.week, n) })}`;
  const who = w.isSelf ? 'My Week' : `${esc(w.person.name)}'s week`;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const itemRow = (it) => {
    const statusCls = it.status === 'delivered' ? 'good' : it.status === 'missed' ? 'bad' : it.status === 'blocked_external' ? 'warn' : '';
    const ratings = it.ratings.map((r) => `<span class="pill ${QCLASS[r.quality]}" title="${esc(r.note || '')}">${esc(r.rater)}: ${QUALITY[r.quality]}</span>${it.mine ? ` <a href="#" data-dispute="${esc(r.id)}" class="small">dispute</a>` : ''}`).join(' ');
    const openBlocker = it.blockers.find((b) => !b.resolved_at);
    const acts = [];
    if (it.mine && it.status !== 'delivered') {
      if (it.status === 'planned') acts.push(`<button data-act="start" data-id="${it.id}">Start</button>`);
      acts.push(`<button class="primary" data-act="deliver" data-id="${it.id}">Deliver</button>`);
      if (!openBlocker) acts.push(`<button data-act="block" data-id="${it.id}">I'm blocked</button>`);
      if (it.status !== 'missed') acts.push(`<button class="ghost" data-act="missed" data-id="${it.id}">Missed</button>`);
    }
    if (openBlocker && (it.mine || w.canRank)) acts.push(`<button data-act="unblock" data-bid="${openBlocker.id}">Blocker solved</button>`);
    if (openBlocker && w.canRank && !it.mine) acts.push(`<button data-act="external" data-bid="${openBlocker.id}">Blocked by others</button>`);
    if ((it.mine || w.canRank) && w.parentOptions.length && !it.parent_item_id) acts.push(`<button class="ghost" data-act="link" data-id="${it.id}">Link to team priority</button>`);
    if (!it.rank && (it.mine || w.canRank)) acts.push(`<button class="ghost danger" data-act="delete" data-id="${it.id}">Remove</button>`);
    const parent = w.parentOptions.find((p) => p.id === it.parent_item_id);
    return `<div class="item"><div class="rank ${it.rank ? `r${Math.min(it.rank, 3)}` : ''}">${it.rank ? `#${it.rank}<small>${weights[it.rank - 1]}%</small>` : '–'}</div>
      <div><h3>${esc(it.title)} ${it.stretch ? '<span class="pill acc star">Stretch</span>' : ''}</h3>
      <div><span class="pill ${statusCls}">${STATUS[it.status]}</span>${it.kind !== 'work' ? `<span class="pill">${it.kind === 'helping' ? 'Helping others' : 'Unplanned'}</span>` : ''}
      ${parent ? `<span class="pill">${UI.ph('arrow-up-right')}Supports: ${esc(parent.title)}</span>` : ''}</div>
      ${it.details ? `<p class="small muted">${esc(it.details)}</p>` : ''}
      ${it.proof_url || it.proof_note ? `<p class="small">Proof (${esc(it.proof_source || 'self-reported')}): ${it.proof_url ? `<a href="${esc(it.proof_url)}" target="_blank" rel="noopener noreferrer">${esc(it.proof_url)}</a> ` : ''}${esc(it.proof_note || '')}</p>` : ''}
      ${openBlocker ? `<p class="small" style="color:var(--warn)">Blocked: ${esc(openBlocker.description)} · since ${fmtTime(openBlocker.raised_at)}${openBlocker.claimed_by ? ` · ${esc(openBlocker.claimed_by)} is on it` : openBlocker.escalated ? ' · escalated' : ''}</p>` : ''}
      ${ratings ? `<div>${ratings}</div>` : it.status === 'delivered' ? '<p class="small muted">Waiting for rating</p>' : ''}
      </div><div class="actions">${acts.join('')}</div></div>`;
  };

  layout('week', `<div class="hello">${UI.cairn()}<div class="who">${w.isSelf ? '' : UI.avatar(w.person.name, 'lg', w.person.avatar)}<div><h1>${w.isSelf ? `${greet}, ${esc(state.me.user.name.split(' ')[0])}` : who}</h1><p>${w.isSelf ? 'My Week · ' : ''}${fmtWeek(w.week)}${w.manager ? ` · ranked by ${esc(w.manager.name)}` : ''}</p></div></div>
    <div class="row"><a class="btn" href="${nav(-7)}">${UI.ph('arrow-left')}Previous</a>${weekPick(w.week)}<a class="btn" href="${nav(7)}">Next${UI.ph('arrow-right')}</a></div></div>
    <div class="grid">
      <div class="tile has-ring"><div><span class="tile-ico t-acc">${UI.icon('score')}</span><div class="k">Priority score</div><div class="v">${scoreText(w.score)}</div><div class="s">${w.pending ? `${w.pending} waiting for rating` : 'out of 100'}</div></div>${UI.ring(w.score)}</div>
      <div class="tile"><span class="tile-ico t-good">${UI.icon('check')}</span><div class="k">Quality</div><div class="v">${w.quality.done_well}<span class="small muted"> / ${w.quality.done_well + w.quality.needs_fixes + w.quality.redo}</span></div><div class="s">rated "Done well"</div></div>
      <div class="tile"><span class="tile-ico t-warn">${UI.icon('coins')}</span><div class="k">Coins received</div><div class="v">${w.coins}</div><div class="s">shown beside the score, never added</div></div>
      <div class="tile"><span class="tile-ico t-teal">${UI.icon('link')}</span><div class="k">Alignment</div><div class="v">${w.alignment === null ? '–' : `${w.alignment}%`}</div><div class="s">of priority weight linked upward</div></div>
    </div>
    <div class="card"><div class="row spread" style="margin-bottom:var(--space-100)"><h2 style="margin:0">Your stack</h2><span class="small muted">Each slab is as wide as its weight</span></div>${UI.stack(ranked, state.me.settings)}</div>
    <div class="card"><div class="row spread"><h2 style="margin:0">Ranked priorities ${w.locked ? '<span class="pill good">🔒 Locked</span>' : '<span class="pill warn">Not locked yet</span>'}</h2>
      <div class="row">${w.canRank ? `<button class="primary" id="rankbtn">${w.locked ? 'Change ranking' : 'Rank this week'}</button>${!w.locked && ranked.length ? '<button id="lockbtn">Lock week</button>' : ''}` : ''}</div></div>
      ${ranked.length ? ranked.map(itemRow).join('') : UI.empty('Nothing ranked yet', w.canRank ? 'Add work below, then rank the top items. The first one counts the most.' : 'Your manager has not ranked this week yet. Add what you plan to work on below.')}</div>
    <div class="card"><div class="row spread"><h2 style="margin:0">Not ranked <span class="small muted">(logged, earns 0)</span></h2>
      ${w.isSelf || w.canRank ? '<button id="addbtn">+ Add work</button>' : ''}</div>
      ${unranked.length ? unranked.map(itemRow).join('') : '<p class="muted small">Nothing here.</p>'}</div>
    ${w.leave.days.length ? `<p class="small muted">Leave this week: ${w.leave.days.map(esc).join(', ')} (expectations reduced to ${w.leave.available} of ${w.leave.working} working days)</p>` : ''}
    ${w.isSelf ? '<button class="ghost small" id="leavebtn">Add a leave day</button>' : ''}`);

  const reload = () => weekScreen(params);
  $('#main').onclick = (e) => {
    const b = e.target.closest('[data-act],[data-dispute]');
    if (!b) return;
    e.preventDefault();
    const id = b.dataset.id;
    if (b.dataset.dispute) {
      return modal('<h3>Dispute this rating</h3><p class="small muted">It goes to the rater\'s manager. Both opinions stay on record.</p><label>Why is it unfair?</label><textarea name="reason" required></textarea>',
        async (fd) => { await api('POST', `/api/ratings/${b.dataset.dispute}/dispute`, fd, { idem: idem() }); toast('Dispute sent'); });
    }
    const act = b.dataset.act;
    if (act === 'start') return run(b, async () => { await api('PATCH', `/api/items/${id}`, { status: 'in_progress' }); reload(); });
    if (act === 'missed') return run(b, async () => { await api('PATCH', `/api/items/${id}`, { status: 'missed' }); reload(); });
    if (act === 'delete') return run(b, async () => { if (confirm('Remove this item?')) { await api('DELETE', `/api/items/${id}`); reload(); } });
    if (act === 'unblock') return run(b, async () => { await api('POST', `/api/blockers/${b.dataset.bid}/resolve`, {}); reload(); });
    if (act === 'external') return run(b, async () => { if (confirm('Mark as blocked by others? It will not count against this person.')) { await api('POST', `/api/blockers/${b.dataset.bid}/resolve`, { external: true }); reload(); } });
    if (act === 'deliver') {
      const key = idem();
      return modal('<h3>Deliver</h3><p class="small muted">Show the result. A link is best (PR, doc, campaign report, published plug).</p><label>Proof link</label><input name="proof_url" type="url" placeholder="https://"><label>Or a note</label><textarea name="proof_note"></textarea>',
        async (fd) => { await api('POST', `/api/items/${id}/deliver`, fd, { idem: key }); toast('Delivered. Your raters were asked.'); reload(); });
    }
    if (act === 'block') {
      const key = idem();
      return modal('<h3>What is blocking you?</h3><label>Describe it</label><textarea name="description" required></textarea>',
        async (fd) => { await api('POST', `/api/items/${id}/block`, fd, { idem: key }); toast('Your manager can see this now'); reload(); });
    }
    if (act === 'link') {
      return modal(`<h3>Which team priority does this support?</h3><select name="parent_item_id">${w.parentOptions.map((p) => `<option value="${esc(p.id)}">#${p.rank} ${esc(p.title)}</option>`).join('')}</select>`,
        async (fd) => { await api('PATCH', `/api/items/${id}`, fd); reload(); });
    }
  };
  const add = $('#addbtn');
  if (add) add.onclick = () => {
    const key = idem();
    modal(`<h3>Add work</h3><label>Title (a result, not an activity)</label><input name="title" required maxlength="200" placeholder="e.g. 20 users connect the Gmail plug">
      <label>Details</label><textarea name="details"></textarea>
      <label>Type</label><select name="kind"><option value="work">Planned work</option><option value="unplanned">Unplanned work</option><option value="helping">Helping others</option></select>
      ${w.parentOptions.length ? `<label>Supports a team priority</label><select name="parent_item_id"><option value="">–</option>${w.parentOptions.map((p) => `<option value="${esc(p.id)}">#${p.rank} ${esc(p.title)}</option>`).join('')}</select>` : ''}`,
    async (fd) => { await api('POST', '/api/items', { ...fd, user_id: w.person.id, week: w.week, parent_item_id: fd.parent_item_id || undefined }, { idem: key }); reload(); });
  };
  const lock = $('#lockbtn');
  if (lock) lock.onclick = () => run(lock, async () => { await api('POST', '/api/stacks/lock', { user_id: w.person.id, week: w.week }, { idem: idem() }); toast('Week locked'); reload(); });
  const leave = $('#leavebtn');
  if (leave) leave.onclick = () => modal('<h3>Add a leave day</h3><label>Date</label><input type="date" name="day" required>', async (fd) => { await api('POST', '/api/leave', { days: [fd.day] }); reload(); });
  const rb = $('#rankbtn');
  if (rb) rb.onclick = () => rankEditor(w, dir.people, reload);
}

function rankEditor(w, people, reload) {
  const max = state.me.settings.rankWeights.length;
  let order = w.items.filter((i) => i.rank).sort((a, b) => a.rank - b.rank).map((i) => ({ item_id: i.id, stretch: i.stretch, second_rater_id: i.second_rater_id || '' }));
  const title = (id) => esc(w.items.find((i) => i.id === id).title);
  const others = people.filter((p) => p.id !== w.person.id);
  const d = document.createElement('dialog');
  document.body.appendChild(d);
  d.addEventListener('close', () => d.remove());
  const draw = () => {
    const pool = w.items.filter((i) => !order.find((o) => o.item_id === i.id) && i.status !== 'blocked_external');
    d.innerHTML = `<h3>Rank ${esc(w.person.name)}'s week</h3><p class="small muted">Top ${max} only. #1 is worth ${state.me.settings.rankWeights[0]}%. Items ranked #1–#${state.me.settings.secondRaterRanks} also get a second rater.</p>
      ${order.map((o, i) => `<div class="card" style="padding:var(--space-75) var(--space-100)"><div class="row spread"><b>#${i + 1} · ${title(o.item_id)}</b>
        <div class="row"><button type="button" data-up="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${UI.ph('arrow-up')}</button><button type="button" data-down="${i}" aria-label="Move down" ${i === order.length - 1 ? 'disabled' : ''}>${UI.ph('arrow-down')}</button><button type="button" class="ghost danger" data-out="${i}">✕</button></div></div>
        <div class="row small"><label style="margin:0"><input type="checkbox" data-stretch="${i}" ${o.stretch ? 'checked' : ''} style="width:auto"> <span class="star-i"></span> Stretch (above level: bonus, no penalty)</label></div>
        ${i < state.me.settings.secondRaterRanks ? `<label>Second rater (someone who uses this work; default: your own manager)</label><select data-second="${i}"><option value="">Default</option>${others.map((p) => `<option value="${esc(p.id)}" ${p.id === o.second_rater_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>` : ''}</div>`).join('') || '<p class="muted">Nothing ranked.</p>'}
      ${pool.length && order.length < max ? `<label>Add to ranking</label><select id="addpool"><option value="">Choose…</option>${pool.map((i) => `<option value="${esc(i.id)}">${esc(i.title)}</option>`).join('')}</select>` : ''}
      ${w.locked ? '<label>Reason for changing a locked week (kept in the history log)</label><input id="reason" required>' : ''}
      <p class="err" id="rankerr"></p><div class="row" style="justify-content:flex-end"><button type="button" id="rcancel">Cancel</button><button class="primary" type="button" id="rsave">Save ranking</button></div>`;
    d.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { const i = +b.dataset.up; [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw(); }));
    d.querySelectorAll('[data-down]').forEach((b) => (b.onclick = () => { const i = +b.dataset.down; [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw(); }));
    d.querySelectorAll('[data-out]').forEach((b) => (b.onclick = () => { order.splice(+b.dataset.out, 1); draw(); }));
    d.querySelectorAll('[data-stretch]').forEach((c) => (c.onchange = () => { order[+c.dataset.stretch].stretch = c.checked; }));
    d.querySelectorAll('[data-second]').forEach((s) => (s.onchange = () => { order[+s.dataset.second].second_rater_id = s.value; }));
    const ap = d.querySelector('#addpool');
    if (ap) ap.onchange = () => { if (ap.value) { order.push({ item_id: ap.value, stretch: false, second_rater_id: '' }); draw(); } };
    d.querySelector('#rcancel').onclick = () => d.close();
    d.querySelector('#rsave').onclick = async () => {
      try {
        const reason = d.querySelector('#reason') ? d.querySelector('#reason').value : undefined;
        await api('POST', '/api/stacks/rank', { user_id: w.person.id, week: w.week, reason, order: order.map((o) => ({ ...o, second_rater_id: o.second_rater_id || undefined })) }, { idem: idem() });
        d.close();
        toast('Ranking saved');
        reload();
      } catch (e) { d.querySelector('#rankerr').textContent = e.message; }
    };
  };
  draw();
  d.showModal();
}

// ---------- Rate Work ----------
async function rateScreen() {
  const r = await api('GET', '/api/ratings/pending');
  state.pending = r.items.length;
  layout('rate', `${UI.head('Review', 'Rate work', `Rate the result, not the person. Needs fixes and Redo need a note.`)}
    ${r.items.length ? r.items.map((it) => `<div class="card" data-id="${esc(it.id)}"><div class="who" style="align-items:flex-start">${UI.avatar(it.owner.name, 'lg', it.owner.avatar)}<div style="flex:1"><div class="row spread"><div><h3>${esc(it.title)}</h3>
      <p class="small muted">${esc(it.owner.name)}${it.owner.level ? ` · ${esc(it.owner.level)}` : ''} · ${it.rank ? `ranked #${it.rank} (${it.weight}%)` : 'not ranked'}${it.stretch ? ' · Stretch' : ''} · you are the ${it.as === 'primary' ? 'main' : 'second'} rater</p></div></div>
      ${it.details ? `<p class="small">${esc(it.details)}</p>` : ''}
      <p>Proof: ${it.proof_url ? `<a href="${esc(it.proof_url)}" target="_blank" rel="noopener noreferrer">${esc(it.proof_url)}</a> ` : ''}${esc(it.proof_note || '')}</p>
      <label>Note (required for Needs fixes and Redo)</label><textarea class="note"></textarea>
      <div class="row" style="margin-top:var(--space-75)"><button class="q q-good" data-q="done_well"><i></i>Done well</button><button class="q q-warn" data-q="needs_fixes"><i></i>Needs fixes</button><button class="q q-bad" data-q="redo"><i></i>Redo</button></div></div></div></div>`).join('')
    : `<div class="card">${UI.empty('All caught up', 'Nothing is waiting for your rating. New work appears here as soon as someone delivers it.')}</div>`}`);
  $('#main').onclick = (e) => {
    const b = e.target.closest('[data-q]');
    if (!b) return;
    const card = b.closest('[data-id]');
    run(b, async () => {
      await api('POST', `/api/items/${card.dataset.id}/rate`, { quality: b.dataset.q, note: card.querySelector('.note').value || undefined }, { idem: `rate-${card.dataset.id}` });
      toast('Rating saved');
      rateScreen();
    });
  };
}


// An admin with an empty workspace is offered sample people and weeks, so every screen has something to show.
function demoNudge() {
  const main = $('#main');
  if (!main || !isAdmin() || state.me.reports > 0 || sessionStorage.getItem('demo-nudge-off')) return;
  const box = document.createElement('div');
  box.className = 'card demo-card nudge';
  box.innerHTML = '<div><h3>Want to see it with data?</h3><p class="small muted">Add a few labelled demo people and seven weeks of ranked, rated work. It takes a second and you can remove it with one click on the People page.</p></div><div class="actions"><button class="primary" id="nudgeGo">Load demo data</button><button class="ghost" id="nudgeNo">Not now</button></div>';
  const hello = main.querySelector('.hello');
  (hello ? hello.after(box) : main.prepend(box));
  $('#nudgeNo').onclick = () => { try { sessionStorage.setItem('demo-nudge-off', '1'); } catch { /* fine */ } box.remove(); };
  $('#nudgeGo').onclick = (e) => run(e.currentTarget, async () => { await api('POST', '/api/demo', {}, { idem: idem() }); await loadMe(); toast('Demo data loaded. Open Team to look around.'); location.hash = '#/team'; });
}

// ---------- My profile ----------
async function profileScreen() {
  const u = state.me.user;
  const days = null; void days;
  layout('profile', `${UI.head('Account', 'My profile', 'Your picture, your details and your password.')}
  <div class="prof">
    <section class="card sect"><h3>Picture</h3><p class="small muted">A photo or an avatar shows beside your name for your team. Your initial is used if you pick nothing.</p>
      <div class="pic-row"><div id="picPrev">${UI.avatar(u.name, 'xl', u.avatar)}</div>
        <div class="pic-actions"><label class="btn primary filebtn">Upload a photo<input type="file" id="picFile" accept="image/png,image/jpeg,image/webp" hidden></label>
          <button type="button" id="picRemove" ${u.avatar ? '' : 'disabled'}>Use my initial</button><p class="small muted" id="picMsg">JPEG, PNG or WebP. It is cropped to a square.</p></div></div>
      <h4 class="sub">Or pick an avatar</h4>
      <div class="presets" role="group" aria-label="Avatars">${Array.from({ length: UI.PRESET_COUNT }, (_, i) => `<button type="button" class="preset-btn${u.avatar === `preset:${i}` ? ' on' : ''}" data-preset="${i}" aria-label="Avatar ${i + 1}" aria-pressed="${u.avatar === `preset:${i}`}">${UI.presetAvatar(i, 'lg')}</button>`).join('')}</div>
    </section>
    <form class="card sect" id="basics"><h3>Basics</h3><p class="small muted">Your name and phone show to people in your workspace. Role, level and team are set by your admin or manager.</p>
      <div class="inline"><div><label>Name</label><input name="name" value="${esc(u.name)}" required maxlength="120" autocomplete="name"></div>
      <div><label>Phone (optional)</label><input name="phone" value="${esc(u.phone || '')}" placeholder="+91 98765 43210" autocomplete="tel"></div></div>
      <div class="inline"><div><label>Email</label><input value="${esc(u.email)}" readonly></div><div><label>Role</label><input value="${esc([u.role, u.level, u.department].filter(Boolean).join(' · '))}" readonly></div></div>
      <p class="err" id="berr"></p><button class="primary">Save changes</button></form>
    <form class="card sect" id="pwform"><h3>Change password</h3><p class="small muted">You will stay signed in here. Other devices are signed out.</p>
      <label>Current password</label><input name="current" type="password" required autocomplete="current-password">
      <label>New password (10+ characters)</label><input name="password" type="password" minlength="10" required autocomplete="new-password">
      <label>Type the new one again</label><input name="again" type="password" minlength="10" required autocomplete="new-password">
      <p class="err" id="perr"></p><button class="primary">Change password</button></form>
  </div>`);
  addPwToggles($('#pwform'));
  const save = async (patch, okMsg) => { const r = await api('PATCH', '/api/profile', patch); state.me.user = { ...state.me.user, ...r.user }; toast(okMsg); profileScreen(); };
  $('#main').querySelectorAll('[data-preset]').forEach((b) => { b.onclick = () => save({ avatar: `preset:${b.dataset.preset}` }, 'Avatar saved').catch((e) => toast(e.message)); });
  $('#picRemove').onclick = () => save({ avatar: null }, 'Using your initial').catch((e) => toast(e.message));
  $('#picFile').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const msg = $('#picMsg');
    try {
      if (f.size > 8 * 1024 * 1024) throw new Error('That picture is too large. Pick one under 8 MB.');
      const bmp = await createImageBitmap(f);
      const side = Math.min(bmp.width, bmp.height); const c = document.createElement('canvas'); c.width = c.height = 192;
      c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, 192, 192);
      let q = 0.85; let data = c.toDataURL('image/jpeg', q);
      while (data.length > 80000 && q > 0.4) { q -= 0.1; data = c.toDataURL('image/jpeg', q); }
      msg.textContent = 'Saving…';
      await save({ avatar: data }, 'Picture saved');
    } catch (err) { msg.textContent = err.message || 'That file could not be read as a picture.'; }
  };
  $('#basics').onsubmit = async (e) => { e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries()); try { await save({ name: fd.name, phone: fd.phone }, 'Saved'); } catch (err) { $('#berr').textContent = err.message; } };
  $('#pwform').onsubmit = async (e) => {
    e.preventDefault(); const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
      if (fd.password !== fd.again) throw new Error('The two new passwords are not the same');
      await api('POST', '/api/profile/password', { current: fd.current, password: fd.password });
      toast('Password changed'); e.target.reset(); $('#perr').textContent = '';
    } catch (err) { $('#perr').textContent = err.message; }
  };
}

// ---------- Team ----------
async function teamScreen(params) {
  const t = await api('GET', `/api/team${params.week ? `?week=${encodeURIComponent(params.week)}` : ''}`);
  const nav = (n) => `#/team?week=${addDays(t.week, n)}`;
  layout('team', `${UI.head('Manager view', 'Team', `${fmtWeek(t.week)} · each person against their own ranked priorities`, `<a class="btn" href="${nav(-7)}">${UI.ph('arrow-left')}Previous</a>${weekPick(t.week)}<a class="btn" href="${nav(7)}">Next${UI.ph('arrow-right')}</a>`)}
    <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Level</th><th>Department</th><th class="num">Score</th><th class="num">Quality</th><th class="num">Coins</th><th class="num">Alignment</th><th>Flags</th></tr></thead><tbody>
    ${t.people.map((p) => `<tr><td><div class="who">${UI.avatar(p.name, '', p.avatar)}<a href="#/week?user=${esc(p.id)}&week=${t.week}">${esc(p.name)}</a></div></td><td>${esc(p.level || '')}</td><td>${esc(p.department || '')}</td>
      <td class="num"><b>${scoreText(p.score)}</b>${p.score === null ? '' : `<span class="sbar"><i style="width:${p.score}%"></i></span>`}${p.pending ? ` <span class="pill">${p.pending} unrated</span>` : ''}</td><td class="num">${p.qualityPct === null ? '–' : `${p.qualityPct}%`}</td>
      <td class="num">${p.coins}</td><td class="num">${p.alignment === null ? '–' : `${p.alignment}%`}</td>
      <td>${p.locked ? '' : '<span class="pill warn">not locked</span>'}${p.openBlockers ? `<span class="pill bad">${p.openBlockers} blocked</span>` : ''}${p.onLeave ? `<span class="pill">${p.onLeave}d leave</span>` : ''}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nobody reports to you yet. Invite people from People.</td></tr>'}
    </tbody></table></div>
    <h2>By department</h2><div class="card tablewrap"><table><thead><tr><th>Department</th><th class="num">People</th><th class="num">Average score</th><th class="num">Open blockers</th></tr></thead><tbody>
    ${t.departments.map((d) => `<tr><td>${esc(d.department)}</td><td class="num">${d.people}</td><td class="num">${scoreText(d.avgScore)}</td><td class="num">${d.blockers}</td></tr>`).join('')}</tbody></table></div>
    <h2>How each rater rates (last 4 weeks)</h2><p class="small muted">Makes harsh or generous patterns visible, so ratings can be compared fairly.</p>
    <div class="card tablewrap"><table><thead><tr><th>Rater</th><th class="num">Done well</th><th class="num">Needs fixes</th><th class="num">Redo</th></tr></thead><tbody>
    ${t.raters.map((r) => `<tr><td>${esc(r.name)}</td><td class="num">${r.done_well}</td><td class="num">${r.needs_fixes}</td><td class="num">${r.redo}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No ratings yet.</td></tr>'}</tbody></table></div>`);
}

// ---------- Scorecard ----------
async function scoreScreen(params) {
  const s = await api('GET', `/api/scorecard${params.user ? `?user=${encodeURIComponent(params.user)}` : ''}`);
  const c = s.current;
  const rated = c.quality.done_well + c.quality.needs_fixes + c.quality.redo;
  layout('score', `${UI.head('Results', `${esc(s.person.name)} · Scorecard`, `${fmtWeek(s.week)}${s.person.level ? ` · ${esc(s.person.level)}` : ''}`)}
    <div class="grid">
      <div class="tile has-ring"><div><div class="k">1. Did what mattered most?</div><div class="v">${scoreText(c.score)}</div><div class="s">priority score out of 100${c.pending ? ` · ${c.pending} waiting for rating` : ''}</div></div>${UI.ring(c.score)}</div>
      <div class="tile"><div class="k">2. Was it done well?</div><div class="v">${rated ? `${c.quality.done_well}/${rated}` : '–'}</div><div class="s">rated Done well</div></div>
      <div class="tile"><div class="k">3. Did others value it?</div><div class="v"><span class="coinic"></span>${c.coins}</div><div class="s">coins from colleagues</div></div>
      <div class="tile"><div class="k">Alignment</div><div class="v">${c.alignment === null ? '–' : `${c.alignment}%`}</div><div class="s">linked to the level above</div></div>
    </div>
    <div class="card"><div class="row spread" style="margin-bottom:var(--space-100)"><h2 style="margin:0">This week's stack</h2></div>${UI.stack(c.breakdown.map((b) => ({ rank: b.rank, title: `#${b.rank}`, status: b.status, mult: b.multiplier })), state.me.settings)}</div>
    <div class="card"><h3>Last 5 weeks</h3><div class="bars">${s.trend.map((t) => `<div><span style="height:${t.score || 0}px"></span>${scoreText(t.score)}<br>${esc(t.week.slice(5))}</div>`).join('')}</div></div>
    <div class="card"><h3>What was delivered this week</h3>${s.changed.length ? `<ul>${s.changed.map((x) => `<li>${x.rank ? `#${x.rank} ` : ''}${esc(x.title)} ${x.proof_url ? `· <a href="${esc(x.proof_url)}" target="_blank" rel="noopener noreferrer">proof</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nothing delivered yet.</p>'}</div>
    <div class="card"><h3>Why colleagues gave coins</h3>${s.coinNotes.length ? `<ul>${s.coinNotes.map((n) => `<li><span class="coinic"></span>${n.coins} from ${esc(n.from_name)}: "${esc(n.reason)}"</li>`).join('')}</ul>` : '<p class="muted">None this week.</p>'}</div>
    <p class="small"><a href="#/how">How is this calculated?</a> · Task count never counts.</p>`);
}

// ---------- Coins ----------
async function coinsScreen() {
  const [c, dir] = await Promise.all([api('GET', '/api/coins'), api('GET', '/api/directory')]);
  layout('coins', `${UI.head('Recognition', 'Coins', `Thank people whose work helped you. You have <b>${c.remaining}</b> left this week, at most ${c.maxPerPerson} to one person.`)}
    <form class="card form" id="coinform"><label>To</label><select name="to_id" required>${dir.people.filter((p) => p.id !== state.me.user.id).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.department ? ` · ${esc(p.department)}` : ''}</option>`).join('')}</select>
      <label>Coins</label><input name="coins" type="number" min="1" max="${c.maxPerPerson}" value="1" required><label>What did they do for you?</label><input name="reason" required maxlength="300">
      <p class="err" id="coinerr"></p><button class="primary">Give coins</button></form>
    <h2>Received</h2><div class="card">${c.received.length ? `<ul>${c.received.map((x) => `<li><span class="coinic"></span>${x.coins} from ${esc(x.from_name)}: "${esc(x.reason)}" <span class="small muted">${fmtTime(x.created_at)}</span></li>`).join('')}</ul>` : UI.empty('No coins yet', 'When a colleague thanks you, it shows up here. Coins sit beside your score and never change it.')}</div>
    <h2>Given</h2><div class="card">${c.given.length ? `<ul>${c.given.map((x) => `<li><span class="coinic"></span>${x.coins} to ${esc(x.to_name)}: "${esc(x.reason)}"</li>`).join('')}</ul>` : UI.empty('Nothing given yet', 'Thank someone whose work helped you, using the form above.')}</div>`);
  const key = idem();
  $('#coinform').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try { await api('POST', '/api/coins', { ...fd, coins: Number(fd.coins) }, { idem: key }); toast('Coins sent'); coinsScreen(); } catch (err) { $('#coinerr').textContent = err.message; }
  };
}

// ---------- Disputes ----------
async function disputesScreen() {
  const d = await api('GET', '/api/disputes');
  layout('disputes', `${UI.head('Review', 'Disputes', `A disputed rating goes to the rater's manager. The original rating and the decision are both kept.`)}
    ${d.disputes.length ? d.disputes.map((x) => `<div class="card"><div class="row spread"><h3>${esc(x.title)}</h3><span class="pill ${x.status === 'open' ? 'warn' : 'good'}">${esc(x.status)}</span></div>
      <p class="small muted">${esc(x.owner_name)} disputes ${esc(x.rater_name)}'s rating "${QUALITY[x.original_quality]}" · ${fmtTime(x.created_at)}</p><p>"${esc(x.reason)}"</p>
      ${x.status !== 'open' ? `<p class="small">Decision: ${x.status === 'changed' ? `changed to ${QUALITY[x.new_quality]}` : 'rating kept'} · "${esc(x.resolution_note)}"</p>` : ''}
      ${x.canResolve ? `<button class="primary" data-resolve="${esc(x.id)}">Decide</button>` : ''}</div>`).join('') : `<div class="card">${UI.empty('No disputes', 'If someone thinks a rating is unfair, they can raise it here. It goes to the rater\'s manager, and both versions are kept.')}</div>`}`);
  $('#main').onclick = (e) => {
    const b = e.target.closest('[data-resolve]');
    if (!b) return;
    modal(`<h3>Decide this dispute</h3><label>Decision</label><select name="decision"><option value="upheld">Keep the rating</option><option value="changed">Change the rating</option></select>
      <label>New rating (if changing)</label><select name="new_quality"><option value="done_well">Done well</option><option value="needs_fixes">Needs fixes</option><option value="redo">Redo</option></select>
      <label>Why</label><textarea name="note" required></textarea>`, async (fd) => { await api('POST', `/api/disputes/${b.dataset.resolve}/resolve`, fd); disputesScreen(); });
  };
}

// ---------- Incidents ----------
async function incidentsScreen() {
  const [r, setup] = await Promise.all([api('GET', '/api/incidents'), api('GET', '/api/alerts/setup')]);
  const st = { open: ['warn', 'Waiting'], answered: ['good', 'Answered'], dismissed: ['', 'Closed on phone'], closed: ['', 'Solved'] };
  layout('incidents', `${UI.head('Review', 'Incidents', 'Phone alerts and work that is stuck.')}
    ${setup.configured ? `<p class="muted">Phone alerts go to <b>${esc(setup.channel)}</b>.</p>` : `<div class="notice warn">Phone alerts are not set up, so nobody is rung. ${isAdmin() ? '<a href="#/settings">Set them up in Settings</a>.' : 'Ask an admin to set them up.'}</div>`}
    <h2>Phone alerts</h2><div class="card tablewrap"><table><thead><tr><th>When</th><th>Alert</th><th>Status</th><th>Answer</th></tr></thead><tbody>
    ${r.incidents.map((i) => `<tr><td class="small">${fmtTime(i.raised_at)}</td><td>${esc(i.title)}<div class="small muted">${esc(i.severity)} · reached ${i.delivered ?? '?'} phone(s)</div></td>
      <td><span class="pill ${(st[i.status] || [''])[0]}">${(st[i.status] || ['', i.status])[1]}</span></td><td>${i.decision_label ? `${esc(i.decision_label)} · ${esc(i.answered_by || '')}${i.answer_note ? `<div class="small muted">"${esc(i.answer_note)}"</div>` : ''}` : '–'}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">No alerts yet.</td></tr>'}</tbody></table></div>
    <h2>Blockers on top priorities, open longer than ${state.me.settings.blockerEscalationHours}h</h2>
    <div class="card tablewrap"><table><thead><tr><th>Person</th><th>Priority</th><th>Blocker</th><th>Since</th></tr></thead><tbody>
    ${r.blockersOverThreshold.map((b) => `<tr><td>${esc(b.name)}</td><td>#${b.rank} ${esc(b.title)}</td><td>${esc(b.description)}</td><td>${fmtTime(b.raised_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None.</td></tr>'}</tbody></table></div>`);
}

// ---------- People ----------
async function peopleScreen() {
  const [p, dir, former, demo] = await Promise.all([api('GET', '/api/people'), api('GET', '/api/directory'), api('GET', '/api/people/former'), isAdmin() ? api('GET', '/api/demo') : Promise.resolve({ loaded: false })]);
  const byId = Object.fromEntries(dir.people.map((x) => [x.id, x.name]));
  const admin = isAdmin();
  const adder = canAddPeople();
  const me = state.me.user.id;
  const src = state.me.settings.peopleSource;
  const team = p.people; // admins: everyone; managers: themselves and their team
  const rowActs = (u) => {
    if (u.id === me || !adder || u.role === 'owner' && !admin) return '';
    const a = [`<button data-edit="${esc(u.id)}">Edit</button>`];
    if (!u.joined) a.push(`<button data-link="${esc(u.id)}">New invite link</button>`); else a.push(`<button data-resetpw="${esc(u.id)}">Reset password</button>`);
    a.push(`<button class="ghost danger" data-off="${esc(u.id)}">Left the company</button>`);
    return a.join(' ');
  };
  layout('people', `${UI.head('Manage', 'People', 'Everyone in the workspace, and who they report to.', `${adder ? '<button id="importp">Import (CSV)</button><button id="importl">Import leave (CSV)</button><button class="primary" id="invite">+ Add person</button>' : ''}`)}
    <p class="small muted">${admin ? `Add your managers and TLs; ${state.me.settings.managersAddTeam ? 'each of them adds and looks after their own team' : 'only admins add people in this workspace'}. People come from: <b>${src === 'keka' ? 'Keka sync' : src === 'csv' ? 'CSV upload' : 'invite links'}</b> · <a href="#/settings">Settings</a>`
      : adder ? 'Add the people in your team. You can update, move within your team, or mark people who left.' : 'Ask your manager or an admin to add or change people.'}</p>
    <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Role</th><th>Level</th><th>Department</th><th>Reports to</th><th>Phone</th>${adder ? '<th></th>' : ''}</tr></thead><tbody>
    ${team.map((u) => `<tr><td><div class="who">${UI.avatar(u.name, '', u.avatar)}<div><a href="#/week?user=${esc(u.id)}">${esc(u.name)}</a> ${u.joined ? '' : '<span class="pill warn">invited</span>'}<small>${esc(u.email)}</small></div></div></td><td>${esc(u.role)}</td><td>${esc(u.level || '')}</td><td>${esc(u.department || '')}</td>
      <td>${esc(byId[u.reports_to] || '–')}</td><td>${esc(u.phone || '')}</td>${adder ? `<td><div class="actions">${rowActs(u)}</div></td>` : ''}</tr>`).join('')}</tbody></table></div>
    ${admin ? `<div class="card demo-card"><div><h3>Sample data</h3><p class="small muted">${demo.loaded ? 'Demo people and six weeks of ranked, rated work are loaded (their names end in “(demo)”). Open Team or Scorecard to look around. Remove them any time.' : 'Fill this workspace with a few labelled demo people and six weeks of ranked, rated work, so you can try the screens, Slack messages and phone alerts. Remove it with one click.'}</p></div><div class="actions"><button class="${demo.loaded ? 'ghost danger' : 'primary'}" id="demoBtn">${demo.loaded ? 'Remove demo data' : 'Load demo data'}</button></div></div>` : ''}
    ${former.people.length ? `<h2>Former people</h2><p class="small muted">They cannot sign in. Their past weeks, ratings and coins stay on record.</p><div class="card tablewrap"><table><tbody>
      ${former.people.map((u) => `<tr><td><div class="who">${UI.avatar(u.name, '', u.avatar)}<div>${esc(u.name)}<small>${esc(u.email)}</small></div></div></td><td>${esc(u.level || '')}</td><td>${esc(u.department || '')}</td><td>${adder ? `<button data-back="${esc(u.id)}">Bring back</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="small muted">New joiners: add them here or by CSV. Leavers: "Left the company" moves their team to a new manager. Team changes: Edit, then Reports to.</p>`);
  const managerOptions = (sel, exclude) => (admin ? dir.people : team).filter((x) => x.id !== exclude).map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  const demoBtn = $('#demoBtn');
  if (demoBtn) demoBtn.onclick = () => run(demoBtn, async () => {
    if (demo.loaded) { if (!confirm('Remove all demo people and their weeks?')) return; await api('DELETE', '/api/demo'); toast('Demo data removed'); } else { await api('POST', '/api/demo', {}, { idem: idem() }); toast('Demo data loaded. Open Team to look around.'); }
    peopleScreen();
  });
  $('#main').addEventListener('click', (e) => {
    const rpw = e.target.closest('[data-resetpw]');
    if (rpw) return run(rpw, async () => {
      const r = await api('POST', `/api/people/${rpw.dataset.resetpw}/reset-link`, {});
      modal(`<h3>Password reset link</h3><p class="small muted">Send this to them privately. It works once and expires in 24 hours. Opening it lets them choose a new password and signs them out everywhere else.</p><input readonly value="${esc(location.origin + r.link)}" onclick="this.select()">`, async () => {});
    });
    const link = e.target.closest('[data-link]');
    const off = e.target.closest('[data-off]');
    const back = e.target.closest('[data-back]');
    if (link) return run(link, async () => {
      const r = await api('POST', `/api/people/${link.dataset.link}/invite-link`, {});
      modal(`<h3>New invite link</h3><p class="small muted">The old link no longer works. This one expires in 30 days.</p><input readonly value="${esc(location.origin + r.link)}" onclick="this.select()">`, async () => {});
    });
    if (off) {
      const u = team.find((x) => x.id === off.dataset.off);
      const reports = team.filter((x) => x.reports_to === u.id);
      return modal(`<h3>${esc(u.name)} left the company</h3><p class="small">They can no longer sign in. Their past work, ratings and coins stay on record.</p>
        ${reports.length ? `<label>Their ${reports.length} team member(s) now report to</label><select name="new_manager_id">${managerOptions(u.reports_to || me, u.id)}</select>` : '<p class="small muted">Nobody reports to them.</p>'}`,
      async (fd) => { await api('POST', `/api/people/${u.id}/offboard`, fd, { idem: idem() }); toast(`${u.name} marked as left`); peopleScreen(); });
    }
    if (back) {
      const u = former.people.find((x) => x.id === back.dataset.back);
      return modal(`<h3>Bring back ${esc(u.name)}</h3><label>Reports to</label><select name="reports_to">${managerOptions(me)}</select>`,
        async (fd) => { await api('POST', `/api/people/${u.id}/reactivate`, fd); toast('Welcome back'); peopleScreen(); });
    }
  });
  if (adder) {
    $('#importp').onclick = () => importDialog({
      title: 'Import people', endpoint: '/api/people/import',
      help: `Columns: <code>email, name, role, level, department, manager_email, phone</code>. Role is member or manager${admin ? ' (or admin)' : ''}. Existing people are updated, not duplicated. People without a manager in the file report to you. Any other column, such as salary, is ignored.`,
      template: [['email', 'name', 'role', 'level', 'department', 'manager_email', 'phone'], ['tl@yourcompany.com', 'Amit', 'manager', 'Lead', 'ISE', '', '919876543210'], ['riya@yourcompany.com', 'Riya', 'member', 'Intern', 'ISE', 'tl@yourcompany.com', '']],
      pick: (r) => ({ email: r.email, name: r.name, role: r.role, level: r.level, department: r.department, manager_email: r.manager_email || r.manager || r.reports_to, phone: r.phone }),
      done: (res) => {
        peopleScreen();
        if (res.links && res.links.length) {
          const rowsOut = [['email', 'name', 'invite_link'], ...res.links.map((l) => [l.email, l.name, location.origin + l.link])];
          setTimeout(() => {
            const d2 = modal(`<h3>${res.new} new, ${res.updated} updated</h3><p class="small muted">New people need their own link to set a password. Links work once and expire in 30 days.</p><button type="button" id="dl">Download invite links (CSV)</button>`, async () => {});
            d2.querySelector('#dl').onclick = () => downloadCsv('invite-links.csv', rowsOut);
          }, 50);
        } else toast(`${res.updated} people updated`);
      }
    });
    $('#importl').onclick = () => importDialog({
      title: 'Import leave', endpoint: '/api/leave/import', noDryRun: true,
      help: 'Columns: <code>email, date</code> with one row per day off, dates as YYYY-MM-DD. Expectations for those weeks go down automatically.',
      template: [['email', 'date'], ['riya@yourcompany.com', '2026-11-12']],
      pick: (r) => ({ email: r.email, date: r.date }),
      done: (res) => toast(`${res.imported} leave days added`)
    });
  }
  const options = (sel) => dir.people.map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  if (adder) $('#invite').onclick = () => {
    const key = idem();
    modal(`<h3>Add a person</h3><label>Work email</label><input name="email" type="email" required><label>Name</label><input name="name" maxlength="120">
      <label>Role</label><select name="role"><option value="member">Member</option><option value="manager">Manager / TL (can add their own team)</option>${admin ? '<option value="admin">Admin</option>' : ''}</select>
      <label>Reports to</label><select name="reports_to">${managerOptions(me)}</select>
      <div class="inline"><div><label>Level</label><input name="level" placeholder="Intern, Junior, Senior…"></div><div><label>Department</label><input name="department" placeholder="ISE, Marketing…"></div></div>`,
    async (fd) => {
      const r = await api('POST', '/api/invites', fd, { idem: key });
      const link = location.origin + r.link;
      peopleScreen();
      setTimeout(() => modal(`<h3>Invite link</h3><p class="small muted">Send this link to them. It works once and expires in 14 days.</p><input readonly value="${esc(link)}" onclick="this.select()">`, async () => {}), 50);
    });
  };
  $('#main').addEventListener('click', (e) => {
    const b = e.target.closest('[data-edit]');
    if (!b) return;
    const u = team.find((x) => x.id === b.dataset.edit);
    const roles = admin ? ['member', 'manager', 'admin', 'owner'] : ['member', 'manager'];
    modal(`<h3>Edit ${esc(u.name)}</h3><label>Role</label><select name="role">${roles.map((r) => `<option ${r === u.role ? 'selected' : ''}>${r}</option>`).join('')}</select>
      <label>Reports to (moving teams)</label><select name="reports_to">${admin ? '<option value="">Nobody (top)</option>' : ''}${managerOptions(u.reports_to, u.id)}</select>
      <div class="inline"><div><label>Level</label><input name="level" value="${esc(u.level || '')}"></div><div><label>Department</label><input name="department" value="${esc(u.department || '')}"></div></div>
      <label>Phone for serious alerts (country code, no +)</label><input name="phone" value="${esc(u.phone || '')}">`,
    async (fd) => { await api('PATCH', `/api/people/${u.id}`, { ...fd, reports_to: fd.reports_to || null }); toast('Saved'); peopleScreen(); });
  });
}

function importDialog(o) {
  let rows = [];
  const d = modal(`<h3>${o.title}</h3><p class="small">${o.help}</p><button type="button" id="tpl">Download a template</button>
    <label>CSV file</label><input type="file" id="csvfile" accept=".csv,text/csv"><div id="preview" class="small muted"></div>`, async () => {
    if (!rows.length) throw new Error('Choose a CSV file first');
    const res = await api('POST', o.endpoint, { rows }, { idem: idem() });
    if (!res.ok) throw new Error(res.errors.slice(0, 8).map((e) => `Line ${e.line} (${e.email}): ${e.errors.join(', ')}`).join(' · '));
    o.done(res);
  });
  d.querySelector('button.primary').textContent = 'Import';
  d.querySelector('#tpl').onclick = () => downloadCsv(`${o.endpoint.split('/')[2]}-template.csv`, o.template);
  d.querySelector('#csvfile').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    if (f.size > 2e6) { d.querySelector('#preview').textContent = 'File is too big (max 2 MB).'; return; }
    rows = parseCsv(await f.text()).map(o.pick);
    const pv = d.querySelector('#preview');
    pv.textContent = `${rows.length} rows read. Checking…`;
    if (o.noDryRun) { pv.textContent = `${rows.length} rows ready to import.`; return; }
    try {
      const chk = await api('POST', o.endpoint, { rows, dryRun: true });
      pv.innerHTML = chk.ok ? `Ready: <b>${chk.new}</b> new, <b>${chk.updated}</b> updated. Nothing is saved until you click Import.`
        : `<span class="err">${chk.errors.length} problem(s) to fix in the file:</span><br>${chk.errors.slice(0, 10).map((x) => `Line ${x.line} ${esc(x.email)}: ${esc(x.errors.join(', '))}`).join('<br>')}`;
    } catch (err) { pv.textContent = err.message; }
  };
}

// ---------- Integrations (Slack and Keka through viaSocket) ----------
const connectState = { token: null, serviceIds: {}, actionIds: {}, ready: false, current: null, error: null };
function loadConnectScript() {
  return new Promise((resolve, reject) => {
    if (window.openViasocketConnection) return resolve();
    const el = document.createElement('script');
    el.src = 'https://flow.viasocket.com/connect.js';
    el.onload = resolve;
    el.onerror = () => reject(new Error('Could not load the connect window. Check your network and try again.'));
    document.head.appendChild(el);
  });
}
// The popup must open straight from the click, so the token is fetched when the screen opens.
async function prepareConnect() {
  try {
    Object.assign(connectState, await api('GET', '/api/viasocket/token?apps=slack,keka'));
    await loadConnectScript();
    connectState.ready = true;
    connectState.error = null;
  } catch (e) { connectState.ready = false; connectState.error = e.message; }
  document.querySelectorAll('[data-connect]').forEach((b) => { b.disabled = !connectState.ready; });
  const err = $('#connectErr');
  if (err) err.textContent = connectState.error || '';
}
if (!window.__vsListener) {
  window.__vsListener = true;
  window.addEventListener('message', async (event) => {
    const d = event.data;
    const app = connectState.current;
    if (!d || !app || typeof d.type !== 'string') return;
    if (d.serviceId && d.serviceId !== connectState.serviceIds[app]) return; // another app's message
    if (d.type === 'viasocket_connection_success' && d.data && d.data.id) {
      connectState.current = null;
      try { await api('POST', '/api/viasocket/connected', { app, authId: d.data.id }); toast(`${app === 'slack' ? 'Slack' : 'Keka'} connected. Now run the test.`); } catch (e) { toast(e.message); }
      integrationsScreen();
    } else if (d.type === 'viasocket_connection_error') {
      connectState.current = null;
      toast((d.error && d.error.message) || 'The connection did not finish');
    } // 'viasocket_connection_closed' is not a failure: a success may still follow
  });
}

async function integrationsScreen() {
  const s = await api('GET', '/api/integrations/status');
  const pill = (c) => (!c.connected ? '<span class="pill warn">Not connected</span>' : c.verifiedAt ? '<span class="pill good">Working</span>' : '<span class="pill warn">Connected, not tested yet</span>');
  const sl = s.slack, ke = s.keka;
  const msgs = [['plan', 'Monday: managers with people who have no locked week'], ['locked', "When a manager locks someone's week: that person gets their #1"], ['rating', 'When work is delivered: the raters are asked to rate it'],
    ['morning', "Weekday mornings (10:00): today's top item, only for people with a locked week and work left"], ['evening', 'Weekday evenings (19:00): a reminder to add proof, only if work is left'], ['digest', "Last working day, evening: each manager gets their team's scores"]];
  const fieldWords = { 'reportsTo.id': 'manager', 'reportsTo.email': null, groups: 'department', 'jobTitle.title': 'job title', mobilePhone: 'mobile number', employeeNumber: 'employee number', displayName: 'name', email: 'work email', id: null };
  const asked = [...new Set(ke.requested.map((f) => fieldWords[f]).filter(Boolean))];
  const runRow = (r) => `<tr><td class="small">${fmtTime(r.started_at)}<div class="muted">${r.trigger}${r.dry_run ? ' · preview' : ''}</div></td><td>${r.status === 'ok' ? `<span class="pill good">ok</span>` : r.status === 'failed' ? '<span class="pill bad">failed</span>' : '<span class="pill">running</span>'}</td>
    <td class="small">${r.summary ? `${r.summary.created} new · ${r.summary.updated} updated · ${r.summary.moved} moved · ${r.summary.offboarded} left` : esc(r.error || '')}</td></tr>`;
  layout('integrations', `${UI.head('Manage', 'Integrations', `Nothing here is shown as working until a real test has succeeded.`)}
    ${s.viasocket.keysPresent ? '' : '<div class="notice warn">The viaSocket keys are missing on the server, so connecting is switched off.</div>'}<p class="err" id="connectErr"></p>

    <div class="card"><div class="row spread"><h2 style="margin:0">Slack</h2>${pill(sl)}</div>
      <p>Sends private direct messages to the people each message is about: planning, ratings, reminders and the weekly team summary. Nothing is posted in channels.</p>
      ${sl.lastError ? `<div class="notice warn">Last problem: ${esc(sl.lastError)}</div>` : ''}
      <div class="row">${sl.connected ? `<button class="primary" id="slTest">Send myself a test message</button><button id="slMatch">Check who is on Slack</button><button class="ghost" data-connect="slack" disabled>Reconnect</button><button class="ghost danger" data-disc="slack">Disconnect</button>` : '<button class="primary" data-connect="slack" disabled>Connect Slack</button>'}</div>
      <p class="small" id="slOut"></p>
      ${sl.connected && sl.coverage ? `<p class="small">${sl.coverage.inSlack} of ${sl.coverage.people} people found in Slack by work email${sl.coverage.notChecked ? ` · ${sl.coverage.notChecked} not checked yet` : ''}.${sl.coverage.notFound.length ? ` Not found: ${sl.coverage.notFound.map(esc).join(', ')}. They need the same email in Slack as here.` : ''}</p>` : ''}
      <h3 style="margin-top:var(--space-200)">Messages</h3>
      ${msgs.map(([k, t]) => `<label style="margin:var(--space-50) 0;color:var(--text)"><input type="checkbox" data-msg="${k}" ${sl.messages[k] ? 'checked' : ''} style="width:auto"> ${esc(t)}</label>`).join('')}
      ${sl.recent && sl.recent.length ? `<h3 style="margin-top:var(--space-200)">Recent</h3><div class="tablewrap"><table><tbody>${sl.recent.map((m) => `<tr><td class="small">${fmtTime(m.created_at)}</td><td>${esc(m.kind)}</td><td><span class="pill ${m.status === 'sent' ? 'good' : m.status === 'pending' ? '' : 'warn'}">${esc(m.status)}</span></td><td class="small muted">${esc(m.last_error || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    </div>

    <div class="card"><div class="row spread"><h2 style="margin:0">Keka</h2>${pill(ke)}</div>
      <p>Optional. Keeps people, managers, departments and job titles in step with Keka. Leavers are only removed when Keka marks them as relieved.</p>
      <p class="small">Keka is only asked for: <b>${asked.join(', ')}</b>. Never salary, payroll, bank, tax, documents, personal email, birth date or attendance. Change what is shared in <a href="#/settings">Settings</a>.</p>
      ${ke.lastError ? `<div class="notice warn">Last problem: ${esc(ke.lastError)}</div>` : ''}
      ${ke.connected && !ke.chosen ? '<div class="notice">This company gets people from somewhere else. To use Keka, choose <b>Keka sync</b> in <a href="#/settings">Settings → People &amp; leave source</a>.</div>' : ''}
      <div class="row">${ke.connected ? `<button class="primary" id="keTest">Test (read-only)</button>${ke.chosen ? '<button id="kePreview">Preview sync</button><button id="keSync">Sync now</button>' : ''}<button class="ghost" data-connect="keka" disabled>Reconnect</button><button class="ghost danger" data-disc="keka">Disconnect</button>` : '<button class="primary" data-connect="keka" disabled>Connect Keka</button>'}</div>
      <p class="small" id="keOut"></p>
      <p class="small muted">Leave days from Keka are not available yet. Import them as a CSV under People.${ke.confirmedAt ? ' The sync runs by itself every night.' : ke.chosen ? ' It runs by itself every night once you have run it by hand once.' : ''}</p>
      ${ke.runs.length ? `<h3 style="margin-top:var(--space-200)">Recent syncs</h3><div class="tablewrap"><table><tbody>${ke.runs.map(runRow).join('')}</tbody></table></div>` : ''}
    </div>

    <div class="card"><div class="row spread"><h2 style="margin:0">Ask Cairn (AI helper)</h2><span class="pill ${s.ai.keyPresent && s.ai.on ? 'good' : 'warn'}">${!s.ai.keyPresent ? 'Not set up' : s.ai.on ? 'On' : 'Off'}</span></div>
      <p class="small">A chat box that explains a person's score, week and team in plain words, using only what that person can already see. It <b>never scores or rates anyone</b>, changes nothing, and what people ask is not stored.</p>
      ${s.ai.keyPresent ? `<label style="margin:var(--space-75) 0;color:var(--text)"><input type="checkbox" id="aiToggle" ${s.ai.on ? 'checked' : ''} style="width:auto"> Let people in <b>${esc(state.me.workspace.name)}</b> use Ask Cairn</label><p class="small" id="aiOut"></p>` : '<div class="notice warn">Not set up yet. The person who runs this server adds <code>GEMINI_API_KEY</code> in the app settings on Embarko.</div>'}
    </div>

    <div class="card"><div class="row spread"><h2 style="margin:0">Email</h2><span class="pill ${s.mail.configured ? 'good' : 'warn'}">${s.mail.configured ? 'Set up' : 'Not set up'}</span></div>
      <p class="small">Sends password reset links to people's inboxes${s.mail.from ? `, from <b>${esc(s.mail.from)}</b>` : ''}. This is a setting of the whole server, so it works for every workspace.</p>
      ${s.mail.configured ? '<div class="row"><button class="primary" id="mailTest">Send myself a test email</button></div><p class="small" id="mailOut"></p>' : '<div class="notice warn">Not set up yet. The person who runs this server adds <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> and <code>MAIL_FROM</code> in the app settings on Embarko. Until then reset links go to Slack when Slack is connected.</div>'}
    </div>

    <div class="card"><div class="row spread"><h2 style="margin:0">Phone alerts (M91)</h2><span class="pill ${s.m91.configured ? 'good' : 'warn'}">${s.m91.configured ? 'Connected' : 'Not set up'}</span></div>
      <p class="small">${s.m91.configured ? `Rings "${esc(s.m91.channel)}" for serious problems. Test it in <a href="#/settings">Settings</a>.` : 'Add your channel link in <a href="#/settings">Settings</a>.'}</p></div>`);

  prepareConnect();
  $('#main').onclick = (e) => {
    const c = e.target.closest('[data-connect]');
    if (c) { // straight from the click: the popup would be blocked after an await
      const app = c.dataset.connect;
      connectState.current = app;
      try { window.openViasocketConnection(connectState.token, connectState.serviceIds[app], { filteredActions: connectState.actionIds[app], skipActionSelection: true }); } catch (err) { connectState.current = null; toast('Could not open the connect window'); }
      return;
    }
    const d = e.target.closest('[data-disc]');
    if (d) return run(d, async () => { if (confirm(`Disconnect ${d.dataset.disc === 'slack' ? 'Slack' : 'Keka'}? Messages and syncing stop.`)) { await api('POST', `/api/integrations/${d.dataset.disc}/disconnect`, {}); integrationsScreen(); } });
    const m = e.target.closest('[data-msg]');
    if (m) return;
  };
  $('#main').onchange = (e) => {
    const m = e.target.closest('[data-msg]');
    if (!m) return;
    run(null, async () => {
      const slackMessages = Object.fromEntries([...document.querySelectorAll('[data-msg]')].map((x) => [x.dataset.msg, x.checked]));
      await api('PUT', '/api/settings', { settings: { slackMessages } });
      await loadMe();
      toast('Saved');
    });
  };
  const out = (id, t) => { const el = $(id); if (el) el.textContent = t; };
  const t1 = $('#slTest');
  if (t1) t1.onclick = () => run(t1, async () => { out('#slOut', 'Sending…'); try { const r = await api('POST', '/api/integrations/slack/test', {}); out('#slOut', r.message); setTimeout(integrationsScreen, 1500); } catch (e) { out('#slOut', e.message); } });
  const ai = $('#aiToggle');
  if (ai) ai.onchange = async () => { try { await api('PUT', '/api/settings', { settings: { aiHelper: ai.checked } }); state.me = await api('GET', '/api/me'); out('#aiOut', ai.checked ? 'Ask Cairn is on.' : 'Ask Cairn is off.'); } catch (e) { out('#aiOut', e.message); ai.checked = !ai.checked; } };
  const tm = $('#mailTest');
  if (tm) tm.onclick = () => run(tm, async () => { out('#mailOut', 'Sending…'); try { const r = await api('POST', '/api/mail/test', {}); out('#mailOut', `Sent to ${r.to}. Check the inbox, and spam too.`); } catch (e) { out('#mailOut', e.message); } });
  const t2 = $('#slMatch');
  if (t2) t2.onclick = () => run(t2, async () => { out('#slOut', 'Checking…'); try { await api('POST', '/api/integrations/slack/match', {}); integrationsScreen(); } catch (e) { out('#slOut', e.message); } });
  const t3 = $('#keTest');
  if (t3) t3.onclick = () => run(t3, async () => { out('#keOut', 'Asking Keka…'); try { const r = await api('POST', '/api/integrations/keka/test', {}); out('#keOut', r.found === null ? 'Keka answered.' : r.found ? 'Keka answered and found you.' : 'Keka answered but has nobody with your email.'); setTimeout(integrationsScreen, 1500); } catch (e) { out('#keOut', e.message); } });
  const sync = (dryRun) => async () => {
    out('#keOut', dryRun ? 'Checking what would change…' : 'Syncing…');
    try {
      const r = await api('POST', '/api/integrations/keka/sync', { dryRun });
      const lines = [`${dryRun ? 'Would change' : 'Changed'}: ${r.created} new · ${r.updated} updated · ${r.moved} moved · ${r.offboarded} left.`, ...r.samples, ...r.held.map((h) => `Left alone: ${h}`)];
      if (dryRun) { $('#keOut').innerHTML = `${lines.map(esc).join('<br>')}<br><b>Nothing was saved.</b>`; } else { toast('Sync finished'); out('#keOut', lines.join(' · ')); setTimeout(integrationsScreen, 2500); }
    } catch (e) { out('#keOut', e.message); }
  };
  const t4 = $('#kePreview');
  if (t4) t4.onclick = () => run(t4, sync(true));
  const t5 = $('#keSync');
  if (t5) t5.onclick = () => run(t5, async () => { if (confirm('Apply Keka\'s people to this workspace now? Use "Preview sync" first to see what changes.')) await sync(false)(); });
}

// ---------- Settings ----------
async function settingsScreen() {
  const s = state.me.settings;
  const ws = state.me.workspace;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  layout('settings', `${UI.head('Manage', 'Settings', 'How scoring, people and alerts work in this workspace.')}<form class="form settings" id="sform">
    <section class="card sect"><h3>Company</h3><p class="small muted">Basic details for this workspace.</p>
    <label>Company name</label><input name="name" value="${esc(ws.name)}" required>
    <label>Time zone</label><input name="timezone" value="${esc(ws.timezone)}">
    <label>Only allow emails from this domain</label><input name="allowed_domain" value="${esc(ws.allowed_domain || '')}" placeholder="yourcompany.com"></section>
    <section class="card sect"><h3>How the score works</h3><p class="small muted">The weights and quality multipliers behind every score. Everyone can read these on the “How we score” page.</p>
    <label>Rank weights in % (#1 first, must add up to 100)</label><input name="rankWeights" value="${s.rankWeights.join(', ')}">
    <div class="inline"><div><label>Done well ×</label><input name="q_done_well" type="number" step="0.05" min="0" max="1" value="${s.quality.done_well}"></div>
    <div><label>Needs fixes ×</label><input name="q_needs_fixes" type="number" step="0.05" min="0" max="1" value="${s.quality.needs_fixes}"></div>
    <div><label>Redo ×</label><input name="q_redo" type="number" step="0.05" min="0" max="1" value="${s.quality.redo}"></div></div>
    <div class="inline"><div><label>Second rater for ranks #1 to #</label><input name="secondRaterRanks" type="number" min="0" max="10" value="${s.secondRaterRanks}"></div>
    <div><label>Stretch bonus (0–1)</label><input name="stretchBonus" type="number" step="0.05" min="0" max="1" value="${s.stretchBonus}"></div></div></section>
    <section class="card sect"><h3>Coins and working days</h3><p class="small muted">Coins are thanks between colleagues. They sit beside the score and never change it.</p>
    <div class="inline"><div><label>Coins per week</label><input name="coinsPerWeek" type="number" min="0" max="100" value="${s.coinsPerWeek}"></div>
    <div><label>Max coins to one person</label><input name="maxCoinsPerPerson" type="number" min="1" value="${s.maxCoinsPerPerson}"></div></div>
    <label>Working days</label><div class="row">${days.map((d, i) => `<label style="margin:0"><input type="checkbox" name="wd${i}" ${s.workingDays.includes(i) ? 'checked' : ''} style="width:auto"> ${d}</label>`).join('')}</div></section>
    <section class="card sect"><h3>Who adds people</h3>
    <label style="margin:var(--space-75) 0;color:var(--text)"><input type="radio" name="managersAddTeam" value="1" ${s.managersAddTeam ? 'checked' : ''} style="width:auto"> <b>Managers add their own team</b> <span class="small muted">Admins add managers/TLs; each manager adds, moves and offboards people in their team.</span></label>
    <label style="margin:var(--space-75) 0;color:var(--text)"><input type="radio" name="managersAddTeam" value="" ${s.managersAddTeam ? '' : 'checked'} style="width:auto"> <b>Only admins</b> <span class="small muted">Managers rank and rate their team but cannot add or remove people.</span></label></section>
    <section class="card sect"><h3>People &amp; leave source</h3><p class="small muted">Choose where people, reporting lines and leave come from. You can change this any time.</p>
    ${[['manual', 'Invite links', 'Managers invite people one by one. Leave is added in the app.'], ['csv', 'CSV upload', 'Export from Keka, Excel or any HR tool and upload it under People. Nothing stays connected.'], ['keka', 'Keka sync', 'Read automatically every night, only the fields ticked below. Needs setup under Integrations.']]
      .map(([v, t, h]) => `<label style="margin:var(--space-75) 0;color:var(--text)"><input type="radio" name="peopleSource" value="${v}" ${s.peopleSource === v ? 'checked' : ''} style="width:auto"> <b>${t}</b> <span class="small muted">${h}</span></label>`).join('')}
    <div id="hrf" style="${s.peopleSource === 'keka' ? '' : 'display:none'}"><label>Fields Keka may share</label>
    ${[['reportingLine', 'Reporting line (who reports to whom)'], ['department', 'Department'], ['jobTitle', 'Job title (used as level)'], ['leave', 'Leave days (not available from Keka yet: import a CSV)'], ['phone', 'Mobile number (for serious alerts)']]
      .map(([k, t]) => `<label style="margin:var(--space-50) 0;color:var(--text)"><input type="checkbox" name="hr_${k}" ${s.hrFields[k] && k !== 'leave' ? 'checked' : ''} ${k === 'leave' ? 'disabled' : ''} style="width:auto"> ${t}</label>`).join('')}
    <p class="small muted">Never read, whatever is ticked: salary, payroll, bank, tax, documents, attendance.</p></div></section>
    <section class="card sect"><h3>Alerts</h3>
    <label>Escalate blockers on top priorities after (hours)</label><input name="blockerEscalationHours" type="number" min="1" max="168" value="${s.blockerEscalationHours}">
    </section>
    <div class="savebar"><p class="err" id="serr"></p><button class="primary">Save settings</button></div></form>
    <div class="card form" id="alertsCard"><p class="muted">Loading phone alerts…</p></div>`);
  phoneAlertsCard();
  $('#sform').addEventListener('change', (e) => { if (e.target.name === 'peopleSource') $('#hrf').style.display = e.target.value === 'keka' ? '' : 'none'; });
  $('#sform').onsubmit = async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target).entries());
    const settings = {
      rankWeights: f.rankWeights.split(',').map((x) => Number(x.trim())).filter((x) => !Number.isNaN(x)),
      quality: { done_well: Number(f.q_done_well), needs_fixes: Number(f.q_needs_fixes), redo: Number(f.q_redo) },
      secondRaterRanks: Number(f.secondRaterRanks), stretchBonus: Number(f.stretchBonus), coinsPerWeek: Number(f.coinsPerWeek), maxCoinsPerPerson: Number(f.maxCoinsPerPerson),
      workingDays: days.map((_, i) => (f[`wd${i}`] ? i : null)).filter((x) => x !== null), blockerEscalationHours: Number(f.blockerEscalationHours),
      peopleSource: f.peopleSource || 'manual',
      managersAddTeam: !!f.managersAddTeam,
      hrFields: Object.fromEntries(['reportingLine', 'department', 'jobTitle', 'leave', 'phone'].map((k) => [k, !!f[`hr_${k}`]]))
    };
    try { await api('PUT', '/api/settings', { name: f.name, timezone: f.timezone, allowed_domain: f.allowed_domain, settings }); await loadMe(); toast('Saved'); settingsScreen(); } catch (err) { $('#serr').textContent = err.message; }
  };
}

// ---------- Phone alerts (M91) ----------
async function phoneAlertsCard() {
  const el = $('#alertsCard');
  if (!el) return;
  const a = await api('GET', '/api/alerts/setup');
  const answers = { blockers: "I'll unblock it · Blocked by others · Seen", unrated: "I'll rate it today · Seen", unranked: "I'll rank today · Seen", disputes: "I'll decide today · Seen" };
  el.innerHTML = `<h2 style="margin-top:0">Phone alerts</h2>
    <p>${UI.brand.name} rings your managers' phones when someone is stuck on a top priority, or when work is waiting on them for days.</p>
    <ol class="small"><li>Install M91: <a href="https://apps.apple.com/app/id6759090472" target="_blank" rel="noopener">App Store</a> · <a href="https://play.google.com/store/apps/details?id=com.msg91.m91" target="_blank" rel="noopener">Google Play</a></li>
      <li>In the app, create a channel and add the managers and TLs who should answer.</li>
      <li>Tap the paper plane on that channel, copy the link and paste it here.</li></ol>
    ${a.configured ? `<p class="ok-line">${UI.ph('check-circle')}Connected to <b>${esc(a.channel)}</b></p>
      <div class="row"><button type="button" id="testAlert" class="primary">Ring our phones to test</button><button type="button" id="dropAlert" class="ghost danger">Disconnect</button></div><p class="small" id="testOut"></p>`
    : `<label>Channel link</label><div class="inline"><input id="m91link" placeholder="Paste the link from M91" autocomplete="off"><button type="button" class="primary" id="saveLink" style="flex:0 0 auto">Connect</button></div><p class="err" id="linkErr"></p>`}
    <h3 style="margin-top:var(--space-200)">You'll be asked when…</h3>
    ${a.moments.map((x) => `<label style="margin:var(--space-50) 0;color:var(--text)"><input type="checkbox" data-moment="${x.key}" ${x.on ? 'checked' : ''} style="width:auto"> ${esc(x.text)} <span class="small muted">→ ${answers[x.key]}</span></label>`).join('')}
    <p class="small muted">Alerts name the person they are for. Everyone in the channel needs M91 installed and the invite accepted, or their phone stays silent.</p>`;
  const save = $('#saveLink');
  if (save) save.onclick = () => run(save, async () => {
    try { await api('POST', '/api/alerts/link', { link: $('#m91link').value }); toast('Connected'); phoneAlertsCard(); } catch (e) { $('#linkErr').textContent = e.message; }
  });
  const tb = $('#testAlert');
  if (tb) tb.onclick = () => run(tb, async () => {
    const out = $('#testOut');
    try {
      const r = await api('POST', '/api/alerts/test', {});
      if (!r.delivered) { out.textContent = 'Sent, but it reached nobody: people in the channel still need to install M91 and accept the invite.'; return; }
      out.textContent = `Ringing ${r.delivered} phone${r.delivered === 1 ? '' : 's'}${r.unregistered ? ` (${r.unregistered} not set up yet)` : ''}. Tap "It rang" on a phone…`;
      for (let i = 0; i < 40; i++) {
        await new Promise((res) => setTimeout(res, 3000));
        const s = await api('GET', `/api/alerts/test/${encodeURIComponent(r.alertId)}`);
        if (s.answered || s.responses) { out.textContent = `Answered on a phone${s.answered ? `: "${s.answered}"` : ''}. Phone alerts work.`; return; }
        if (s.status === 'RESOLVED') { out.textContent = 'Closed on a phone. Phone alerts work.'; return; }
      }
      out.textContent = 'No answer yet. Check that a phone in the channel rang.';
    } catch (e) { out.textContent = e.message; }
  });
  const drop = $('#dropAlert');
  if (drop) drop.onclick = () => run(drop, async () => { if (confirm('Stop phone alerts?')) { await api('DELETE', '/api/alerts/link'); phoneAlertsCard(); } });
  el.querySelectorAll('[data-moment]').forEach((c) => (c.onchange = () => run(null, async () => {
    const alertMoments = Object.fromEntries([...el.querySelectorAll('[data-moment]')].map((x) => [x.dataset.moment, x.checked]));
    await api('PUT', '/api/settings', { settings: { alertMoments } });
    await loadMe();
    toast('Saved');
  })));
}

// ---------- History log ----------
async function auditScreen() {
  const a = await api('GET', '/api/audit');
  layout('audit', `${UI.head('Reference', 'History log', `${isAdmin() ? 'Every change in the workspace.' : 'Your own changes.'} Entries can never be edited or deleted.`)}
    <div class="card tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
    ${a.entries.map((x) => `<tr><td class="small">${fmtTime(x.created_at)}</td><td>${esc(x.actor || '')}</td><td><code>${esc(x.action)}</code>${x.action === 'stack.changed_after_lock' && x.detail_json ? ` · reason: ${esc((JSON.parse(x.detail_json).reason) || '')}` : ''}</td></tr>`).join('')}</tbody></table></div>`);
}

// ---------- How we score ----------
function howScreen() {
  const s = state.me.settings;
  const W = s.rankWeights; const Q = s.quality; const pct = (n) => `${Math.round(n * 100)}%`;
  const maxW = Math.max(...W);
  const rankName = ['Most important', 'Very important', 'Important', 'Useful', 'Nice to have'];
  const ex = [['Launch the new feature', 'done_well'], ['Write the help page', 'done_well'], ['Fix the login bug', 'needs_fixes']];
  const label = { done_well: 'Done well', needs_fixes: 'Needs fixes', redo: 'Redo' };
  const check = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const cross = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  layout('how', `${UI.head('Reference', 'How we score', 'A short, plain explanation. Anyone can read it, and the numbers come from this workspace\'s live settings.')}
  <section class="how-hero"><div class="how-q">Your weekly score is</div>
    <h2 class="how-big">how much of your plan you delivered, and how well.</h2>
    <div class="how-eq" aria-label="Score equals points earned divided by points possible times 100"><span><b>Points you earned</b><small>from the work you delivered</small></span><i>÷</i><span><b>Points your plan was worth</b><small>your manager's top ${W.length}</small></span><i>× 100</i></div>
    <p class="how-note"><b>The number of tasks never counts.</b> Doing 50 small things does not beat doing one thing that mattered.</p></section>

  <h2>How a week works</h2>
  <div class="how-steps">
    <div class="how-step"><span class="n">1</span><h3>Plan</h3><p>At the start of the week, your manager picks your top ${W.length} pieces of work and puts them in order.</p></div>
    <div class="how-step"><span class="n">2</span><h3>Deliver</h3><p>You do the work and mark it delivered, with a link or a note as proof.</p></div>
    <div class="how-step"><span class="n">3</span><h3>Rate</h3><p>Someone who used the work rates it. Ranks #1${s.secondRaterRanks > 1 ? ` to #${s.secondRaterRanks}` : ''} get a second opinion.</p></div>
    <div class="how-step"><span class="n">4</span><h3>Score</h3><p>The points add up into one number out of 100. Always the same formula.</p></div>
  </div>

  <h2>What each priority is worth</h2>
  <div class="card"><p class="small muted" style="margin-top:0">The higher a piece of work is in your list, the more of your score it carries. Everyone's list has its own #1, so a new joiner and a team lead are both scored out of 100.</p>
    <div class="how-bars">${W.map((w, i) => `<div class="how-bar"><b class="how-rk${i === 0 ? ' r1' : ''}">#${i + 1}</b><div><div class="lab"><span>${rankName[i] || 'Priority'}</span><em>${w}%</em></div><div class="track"><i style="width:${(w / maxW) * 100}%"></i></div></div></div>`).join('')}</div></div>

  <h2>How well it was done</h2>
  <div class="how-q3">
    <div class="how-card good"><span class="dot"></span><h3>Done well</h3><b>${pct(Q.done_well)} of the points</b><p>It worked and it did the job.</p></div>
    <div class="how-card warn"><span class="dot"></span><h3>Needs fixes</h3><b>${pct(Q.needs_fixes)} of the points</b><p>Mostly there, a few things to fix. The rater says what.</p></div>
    <div class="how-card bad"><span class="dot"></span><h3>Redo</h3><b>${pct(Q.redo)} of the points</b><p>It missed the brief. The rater says why.</p></div>
  </div>

  <h2>Try it yourself</h2>
  <div class="card how-try" id="howTry"><p class="small muted" style="margin-top:0">Three priorities for one week. Tap a rating and watch the score.</p>
    <div class="how-rows">${ex.map((e, i) => `<div class="how-row" data-i="${i}"><b class="how-rk${i === 0 ? ' r1' : ''}">#${i + 1}</b><div class="t"><span>${e[0]}</span><small>worth ${W[i]} points</small></div>
      <div class="opts" role="group" aria-label="Rating for ${e[0]}">${['done_well', 'needs_fixes', 'redo'].map((q) => `<button type="button" class="q q-${q === 'done_well' ? 'good' : q === 'needs_fixes' ? 'warn' : 'bad'}${e[1] === q ? ' on' : ''}" data-q="${q}"><i></i>${label[q]}</button>`).join('')}</div><div class="pts" data-pts></div></div>`).join('')}</div>
    <div class="how-result"><div><small>Points earned</small><b data-earn>0</b><span>of <em data-poss>0</em></span></div><div class="how-sc"><small>Weekly score</small><b data-score>0</b><span>/ 100</span></div></div></div>

  <h2>What counts, and what never does</h2>
  <div class="how-two">
    <div class="card"><h3>Helps your score</h3><ul class="how-list yes">
      <li>${check}Finishing your top priorities</li><li>${check}Doing them well, as rated by others</li><li>${check}A stretch task above your level: +${pct(s.stretchBonus)} if done well</li></ul></div>
    <div class="card"><h3>Never lowers it</h3><ul class="how-list no">
      <li>${check}Work blocked by someone else</li><li>${check}A missed stretch task</li><li>${check}Leave days: less is expected that week</li><li>${check}Being given only small tasks</li></ul></div>
    <div class="card"><h3>Never counts</h3><ul class="how-list none">
      <li>${cross}How many tasks you did</li><li>${cross}Hours worked, screenshots or activity tracking</li><li>${cross}Work that was not in your top ${W.length}. It is logged, not scored</li><li>${cross}AI. It never scores anyone</li></ul></div>
  </div>

  <h2>Common questions</h2>
  <div class="how-faq">
    <details><summary>What if I only got small tasks this week?</summary><p>Nothing is lost. The score compares what you delivered with <b>your own plan</b>. If you delivered every small task well, you score 100. Managers also see the level of work in the Team view.</p></details>
    <details><summary>What if I disagree with a rating?</summary><p>Raise a dispute from the rating. The rater's manager decides. Both opinions and the decision are kept, so nothing is hidden.</p></details>
    <details><summary>Can my manager change my priorities during the week?</summary><p>Yes, but the week is locked once it starts. A change needs a written reason, and it is recorded in the history log for everyone to see.</p></details>
    <details><summary>What are coins?</summary><p>Thank-yous from colleagues. Everyone has ${s.coinsPerWeek} a week, up to ${s.maxCoinsPerPerson} for one person, never to themselves. They show beside your score and <b>never change it</b>.</p></details>
    <details><summary>Who can see my score?</summary><p>You, your manager and the people above them. Colleagues at your level cannot see it. Raters' habits (how often they say Done well) are visible to managers, so harsh or soft raters show up.</p></details>
  </div>`);
  const box = $('#howTry');
  const recompute = () => {
    let earned = 0; let poss = 0;
    box.querySelectorAll('.how-row').forEach((r, i) => {
      const q = r.querySelector('.q.on').dataset.q; const pts = Math.round(W[i] * Q[q] * 10) / 10;
      earned += pts; poss += W[i]; r.querySelector('[data-pts]').textContent = `+${pts}`;
    });
    const bump = (n, v) => { n.textContent = v; n.classList.remove('bump'); void n.offsetWidth; n.classList.add('bump'); };
    bump(box.querySelector('[data-earn]'), Math.round(earned * 10) / 10); box.querySelector('[data-poss]').textContent = poss;
    bump(box.querySelector('[data-score]'), poss ? Math.min(100, Math.round((earned / poss) * 100)) : 0);
  };
  box.addEventListener('click', (e) => { const b = e.target.closest('.q'); if (!b) return; b.parentNode.querySelectorAll('.q').forEach((x) => x.classList.toggle('on', x === b)); recompute(); });
  recompute();
}

// ---------- router ----------
async function route() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  document.title = 'Cairn · Measure what mattered';
  if (window.Home) window.Home.destroy();
  const mainEl = document.getElementById('main');
  if (mainEl && state.me) mainEl.innerHTML = UI.skeleton();
  const [p, qs] = (location.hash.slice(2) || '').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const [page, arg] = p.split('/');
  try {
    if (page === 'join') {
      const inv = await api('GET', `/api/invites/${encodeURIComponent(arg)}`);
      return authScreen('join', { ...inv, token: arg });
    }
    const KNOWN = ['', 'home', 'signin', 'signup', 'forgot', 'reset', 'join', 'week', 'rate', 'team', 'score', 'coins', 'disputes', 'incidents', 'people', 'integrations', 'settings', 'profile', 'audit', 'how'];
    if (!KNOWN.includes(page || '')) return notFoundScreen();
    if (page === 'forgot') return authScreen('forgot');
    if (page === 'reset') return authScreen('reset', { token: arg });
    if (!state.me) {
      try { if ((await api('GET', '/api/session')).signedIn) await loadMe(); } catch { /* not signed in */ }
    }
    if (page === 'home' || (!state.me && !page)) {
      window.Home.render($('#app'), { signedIn: !!state.me });
      window.scrollTo(0, 0);
      return;
    }
    if (!state.me) return authScreen(page === 'signup' ? 'signup' : 'signin', params.reset ? { notice: 'Password updated. Sign in with your new password.' } : {});
    const screens = { week: weekScreen, rate: rateScreen, team: teamScreen, score: scoreScreen, coins: coinsScreen, disputes: disputesScreen, incidents: incidentsScreen, people: peopleScreen, integrations: integrationsScreen, settings: settingsScreen, profile: profileScreen, audit: auditScreen, how: howScreen };
    await (screens[page] || weekScreen)(params);
    if ((screens[page] || weekScreen) === weekScreen && !params.user) demoNudge();
    window.scrollTo(0, 0);
  } catch (e) {
    if (state.me) layout(page, `<div class="card"><p class="err">${esc(e.message)}</p></div>`);
    else $('#app').innerHTML = `<div class="auth"><div class="card"><p class="err">${esc(e.message)}</p><a href="#/signin">Sign in</a></div></div>`;
  }
}
window.addEventListener('hashchange', route);
route();
