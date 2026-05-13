import 'dotenv/config';
const mod = await import('./src/db/schema.js');
console.log('schema loaded');
await mod.initDb();
console.log('initDb OK');
process.exit(0);
