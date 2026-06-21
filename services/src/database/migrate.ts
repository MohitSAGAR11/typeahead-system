
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { pool } from './connection';
async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  console.log('[Migrate] Running schema migrations...');
  try {
    await pool.query(sql);
    console.log('[Migrate] ✓ Schema applied successfully');
  } catch (err) {
    console.error('[Migrate] ✗ Migration failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}
migrate();
