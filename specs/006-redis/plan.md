# Implementation Plan: Redis Runtime Infrastructure

**Branch**: `006-redis` | **Date**: 2026-05-15 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/006-redis/spec.md`

## Summary

Add Redis as BrAIniac's shared runtime infrastructure for seven runtime
surfaces: browser refresh sessions, distributed rate limits, pipeline execution
coordination, heavy workload queues, bounded caches, provider resilience state,
and realtime progress events. PostgreSQL remains the source of truth for
durable domain data, and existing `.artifacts` execution blobs remain the
durable large-artifact path. Redis-backed security, coordination, queue, and
provider-resilience decisions fail closed when Redis is unavailable; cache and
realtime progress degrade by bypassing cache and preserving polling.

## Technical Context

**Language/Version**: TypeScript; backend uses the existing `backend/package.json`
tooling (`typescript` 5.9.x, Node types 24.x). Frontend remains React/CRA with
the existing API helper and auth provider structure.
**Primary Dependencies**: Existing Express/Prisma backend, official `redis`
Node client for shared runtime primitives, BullMQ for heavy job lifecycle,
existing auth/session routes, existing pipeline executor, MCP transport/tools,
judge services, OpenRouter and Mistral judge provider adapters, and existing
contract test scripts. No new frontend runtime dependency is planned.
**Storage**: PostgreSQL remains durable source of truth for users, projects,
pipelines, nodes, edges, datasets, tools, and judge reports. Redis stores
ephemeral runtime state with TTLs: refresh-session records, rate buckets,
execution locks/idempotency pointers, job queues, cache entries, provider
cooldowns, and progress streams. Filesystem `.artifacts` remains the durable
execution artifact/blob path.
**Testing**: Add backend Redis runtime contract tests for refresh rotation,
rate limiting, execution locks/idempotency, queue lifecycle, cache invalidation,
provider cooldown, Redis outage posture, and progress fallback. Keep existing
`test:web-session-refresh`, Redis web-session contract checks,
`test:executor:coordination`, `test:executor:http`, `test:contracts:freeze`,
MCP, RAG, judge, and frontend auth/session checks.
**Target Platform**: Local Docker Compose BrAIniac backend, browser frontend,
VS Code/MCP clients, and optional app profile workers on the same Docker network.
**Project Type**: Web application with backend MCP adapter and frontend UI.
**Performance Goals**: Redis-backed security and coordination decisions should
complete within normal backend API latency; repeated cacheable reads should
avoid rebuild work when safe; progress events should become visible within
1 second while polling remains complete.
**Constraints**: Do not replace PostgreSQL domain truth, do not move large
artifacts out of `.artifacts` in this feature, do not introduce Redis as hidden
RAG/vector search, do not expose secrets or unauthorized cached data, and do
not let Redis outages silently bypass security, rate limits, locks, queues, or
provider cooldowns.
**Scale/Scope**: Applies to web refresh sessions, auth/judge/MCP/execution
rate limits, pipeline execution starts and polling, heavy tool contracts,
judge/batch workloads, MCP/export/catalog/cache reads, LLM/embedding/judge
provider calls, and execution/assessment progress publication.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/10-real-rag-backend-plan.md`,
  `docs/sdd/11-backend-contract-freeze.md`, `docs/sdd/08-rag-toolkit.md`,
  `docs/sdd/09-backend-runtime-truth-snapshot.md`, `docs/deploy-checklist.md`,
  existing web-session service, pipeline executor, snapshot store, MCP tools,
  provider adapters, and `docker-compose.yaml`. Code remains the source of
  truth for current runtime behavior; SDD remains the contract boundary for
  public execution and RAG shapes.
- **Technology stack**: Adds Redis as the user-approved shared runtime store
  and BullMQ as the queue lifecycle library. Backend remains TypeScript,
  Express, Prisma, PostgreSQL, and Docker Compose. Frontend keeps existing CRA
  stack. The new dependency is justified because the feature explicitly needs
  distributed runtime state and global queue semantics that process-local maps
  and filesystem locks do not provide cleanly.
- **UX/adaptivity**: User-facing behavior must show honest states: throttled,
  queued, retrying, Redis/runtime unavailable, provider cooling down, progress
  unavailable with polling fallback. Existing execution polling and auth
  failure paths remain understandable instead of becoming silent cache/queue
  behavior.
- **Simplicity**: Introduce one backend runtime boundary (`runtime/redis`) and
  small adapters per use case. Do not rewrite domain services or replace
  persisted domain models. Migrate high-risk surfaces incrementally: sessions
  and rate limits first, then execution coordination, queues, caches, provider
  resilience, and progress.
- **Tests**: Required checks are backend build, web-session refresh tests,
  Redis outage contract tests, Redis rate-limit tests, executor coordination
  and HTTP tests, queue lifecycle tests, cache invalidation tests, provider
  cooldown tests, progress fallback tests, MCP auth/export/domain tests, RAG
  smoke/e2e tests where touched, judge tests where touched, and frontend
  auth/session checks for visible degraded states.

Post-design re-check: PASS. The design keeps durable product data in PostgreSQL,
keeps RAG artifacts explicit, adds Redis only as shared runtime infrastructure,
and preserves the existing public execution contracts with explicit new
diagnostic states.

## Project Structure

### Documentation (this feature)

```text
specs/006-redis/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- redis-runtime.md
|   |-- http-runtime.md
|   `-- progress-events.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
backend/
|-- src/
|   |-- runtime/
|   |   |-- redis.client.ts
|   |   |-- redis.health.ts
|   |   |-- redis.keys.ts
|   |   |-- runtime-errors.ts
|   |   |-- rate-limit.service.ts
|   |   |-- cache.service.ts
|   |   |-- progress.service.ts
|   |   `-- queue/
|   |       |-- runtime-queue.ts
|   |       |-- heavy-tool.queue.ts
|   |       `-- judge.queue.ts
|   |-- services/
|   |   |-- application/
|   |   |   |-- auth/
|   |   |   |   `-- web-session.application.service.ts
|   |   |   |-- pipeline/
|   |   |   |   |-- pipeline.executor.application.service.ts
|   |   |   |   `-- pipeline.executor.snapshot-store.ts
|   |   |   `-- judge/
|   |   |       `-- judge.service.ts
|   |   `-- core/
|   |       |-- openrouter/
|   |       `-- judge_provider/
|   |-- routes/
|   |   |-- resources/
|   |   |   |-- auth/
|   |   |   |-- pipeline/
|   |   |   `-- judge/
|   |   `-- runtime/
|   |       `-- runtime-health.routes.ts
|   `-- mcp/
|       |-- mcp.transport.ts
|       `-- tools/
|-- scripts/
|   |-- redis-runtime-contract-test.mjs
|   |-- redis-outage-contract-test.mjs
|   |-- redis-web-session-contract-test.mjs
|   |-- redis-rate-limit-test.mjs
|   |-- redis-queue-contract-test.mjs
|   |-- redis-cache-contract-test.mjs
|   |-- redis-provider-resilience-test.mjs
|   `-- redis-progress-contract-test.mjs
`-- package.json

frontend/
|-- src/
|   |-- lib/
|   |   `-- api.ts
|   |-- providers/
|   |   `-- AuthProvider.tsx
|   `-- components/
|       `-- run-panel.tsx

docker-compose.yaml
```

**Structure Decision**: Add a small backend runtime layer for Redis primitives,
then wire existing auth, executor, judge, MCP, provider, and cache use cases
through focused adapters. Keep frontend changes limited to displaying existing
and new diagnostic states returned by backend APIs.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| New Redis service | The feature explicitly requires shared runtime state across backend workers for sessions, rate limits, locks, queues, caches, provider state, and progress. | Process-local `Map` and filesystem coordination already exist but do not provide clean distributed TTL, counters, queues, Pub/Sub/Streams, or shared outage semantics. |
| New BullMQ dependency | Heavy workload lifecycle requires global concurrency, retry, backoff, cancellation, and observable job states. | A custom Redis Streams queue would recreate queue semantics manually and increase correctness risk. |
