import { Kafka, Producer, Consumer, logLevel } from 'kafkajs';

export const SEARCH_EVENTS_TOPIC = process.env.KAFKA_SEARCH_TOPIC ?? 'search-events';

const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092')
  .split(',')
  .map((broker) => broker.trim())
  .filter(Boolean);

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID ?? 'search-typeahead',
  brokers,
  logLevel: logLevel.WARN,
});

let producer: Producer | null = null;

export async function getKafkaProducer(): Promise<Producer> {
  if (!producer) {
    producer = kafka.producer();
    await producer.connect();
  }
  return producer;
}

export function createKafkaConsumer(groupId: string): Consumer {
  return kafka.consumer({ groupId });
}

export async function publishSearchEvent(query: string): Promise<void> {
  const producer = await getKafkaProducer();
  await producer.send({
    topic: SEARCH_EVENTS_TOPIC,
    messages: [
      {
        key: query.toLowerCase(),
        value: JSON.stringify({ query, searchedAt: new Date().toISOString() }),
      },
    ],
  });
}

export async function disconnectKafkaProducer(): Promise<void> {
  if (producer) {
    await producer.disconnect();
    producer = null;
  }
}
