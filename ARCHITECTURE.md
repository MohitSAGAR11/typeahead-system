# Architecture

This project is a Docker-based search typeahead system split into independent runtime containers. The browser talks to one API gateway, while suggestions, search submissions, batch writes, Kafka, Zookeeper, PostgreSQL, and Redis run as separate services.

## High-Level Flow

```text
Browser
  |
  | http://localhost:5173
  v
Frontend container
  |
  | /api/*
  v
API Gateway container
  |
  |-- GET /api/suggest, /api/trending, /api/cache/*, /api/stats
  |     v
  |   Suggestion Service
  |     |
  |     |-- read/write cache
  |     |     v
  |     |   Redis
  |     |
  |     |-- read query data
  |           v
  |         PostgreSQL
  |
  |-- POST /api/search
        v
      Search Service
        |
        | publish search event
        v
      Kafka
        |
        | consume events
        v
      Batch Writer
        |
        |-- batch upsert counts
        |     v
        |   PostgreSQL
        |
        |-- invalidate affected prefixes
              v
            Redis
```

## Runtime Services

| Compose service | Container | Responsibility | Host port |
|---|---|---|---|
| `frontend` | `typeahead-frontend` | Runs the React/Vite UI and proxies browser `/api` calls to the API gateway. | `5173` |
| `api-gateway` | `typeahead-api-gateway` | Nginx gateway that routes read endpoints to suggestion service and search submissions to search service. | `3001` |
| `suggestion-service` | `typeahead-suggestion-service` | Handles suggestion, trending, cache debug, cache ring, and stats read APIs. | `3002` |
| `search-service` | `typeahead-search-service` | Accepts search submissions and publishes them to Kafka. | `3003` |
| `batch-writer` | `typeahead-batch-writer` | Consumes Kafka search events, batches updates, writes to PostgreSQL, and invalidates Redis prefixes. | internal |
| `kafka` | `typeahead-kafka` | Message broker for search events. | `9092`, `29092` |
| `zookeeper` | `typeahead-zookeeper` | Coordination service required by the Kafka image used here. | `2181` |
| `postgres` | `typeahead-postgres` | Persistent store for query counts and recent search events. | `5433` |
| `redis` | `typeahead-redis` | Shared cache backend for typeahead suggestions. | `6379` |
| `db-init` | `typeahead-db-init` | One-shot migration and seed container. | internal |

## Request Flows

### Suggestion Flow

```text
Browser
  -> frontend
  -> api-gateway
  -> suggestion-service
  -> Redis cache lookup
  -> PostgreSQL fallback on cache miss
  -> Redis cache write
  -> response to browser
```

Endpoint:

```text
GET /api/suggest?q=<prefix>&mode=<basic|enhanced>
```

The suggestion service normalizes the prefix, checks cache ownership through the consistent hash ring, then returns cached suggestions or reads from PostgreSQL. Cache entries use the configured TTL from `CACHE_TTL_SECONDS`.

### Search Submission Flow

```text
Browser
  -> frontend
  -> api-gateway
  -> search-service
  -> Kafka topic: search-events
  -> response: Search queued
```

Endpoint:

```text
POST /api/search
```

Body:

```json
{ "query": "react tutorial" }
```

The search service does not write directly to PostgreSQL. It only validates the request and publishes a Kafka event. This keeps request latency low and separates the write workload from the API process.

### Batch Writer Flow

```text
Kafka topic: search-events
  -> batch-writer consumer group
  -> in-memory aggregation buffer
  -> flush on size threshold or timer
  -> PostgreSQL batch upsert
  -> Redis prefix invalidation
```

The batch writer groups repeated query submissions before writing them. This reduces database write amplification when the same search is submitted many times.

Flush behavior is controlled by:

| Variable | Purpose |
|---|---|
| `BATCH_SIZE` | Flush when this many unique queries are buffered. |
| `BATCH_FLUSH_INTERVAL_MS` | Flush after this interval even if size threshold is not reached. |

### Trending Flow

```text
Browser
  -> frontend
  -> api-gateway
  -> suggestion-service
  -> PostgreSQL
  -> response
```

Endpoint:

```text
GET /api/trending?mode=<basic|enhanced>&window=<hours>
```

Basic mode ranks by total historical count. Enhanced mode combines historical count with recent search activity from `recent_search_events`.

### Cache Debug Flow

```text
Browser
  -> frontend
  -> api-gateway
  -> suggestion-service
  -> Redis / consistent hash ring
  -> response
```

Endpoints:

```text
GET /api/cache/debug?prefix=<prefix>
GET /api/cache/ring
```

These endpoints expose which cache node owns a prefix, whether the prefix is cached, and the consistent hash ring distribution.

## Data Stores

### PostgreSQL

PostgreSQL stores durable search data.

Main tables:

| Table | Purpose |
|---|---|
| `search_queries` | Stores normalized query text and aggregate search count. |
| `recent_search_events` | Stores recent search activity for enhanced trending. |

PostgreSQL is initialized by the `db-init` container using:

```text
services/src/database/migrate.ts
services/src/database/seed.ts
services/dataset/unigram_freq.csv
```

### Redis

Redis stores cached suggestion responses. The application models multiple logical Redis cache nodes (`Redis-A`, `Redis-B`, `Redis-C`) through a consistent hash ring so prefixes are distributed predictably.

Redis is shared by:

| Service | Usage |
|---|---|
| `suggestion-service` | Reads and writes cached suggestion results. |
| `batch-writer` | Invalidates cached prefixes after query counts change. |

### Kafka

Kafka is the asynchronous boundary between search submission and write persistence.

| Topic | Producer | Consumer | Purpose |
|---|---|---|---|
| `search-events` | `search-service` | `batch-writer` | Carries submitted search queries for eventual batch persistence. |

## Tech Stack

| Technology | Used by | Purpose |
|---|---|---|
| React | `frontend` | Browser UI for search, suggestions, trending, cache debug, and stats. |
| Vite | `frontend` | Development server and frontend build tooling. |
| TypeScript | `frontend`, `services` | Static typing across UI and backend services. |
| Express | `suggestion-service`, `search-service` | HTTP API framework. |
| Nginx | `api-gateway` | Routes public API paths to the correct backend service container. |
| KafkaJS | `search-service`, `batch-writer` | Kafka producer and consumer client in Node.js. |
| Apache Kafka | `kafka` | Durable event broker for search submissions. |
| Zookeeper | `zookeeper` | Kafka broker coordination for the selected Confluent Kafka image. |
| PostgreSQL | `postgres` | Durable database for query counts and recent events. |
| Redis | `redis` | Shared cache backend for suggestion responses. |
| Docker Compose | all services | Local multi-container orchestration. |
| Jest | `services` | Backend unit tests. |

## Important Files

| Path | Purpose |
|---|---|
| `docker-compose.yml` | Defines all containers, ports, environment variables, and dependencies. |
| `api-gateway/nginx.conf` | API gateway routing rules. Uses Docker DNS resolver for backend service discovery. |
| `services/src/suggestionServer.ts` | Suggestion API entrypoint. |
| `services/src/searchServer.ts` | Search submission API entrypoint. |
| `services/src/batchWriterWorker.ts` | Batch writer worker entrypoint. |
| `services/src/messaging/KafkaClient.ts` | Kafka producer/consumer setup. |
| `services/src/jobs/BatchWriter.ts` | In-memory aggregation and flush logic. |
| `services/src/services/SuggestionService.ts` | Suggestion lookup, ranking, and cache interaction. |
| `services/src/cache/CacheManager.ts` | Redis/simulated cache implementation and consistent hash ownership. |
| `services/src/repositories/SearchQueryRepository.ts` | PostgreSQL query access layer. |
| `services/src/database/schema.sql` | Database schema. |
| `services/Dockerfile.suggestion` | Builds the suggestion API image. |
| `services/Dockerfile.search` | Builds the search API image. |
| `services/Dockerfile.batch-writer` | Builds the batch writer image. |

## Ports

| Host port | Service |
|---|---|
| `5173` | Frontend |
| `3001` | API gateway |
| `3002` | Suggestion service direct access |
| `3003` | Search service direct access |
| `5433` | PostgreSQL |
| `6379` | Redis |
| `9092` | Kafka internal/plaintext listener exposed to host |
| `29092` | Kafka host listener |
| `2181` | Zookeeper |

## Startup Order

Docker Compose starts services according to health and completion dependencies:

1. `postgres`, `redis`, and `zookeeper` start.
2. `kafka` starts after `zookeeper`.
3. `db-init` waits for healthy PostgreSQL, runs migrations, and seeds data.
4. `suggestion-service` waits for `db-init` and healthy Redis.
5. `search-service` waits for healthy Kafka.
6. `batch-writer` waits for `db-init`, healthy Redis, and healthy Kafka.
7. `api-gateway` starts after suggestion and search services.
8. `frontend` starts after the API gateway.

## Failure Boundaries

| Failure | Expected behavior |
|---|---|
| `suggestion-service` down | Read APIs fail through the gateway, but search submissions can still be accepted if `search-service` and Kafka are up. |
| `search-service` down | Search submissions fail, but suggestions and trending can still work. |
| `batch-writer` down | Search events can remain in Kafka, but counts are not persisted until the worker is restored. |
| `redis` down | Suggestion cache is unavailable; the suggestion service may fall back depending on cache connection behavior. |
| `postgres` down | Suggestions, trending, migrations, and batch persistence fail. |
| `kafka` down | Search submissions cannot be queued and the batch writer cannot consume events. |

## Verified Local URLs

| URL | Purpose |
|---|---|
| `http://localhost:5173` | Frontend app |
| `http://localhost:3001/health` | API gateway health |
| `http://localhost:3001/api/suggest?q=rea&mode=basic` | Suggestion API through gateway |
| `http://localhost:3001/api/search` | Search submission API through gateway |
| `http://localhost:3002/health` | Suggestion service direct health |
| `http://localhost:3003/health` | Search service direct health |

