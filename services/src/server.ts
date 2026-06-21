import app from './app';
import { batchWriter } from './jobs/BatchWriter';
import { getCacheManager } from './cache/CacheManager';
import { checkConnection } from './database/connection';
import * as dotenv from 'dotenv';
dotenv.config();
const PORT = parseInt(process.env.PORT ?? '3001', 10);
async function main() {
  console.log('\n╔══════════════════════════════════════╗');
  console.log('║   Search Typeahead System — Backend  ║');
  console.log('╚══════════════════════════════════════╝\n');
  const dbOk = await checkConnection();
  if (!dbOk) {
    console.warn('[Server] ⚠️  PostgreSQL not reachable — running in DB-less mode');
    console.warn('[Server]    Suggestions will return empty until DB is available.');
  } else {
    console.log('[Server] ✓ PostgreSQL connected');
  }
  const cache = getCacheManager();
  const cacheMode = process.env.CACHE_MODE ?? 'simulated';
  if (cacheMode === 'redis') {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    try {
      await cache.connectRedis(redisUrl);
      console.log('[Server] ✓ Redis connected');
    } catch (e) {
      console.warn('[Server] ⚠️  Redis not reachable — falling back to simulated cache');
    }
  } else {
    console.log('[Server] ✓ Cache mode: simulated (3 in-process nodes)');
  }
  console.log(cache.visualizeRing());
  console.log('[Server] Cache node distribution:', cache.getDistribution());
  batchWriter.start();
  console.log('[Server] ✓ Batch writer started');
  const server = app.listen(PORT, () => {
    console.log(`\n[Server] ✓ Listening on http://localhost:${PORT}`);
    console.log('[Server]   API base: http://localhost:' + PORT + '/api\n');
  });
  const shutdown = async () => {
    console.log('\n[Server] Shutting down gracefully...');
    batchWriter.stop();
    await batchWriter.flush('shutdown');
    server.close(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
main().catch((err) => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});
