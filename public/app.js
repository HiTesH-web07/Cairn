'use strict';
// Proof of Impact: single-page frontend. All data comes from the server; nothing secret lives here.

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
  ['week', 'My Week', () => true],
  ['rate', 'Rate Work', () => true],
  ['team', 'Team', isManager],
  ['score', 'Scorecard', () => true],
  ['coins', 'Coins', () => true],
  ['disputes', 'Disputes', () => true],
  ['incidents', 'Incidents', isManager],
  ['sep'],
  ['people', 'People', () => isManager() || canAddPeople()],
  ['integrations', 'Integrations', isAdmin],
  ['settings', 'Settings', isAdmin],
  ['audit', 'History log', () => true],
  ['how', 'How we score', () => true]
];
function layout(active, inner) {
  const links = NAV.filter((n) => n[0] === 'sep' || n[2]()).map((n) => (n[0] === 'sep' ? '<div class="sep"></div>'
    : `<a href="#/${n[0]}" class="${n[0] === active ? 'on' : ''}">${n[1]}${n[0] === 'rate' && state.pending ? `<span class="badge">${state.pending}</span>` : ''}</a>`)).join('');
  $('#app').innerHTML = `<div class="topbar"><button class="ghost" id="menu" aria-label="Menu">☰</button><b>Proof of Impact</b></div>
  <div class="shell"><nav class="side" id="side"><div class="brand"><i></i>Proof of Impact</div>
  <div class="ws">${esc(state.me.workspace.name)} · ${esc(state.me.user.name)}</div>${links}
  <div class="sep"></div><a href="#" id="signout">Sign out</a></nav><main id="main">${inner}</main></div>`;
  $('#menu').onclick = () => $('#side').classList.toggle('open');
  $('#signout').onclick = async (e) => { e.preventDefault(); await api('POST', '/api/auth/logout'); state.me = null; location.hash = '#/signin'; };
}

// ---------- auth screens ----------
function authScreen(mode, extra = {}) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const signup = `<label>Company name</label><input name="company" required maxlength="120">
    <label>Your name</label><input name="name" required maxlength="120">
    <label>Work email</label><input name="email" type="email" required autocomplete="email">
    <label>Password (10+ characters)</label><input name="password" type="password" minlength="10" required autocomplete="new-password">
    <label>Only allow emails from this domain (optional)</label><input name="allowed_domain" placeholder="yourcompany.com">
    <label>Time zone</label><input name="timezone" value="${esc(tz)}">`;
  const signin = `<label>Email</label><input name="email" type="email" required autocomplete="email">
    <label>Password</label><input name="password" type="password" required autocomplete="current-password">
    ${extra.choose ? `<label>Workspace</label><select name="workspace_id">${extra.choose.map((w) => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select>` : ''}`;
  const join = `<p>You're invited to <b>${esc(extra.workspace)}</b> as ${esc(extra.email)}.</p>
    <label>Your name</label><input name="name" required maxlength="120">
    <label>Choose a password (10+ characters)</label><input name="password" type="password" minlength="10" required autocomplete="new-password">`;
  $('#app').innerHTML = `<div class="auth"><div class="brand" style="padding:0 0 1rem"><i></i>Proof of Impact</div>
    <p class="muted">Measure the value of work, not the number of tasks.</p>
    ${mode === 'join' ? '' : `<div class="tabs"><button class="${mode === 'signin' ? 'on' : ''}" onclick="location.hash='#/signin'">Sign in</button><button class="${mode === 'signup' ? 'on' : ''}" onclick="location.hash='#/signup'">Create a workspace</button></div>`}
    <form class="card" id="authform">${mode === 'signup' ? signup : mode === 'join' ? join : signin}<p class="err" id="autherr"></p>
    <button class="primary">${mode === 'signup' ? 'Create workspace' : mode === 'join' ? 'Join' : 'Sign in'}</button></form></div>`;
  $('#authform').onsubmit = async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target).entries());
    try {
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
    return `<div class="item"><div class="rank">${it.rank ? `#${it.rank}<small>${weights[it.rank - 1]}%</small>` : '–'}</div>
      <div><h3>${esc(it.title)} ${it.stretch ? '<span class="pill acc">⭐ Stretch</span>' : ''}</h3>
      <div><span class="pill ${statusCls}">${STATUS[it.status]}</span>${it.kind !== 'work' ? `<span class="pill">${it.kind === 'helping' ? 'Helping others' : 'Unplanned'}</span>` : ''}
      ${parent ? `<span class="pill">↑ supports: ${esc(parent.title)}</span>` : ''}</div>
      ${it.details ? `<p class="small muted">${esc(it.details)}</p>` : ''}
      ${it.proof_url || it.proof_note ? `<p class="small">Proof (${esc(it.proof_source || 'self-reported')}): ${it.proof_url ? `<a href="${esc(it.proof_url)}" target="_blank" rel="noopener noreferrer">${esc(it.proof_url)}</a> ` : ''}${esc(it.proof_note || '')}</p>` : ''}
      ${openBlocker ? `<p class="small" style="color:var(--warn)">Blocked: ${esc(openBlocker.description)} · since ${fmtTime(openBlocker.raised_at)}${openBlocker.escalated ? ' · escalated' : ''}</p>` : ''}
      ${ratings ? `<div>${ratings}</div>` : it.status === 'delivered' ? '<p class="small muted">Waiting for rating</p>' : ''}
      </div><div class="actions">${acts.join('')}</div></div>`;
  };

  layout('week', `<div class="row spread"><div><h1>${who}</h1><p class="muted">${fmtWeek(w.week)}${w.manager ? ` · ranked by ${esc(w.manager.name)}` : ''}</p></div>
    <div class="row"><a class="btn" href="${nav(-7)}">← Previous</a><a class="btn" href="${nav(7)}">Next →</a></div></div>
    <div class="grid">
      <div class="tile"><div class="k">Priority score</div><div class="v">${scoreText(w.score)}</div><div class="s">${w.pending ? `${w.pending} waiting for rating` : 'out of 100'}</div></div>
      <div class="tile"><div class="k">Quality</div><div class="v">${w.quality.done_well}<span class="small muted"> / ${w.quality.done_well + w.quality.needs_fixes + w.quality.redo}</span></div><div class="s">rated "Done well"</div></div>
      <div class="tile"><div class="k">Coins received</div><div class="v">${w.coins}</div><div class="s">shown beside the score, never added</div></div>
      <div class="tile"><div class="k">Alignment</div><div class="v">${w.alignment === null ? '–' : `${w.alignment}%`}</div><div class="s">of priority weight linked upward</div></div>
    </div>
    <div class="card"><div class="row spread"><h2 style="margin:0">Ranked priorities ${w.locked ? '<span class="pill good">🔒 Locked</span>' : '<span class="pill warn">Not locked yet</span>'}</h2>
      <div class="row">${w.canRank ? `<button class="primary" id="rankbtn">${w.locked ? 'Change ranking' : 'Rank this week'}</button>${!w.locked && ranked.length ? '<button id="lockbtn">Lock week</button>' : ''}` : ''}</div></div>
      ${ranked.length ? ranked.map(itemRow).join('') : `<p class="muted">${w.canRank ? 'Nothing ranked yet. Add work below, then rank the top items.' : 'Your manager has not ranked this week yet. Add what you plan to work on below.'}</p>`}</div>
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
      ${order.map((o, i) => `<div class="card" style="padding:.6rem .8rem"><div class="row spread"><b>#${i + 1} · ${title(o.item_id)}</b>
        <div class="row"><button type="button" data-up="${i}" ${i === 0 ? 'disabled' : ''}>↑</button><button type="button" data-down="${i}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button><button type="button" class="ghost danger" data-out="${i}">✕</button></div></div>
        <div class="row small"><label style="margin:0"><input type="checkbox" data-stretch="${i}" ${o.stretch ? 'checked' : ''} style="width:auto"> ⭐ Stretch (above level: bonus, no penalty)</label></div>
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
  layout('rate', `<h1>Rate Work</h1><p class="muted">Rate the result, not the person. Needs fixes and Redo need a note.</p>
    ${r.items.length ? r.items.map((it) => `<div class="card" data-id="${esc(it.id)}"><div class="row spread"><div><h3>${esc(it.title)}</h3>
      <p class="small muted">${esc(it.owner.name)}${it.owner.level ? ` · ${esc(it.owner.level)}` : ''} · ${it.rank ? `ranked #${it.rank} (${it.weight}%)` : 'not ranked'}${it.stretch ? ' · ⭐ Stretch' : ''} · you are the ${it.as === 'primary' ? 'main' : 'second'} rater</p></div></div>
      ${it.details ? `<p class="small">${esc(it.details)}</p>` : ''}
      <p>Proof: ${it.proof_url ? `<a href="${esc(it.proof_url)}" target="_blank" rel="noopener noreferrer">${esc(it.proof_url)}</a> ` : ''}${esc(it.proof_note || '')}</p>
      <label>Note (required for Needs fixes and Redo)</label><textarea class="note"></textarea>
      <div class="row" style="margin-top:.5rem"><button class="primary" data-q="done_well">✅ Done well</button><button data-q="needs_fixes">⚠️ Needs fixes</button><button data-q="redo">🔁 Redo</button></div></div>`).join('')
    : '<div class="card"><p class="muted">Nothing waiting for you.</p></div>'}`);
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

// ---------- Team ----------
async function teamScreen(params) {
  const t = await api('GET', `/api/team${params.week ? `?week=${encodeURIComponent(params.week)}` : ''}`);
  const nav = (n) => `#/team?week=${addDays(t.week, n)}`;
  layout('team', `<div class="row spread"><div><h1>Team</h1><p class="muted">${fmtWeek(t.week)} · each person against their own ranked priorities</p></div>
    <div class="row"><a class="btn" href="${nav(-7)}">← Previous</a><a class="btn" href="${nav(7)}">Next →</a></div></div>
    <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Level</th><th>Department</th><th class="num">Score</th><th class="num">Quality</th><th class="num">Coins</th><th class="num">Alignment</th><th>Flags</th></tr></thead><tbody>
    ${t.people.map((p) => `<tr><td><a href="#/week?user=${esc(p.id)}&week=${t.week}">${esc(p.name)}</a></td><td>${esc(p.level || '')}</td><td>${esc(p.department || '')}</td>
      <td class="num">${scoreText(p.score)}${p.pending ? ` <span class="pill">${p.pending} unrated</span>` : ''}</td><td class="num">${p.qualityPct === null ? '–' : `${p.qualityPct}%`}</td>
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
  layout('score', `<h1>${esc(s.person.name)} · Scorecard</h1><p class="muted">${fmtWeek(s.week)}${s.person.level ? ` · ${esc(s.person.level)}` : ''}</p>
    <div class="grid">
      <div class="tile"><div class="k">1. Did what mattered most?</div><div class="v">${scoreText(c.score)}</div><div class="s">priority score out of 100${c.pending ? ` · ${c.pending} waiting for rating` : ''}</div></div>
      <div class="tile"><div class="k">2. Was it done well?</div><div class="v">${rated ? `${c.quality.done_well}/${rated}` : '–'}</div><div class="s">rated Done well</div></div>
      <div class="tile"><div class="k">3. Did others value it?</div><div class="v">🪙 ${c.coins}</div><div class="s">coins from colleagues</div></div>
      <div class="tile"><div class="k">Alignment</div><div class="v">${c.alignment === null ? '–' : `${c.alignment}%`}</div><div class="s">linked to the level above</div></div>
    </div>
    <div class="card"><h3>Last 5 weeks</h3><div class="bars">${s.trend.map((t) => `<div><span style="height:${t.score || 0}px"></span>${scoreText(t.score)}<br>${esc(t.week.slice(5))}</div>`).join('')}</div></div>
    <div class="card"><h3>What was delivered this week</h3>${s.changed.length ? `<ul>${s.changed.map((x) => `<li>${x.rank ? `#${x.rank} ` : ''}${esc(x.title)} ${x.proof_url ? `· <a href="${esc(x.proof_url)}" target="_blank" rel="noopener noreferrer">proof</a>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Nothing delivered yet.</p>'}</div>
    <div class="card"><h3>Why colleagues gave coins</h3>${s.coinNotes.length ? `<ul>${s.coinNotes.map((n) => `<li>🪙 ${n.coins} from ${esc(n.from_name)}: "${esc(n.reason)}"</li>`).join('')}</ul>` : '<p class="muted">None this week.</p>'}</div>
    <p class="small"><a href="#/how">How is this calculated?</a> · Task count never counts.</p>`);
}

// ---------- Coins ----------
async function coinsScreen() {
  const [c, dir] = await Promise.all([api('GET', '/api/coins'), api('GET', '/api/directory')]);
  layout('coins', `<h1>Coins</h1><p class="muted">Thank people whose work helped you. You have <b>${c.remaining}</b> left this week, at most ${c.maxPerPerson} to one person.</p>
    <form class="card form" id="coinform"><label>To</label><select name="to_id" required>${dir.people.filter((p) => p.id !== state.me.user.id).map((p) => `<option value="${esc(p.id)}">${esc(p.name)}${p.department ? ` · ${esc(p.department)}` : ''}</option>`).join('')}</select>
      <label>Coins</label><input name="coins" type="number" min="1" max="${c.maxPerPerson}" value="1" required><label>What did they do for you?</label><input name="reason" required maxlength="300">
      <p class="err" id="coinerr"></p><button class="primary">Give coins</button></form>
    <h2>Received</h2><div class="card">${c.received.length ? `<ul>${c.received.map((x) => `<li>🪙 ${x.coins} from ${esc(x.from_name)}: "${esc(x.reason)}" <span class="small muted">${fmtTime(x.created_at)}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}</div>
    <h2>Given</h2><div class="card">${c.given.length ? `<ul>${c.given.map((x) => `<li>🪙 ${x.coins} to ${esc(x.to_name)}: "${esc(x.reason)}"</li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}</div>`);
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
  layout('disputes', `<h1>Disputes</h1><p class="muted">A disputed rating goes to the rater's manager. The original rating and the decision are both kept.</p>
    ${d.disputes.length ? d.disputes.map((x) => `<div class="card"><div class="row spread"><h3>${esc(x.title)}</h3><span class="pill ${x.status === 'open' ? 'warn' : 'good'}">${esc(x.status)}</span></div>
      <p class="small muted">${esc(x.owner_name)} disputes ${esc(x.rater_name)}'s rating "${QUALITY[x.original_quality]}" · ${fmtTime(x.created_at)}</p><p>"${esc(x.reason)}"</p>
      ${x.status !== 'open' ? `<p class="small">Decision: ${x.status === 'changed' ? `changed to ${QUALITY[x.new_quality]}` : 'rating kept'} · "${esc(x.resolution_note)}"</p>` : ''}
      ${x.canResolve ? `<button class="primary" data-resolve="${esc(x.id)}">Decide</button>` : ''}</div>`).join('') : '<div class="card"><p class="muted">No disputes.</p></div>'}`);
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
  const r = await api('GET', '/api/incidents');
  layout('incidents', `<h1>Incidents</h1>
    <div class="notice warn">Phone alerts (M91) are not set up yet, so nobody is woken. Serious blockers are listed here until it is.</div>
    <h2>Blockers on top priorities, open longer than ${state.me.settings.blockerEscalationHours}h</h2>
    <div class="card tablewrap"><table><thead><tr><th>Person</th><th>Priority</th><th>Blocker</th><th>Since</th></tr></thead><tbody>
    ${r.blockersOverThreshold.map((b) => `<tr><td>${esc(b.name)}</td><td>#${b.rank} ${esc(b.title)}</td><td>${esc(b.description)}</td><td>${fmtTime(b.raised_at)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">None.</td></tr>'}</tbody></table></div>
    <h2>Alerts</h2><div class="card">${r.incidents.length ? r.incidents.map((i) => `<p>${esc(i.severity)} · ${esc(i.title)} · ${esc(i.status)}</p>`).join('') : '<p class="muted">No alerts sent.</p>'}</div>`);
}

// ---------- People ----------
async function peopleScreen() {
  const [p, dir, former] = await Promise.all([api('GET', '/api/people'), api('GET', '/api/directory'), api('GET', '/api/people/former')]);
  const byId = Object.fromEntries(dir.people.map((x) => [x.id, x.name]));
  const admin = isAdmin();
  const adder = canAddPeople();
  const me = state.me.user.id;
  const src = state.me.settings.peopleSource;
  const team = p.people; // admins: everyone; managers: themselves and their team
  const rowActs = (u) => {
    if (u.id === me || !adder || u.role === 'owner' && !admin) return '';
    const a = [`<button data-edit="${esc(u.id)}">Edit</button>`];
    if (!u.joined) a.push(`<button data-link="${esc(u.id)}">New invite link</button>`);
    a.push(`<button class="ghost danger" data-off="${esc(u.id)}">Left the company</button>`);
    return a.join(' ');
  };
  layout('people', `<div class="row spread"><h1>People</h1><div class="row">${adder ? '<button id="importp">Import (CSV)</button><button id="importl">Import leave (CSV)</button><button class="primary" id="invite">+ Add person</button>' : ''}</div></div>
    <p class="small muted">${admin ? `Add your managers and TLs; ${state.me.settings.managersAddTeam ? 'each of them adds and looks after their own team' : 'only admins add people in this workspace'}. People come from: <b>${src === 'keka' ? 'Keka sync' : src === 'csv' ? 'CSV upload' : 'invite links'}</b> · <a href="#/settings">Settings</a>`
      : adder ? 'Add the people in your team. You can update, move within your team, or mark people who left.' : 'Ask your manager or an admin to add or change people.'}</p>
    <div class="card tablewrap"><table><thead><tr><th>Name</th><th>Role</th><th>Level</th><th>Department</th><th>Reports to</th><th>Phone</th>${adder ? '<th></th>' : ''}</tr></thead><tbody>
    ${team.map((u) => `<tr><td><a href="#/week?user=${esc(u.id)}">${esc(u.name)}</a> ${u.joined ? '' : '<span class="pill warn">invited</span>'}<div class="small muted">${esc(u.email)}</div></td><td>${esc(u.role)}</td><td>${esc(u.level || '')}</td><td>${esc(u.department || '')}</td>
      <td>${esc(byId[u.reports_to] || '–')}</td><td>${esc(u.phone || '')}</td>${adder ? `<td><div class="actions">${rowActs(u)}</div></td>` : ''}</tr>`).join('')}</tbody></table></div>
    ${former.people.length ? `<h2>Former people</h2><p class="small muted">They cannot sign in. Their past weeks, ratings and coins stay on record.</p><div class="card tablewrap"><table><tbody>
      ${former.people.map((u) => `<tr><td>${esc(u.name)}<div class="small muted">${esc(u.email)}</div></td><td>${esc(u.level || '')}</td><td>${esc(u.department || '')}</td><td>${adder ? `<button data-back="${esc(u.id)}">Bring back</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <p class="small muted">New joiners: add them here or by CSV. Leavers: "Left the company" moves their team to a new manager. Team changes: Edit → Reports to.</p>`);
  const managerOptions = (sel, exclude) => (admin ? dir.people : team).filter((x) => x.id !== exclude).map((x) => `<option value="${esc(x.id)}" ${x.id === sel ? 'selected' : ''}>${esc(x.name)}</option>`).join('');
  $('#main').addEventListener('click', (e) => {
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

// ---------- Integrations ----------
async function integrationsScreen() {
  const s = await api('GET', '/api/integrations/status');
  const line = (name, ok, text) => `<tr><td><b>${name}</b></td><td><span class="pill ${ok ? 'good' : 'warn'}">${ok ? 'Working' : 'Not set up'}</span></td><td class="small">${text}</td></tr>`;
  layout('integrations', `<h1>Integrations</h1><p class="muted">Nothing here is shown as working until it has been tested for real.</p>
    <div class="card tablewrap"><table><tbody>
    ${line('Connect your tools (viaSocket)', s.viasocket.verified, s.viasocket.keysPresent ? 'Keys are stored on the server. Waiting for the plan to be approved and a real test.' : 'Keys missing.')}
    ${line('Slack (daily check-ins, rating buttons)', false, 'Not connected yet.')}
    ${line('Keka (people, reporting lines, leave)', false, state.me.settings.peopleSource === 'keka' ? 'Chosen in Settings. The Connect button appears here once the Keka sync is built and tested.' : 'Optional. This company gets people from ' + (state.me.settings.peopleSource === 'csv' ? 'CSV uploads' : 'invite links') + '.')}
    ${line('M91 (phone alerts for serious problems)', s.m91.verified, s.m91.sendLinkPresent ? 'Send link stored. Waiting for a safe test.' : 'Send link not added yet.')}
    </tbody></table></div>`);
}

// ---------- Settings ----------
async function settingsScreen() {
  const s = state.me.settings;
  const ws = state.me.workspace;
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  layout('settings', `<h1>Settings</h1><form class="card form" id="sform">
    <label>Company name</label><input name="name" value="${esc(ws.name)}" required>
    <label>Time zone</label><input name="timezone" value="${esc(ws.timezone)}">
    <label>Only allow emails from this domain</label><input name="allowed_domain" value="${esc(ws.allowed_domain || '')}" placeholder="yourcompany.com">
    <label>Rank weights in % (#1 first, must add up to 100)</label><input name="rankWeights" value="${s.rankWeights.join(', ')}">
    <div class="inline"><div><label>Done well ×</label><input name="q_done_well" type="number" step="0.05" min="0" max="1" value="${s.quality.done_well}"></div>
    <div><label>Needs fixes ×</label><input name="q_needs_fixes" type="number" step="0.05" min="0" max="1" value="${s.quality.needs_fixes}"></div>
    <div><label>Redo ×</label><input name="q_redo" type="number" step="0.05" min="0" max="1" value="${s.quality.redo}"></div></div>
    <div class="inline"><div><label>Second rater for ranks #1 to #</label><input name="secondRaterRanks" type="number" min="0" max="10" value="${s.secondRaterRanks}"></div>
    <div><label>Stretch bonus (0–1)</label><input name="stretchBonus" type="number" step="0.05" min="0" max="1" value="${s.stretchBonus}"></div></div>
    <div class="inline"><div><label>Coins per week</label><input name="coinsPerWeek" type="number" min="0" max="100" value="${s.coinsPerWeek}"></div>
    <div><label>Max coins to one person</label><input name="maxCoinsPerPerson" type="number" min="1" value="${s.maxCoinsPerPerson}"></div></div>
    <label>Working days</label><div class="row">${days.map((d, i) => `<label style="margin:0"><input type="checkbox" name="wd${i}" ${s.workingDays.includes(i) ? 'checked' : ''} style="width:auto"> ${d}</label>`).join('')}</div>
    <h2>Who adds people</h2>
    <label style="margin:.4rem 0;color:var(--text)"><input type="radio" name="managersAddTeam" value="1" ${s.managersAddTeam ? 'checked' : ''} style="width:auto"> <b>Managers add their own team</b> <span class="small muted">Admins add managers/TLs; each manager adds, moves and offboards people in their team.</span></label>
    <label style="margin:.4rem 0;color:var(--text)"><input type="radio" name="managersAddTeam" value="" ${s.managersAddTeam ? '' : 'checked'} style="width:auto"> <b>Only admins</b> <span class="small muted">Managers rank and rate their team but cannot add or remove people.</span></label>
    <h2>People &amp; leave source</h2><p class="small muted">Choose where people, reporting lines and leave come from. You can change this any time.</p>
    ${[['manual', 'Invite links', 'Managers invite people one by one. Leave is added in the app.'], ['csv', 'CSV upload', 'Export from Keka, Excel or any HR tool and upload it under People. Nothing stays connected.'], ['keka', 'Keka sync', 'Read automatically every night, only the fields ticked below. Needs setup under Integrations.']]
      .map(([v, t, h]) => `<label style="margin:.4rem 0;color:var(--text)"><input type="radio" name="peopleSource" value="${v}" ${s.peopleSource === v ? 'checked' : ''} style="width:auto"> <b>${t}</b> <span class="small muted">${h}</span></label>`).join('')}
    <div id="hrf" style="${s.peopleSource === 'keka' ? '' : 'display:none'}"><label>Fields Keka may share</label>
    ${[['reportingLine', 'Reporting line (who reports to whom)'], ['department', 'Department'], ['jobTitle', 'Job title (used as level)'], ['leave', 'Leave days'], ['phone', 'Mobile number (for serious alerts)']]
      .map(([k, t]) => `<label style="margin:.2rem 0;color:var(--text)"><input type="checkbox" name="hr_${k}" ${s.hrFields[k] ? 'checked' : ''} style="width:auto"> ${t}</label>`).join('')}
    <p class="small muted">Never read, whatever is ticked: salary, payroll, bank, tax, documents, attendance.</p></div>
    <h2>Alerts</h2>
    <label>Escalate blockers on top priorities after (hours)</label><input name="blockerEscalationHours" type="number" min="1" max="168" value="${s.blockerEscalationHours}">
    <p class="err" id="serr"></p><button class="primary">Save settings</button></form>`);
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

// ---------- History log ----------
async function auditScreen() {
  const a = await api('GET', '/api/audit');
  layout('audit', `<h1>History log</h1><p class="muted">${isAdmin() ? 'Every change in the workspace.' : 'Your own changes.'} Entries can never be edited or deleted.</p>
    <div class="card tablewrap"><table><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
    ${a.entries.map((x) => `<tr><td class="small">${fmtTime(x.created_at)}</td><td>${esc(x.actor || '')}</td><td><code>${esc(x.action)}</code>${x.action === 'stack.changed_after_lock' && x.detail_json ? ` · reason: ${esc((JSON.parse(x.detail_json).reason) || '')}` : ''}</td></tr>`).join('')}</tbody></table></div>`);
}

// ---------- How we score ----------
function howScreen() {
  const s = state.me.settings;
  layout('how', `<h1>How we score</h1><p class="muted">Generated from ${esc(state.me.workspace.name)}'s live settings.</p>
    <div class="card"><h3>The idea</h3><p>Every week, your manager ranks your top ${s.rankWeights.length} pieces of work. You are measured on delivering the most important ones, and on how well they were done. <b>The number of tasks never counts.</b></p></div>
    <div class="card"><h3>1. Priority score (out of 100)</h3><table><thead><tr><th>Rank</th><th class="num">Weight</th></tr></thead><tbody>${s.rankWeights.map((w, i) => `<tr><td>#${i + 1}</td><td class="num">${w}%</td></tr>`).join('')}</tbody></table>
      <p>Score = sum of (weight × quality) for delivered priorities, divided by the weight of what was ranked. Each person's #1 is their most important work, so an intern and a senior are both scored out of 100.</p>
      <ul><li>Work outside the ranked list is logged but earns 0.</li><li>⭐ Stretch work (above your level): +${Math.round(s.stretchBonus * 100)}% if done well, no penalty if missed.</li>
      <li>Work your manager marks "blocked by others" does not count against you.</li><li>Leave days lower what is expected that week.</li><li>The score is capped at 100.</li></ul></div>
    <div class="card"><h3>2. Quality</h3><p>Done well ×${s.quality.done_well} · Needs fixes ×${s.quality.needs_fixes} · Redo ×${s.quality.redo}. Ranks #1–#${s.secondRaterRanks} are rated by two people: your manager and someone who used the work (or your manager's manager). Needs fixes and Redo always come with a note.</p></div>
    <div class="card"><h3>3. Coins from colleagues</h3><p>Everyone gives up to ${s.coinsPerWeek} coins a week, at most ${s.maxCoinsPerPerson} to one person, never to themselves. Coins are shown next to the score, never added to it.</p></div>
    <div class="card"><h3>Fairness</h3><ul><li>Priorities are locked before the work; changes need a reason and are logged.</li><li>Each rater's pattern (how often they say Done well) is visible to managers.</li>
      <li>Any rating can be disputed; the rater's manager decides and both opinions are kept.</li><li>AI never scores anyone.</li><li>No screenshots, time tracking or activity monitoring. Ever.</li></ul></div>`);
}

// ---------- router ----------
async function route() {
  document.querySelectorAll('dialog[open]').forEach((d) => d.close());
  const [p, qs] = (location.hash.slice(2) || '').split('?');
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  const [page, arg] = p.split('/');
  try {
    if (page === 'join') {
      const inv = await api('GET', `/api/invites/${encodeURIComponent(arg)}`);
      return authScreen('join', { ...inv, token: arg });
    }
    if (!state.me) {
      try { await loadMe(); } catch { /* not signed in */ }
    }
    if (!state.me) return authScreen(page === 'signup' ? 'signup' : 'signin');
    const screens = { week: weekScreen, rate: rateScreen, team: teamScreen, score: scoreScreen, coins: coinsScreen, disputes: disputesScreen, incidents: incidentsScreen, people: peopleScreen, integrations: integrationsScreen, settings: settingsScreen, audit: auditScreen, how: howScreen };
    await (screens[page] || weekScreen)(params);
    window.scrollTo(0, 0);
  } catch (e) {
    if (state.me) layout(page, `<div class="card"><p class="err">${esc(e.message)}</p></div>`);
    else $('#app').innerHTML = `<div class="auth"><div class="card"><p class="err">${esc(e.message)}</p><a href="#/signin">Sign in</a></div></div>`;
  }
}
window.addEventListener('hashchange', route);
route();
