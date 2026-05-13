import { db, saveDb } from './schema';

interface Migration {
  version: number;
  name: string;
  up: string[];
}

const migrations: Migration[] = [
  {
    version: 1,
    name: 'Add url to sessions',
    up: [
      `ALTER TABLE sessions ADD COLUMN url TEXT`,
    ],
  },
  {
    version: 3,
    name: 'Add users table',
    up: [
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        created_at INTEGER NOT NULL
      )`,
    ],
  },
  {
    version: 2,
    name: 'Add learning_records and provider_stats',
    up: [
      `CREATE TABLE IF NOT EXISTS learning_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        success INTEGER NOT NULL,
        duration REAL NOT NULL,
        tokens_used INTEGER DEFAULT 0,
        error TEXT,
        created_at INTEGER NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS provider_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        avg_duration REAL DEFAULT 0,
        UNIQUE(provider, model)
      )`,
    ],
  },
];

export function ensureMigrationsTable(): void {
  if (!db) return;
  db.run(`CREATE TABLE IF NOT EXISTS _migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at INTEGER NOT NULL
  )`);
  saveDb();
}

export function getAppliedVersions(): Set<number> {
  if (!db) return new Set();
  try {
    const r = db.exec(`SELECT version FROM _migrations ORDER BY version`);
    if (!r.length) return new Set();
    return new Set(r[0].values.map(row => Number(row[0])));
  } catch {
    return new Set();
  }
}

export function runMigrations(): void {
  if (!db) return;
  ensureMigrationsTable();
  const applied = getAppliedVersions();

  for (const m of migrations) {
    if (applied.has(m.version)) continue;
    console.log(`[Migration] Running v${m.version}: ${m.name}`);
    for (const sql of m.up) {
      try {
        db.run(sql);
      } catch (e: any) {
        if (!e.message?.includes('duplicate column')) {
          console.warn(`[Migration] v${m.version} SQL warning: ${e.message}`);
        }
      }
    }
    const now = Date.now();
    db.run(`INSERT INTO _migrations (version, name, applied_at) VALUES (?, ?, ?)`, [m.version, m.name, now]);
    saveDb();
    console.log(`[Migration] v${m.version} applied`);
  }
}
