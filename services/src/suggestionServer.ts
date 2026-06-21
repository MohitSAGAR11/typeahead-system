import { createApp } from './app';
import suggestionRoutes from './routes/suggestionRoutes';
import { getCacheManager } from './cache/CacheManager';
import { checkConnection } from './database/connection';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3001', 10);

async function main() {
  const dbOk = await checkConnection();
  if (!dbOk) {
    console.warn('[SuggestionService] PostgreSQL not reachable - suggestions will be empty until DB is available.');
  } else {
    console.log('[SuggestionService] PostgreSQL connected');
  }

  const cache = getCacheManager();
  const cacheMode = process.env.CACHE_MODE ?? 'simulated';
  if (cacheMode === 'redis') {
    const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
    try {
      await cache.connectRedis(redisUrl);
      console.log('[SuggestionService] Redis connected');
    } catch (e) {
      console.warn('[SuggestionService] Redis not reachable - falling back to simulated cache');
    }
  }

  const app = createApp(suggestionRoutes);
  const server = app.listen(PORT, () => {
    console.log(`[SuggestionService] Listening on http://localhost:${PORT}`);
  });

  const shutdown = () => {
    console.log('[SuggestionService] Shutting down...');
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[SuggestionService] Fatal startup error:', err);
  process.exit(1);
});
