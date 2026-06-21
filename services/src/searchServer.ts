import { createApp } from './app';
import searchRoutes from './routes/searchRoutes';
import { disconnectKafkaProducer, getKafkaProducer } from './messaging/KafkaClient';
import * as dotenv from 'dotenv';

dotenv.config();

const PORT = parseInt(process.env.PORT ?? '3002', 10);

async function main() {
  await getKafkaProducer();
  console.log('[SearchService] Kafka producer connected');

  const app = createApp(searchRoutes);
  const server = app.listen(PORT, () => {
    console.log(`[SearchService] Listening on http://localhost:${PORT}`);
  });

  const shutdown = async () => {
    console.log('[SearchService] Shutting down...');
    await disconnectKafkaProducer();
    server.close(() => process.exit(0));
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[SearchService] Fatal startup error:', err);
  process.exit(1);
});
