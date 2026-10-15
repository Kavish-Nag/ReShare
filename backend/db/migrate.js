// Applies db/migrations/*.sql in order; pass --seed to also load the demo data. Used by the ECS one-off migration task.
import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { pool } from '../src/config/database.js';

const dir = dirname(fileURLToPath(import.meta.url));
const files = (await readdir(join(dir, 'migrations'))).filter(f => f.endsWith('.sql')).sort().map(f => join('migrations', f));
if (process.argv.includes('--seed')) files.push('seed-demo.sql');

try {
  for (const file of files) {
    console.log(`Applying ${file}`);
    await pool.query(await readFile(join(dir, file), 'utf8'));
  }
  console.log('Database is up to date');
} catch (error) {
  console.error('Migration failed:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
