'use strict';
// A small request router for Cairn's API. Next.js route handlers call `handleWeb(request)`;
// tests and local tools can use `listen(port)`, which serves the same routes over plain Node http.
// Handlers use a familiar (req, res, next) shape so each route reads like a normal API handler.
const http = require('http');
const { EventEmitter } = require('events');

const BODY_LIMIT = 100 * 1024;

function compile(pattern) {
  if (pattern instanceof RegExp) return { re: pattern, keys: [] };
  const keys = [];
  const src = pattern.replace(/[.+*?^${}()|[\]\\]/g, '\\$&').replace(/\/:([A-Za-z_]\w*)/g, (_, k) => { keys.push(k); return '/([^/]+)'; });
  return { re: new RegExp(`^${src}/?$`), keys };
}

function createRouter() {
  const stack = []; // { method|null, prefix|null, matcher|null, fns }
  const add = (method) => (pattern, ...fns) => { stack.push({ method, ...compile(pattern), fns: fns.flat() }); return api; };
  const api = {
    get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE'),
    use(prefixOrFn, ...fns) {
      if (typeof prefixOrFn === 'function') stack.push({ method: null, prefix: '', fns: [prefixOrFn, ...fns] });
      else stack.push({ method: null, prefix: prefixOrFn, fns });
      return api;
    },
    // Runs one request through the matching middleware and routes.
    dispatch(req, res) {
      let i = 0, j = 0;
      const next = (err) => {
        if (res.finished) return;
        while (i < stack.length) {
          const layer = stack[i];
          let match = false;
          if (layer.method === null) match = req.path === layer.prefix || req.path.startsWith(layer.prefix === '' ? '/' : `${layer.prefix}/`);
          else if (layer.method === req.method || (layer.method === 'GET' && req.method === 'HEAD')) {
            const m = layer.re.exec(req.path);
            if (m) { match = true; req.params = Object.fromEntries(layer.keys.map((k, n) => [k, decodeURIComponent(m[n + 1])])); }
          }
          if (!match) { i++; j = 0; continue; }
          const fn = layer.fns[j++];
          if (j >= layer.fns.length) { i++; j = 0; }
          if (!fn) continue;
          const isErrorHandler = fn.length === 4;
          if (err ? !isErrorHandler : isErrorHandler) continue;
          try {
            const r = err ? fn(err, req, res, next) : fn(req, res, next);
            if (r && typeof r.catch === 'function') r.catch(next);
          } catch (e) { next(e); }
          return;
        }
        if (err) { res.status(500).json({ error: 'Something went wrong' }); return; }
        res.status(404).json({ error: 'Not found' });
      };
      next();
    },
  };
  return api;
}

// ---------- request / response objects ----------
function makeReq({ method, url, headers, ip, rawBody }) {
  const u = new URL(url, 'http://local');
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), Array.isArray(v) ? v.join(', ') : v]));
  const req = { method, url: u.pathname + u.search, path: u.pathname, headers: h, query: Object.fromEntries(u.searchParams), params: {}, ip, body: {} };
  req.get = (name) => h[String(name).toLowerCase()];
  if (rawBody && rawBody.length) {
    if (rawBody.length > BODY_LIMIT) { const e = new Error('Request is too large'); e.status = 413; throw e; }
    if ((h['content-type'] || '').includes('application/json')) {
      try { req.body = JSON.parse(rawBody.toString('utf8')); } catch { const e = new Error('Request body is not valid JSON'); e.status = 400; e.type = 'entity.parse.failed'; throw e; }
    }
  }
  return req;
}

function makeRes() {
  const res = new EventEmitter();
  Object.assign(res, { statusCode: 200, headers: {}, body: '', finished: false });
  res.status = (c) => { res.statusCode = c; return res; };
  res.setHeader = (k, v) => { res.headers[k.toLowerCase()] = v; return res; };
  res.set = (k, v) => res.setHeader(k, v);
  res.get = (k) => res.headers[k.toLowerCase()];
  res.type = (t) => res.setHeader('content-type', t === 'json' ? 'application/json; charset=utf-8' : t);
  res.end = (body = '') => {
    if (res.finished) return res;
    res.body = body; res.finished = true; res.emit('done'); setImmediate(() => res.emit('finish'));
    return res;
  };
  res.send = (body) => {
    if (!res.get('content-type')) res.type(typeof body === 'object' ? 'json' : 'text/plain; charset=utf-8');
    return res.end(typeof body === 'object' ? JSON.stringify(body) : String(body ?? ''));
  };
  res.json = (body) => { res.type('json'); return res.end(JSON.stringify(body)); };
  res.sendStatus = (c) => { res.statusCode = c; res.type('text/plain; charset=utf-8'); return res.end(String(c)); };
  return res;
}

function run(router, input) {
  return new Promise((resolve) => {
    const res = makeRes();
    res.once('done', () => resolve(res));
    let req;
    try { req = makeReq(input); } catch (e) { res.status(e.status || 400).json({ error: e.message }); return; }
    router.dispatch(req, res);
  });
}

// For Next.js route handlers: Web Request in, Web Response out.
async function handleWeb(router, request) {
  const rawBody = ['GET', 'HEAD'].includes(request.method) ? null : Buffer.from(await request.arrayBuffer());
  const headers = Object.fromEntries(request.headers.entries());
  const ip = (headers['x-forwarded-for'] || '').split(',')[0].trim() || headers['x-real-ip'] || '127.0.0.1';
  const res = await run(router, { method: request.method, url: request.url, headers, ip, rawBody });
  const out = new Headers();
  for (const [k, v] of Object.entries(res.headers)) out.set(k, String(v));
  return new Response(request.method === 'HEAD' || res.statusCode === 204 ? null : res.body, { status: res.statusCode, headers: out });
}

// For tests and local tools: plain Node http server serving the same router.
function listen(router, port = 0) {
  const server = http.createServer((req, nres) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const res = await run(router, { method: req.method, url: req.url, headers: req.headers, ip: req.socket.remoteAddress, rawBody: Buffer.concat(chunks) });
      nres.writeHead(res.statusCode, res.headers);
      nres.end(req.method === 'HEAD' ? undefined : res.body);
    });
  });
  return server.listen(port);
}

module.exports = { createRouter, handleWeb, listen };
