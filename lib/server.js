// Loads Cairn's server code (routes, SQLite database, integrations) once per process.
// It is required at run time, outside the Next.js bundle, because it uses Node's built-in SQLite.
import { createRequire } from 'module';
import path from 'path';

let cached;
export function cairn() {
  if (!cached) {
    const req = createRequire(path.join(process.cwd(), 'package.json'));
    const { app } = req('./server/server.js');
    const { handleWeb } = req('./server/router.js');
    cached = { handle: (request) => handleWeb(app, request) };
  }
  return cached;
}
