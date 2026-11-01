// Database setup. Uses better-sqlite3, which stores everything in a single
// file (data/church.db) rather than needing a separate database server.
// This keeps deployment simple: no extra account to create, no connection
// string to configure beyond a file path.

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const DATA_DIR = path.join(__dirname, "..", "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, "church.db");
const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS roles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      can_edit INTEGER NOT NULL DEFAULT 0,
      can_see_notes INTEGER NOT NULL DEFAULT 0,
      can_admin INTEGER NOT NULL DEFAULT 0,
      built_in INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role_id TEXT NOT NULL REFERENCES roles(id),
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      must_change_password INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('income','expense')),
      name TEXT NOT NULL,
      note_no INTEGER,
      subs TEXT NOT NULL DEFAULT '[]'
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL CHECK(kind IN ('cash','bank')),
      name TEXT NOT NULL,
      acc_no TEXT DEFAULT '',
      opening REAL NOT NULL DEFAULT 0,
      deletable INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS members (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      envelope_no TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS slips (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('income','expense','transfer')),
      method TEXT NOT NULL,
      account_id TEXT NOT NULL REFERENCES accounts(id),
      to_account_id TEXT REFERENCES accounts(id),
      cheque_no TEXT DEFAULT '',
      payer_bank TEXT DEFAULT '',
      pv_no TEXT DEFAULT '',
      amount REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT '',
      recorded_by TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS slip_lines (
      id TEXT PRIMARY KEY,
      slip_id TEXT NOT NULL REFERENCES slips(id) ON DELETE CASCADE,
      cat_id TEXT NOT NULL REFERENCES categories(id),
      sub_name TEXT DEFAULT '',
      member_id TEXT REFERENCES members(id),
      amount REAL NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS budgets (
      year INTEGER NOT NULL,
      cat_id TEXT NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (year, cat_id)
    );

    CREATE TABLE IF NOT EXISTS prior_year (
      year INTEGER NOT NULL,
      cat_id TEXT NOT NULL REFERENCES categories(id),
      amount REAL NOT NULL DEFAULT 0,
      PRIMARY KEY (year, cat_id)
    );

    CREATE TABLE IF NOT EXISTS disclosures (
      id TEXT PRIMARY KEY,
      year INTEGER NOT NULL,
      category TEXT NOT NULL,
      label TEXT NOT NULL,
      amount REAL NOT NULL DEFAULT 0,
      note TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_slips_date ON slips(date);
    CREATE INDEX IF NOT EXISTS idx_slip_lines_slip ON slip_lines(slip_id);
    CREATE INDEX IF NOT EXISTS idx_slip_lines_cat ON slip_lines(cat_id);
  `);

  runMigrations();
}

// Runs once per startup. Each migration checks whether it's already been
// applied before doing anything, so this is safe to run against both a
// brand-new database (where the column already exists from CREATE TABLE
// above) and an existing live database created before this column existed.
function runMigrations() {
  const roleColumns = db.prepare("PRAGMA table_info(roles)").all().map(c => c.name);
  if (!roleColumns.includes("can_admin")) {
    console.log("Migrating: adding can_admin column to roles table...");
    db.exec("ALTER TABLE roles ADD COLUMN can_admin INTEGER NOT NULL DEFAULT 0");
    // Backfill: any role that already had full edit access was, until now,
    // the only thing that gated the Admin page too — preserve that existing
    // behaviour for roles created before this distinction existed, rather
    // than silently locking the Treasurer out of Admin on their next login.
    db.prepare("UPDATE roles SET can_admin = 1 WHERE can_edit = 1").run();
    console.log("Migration complete.");
  }
}

initSchema();

module.exports = db;
