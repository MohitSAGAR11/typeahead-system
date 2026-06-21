import { batchWriter } from './jobs/BatchWriter';
import { EachMessagePayload } from 'kafkajs';
import { createKafkaConsumer, SEARCH_EVENTS_TOPIC } from './messaging/KafkaClient';
import { checkConnection } from './database/connection';
import { getCacheManager } from './cache/CacheManager';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  const dbOk = await checkConnection();
  if (!dbOk) {
    throw new Error('PostgreSQL is required for the batch writer');
  }
  console.log('[BatchWriterWorker] PostgreSQL connected');

  const cache = getCacheManager();
  if ((process.env.CACHE_MODE ?? 'simulated') === 'redis') {
    await cache.connectRedis(process.env.REDIS_URL ?? 'redis://localhost:6379');
    console.log('[BatchWriterWorker] Redis connected');
  }

  batchWriter.start();

  const consumer = createKafkaConsumer(process.env.KAFKA_GROUP_ID ?? 'batch-writer');
  await consumer.connect();
  await consumer.subscribe({ topic: SEARCH_EVENTS_TOPIC, fromBeginning: false });
  console.log(`[BatchWriterWorker] Consuming Kafka topic ${SEARCH_EVENTS_TOPIC}`);

  await consumer.run({
    eachMessage: async ({ message }: EachMessagePayload) => {
      if (!message.value) return;
      const payload = JSON.parse(message.value.toString()) as { query?: string };
      if (payload.query && payload.query.trim()) {
        batchWriter.add(payload.query.trim());
      }
    },
  });

  const shutdown = async () => {
    console.log('[BatchWriterWorker] Shutting down...');
    batchWriter.stop();
    await batchWriter.flush('shutdown');
    await consumer.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  console.error('[BatchWriterWorker] Fatal startup error:', err);
  process.exit(1);
});
