const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });
console.log('opening database in', dataDir);

// Node's built-in SQLite: no native add-on to build, so it runs in any slim image.
const db = new DatabaseSync(process.env.DB_FILE || path.join(dataDir, 'impact.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
db.transaction = (fn) => (...args) => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn(...args);
    db.exec('COMMIT');
    return out;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};

db.exec(`
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, timezone TEXT NOT NULL DEFAULT 'UTC',
  country TEXT, allowed_domain TEXT, settings_json TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  email TEXT NOT NULL, name TEXT NOT NULL, pw_hash TEXT,
  role TEXT NOT NULL CHECK (role IN ('owner','admin','manager','member')),
  level TEXT, department TEXT, reports_to TEXT REFERENCES users(id), phone TEXT,
  timezone TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL,
  UNIQUE (workspace_id, email)
);
CREATE INDEX IF NOT EXISTS users_email ON users(email);
CREATE TABLE IF NOT EXISTS invites (
  token_hash TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), email TEXT NOT NULL,
  role TEXT NOT NULL, level TEXT, department TEXT, reports_to TEXT, created_by TEXT NOT NULL,
  expires_at TEXT NOT NULL, used_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stacks (
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, week_start TEXT NOT NULL,
  locked_at TEXT, locked_by TEXT, PRIMARY KEY (workspace_id, user_id, week_start)
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id),
  week_start TEXT NOT NULL, rank INTEGER, title TEXT NOT NULL, details TEXT, stretch INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','delivered','missed','blocked_external')),
  proof_url TEXT, proof_note TEXT, proof_source TEXT, delivered_at TEXT,
  parent_item_id TEXT REFERENCES items(id), second_rater_id TEXT REFERENCES users(id),
  kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work','unplanned','helping')),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS items_user_week ON items(workspace_id, user_id, week_start);
CREATE TABLE IF NOT EXISTS ratings (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES items(id),
  rater_id TEXT NOT NULL REFERENCES users(id), rater_role TEXT NOT NULL CHECK (rater_role IN ('primary','second')),
  quality TEXT NOT NULL CHECK (quality IN ('done_well','needs_fixes','redo')), note TEXT, created_at TEXT NOT NULL,
  UNIQUE (item_id, rater_id)
);
CREATE TABLE IF NOT EXISTS blockers (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES items(id), user_id TEXT NOT NULL,
  description TEXT NOT NULL, raised_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT, escalated INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS coins (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, from_id TEXT NOT NULL, to_id TEXT NOT NULL,
  coins INTEGER NOT NULL, reason TEXT NOT NULL, week_start TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS disputes (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, rating_id TEXT NOT NULL REFERENCES ratings(id), raised_by TEXT NOT NULL,
  reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','upheld','changed')),
  original_quality TEXT NOT NULL, resolver_id TEXT, resolution_note TEXT, new_quality TEXT, created_at TEXT NOT NULL, resolved_at TEXT
);
CREATE TABLE IF NOT EXISTS leave_days (
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, day TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual',
  PRIMARY KEY (workspace_id, user_id, day)
);
CREATE TABLE IF NOT EXISTS weekly_scores (
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, week_start TEXT NOT NULL, priority_score INTEGER,
  quality_json TEXT NOT NULL, coins_received INTEGER NOT NULL, alignment_pct INTEGER, pending INTEGER NOT NULL,
  computed_at TEXT NOT NULL, PRIMARY KEY (workspace_id, user_id, week_start)
);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, custom_id TEXT NOT NULL, kind TEXT NOT NULL, severity TEXT NOT NULL,
  title TEXT NOT NULL, owner_id TEXT, status TEXT NOT NULL DEFAULT 'open', provider_alert_id TEXT,
  raised_at TEXT NOT NULL, acknowledged_at TEXT, acknowledged_by TEXT, closed_at TEXT, UNIQUE (workspace_id, custom_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, workspace_id TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL,
  entity TEXT, entity_id TEXT, detail_json TEXT, created_at TEXT NOT NULL
);
CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_log BEGIN SELECT RAISE(ABORT, 'audit log is append-only'); END;
CREATE TABLE IF NOT EXISTS idempotency (
  workspace_id TEXT NOT NULL, user_id TEXT NOT NULL, key TEXT NOT NULL, status INTEGER NOT NULL, body TEXT NOT NULL,
  created_at TEXT NOT NULL, PRIMARY KEY (workspace_id, user_id, key)
);
`);

module.exports = db;
