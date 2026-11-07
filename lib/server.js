// Loads Cairn's server code (routes, SQLite database, integrations) once per process.
// It is required at run time with Node's own require, outside the Next.js bundle,
// because it uses Node's built-in SQLite and keeps state (rate limits, queues) in memory.
import path from 'path';

const nodeRequire = process.getBuiltinModule('node:module').createRequire(path.join(process.cwd(), 'package.json'));

let cached;
export function cairn() {
  if (!cached) {
    const root = process.cwd();
    const { app } = nodeRequire(path.join(root, 'server', 'server.js'));
    const { handleWeb } = nodeRequire(path.join(root, 'server', 'router.js'));
    cached = { handle: (request) => handleWeb(app, request) };
  }
  return cached;
}
