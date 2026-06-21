
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import * as dotenv from 'dotenv';
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
import { pool, query } from './connection';
const BATCH_SIZE = 5000;
const TOPICS = [
  'react', 'vue', 'angular', 'typescript', 'javascript', 'python', 'java',
  'golang', 'rust', 'nodejs', 'docker', 'kubernetes', 'aws', 'azure', 'gcp',
  'iphone', 'samsung', 'laptop', 'gaming', 'netflix', 'spotify', 'amazon',
  'tutorial', 'guide', 'course', 'certification', 'interview', 'resume',
  'recipe', 'food', 'travel', 'hotel', 'flight', 'car', 'health', 'fitness',
  'yoga', 'meditation', 'finance', 'crypto', 'bitcoin', 'stocks', 'investing',
  'news', 'weather', 'sports', 'football', 'basketball', 'tennis', 'cricket',
];
const MODIFIERS = [
  '', ' tutorial', ' guide', ' course', ' free', ' online', ' 2024',
  ' download', ' best', ' review', ' vs', ' price', ' how to', ' for beginners',
  ' advanced', ' tips', ' tricks', ' examples', ' documentation', ' api',
];
function generateSyntheticQueries(count: number): Array<{ query: string; count: number }> {
  const queries: Array<{ query: string; count: number }> = [];
  const seen = new Set<string>();
  for (const topic of TOPICS) {
    for (const mod of MODIFIERS) {
      const q = `${topic}${mod}`.trim();
      if (!seen.has(q)) {
        seen.add(q);
        const base = Math.floor(Math.random() * 500000) + 1000;
        const c = Math.floor(base * Math.random() + 500);
        queries.push({ query: q, count: c });
      }
    }
    for (let i = 2; i <= topic.length; i++) {
      const prefix = topic.slice(0, i);
      if (!seen.has(prefix)) {
        seen.add(prefix);
        queries.push({ query: prefix, count: Math.floor(Math.random() * 10000) + 100 });
      }
    }
  }
  while (queries.length < count) {
    const t = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    const m = MODIFIERS[Math.floor(Math.random() * MODIFIERS.length)];
    const suffix = Math.floor(Math.random() * 1000);
    const q = `${t}${m} ${suffix}`.trim();
    if (!seen.has(q)) {
      seen.add(q);
      queries.push({ query: q, count: Math.floor(Math.random() * 50000) + 10 });
    }
  }
  return queries.slice(0, count);
}
async function loadFromCsv(
  csvPath: string,
  limit: number
): Promise<Array<{ query: string; count: number }>> {
  return new Promise((resolve, reject) => {
    const results: Array<{ query: string; count: number }> = [];
    const rl = readline.createInterface({ input: fs.createReadStream(csvPath) });
    let firstLine = true;
    rl.on('line', (line) => {
      if (results.length >= limit) { rl.close(); return; }
      if (firstLine) { firstLine = false; return; } 
      const parts = line.split(',');
      if (parts.length < 2) return;
      const q = parts[0].trim().replace(/^"|"$/g, '');
      const c = parseInt(parts[parts.length - 1].trim().replace(/^"|"$/g, ''), 10);
      if (q && !isNaN(c) && c > 0) results.push({ query: q, count: c });
    });
    rl.on('close', () => resolve(results));
    rl.on('error', reject);
  });
}
async function upsertBatch(rows: Array<{ query: string; count: number }>) {
  if (rows.length === 0) return;
  const values: any[] = [];
  const placeholders: string[] = [];
  rows.forEach((row, i) => {
    const base = i * 2;
    placeholders.push(`($${base + 1}, $${base + 2})`);
    values.push(row.query.toLowerCase(), row.count);
  });
  const sql = `
    INSERT INTO search_queries (query, count)
    VALUES ${placeholders.join(', ')}
    ON CONFLICT (LOWER(query))
    DO UPDATE SET
      count = search_queries.count + EXCLUDED.count,
      updated_at = NOW()
  `;
  await query(sql, values);
}
async function seed() {
  const args = process.argv.slice(2);
  const csvIdx = args.indexOf('--csv');
  const limitIdx = args.indexOf('--limit');
  const ifEmpty = args.includes('--if-empty');

  if (ifEmpty) {
    const [{ count }] = await query<{ count: string }>('SELECT COUNT(*) as count FROM search_queries');
    if (Number(count) > 0) {
      console.log(`[Seed] Skipping seed because search_queries already has ${count} rows`);
      await pool.end();
      return;
    }
  }

  const defaultQueriesPath = path.join(__dirname, '../../dataset/queries.csv');
  const defaultUnigramPath = path.join(__dirname, '../../dataset/unigram_freq.csv');
  let csvPath = csvIdx >= 0 ? args[csvIdx + 1] : null;
  if (!csvPath) {
    csvPath = fs.existsSync(defaultUnigramPath) ? defaultUnigramPath : defaultQueriesPath;
  }
  const isUnigram = csvPath.endsWith('unigram_freq.csv');
  const defaultLimit = isUnigram ? 350000 : 100000;
  const limit = limitIdx >= 0 ? parseInt(args[limitIdx + 1], 10) : defaultLimit;
  console.log(`[Seed] Target: ${limit} records`);
  let rows: Array<{ query: string; count: number }>;
  if (fs.existsSync(csvPath)) {
    console.log(`[Seed] Loading from CSV: ${csvPath}`);
    rows = await loadFromCsv(csvPath, limit);
    console.log(`[Seed] Loaded ${rows.length} rows from CSV`);
  } else {
    console.log('[Seed] CSV not found — generating synthetic dataset...');
    rows = generateSyntheticQueries(limit);
    console.log(`[Seed] Generated ${rows.length} synthetic queries`);
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await upsertBatch(batch);
    inserted += batch.length;
    process.stdout.write(`\r[Seed] Inserted ${inserted}/${rows.length}...`);
  }
  console.log(`\n[Seed] ✓ Done. Total rows: ${rows.length}`);
  const [{ count }] = await query<{ count: string }>('SELECT COUNT(*) as count FROM search_queries');
  console.log(`[Seed] ✓ Verified: ${count} rows in search_queries table`);
  await pool.end();
}
seed().catch((err) => {
  console.error('[Seed] ✗ Fatal error:', err);
  process.exit(1);
});
