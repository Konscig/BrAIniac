# Tasks: Redis Runtime Infrastructure

**Input**: Design documents from `specs/006-redis/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/)

**Tests**: Required by the BrAIniac Constitution. Redis touches auth, rate limits, executor coordination, queues, cache, provider resilience, and progress, so each story includes backend contract or integration tests before implementation.

**Organization**: Tasks are grouped by user story so each increment can be implemented and tested independently after the shared foundation.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add Redis/BullMQ dependencies and local runtime service wiring.

- [X] T001 Add `redis` and `bullmq` backend dependencies in `backend/package.json`
- [X] T002 Refresh backend lockfile after dependency install in `backend/package-lock.json`
- [X] T003 Add Redis service, healthcheck, network wiring, and backend `REDIS_URL` environment in `docker-compose.yaml`
- [X] T004 Document Redis local startup and environment variables in `docs/local-dev.md`
- [X] T005 Add Redis runtime configuration notes to `backend/README.md`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core Redis runtime boundary that all user stories depend on.

**CRITICAL**: No user story work should begin until this phase is complete.

- [X] T006 [P] Create Redis key naming helpers and prefix normalization in `backend/src/runtime/redis.keys.ts`
- [X] T007 [P] Create shared runtime error types for fail-closed and degraded behavior in `backend/src/runtime/runtime-errors.ts`
- [X] T008 Create Redis client lifecycle with connect, reconnect, timeout, and test cleanup support in `backend/src/runtime/redis.client.ts`
- [X] T009 Create Redis health probe and dependency status model in `backend/src/runtime/redis.health.ts`
- [X] T010 [P] Create runtime health route contract test in `backend/scripts/redis-runtime-contract-test.mjs`
- [X] T011 Add `/runtime/health` route implementation in `backend/src/routes/runtime/runtime-health.routes.ts`
- [X] T012 Wire runtime health route into the Express app in `backend/src/index.ts`
- [X] T013 [P] Create Redis outage posture and `REDIS_REQUIRED=false` critical-operation contract test in `backend/scripts/redis-outage-contract-test.mjs`
- [X] T014 Add backend test scripts for Redis runtime checks in `backend/package.json`

**Checkpoint**: Redis client, key policy, health, and fail-closed error vocabulary are ready.

---

## Phase 3: User Story 1 - Stable Browser Sessions (Priority: P1) MVP

**Goal**: Browser refresh sessions survive backend restarts and multi-worker routing while preserving secure cookie behavior.

**Independent Test**: Sign in, refresh, rotate, replay, revoke, and simulate Redis outage; valid sessions refresh, replay/revoked sessions fail, and Redis outage fails closed.

### Tests for User Story 1

- [X] T015 [P] [US1] Add Redis-backed refresh rotation/replay test in `backend/scripts/web-session-refresh-test.mjs`
- [X] T016 [P] [US1] Add dedicated Redis refresh-session contract test in `backend/scripts/redis-web-session-contract-test.mjs`
- [X] T017 [P] [US1] Add frontend auth degraded-state test coverage in `frontend/src/lib/api.test.ts`

### Implementation for User Story 1

- [X] T018 [US1] Replace process-local refresh session `Map` with Redis-backed records in `backend/src/services/application/auth/web-session.application.service.ts`
- [X] T019 [US1] Implement atomic refresh rotation and replay rejection in `backend/src/services/application/auth/web-session.application.service.ts`
- [X] T020 [US1] Preserve cookie issue, clear, revoke, and refresh response behavior in `backend/src/routes/resources/auth/web-session.routes.ts`
- [X] T021 [US1] Preserve login/signup refresh-cookie issuance with Redis session creation in `backend/src/routes/resources/auth/auth.routes.ts`
- [X] T022 [US1] Surface retryable auth runtime failures through API helper handling in `frontend/src/lib/api.ts`
- [X] T023 [US1] Register Redis web-session test script in `backend/package.json`

**Checkpoint**: User Story 1 is functional and testable independently.

---

## Phase 4: User Story 2 - Abuse And Cost Protection (Priority: P1)

**Goal**: Shared rate limits protect auth, judge, MCP, execution starts, and provider-bound calls across backend workers.

**Independent Test**: Repeated requests from the same scope are throttled consistently across workers with clear `429` or fail-closed `503` responses.

### Tests for User Story 2

- [X] T024 [P] [US2] Create Redis rate-limit contract test in `backend/scripts/redis-rate-limit-test.mjs`
- [X] T025 [P] [US2] Extend auth route tests for login/signup throttling in `backend/scripts/auth-test.mjs`
- [X] T026 [P] [US2] Extend judge route audit for throttling behavior in `backend/scripts/judge-route-audit.mjs`

### Implementation for User Story 2

- [X] T027 [P] [US2] Implement atomic Redis rate bucket service in `backend/src/runtime/rate-limit.service.ts`
- [X] T028 [US2] Apply unauthenticated auth rate limits in `backend/src/routes/resources/auth/auth.routes.ts`
- [X] T029 [US2] Apply authenticated judge rate limits in `backend/src/routes/resources/judge/judge.routes.ts`
- [X] T030 [US2] Apply pipeline execution start rate limits in `backend/src/routes/resources/pipeline/pipeline.routes.ts`
- [X] T031 [US2] Apply MCP request/tool rate limits in `backend/src/mcp/mcp.transport.ts`
- [X] T032 [US2] Apply provider-bound rate buckets in `backend/src/services/core/openrouter/openrouter.adapter.ts`
- [X] T033 [US2] Register Redis rate-limit test script in `backend/package.json`

**Checkpoint**: User Story 2 is functional and testable independently.

---

## Phase 5: User Story 3 - Safe Pipeline Execution Coordination (Priority: P1)

**Goal**: In-flight locks, idempotency keys, and polling snapshots behave correctly across backend workers.

**Independent Test**: Concurrent pipeline starts produce one active non-idempotent execution; idempotent replays return the original execution; polling remains consistent.

### Tests for User Story 3

- [X] T034 [P] [US3] Extend executor coordination tests for Redis locks and idempotency in `backend/scripts/executor-coordination-test.mjs`
- [X] T035 [P] [US3] Extend HTTP executor smoke test for cross-worker idempotency in `backend/scripts/executor-http-coordination-test.mjs`
- [X] T036 [P] [US3] Add Redis execution outage cases in `backend/scripts/redis-outage-contract-test.mjs`

### Implementation for User Story 3

- [X] T037 [US3] Add Redis execution coordination helpers in `backend/src/services/application/pipeline/pipeline.executor.snapshot-store.ts`
- [X] T038 [US3] Move in-flight claims to Redis atomic claim semantics in `backend/src/services/application/pipeline/pipeline.executor.application.service.ts`
- [X] T039 [US3] Move idempotency claims to Redis atomic claim semantics in `backend/src/services/application/pipeline/pipeline.executor.application.service.ts`
- [X] T040 [US3] Add Redis snapshot cache read/write around durable execution snapshots in `backend/src/services/application/pipeline/pipeline.executor.snapshot-store.ts`
- [X] T041 [US3] Preserve durable `.artifacts` snapshot fallback and cleanup policy in `backend/src/services/application/pipeline/pipeline.executor.snapshot-store.ts`
- [X] T042 [US3] Register Redis executor coordination checks in `backend/package.json`

**Checkpoint**: User Story 3 is functional and testable independently.

---

## Phase 6: User Story 4 - Queued Heavy Runtime Workloads (Priority: P2)

**Goal**: Heavy tool contracts, judge assessments, and batch evaluations use shared queue lifecycle with global concurrency, retry, backoff, cancellation, and diagnostics.

**Independent Test**: Submit more heavy jobs than configured concurrency and verify queued, active, retrying, succeeded, failed, and cancelled states.

### Tests for User Story 4

- [X] T043 [P] [US4] Create Redis queue lifecycle contract test in `backend/scripts/redis-queue-contract-test.mjs`
- [X] T044 [P] [US4] Extend judge assessment e2e for queued workload diagnostics in `backend/scripts/judge-assessment-e2e-test.mjs`
- [X] T045 [P] [US4] Extend heavy contract HTTP test for queue backpressure in `backend/scripts/executor-http-coordination-test.mjs`

### Implementation for User Story 4

- [X] T046 [P] [US4] Create BullMQ runtime queue wrapper in `backend/src/runtime/queue/runtime-queue.ts`
- [X] T047 [P] [US4] Create heavy tool queue adapter in `backend/src/runtime/queue/heavy-tool.queue.ts`
- [X] T048 [P] [US4] Create judge queue adapter in `backend/src/runtime/queue/judge.queue.ts`
- [X] T049 [US4] Replace process-local heavy semaphore for contract execution with queue/backpressure behavior in `backend/src/index.ts`
- [X] T050 [US4] Add queued judge assessment execution path with immediate pre-execution ownership re-check in `backend/src/services/application/judge/judge.service.ts`
- [X] T051 [US4] Add queue diagnostics to judge routes in `backend/src/routes/resources/judge/judge.routes.ts`
- [X] T052 [US4] Add queue cancellation and cancelled-status handling to run panel UI in `frontend/src/components/run-panel.tsx`
- [X] T053 [US4] Register Redis queue test script in `backend/package.json`

**Checkpoint**: User Story 4 is functional and testable independently.

---

## Phase 7: User Story 5 - Fast Repeated Reads And Computations (Priority: P2)

**Goal**: Approved catalogs, graph snapshots, exports, embeddings, and provider checks reuse safe bounded cache entries without hidden graph behavior.

**Independent Test**: Repeated supported reads hit cache, mutation invalidates or bypasses cache, and cross-owner reads never reuse unauthorized data.

### Tests for User Story 5

- [X] T054 [P] [US5] Create Redis cache contract and invalidation test in `backend/scripts/redis-cache-contract-test.mjs`
- [X] T055 [P] [US5] Extend MCP export redaction test for cache-safe ownership in `backend/scripts/mcp-export-redaction-test.mjs`
- [X] T056 [P] [US5] Extend RAG artifact contract test to prove cache does not create hidden retrieval paths in `backend/scripts/rag-artifact-contract-test.mjs`

### Implementation for User Story 5

- [X] T057 [P] [US5] Implement bounded Redis cache service in `backend/src/runtime/cache.service.ts`
- [X] T058 [US5] Add node type and tool catalog cache reads with safe invalidation in `backend/src/services/application/node_type/node_type.application.service.ts`
- [X] T059 [US5] Add tool search/catalog cache reads with safe invalidation in `backend/src/services/application/tool/tool-search.application.service.ts`
- [X] T060 [US5] Add MCP export snapshot cache with owner-scoped keys in `backend/src/mcp/resources/export.resources.ts`
- [X] T061 [US5] Add embedding cache for normalized content/model identity in `backend/src/services/core/openrouter/openrouter.adapter.ts`
- [X] T062 [US5] Invalidate graph/export cache on node mutations in `backend/src/services/application/node/node.application.service.ts`
- [X] T063 [US5] Invalidate graph/export cache on edge mutations in `backend/src/services/application/edge/edge.application.service.ts`
- [X] T064 [US5] Register Redis cache test script in `backend/package.json`

**Checkpoint**: User Story 5 is functional and testable independently.

---

## Phase 8: User Story 6 - Provider Resilience (Priority: P2)

**Goal**: LLM, embedding, and judge provider cooldowns, retry budgets, and circuit-breaker states are shared across backend workers.

**Independent Test**: Simulated upstream `429`/`503` responses set shared cooldown state, prevent retry storms, and record diagnostics in execution/judge outputs.

### Tests for User Story 6

- [X] T065 [P] [US6] Create Redis provider resilience contract test in `backend/scripts/redis-provider-resilience-test.mjs`
- [X] T066 [P] [US6] Extend OpenRouter adapter tests through existing agent runtime smoke in `backend/scripts/agent-runtime-unit-test.mjs`
- [X] T067 [P] [US6] Extend judge reproducibility or comparison test for OpenRouter and Mistral provider cooldown diagnostics in `backend/scripts/judge-reproducibility-smoke-test.mjs`

### Implementation for User Story 6

- [X] T068 [P] [US6] Implement provider resilience state service in `backend/src/runtime/provider-resilience.service.ts`
- [X] T069 [US6] Apply shared cooldown and retry budget checks in `backend/src/services/core/openrouter/openrouter.adapter.ts`
- [X] T070 [US6] Apply shared cooldown and retry budget checks in `backend/src/services/core/judge_provider/openrouter.adapter.ts` and `backend/src/services/core/judge_provider/mistral.adapter.ts`
- [X] T071 [US6] Add provider cooldown diagnostics to agent provider call output in `backend/src/services/application/node/handlers/agent-provider-call.ts`
- [X] T072 [US6] Add provider cooldown diagnostics to judge metric execution in `backend/src/services/application/judge/llm_judge.metric.ts`
- [X] T073 [US6] Register Redis provider resilience test script in `backend/package.json`

**Checkpoint**: User Story 6 is functional and testable independently.

---

## Phase 9: User Story 7 - Realtime Runtime Progress (Priority: P3)

**Goal**: Long-running executions and assessments publish ordered progress events while polling remains complete.

**Independent Test**: Run a long execution, subscribe to events, verify ordered progress, disable Redis progress, and verify polling still reconstructs final status.

### Tests for User Story 7

- [X] T074 [P] [US7] Create Redis progress contract test in `backend/scripts/redis-progress-contract-test.mjs`
- [X] T075 [P] [US7] Extend executor HTTP smoke test for progress fallback in `backend/scripts/executor-http-coordination-test.mjs`
- [X] T076 [P] [US7] Add frontend run panel progress fallback test in `frontend/src/App.test.tsx`

### Implementation for User Story 7

- [X] T077 [P] [US7] Implement Redis progress stream service in `backend/src/runtime/progress.service.ts`
- [X] T078 [US7] Publish execution lifecycle and node state events from `backend/src/services/application/pipeline/pipeline.executor.application.service.ts`
- [X] T079 [US7] Publish judge assessment progress events from `backend/src/services/application/judge/judge.service.ts`
- [X] T080 [US7] Add authorized execution events route in `backend/src/routes/resources/pipeline/pipeline.routes.ts`
- [X] T081 [US7] Add progress event consumption and polling fallback in `frontend/src/components/run-panel.tsx`
- [X] T082 [US7] Register Redis progress test script in `backend/package.json`

**Checkpoint**: User Story 7 is functional and testable independently.

---

## Phase 10: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, hardening, cleanup, and full verification across all Redis-backed surfaces.

- [X] T083 [P] Update Redis production deployment guidance in `docs/deploy-checklist.md`
- [X] T084 [P] Document Redis runtime contracts and outage posture in `docs/sdd/15-redis-runtime-infrastructure.md`
- [X] T085 [P] Create Redis environment example file `.env.docker.example`
- [X] T086 Audit logs and diagnostics for secret-safe Redis errors in `backend/src/runtime/runtime-errors.ts`
- [X] T087 Run `npm --prefix backend run build`
- [ ] T088 Run `npm --prefix backend run test:web-session-refresh`
- [X] T089 Run `npm --prefix backend run test:executor:coordination`
- [ ] T090 Run `npm --prefix backend run test:executor:http`
- [X] T091 Run `npm --prefix backend run test:contracts:freeze`
- [X] T092 Run Redis-specific backend scripts listed in `specs/006-redis/quickstart.md`
- [X] T093 Run MCP auth/export/domain checks from `backend/package.json`
- [ ] T094 Run RAG and judge smoke checks touched by Redis cache/provider/queue behavior from `backend/package.json`
- [X] T095 Run frontend auth/session and build checks from `frontend/package.json`
- [ ] T096 Validate manual Redis outage and polling fallback steps in `specs/006-redis/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies; starts immediately.
- **Foundational (Phase 2)**: Depends on Setup; blocks all user stories.
- **User Stories (Phase 3+)**: Depend on Foundational.
- **Polish (Phase 10)**: Depends on all implemented stories selected for delivery.

### User Story Dependencies

- **US1 Stable Browser Sessions**: First MVP after foundation; no dependency on other stories.
- **US2 Abuse And Cost Protection**: Can start after foundation; independent of US1 except shared Redis client/errors.
- **US3 Safe Pipeline Execution Coordination**: Can start after foundation; independent of US1/US2 except shared Redis client/errors.
- **US4 Queued Heavy Runtime Workloads**: Depends on foundation and benefits from US2 rate-limit policy, but can be implemented separately.
- **US5 Fast Repeated Reads And Computations**: Depends on foundation; independent because cache degrades safely.
- **US6 Provider Resilience**: Depends on foundation and can integrate with US2 provider-bound limits.
- **US7 Realtime Runtime Progress**: Depends on foundation and execution/judge services; polling fallback keeps it additive.

### Within Each User Story

- Tests first, and they should fail before implementation.
- Runtime records/key helpers before services.
- Services before route/middleware integration.
- Backend behavior before frontend diagnostic display.
- Story checkpoint before moving to the next priority story.

### Parallel Opportunities

- Setup docs and compose work can proceed alongside dependency installation.
- Foundational key helpers, runtime errors, health test, and outage test can be worked on in parallel.
- US1 tests can be written while Redis session service is implemented.
- US2 auth, judge, pipeline, MCP, and provider limit integrations can be split by file after `rate-limit.service.ts` exists.
- US4 queue wrappers for heavy-tool and judge queues can be implemented in parallel.
- US5 cache integrations for catalogs, MCP export, embeddings, node invalidation, and edge invalidation can be split after `cache.service.ts` exists.
- US6 OpenRouter and judge provider integrations can be split after `provider-resilience.service.ts` exists.
- US7 backend progress publishing and frontend progress fallback can be split after `progress.service.ts` and event route contract are in place.

---

## Parallel Example: User Story 2

```text
Task: "Create Redis rate-limit contract test in backend/scripts/redis-rate-limit-test.mjs"
Task: "Extend auth route tests for login/signup throttling in backend/scripts/auth-test.mjs"
Task: "Extend judge route audit for throttling behavior in backend/scripts/judge-route-audit.mjs"
```

After `backend/src/runtime/rate-limit.service.ts` exists:

```text
Task: "Apply unauthenticated auth rate limits in backend/src/routes/resources/auth/auth.routes.ts"
Task: "Apply authenticated judge rate limits in backend/src/routes/resources/judge/judge.routes.ts"
Task: "Apply pipeline execution start rate limits in backend/src/routes/resources/pipeline/pipeline.routes.ts"
Task: "Apply MCP request/tool rate limits in backend/src/mcp/mcp.transport.ts"
```

---

## Parallel Example: User Story 5

```text
Task: "Add node type and tool catalog cache reads with safe invalidation in backend/src/services/application/node_type/node_type.application.service.ts"
Task: "Add MCP export snapshot cache with owner-scoped keys in backend/src/mcp/resources/export.resources.ts"
Task: "Add embedding cache for normalized content/model identity in backend/src/services/core/openrouter/openrouter.adapter.ts"
Task: "Invalidate graph/export cache on node mutations in backend/src/services/application/node/node.application.service.ts"
Task: "Invalidate graph/export cache on edge mutations in backend/src/services/application/edge/edge.application.service.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete US1 Stable Browser Sessions.
3. Stop and validate refresh, replay, revoke, multi-worker, and Redis outage behavior.

### Priority 1 Runtime Safety

1. Complete US2 Abuse And Cost Protection.
2. Complete US3 Safe Pipeline Execution Coordination.
3. Validate auth/judge/MCP/execution throttling and executor idempotency under Redis-backed state.

### Runtime Scale And UX

1. Complete US4 Queued Heavy Runtime Workloads.
2. Complete US5 Fast Repeated Reads And Computations.
3. Complete US6 Provider Resilience.
4. Complete US7 Realtime Runtime Progress.
5. Run full quickstart and cross-cutting verification.

### Notes

- Keep Redis values ephemeral and TTL-bound unless a queue/stream cleanup policy applies.
- Never store raw refresh tokens, access tokens, provider keys, passwords, or raw dataset content in Redis keys.
- Do not introduce Redis vector search or hidden retrieval paths in this feature.
- Preserve existing polling and frozen execution response contracts unless a contract file in `specs/006-redis/contracts/` explicitly changes behavior.
