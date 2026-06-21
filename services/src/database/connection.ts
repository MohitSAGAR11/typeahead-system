
import { Pool, PoolClient } from 'pg';
import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
const pool = new Pool({
  host: process.env.DB_HOST ?? 'localhost',
  port: parseInt(process.env.DB_PORT ?? '5432', 10),
  database: process.env.DB_NAME ?? 'search_typeahead',
  user: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  max: 20,               
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});
pool.on('error', (err) => {
  console.error('[DB] Unexpected pool error:', err);
});
export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<T[]> {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const dur = Date.now() - start;
    if (dur > 100) console.warn(`[DB] Slow query (${dur}ms): ${text.slice(0, 80)}`);
    return result.rows as T[];
  } catch (err) {
    console.error('[DB] Query error:', err, '\nSQL:', text);
    throw err;
  }
}
export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}
export async function checkConnection(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}
export { pool };
