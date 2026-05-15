# Research: Redis Runtime Infrastructure

## Decision: Use Redis as shared runtime state, not durable domain storage

**Rationale**: BrAIniac already uses PostgreSQL/Prisma for durable users,
projects, pipelines, nodes, edges, datasets, tools, and judge reports. Redis is
best scoped to short-lived runtime decisions: TTL sessions, counters, locks,
queues, cache entries, provider cooldowns, and progress streams.

**Alternatives considered**:
- PostgreSQL for all runtime state: durable but heavier for high-churn counters,
  locks, progress, and queue operations.
- Filesystem coordination only: already present for executor baseline but weak
  for rate limits, queues, pub/sub, and cross-worker cache.

## Decision: Fail closed for security/coordination/queue/provider decisions

**Rationale**: When Redis is unavailable, accepting refresh tokens, bypassing
rate limits, starting pipeline executions, queueing heavy work, or ignoring
provider cooldowns can violate security or correctness. These operations should
return clear retryable errors instead of silently falling back to process-local
state.

**Alternatives considered**:
- Full in-memory fallback: easier in local development but unsafe in
  multi-worker deployment because each worker sees different state.
- Fail closed for everything: correct but unnecessarily blocks cacheable reads
  and progress UX.

## Decision: Degrade cache and realtime progress

**Rationale**: Cache misses can fall back to the authoritative source, and
progress events can fall back to existing execution polling. These paths do not
need to block user work when Redis is unavailable.

**Alternatives considered**:
- Fail closed for cache/progress: would reduce availability without improving
  data correctness.
- Hidden local progress fallback: would create inconsistent cross-worker
  visibility and is not necessary because polling remains complete.

## Decision: Use the official Redis client for primitives

**Rationale**: The backend needs predictable Redis commands, TTLs, transactions,
Pub/Sub or Streams, and connection health. A direct client keeps session,
limiter, lock, cache, and provider-resilience code small and testable.

**Alternatives considered**:
- Wrap Redis behind a broad generic storage layer: unnecessary abstraction for
  the current explicit runtime use cases.
- Use separate packages per primitive: increases dependency surface and makes
  outage semantics harder to keep consistent.

## Decision: Use BullMQ for heavy queues

**Rationale**: Heavy tool contracts and judge/batch workloads need global
concurrency, retries, backoff, cancellation, and job inspection. BullMQ provides
these lifecycle semantics on Redis without building a queue engine in the
codebase.

**Alternatives considered**:
- Redis Streams custom queue: fewer dependencies but more custom correctness
  work for retries, backoff, lock renewal, and cleanup.
- Existing process-local semaphore: already limits only one process and scales
  incorrectly with multiple workers.

## Decision: Keep public execution contract stable

**Rationale**: `POST /pipelines/:id/execute` and
`GET /pipelines/:id/executions/:executionId` are frozen frontend/backend
contracts. Redis should strengthen idempotency, in-flight locks, and polling
snapshots without changing the core response shape except explicit diagnostic
fields/errors where needed.

**Alternatives considered**:
- Replace polling with realtime only: violates fallback requirement and would
  make Redis a user-visible availability dependency.
- Move execution snapshots entirely to Redis: faster but less durable than the
  current artifact-backed snapshot path.

## Decision: Do not introduce Redis vector search in this feature

**Rationale**: Current RAG contracts require explicit graph/tool paths and
artifact-backed retrieval. Redis cache may speed repeated embeddings or
approved computations, but it must not become hidden vector storage or a hidden
retrieval path.

**Alternatives considered**:
- Redis Stack/RediSearch vector backend: possible future retrieval evolution,
  but outside this feature and requires separate contract work.
