# Search Typeahead System

A Docker-ready distributed search typeahead demo with:

- React + Vite frontend
- Split Express + TypeScript services for suggestions and search submissions
- PostgreSQL persistence
- Redis-backed cache mode
- Consistent hashing over cache nodes
- Kafka-backed search event queue
- Dedicated batch-writer worker
- Trending and cache-debug panels

The default setup is designed so someone can run the full app with Docker only.

For the full container topology, request flow, and tech stack breakdown, see [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Quick Start With Docker

### Prerequisites

- Docker Desktop, or Docker Engine with Docker Compose
- Ports `5173`, `3001`, `3002`, `3003`, `5433`, `6379`, `9092`, `29092`, and `2181` available on your machine

### Run The App

From the project root:

```bash
docker compose up --build --remove-orphans
```

Then open:

- Frontend: http://localhost:5173
- API gateway health check: http://localhost:3001/health
- API gateway base: http://localhost:3001/api
- Suggestion service direct health check: http://localhost:3002/health
- Search service direct health check: http://localhost:3003/health

On first startup, the `db-init` container automatically:

1. Waits for PostgreSQL to become healthy.
2. Runs database migrations.
3. Seeds the database if it is empty.

After that, Docker starts the independent suggestion API, search API, and batch-writer worker containers.

The seed step uses `services/dataset/unigram_freq.csv` when present and inserts up to 50,000 rows in Docker mode. On later restarts it skips seeding if data already exists.

### Stop The App

```bash
docker compose down
```

### Reset All Data

This removes the PostgreSQL volume and starts from a fresh database next time:

```bash
docker compose down -v
docker compose up --build --remove-orphans
```

## Docker Services

| Service | Container | Purpose | Host Port |
|---|---|---|---|
| `frontend` | `typeahead-frontend` | Vite React UI | `5173` |
| `api-gateway` | `typeahead-api-gateway` | Routes `/api/search` to search service and read APIs to suggestion service | `3001` -> container `8080` |
| `suggestion-service` | `typeahead-suggestion-service` | Suggest, trending, cache, and stats read API | `3002` -> container `3001` |
| `search-service` | `typeahead-search-service` | Accepts search submissions and publishes Kafka events | `3003` -> container `3002` |
| `batch-writer` | `typeahead-batch-writer` | Kafka consumer that batches writes to PostgreSQL and invalidates cache prefixes | internal |
| `kafka` | `typeahead-kafka` | Search event broker | `9092`, `29092` |
| `zookeeper` | `typeahead-zookeeper` | Kafka coordination service | `2181` |
| `postgres` | `typeahead-postgres` | Database | `5433` -> container `5432` |
| `redis` | `typeahead-redis` | Cache backend | `6379` |

The frontend proxies `/api` requests to the API gateway container, so the browser can use the app from `http://localhost:5173` without knowing which backend service handles each route.

Write path:

```text
frontend -> api-gateway -> search-service -> Kafka -> batch-writer -> PostgreSQL
                                                        -> Redis cache invalidation
```

Read path:

```text
frontend -> api-gateway -> suggestion-service -> Redis/PostgreSQL
```

## Common Docker Commands

Rebuild and start:

```bash
docker compose up --build --remove-orphans
```

Start in the background:

```bash
docker compose up --build -d --remove-orphans
```

View logs:

```bash
docker compose logs -f suggestion-service
docker compose logs -f search-service
docker compose logs -f batch-writer
docker compose logs -f frontend
```

Run service tests inside Docker:

```bash
docker compose run --rm suggestion-service npm test
```

Run a fresh migration manually:

```bash
docker compose run --rm suggestion-service npm run db:migrate
```

Seed manually with a different limit:

```bash
docker compose run --rm suggestion-service npm run db:seed -- --if-empty --limit 100000
```

Smoke test the running stack:

```bash
curl http://localhost:3001/health
curl "http://localhost:3001/api/suggest?q=rea&mode=basic"
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"compose smoke test\"}"
```

Expected search response:

```json
{ "message": "Search queued" }
```

## API Endpoints

### `GET /api/suggest?q=<prefix>&mode=<basic|enhanced>`

Returns up to 10 typeahead suggestions.

Example:

```json
{
  "source": "cache",
  "node": "Redis-A",
  "latency": "2ms",
  "suggestions": [
    { "query": "react", "count": 50000, "score": 50000 }
  ]
}
```

### `POST /api/search`

Submit a search query. The update is buffered and flushed in batches.

```json
{ "query": "react tutorial" }
```

The search service publishes the request to Kafka and returns after the event is queued. The batch-writer container consumes those events and performs the database write in batches.

### `GET /api/trending?mode=<basic|enhanced>&window=<hours>`

Returns trending searches ranked by all-time count or enhanced recent activity.

### `GET /api/cache/debug?prefix=<prefix>`

Shows which cache node owns a prefix and whether the prefix is cached.

### `GET /api/cache/ring`

Returns the consistent-hash ring visualization and distribution stats.

### `GET /api/stats`

Returns cache hit rate, latency, and DB read/write counts for the suggestion API. The batch writer runs as a separate worker container.

### `GET /api/batch/status` and `POST /api/batch/flush`

These endpoints are intentionally not exposed in the split-container architecture because the batch writer is no longer in the API process.

## Local Development Without Docker

Docker is the recommended path. If you want to run services manually, use the commands below.

Install dependencies:

```bash
npm run install:all
```

Start PostgreSQL, Redis, Kafka, and Zookeeper locally, then configure `services/.env`.

Run migrations and seed data:

```bash
npm run db:migrate
npm run db:seed -- --if-empty
```

Build backend services:

```bash
npm run build --prefix services
```

Start services in separate terminals:

```bash
npm run dev:suggestion
npm run dev:search
npm run dev:batch-writer
npm run dev:frontend
```

## Environment Variables

The Docker defaults are defined in `docker-compose.yml`.

| Variable | Docker Default | Description |
|---|---|---|
| `PORT` | `3001` / `3002` | Service port inside the suggestion or search container |
| `DB_HOST` | `postgres` | PostgreSQL service name |
| `DB_PORT` | `5432` | PostgreSQL container port |
| `DB_NAME` | `search_typeahead` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | `postgres` | Database password |
| `CACHE_MODE` | `redis` | `redis` or `simulated` |
| `REDIS_URL` | `redis://redis:6379` | Redis connection URL |
| `BATCH_SIZE` | `100` | Flush after this many unique queries |
| `BATCH_FLUSH_INTERVAL_MS` | `10000` | Flush interval in milliseconds |
| `CACHE_TTL_SECONDS` | `300` | Cache TTL |
| `KAFKA_BROKERS` | `kafka:9092` | Comma-separated Kafka broker list |
| `KAFKA_SEARCH_TOPIC` | `search-events` | Topic used for search submission events |
| `KAFKA_GROUP_ID` | `batch-writer` | Consumer group for the batch writer |

## Project Structure

```text
search-typeahead/
  docker-compose.yml
  package.json
  README.md
  frontend/
    Dockerfile
    src/
      components/app/SearchApp.tsx
      hooks/
      services/api.ts
      types/
  services/
    Dockerfile.suggestion
    Dockerfile.search
    Dockerfile.batch-writer
    dataset/
      unigram_freq.csv
    src/
      cache/
      controllers/
      database/
      hashing/
      jobs/
      repositories/
      routes/
      messaging/
      services/
      __tests__/
  api-gateway/
    nginx.conf
```

## Testing And Builds

Service tests:

```bash
npm test
```

Service TypeScript build:

```bash
npm run build --prefix services
```

Frontend production build:

```bash
npm run build --prefix frontend
```

## Troubleshooting

If the frontend cannot reach the APIs, confirm the gateway and service containers are running:

```bash
docker compose ps
```

If startup fails because a port is already in use, stop the local process using that port or change the host-side port in `docker-compose.yml`.

If you previously ran the older single-backend Compose setup, remove orphan containers while starting the new split-service stack:

```bash
docker compose up --build --remove-orphans
```

If you want to reseed from scratch, remove volumes:

```bash
docker compose down -v
docker compose up --build --remove-orphans
```

If Docker reports stale image behavior, rebuild without cache:

```bash
docker compose build --no-cache
docker compose up --remove-orphans
```
