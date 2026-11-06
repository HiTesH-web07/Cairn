// M91: ring a real person's phone and read their answer back.
// The send link is a credential (the token is in the URL): it is stored encrypted, never logged,
// never returned to a browser, and errors from here never contain it.
const HOST = 'https://m91-api.msg91.com';
const LINK_RE = /^https:\/\/m91-api\.msg91\.com\/s\/[A-Za-z0-9_-]{8,}$/;

class M91Error extends Error {
  constructor(code, message, status, details) { super(message); this.code = code; this.status = status; this.details = details; }
}

// Strip anything from "?" onward: a link with ?title=… would RAISE an alert when fetched.
function cleanLink(raw) {
  const link = String(raw || '').trim().split('?')[0].split('#')[0].replace(/\/+$/, '');
  if (!LINK_RE.test(link)) throw new M91Error('BAD_LINK', 'That does not look like an M91 link. In the M91 app, tap the paper plane on your channel and copy the link.');
  return link;
}

async function call(method, url, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000)
    });
  } catch (e) {
    throw new M91Error('NETWORK', 'Could not reach M91', 0);
  }
  let json = null;
  try { json = await res.json(); } catch { /* not JSON */ }
  if (!res.ok || !json || json.success === false) {
    const err = (json && json.error) || {};
    throw new M91Error(err.code || `HTTP_${res.status}`, err.message || `M91 answered ${res.status}`, res.status, err.details);
  }
  return { status: res.status, data: json.data };
}

// A bare GET raises nothing: it only returns the channel.
const checkLink = (link) => call('GET', link).then((r) => r.data);
const send = (link, payload) => call('POST', link, payload).then((r) => ({ ...r.data, httpStatus: r.status }));
const read = (link, id) => call('GET', `${link}/alerts/${encodeURIComponent(id)}`).then((r) => r.data);
async function close(link, customId) {
  try { return await call('POST', `${link}/close`, { customId }); } catch (e) {
    if (e.status === 404 || e.status === 403) return { alreadyClosed: true }; // nothing to close
    throw e;
  }
}

const { seal, open } = require('./secrets');

module.exports = { HOST, M91Error, cleanLink, checkLink, send, read, close, seal, open };
