# Design Choices and Trade-offs

This document explains the key architectural and implementation decisions in the
Search Typeahead System, and the trade-offs each decision carries.

---

## 1. Split-Service Architecture (Suggestion + Search + Batch Writer)

### Decision

The backend is decomposed into three independent processes:

| Process | Responsibility |
|---|---|
| `suggestion-service` | Read APIs: suggest, trending, cache debug, stats |
| `search-service` | Accept `POST /api/search`, publish to Kafka |
| `batch-writer` | Kafka consumer, batch DB writes, cache invalidation |

### Why

**Read/write workloads have completely different SLA requirements.** A suggestion
lookup must respond in single-digit milliseconds to feel instantaneous to the user.
A search submission only needs to acknowledge receipt. Separating them means:

- Suggestion service can be scaled independently during read-heavy traffic.
- A slow DB write batch does not block the suggestion response path.
- The batch writer can be restarted or redeployed without affecting live reads.

### Trade-offs

| Pro | Con |
|---|---|
| Independent scaling per workload | More containers to orchestrate and monitor |
| Failure isolation (one service down ≠ full outage) | Requires a message queue (Kafka) and its coordination service (Zookeeper) |
| Clear ownership of each concern | Service discovery handled by nginx upstream — fragile if names change |

---

## 2. Kafka as the Write Buffer

### Decision

Search submissions are published to the `search-events` Kafka topic by `search-service`
and consumed by `batch-writer`. The `search-service` never writes to PostgreSQL directly.

### Why

**Kafka decouples the submission rate from the write rate.** If 1,000 searches arrive
per second, the search service only needs to produce 1,000 Kafka messages — a very
fast operation. The batch writer consumes at its own pace and aggregates before writing.

Kafka also provides **durability**: if the batch writer crashes, unprocessed events
remain in the topic and are replayed when the worker restarts. No submissions are lost.

### Trade-offs

| Pro | Con |
|---|---|
| Search count updates are not lost on batch-writer failure | Zookeeper dependency adds complexity and two more containers |
| Producer latency is very low (fire-and-forget to broker) | Count visibility is delayed — a search does not appear in suggestions immediately |
| Horizontally scalable consumer group model | Kafka startup is slow and flaky in Docker; health-check retries are needed |
| At-least-once delivery semantics | Duplicate processing possible if batch-writer crashes mid-flush (mitigated by `ON CONFLICT DO UPDATE`) |

---

## 3. In-Memory Aggregation in the Batch Writer

### Decision

The batch writer holds submitted queries in a `Map<string, BufferEntry>` and
increments a `delta` counter for repeated queries instead of writing each one.
It flushes all buffered deltas in a single multi-row SQL upsert.

### Why

**Database write amplification is the primary bottleneck under search traffic.** 
Popular queries like `"react"` or `"python"` can be submitted hundreds of times per
second. Without aggregation, each submission becomes a separate `INSERT … ON CONFLICT
DO UPDATE` round-trip. With aggregation, all 200 submissions of `"react"` in a 10-second
window become a single upsert with `delta = 200`.

### Trade-offs

| Pro | Con |
|---|---|
| 80–95% reduction in DB writes under typical traffic | Data is not persisted to PostgreSQL until a flush — crash between submissions and flush loses the buffered deltas |
| Single DB round-trip per flush (multi-row VALUES clause) | In-memory buffer is not shared across multiple batch-writer instances |
| Configurable via `BATCH_SIZE` and `BATCH_FLUSH_INTERVAL_MS` | Large `BATCH_SIZE` delays count visibility; small values reduce write savings |

**Crash-loss window:** In the worst case, the batch writer processes a Kafka message,
adds it to the buffer, and then crashes before flushing. Because Kafka commits
offsets only after a successful flush (in a correctly implemented consumer), the
message would be replayed. The current implementation should be verified to ensure
offset commits happen post-flush.

---

## 4. Redis Cache with Consistent Hashing

### Decision

Suggestion results are cached in Redis. Three logical cache nodes (`Redis-A`, `Redis-B`,
`Redis-C`) are modelled over a single Redis instance using key namespacing
(`node:Redis-A:<prefix>`). Prefix-to-node assignment is handled by a consistent hash
ring with 150 virtual nodes per physical node.

### Why

**Two separable goals:**

1. **Caching** — Avoid hitting PostgreSQL on every keystroke. A prefix like `"re"` will
   be queried by every user typing `"react"`, `"redux"`, `"remix"`, etc. Caching it
   eliminates repeated identical DB reads.

2. **Consistent hashing** — Demonstrates that in a real multi-node Redis deployment,
   the same prefix always routes to the same node (stable assignment). Adding or
   removing a node reshuffles only a 1/N fraction of keys rather than all of them.
   The 150-virtual-node setting balances the ring distribution.

### Trade-offs

| Pro | Con |
|---|---|
| Cache hits reduce DB read load by 70–90% | Redis is a single point of failure; no Redis replica configured |
| Consistent hashing gives predictable node ownership | Three logical nodes over one physical instance is illustrative, not actually distributed |
| `CACHE_TTL_SECONDS` makes stale data bounded | After every batch flush, all affected prefixes are invalidated — causes a cold-miss spike |
| Cache debug endpoints expose ring state for observability | Invalidation is O(query_length) deletes per flushed query |

### Invalidation Strategy

When the batch writer flushes a query like `"react"`, it deletes cached keys for
`"r"`, `"re"`, `"rea"`, `"reac"`, `"react"`. This is a **write-through invalidation**
pattern: after a count changes, the stale cache entry is evicted so the next read
fetches fresh data from PostgreSQL.

The alternative — write-through update (recompute and cache on flush) — was not chosen
because the suggestion service needs to query the DB to rank results, and doing so
from the batch writer would couple the two processes.

---

## 5. Nginx as API Gateway

### Decision

An Nginx container acts as the single public entry point for all `/api/*` traffic.
It routes read endpoints to the suggestion service and `POST /api/search` to the
search service using `location` blocks and Docker DNS-based upstream resolution.

### Why

**The frontend should not know or care which backend service handles each route.**
A single gateway URL (`http://localhost:3001`) decouples the browser from backend
topology. Routing rules live in `nginx.conf` and can be changed without touching
frontend code.

Nginx is also stateless, fast, and well-understood for this role — no custom code
required.

### Trade-offs

| Pro | Con |
|---|---|
| Single ingress point simplifies frontend configuration | Nginx is not a health-aware load balancer — if a backend is down, requests fail immediately |
| No service discovery complexity in frontend code | `resolver 127.0.0.11` relies on Docker's internal DNS, which is not portable outside Docker |
| Routing rules are declarative and auditable | Adding a new service requires an Nginx config change and container rebuild |

---

## 6. Two Suggestion Ranking Modes (Basic vs. Enhanced)

### Decision

`GET /api/suggest?mode=basic` returns results ranked by `count DESC`. 
`GET /api/suggest?mode=enhanced` uses a weighted score combining historical count
(70%) and recent activity from `recent_search_events` (30%).

```sql
score = count * 0.7 + recent_count * 0.3 * GREATEST(count / NULLIF(recent_count, 0), 1)
```

### Why

**Pure count ranking favours all-time popular queries.** A query that was heavily
searched a year ago but is no longer trending will outrank something that just went
viral. The enhanced mode surfaces recent momentum without completely discarding
historical authority.

### Trade-offs

| Pro | Con |
|---|---|
| Basic mode is fast and simple — pure index scan on `count` | Enhanced mode requires a CTE join against `recent_search_events`, which grows over time |
| Enhanced mode rewards recency for trending use cases | The 0.7/0.3 weighting is hardcoded — no tuning interface |
| Both modes can be selected per-request | `recent_search_events` is never pruned — the table will grow indefinitely without a cleanup job |

---

## 7. PostgreSQL as the Source of Truth

### Decision

All durable query counts and recent events are stored in PostgreSQL. Redis is
exclusively a cache layer; Kafka is a transit layer.

### Why

**PostgreSQL provides ACID guarantees, a well-understood schema model, and strong
`ON CONFLICT DO UPDATE` (upsert) semantics.** The batch upsert pattern relies on
`ON CONFLICT (LOWER(query)) DO UPDATE SET count = count + EXCLUDED.count`, which
is both atomic and idempotent for a given batch. This makes it safe to retry a flush
if it fails partway.

### Trade-offs

| Pro | Con |
|---|---|
| ACID semantics; no risk of count corruption from concurrent upserts | PostgreSQL is the primary bottleneck if the batch writer is too aggressive |
| Schema is explicit and version-controlled in `schema.sql` | No read replica — all suggestion queries hit the same instance as writes |
| `LIKE 'prefix%'` with a functional index is efficient for prefix lookups | The functional index on `LOWER(query)` must exist for prefix queries to be fast at scale |

---

## 8. Docker Compose as the Orchestrator

### Decision

The entire system — 9 services — is defined in a single `docker-compose.yml` with
explicit health checks and dependency ordering.

### Why

**Docker Compose is the lowest-friction way to run a multi-container system on a
developer or evaluator machine.** No Kubernetes knowledge, cloud account, or complex
setup is required. A single `docker compose up --build` is the complete runbook.

### Trade-offs

| Pro | Con |
|---|---|
| Zero external dependencies for a reviewer to run the system | Not production-grade — single host, no orchestration for restarts/scaling |
| Health checks and `depends_on` prevent race conditions on startup | Kafka + Zookeeper cold-start is slow (30–60 s) and occasionally fails on first attempt |
| `restart: unless-stopped` provides basic crash recovery | No secrets management — credentials are plaintext in `docker-compose.yml` |
| Volume-backed PostgreSQL survives container restarts | `db-init` re-runs on every `docker compose up` (skipped by `--if-empty` guard) |

---

## Summary Table

| Decision | Main Benefit | Main Cost |
|---|---|---|
| Split services | Independent scaling and failure isolation | More containers and Kafka dependency |
| Kafka write buffer | No search submissions lost on crash | Delayed count visibility, Zookeeper overhead |
| In-memory aggregation | 80–95% DB write reduction | Buffered deltas lost if process crashes before flush |
| Redis + consistent hashing | Sub-5ms read path on cache hit | Invalidation spikes; single Redis instance is not HA |
| Nginx gateway | Unified ingress, no frontend coupling | Not health-aware; requires config change for new routes |
| Basic + Enhanced ranking | Recency-aware suggestions | CTE query cost; `recent_search_events` grows unbounded |
| PostgreSQL source of truth | ACID upserts, idempotent retry | Single instance; no read replica |
| Docker Compose | One-command local setup | Not production-grade orchestration |
