import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';

const DB_PATH = process.env.DB_PATH || 'data.db';

let db: Database | null = null;

export function getDbPath(): string { return DB_PATH; }

export async function initDb() {
  if (db) return;
  const SQL = await initSqlJs();
  try {
    const data = fs.readFileSync(DB_PATH);
    db = new SQL.Database(new Uint8Array(data));
  } catch {
    db = new SQL.Database();
  }
  db.run(`CREATE TABLE IF NOT EXISTS profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    credentials TEXT,
    cookies TEXT,
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    profile_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    prompt TEXT NOT NULL,
    url TEXT,
    result TEXT,
    error TEXT,
    provider TEXT,
    model TEXT,
    started_at INTEGER,
    completed_at INTEGER,
    retry_count INTEGER DEFAULT 0,
    error_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS learning_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prompt TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    success INTEGER NOT NULL,
    duration REAL NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    error TEXT,
    created_at INTEGER NOT NULL
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS provider_stats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    success_count INTEGER DEFAULT 0,
    total_count INTEGER DEFAULT 0,
    avg_duration REAL DEFAULT 0,
    UNIQUE(provider, model)
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
  )`);
  saveDb();
  console.log('Database initialized');
}

export function saveDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

function snakeToCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function rowToObj(r: any): any {
  if (!r.length || !r[0].values.length) return null;
  const row = r[0].values[0];
  const cols = r[0].columns;
  const obj: any = {};
  cols.forEach((col: string, i: number) => { obj[snakeToCamel(col)] = row[i]; });
  return obj;
}

function rowsToArr(r: any): any[] {
  if (!r.length || !r[0].values.length) return [];
  const cols = r[0].columns;
  return r[0].values.map((row: any[]) => {
    const obj: any = {};
    cols.forEach((col: string, i: number) => { obj[snakeToCamel(col)] = row[i]; });
    return obj;
  });
}

export function getAllProfiles(): any[] {
  if (!db) return [];
  return rowsToArr(db.exec(`SELECT * FROM profiles ORDER BY created_at DESC`));
}

export function getProfile(id: number): any | null {
  if (!db) return null;
  return rowToObj(db.exec(`SELECT * FROM profiles WHERE id = ?`, [id]));
}

export function createProfile(name: string, url: string, credentials?: string): number {
  if (!db) throw new Error('Database not initialized');
  const now = Date.now();
  db.run(`INSERT INTO profiles (name, url, credentials, created_at) VALUES (?, ?, ?, ?)`, [name, url, credentials || null, now]);
  const r = db.exec(`SELECT last_insert_rowid() as id`);
  saveDb();
  return Number(r[0].values[0][0]);
}

export function deleteProfile(id: number): void {
  if (!db) return;
  db.run(`DELETE FROM profiles WHERE id = ?`, [id]);
  saveDb();
}

export function updateProfileCookies(id: number, cookies: string): void {
  if (!db) return;
  db.run(`UPDATE profiles SET cookies = ? WHERE id = ?`, [cookies, id]);
  saveDb();
}

export function getAllSessions(profileId?: number): any[] {
  if (!db) return [];
  if (profileId !== undefined) {
    return rowsToArr(db.exec(`SELECT * FROM sessions WHERE profile_id = ? ORDER BY created_at DESC`, [profileId]));
  }
  return rowsToArr(db.exec(`SELECT * FROM sessions ORDER BY created_at DESC`));
}

export function getSession(id: number): any | null {
  if (!db) return null;
  return rowToObj(db.exec(`SELECT * FROM sessions WHERE id = ?`, [id]));
}

export function createSession(profileId: number, prompt: string, url?: string): number {
  if (!db) throw new Error('Database not initialized');
  const now = Date.now();
  db.run(`INSERT INTO sessions (profile_id, prompt, url, status, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?)`,
    [profileId, prompt, url || null, now, now]);
  const r = db.exec(`SELECT last_insert_rowid() as id`);
  saveDb();
  return Number(r[0].values[0][0]);
}

export function updateSessionStatus(id: number, status: string, provider?: string, model?: string): void {
  if (!db) return;
  const now = Date.now();
  const updates = ['status = ?', 'updated_at = ?'];
  const params: any[] = [status, now];
  if (provider !== undefined) { updates.push('provider = ?'); params.push(provider); }
  if (model !== undefined) { updates.push('model = ?'); params.push(model); }
  params.push(id);
  db.run(`UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`, params);
  saveDb();
}

export function saveSessionResult(id: number, result: string, error?: string): void {
  if (!db) return;
  if (error) {
    db.run(`UPDATE sessions SET result = ?, error = ?, status = 'error', updated_at = ? WHERE id = ?`, [result, error, Date.now(), id]);
  } else {
    db.run(`UPDATE sessions SET result = ?, status = 'completed', updated_at = ? WHERE id = ?`, [result, Date.now(), id]);
  }
  saveDb();
}

export function getSessionMetrics(profileId?: number): any {
  if (!db) return {};
  if (profileId !== undefined) {
    const r = db.exec(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed FROM sessions WHERE profile_id = ?`, [profileId]);
    return rowToObj(r) || { total: 0, completed: 0, failed: 0 };
  }
  const r = db.exec(`SELECT COUNT(*) as total, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed, SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) as failed FROM sessions`);
  return rowToObj(r) || { total: 0, completed: 0, failed: 0 };
}

export function saveLearningRecord(record: any): void {
  if (!db) return;
  const now = Date.now();
  db.run(`INSERT INTO learning_records (prompt, provider, model, success, duration, tokens_used, error, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [record.prompt, record.provider, record.model, record.success ? 1 : 0, record.duration, record.tokensUsed || 0, record.error || null, now]);
  saveDb();
}

export function getAllLearningRecords(): any[] {
  if (!db) return [];
  return rowsToArr(db.exec(`SELECT * FROM learning_records ORDER BY created_at DESC`));
}

export function upsertProviderStats(provider: string, model: string, success: boolean, duration: number): void {
  if (!db) return;
  const existing = rowToObj(db.exec(`SELECT * FROM provider_stats WHERE provider = ? AND model = ?`, [provider, model]));
  if (existing) {
    const newTotal = Number(existing.total_count) + 1;
    const newSuccess = Number(existing.success_count) + (success ? 1 : 0);
    const newAvg = ((Number(existing.avg_duration) * Number(existing.total_count)) + duration) / newTotal;
    db.run(`UPDATE provider_stats SET success_count = ?, total_count = ?, avg_duration = ? WHERE provider = ? AND model = ?`,
      [newSuccess, newTotal, newAvg, provider, model]);
  } else {
    db.run(`INSERT INTO provider_stats (provider, model, success_count, total_count, avg_duration) VALUES (?, ?, ?, ?, ?)`,
      [provider, model, success ? 1 : 0, 1, duration]);
  }
  saveDb();
}

export function getAllProviderStats(): any[] {
  if (!db) return [];
  return rowsToArr(db.exec(`SELECT * FROM provider_stats`));
}

export function findUserByEmail(email: string): any | null {
  if (!db) return null;
  const r = db.exec(`SELECT * FROM users WHERE email = ?`, [email]);
  if (!r.length || !r[0].values.length) return null;
  const row = r[0].values[0];
  const cols = r[0].columns;
  const obj: any = {};
  cols.forEach((col: string, i: number) => { obj[col] = row[i]; });
  return obj;
}

export function findUserById(id: number): any | null {
  if (!db) return null;
  const r = db.exec(`SELECT * FROM users WHERE id = ?`, [id]);
  if (!r.length || !r[0].values.length) return null;
  const row = r[0].values[0];
  const cols = r[0].columns;
  const obj: any = {};
  cols.forEach((col: string, i: number) => { obj[col] = row[i]; });
  return obj;
}

export function createUser(email: string, passwordHash: string, role: string = 'user'): number {
  if (!db) throw new Error('Database not initialized');
  const now = Date.now();
  db.run(`INSERT INTO users (email, password_hash, role, created_at) VALUES (?, ?, ?, ?)`, [email, passwordHash, role, now]);
  const r = db.exec(`SELECT last_insert_rowid() as id`);
  saveDb();
  return Number(r[0].values[0][0]);
}

export function getUserCount(): number {
  if (!db) return 0;
  const r = db.exec(`SELECT COUNT(*) as cnt FROM users`);
  if (!r.length || !r[0].values.length) return 0;
  return Number(r[0].values[0][0]);
}

export { db };