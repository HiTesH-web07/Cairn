// Entry point: bind the port first, then load the app, so a slow or failing start is visible.
const http = require('http');

const port = Number(process.env.PORT) || 3000;
let handler = null;
let stage = 'starting';
let failure = null;

const server = http.createServer((req, res) => {
  if (handler) return handler(req, res);
  res.writeHead(503, { 'content-type': 'text/plain' });
  res.end(failure ? `Startup failed at "${stage}": ${failure}` : `Starting (${stage})`);
});
server.listen(port, '0.0.0.0', () => {
  console.log(`listening on ${port}`);
  setImmediate(() => {
    try {
      stage = 'loading app';
      const { app } = require('./server');
      handler = app;
      stage = 'ready';
      console.log('ready');
    } catch (e) {
      failure = e.message;
      console.error('startup failed', stage, e);
    }
  });
});
