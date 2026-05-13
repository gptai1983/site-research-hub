const initSqlJs = require('sql.js');
const fs = require('fs');
async function main() {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data.db');
  const db = new SQL.Database(buf);
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
  console.log('Tables:', tables[0]?.values?.flat());
  try {
    const users = db.exec('SELECT * FROM users');
    console.log('Users:', JSON.stringify(users));
  } catch(e) {
    console.log('Users table error:', e.message);
  }
}
main();
