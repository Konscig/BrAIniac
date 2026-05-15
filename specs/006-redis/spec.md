# Feature Specification: Redis Runtime Infrastructure

**Feature Branch**: `006-redis`  
**Created**: 2026-05-15  
**Status**: Draft  
**Input**: User description: "Implement Redis for the seven identified BrAIniac runtime use cases: web refresh sessions, rate limiting, pipeline execution coordination, heavy job queues, caching, provider resilience, and realtime progress."

## Clarifications

### Session 2026-05-15

- Q: How should BrAIniac behave when Redis is unavailable? -> A: Fail closed for security, coordination, queue, and provider-resilience decisions; degrade only cache and realtime progress while preserving polling.
- Q: Which provider adapters must Redis provider resilience cover? -> A: All configured provider adapters, including OpenRouter LLM/embedding and both OpenRouter and Mistral judge providers.
- Q: What queue safety behavior is required before queued work mutates state? -> A: Queued work must support cancellation and re-check ownership immediately before execution.
- Q: What does `REDIS_REQUIRED=false` mean in local development? -> A: It may allow backend startup for non-critical dev flows only; critical Redis-backed operations still fail closed instead of using in-memory fallback.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Stable Browser Sessions (Priority: P1)

As a BrAIniac web user, I want browser sessions to survive backend restarts and work consistently when multiple backend workers are running, so that idle refresh and sign-out behavior remains predictable.

**Why this priority**: Refresh-session state is currently short-lived runtime state and directly affects authentication reliability.

**Independent Test**: Can be tested by signing in, refreshing the access token, restarting or scaling backend workers, and confirming that valid sessions refresh while revoked or replayed sessions fail.

**Acceptance Scenarios**:

1. **Given** a signed-in browser user with a valid refresh cookie, **When** the access token expires and the frontend refreshes the session, **Then** the user receives a new access token without exposing refresh material to JavaScript.
2. **Given** a refresh token that was already rotated or revoked, **When** the browser attempts refresh, **Then** the request is rejected and the refresh cookie is cleared.
3. **Given** multiple backend workers, **When** refresh, revoke, and replay attempts are routed to different workers, **Then** all workers observe the same session state.

---

### User Story 2 - Abuse And Cost Protection (Priority: P1)

As an operator, I want shared rate limits for authentication, judge, MCP, provider, and execution entry points, so that brute-force attempts, accidental floods, and costly LLM workloads are bounded across all backend workers.

**Why this priority**: Public deployment guidance already identifies auth and judge rate limiting as required before production exposure.

**Independent Test**: Can be tested by issuing repeated requests from the same principal and confirming limits are enforced consistently across backend workers with clear retry responses.

**Acceptance Scenarios**:

1. **Given** repeated failed login attempts from one origin, **When** the configured threshold is exceeded, **Then** further login attempts are temporarily rejected with a clear retry signal.
2. **Given** a user repeatedly starts judge or pipeline workloads, **When** the user's shared quota is exhausted, **Then** new requests are throttled without affecting unrelated users.
3. **Given** MCP clients call read and write tools at high frequency, **When** tool-specific thresholds are exceeded, **Then** the system throttles the client while preserving authorization checks and auditability.

---

### User Story 3 - Safe Pipeline Execution Coordination (Priority: P1)

As a BrAIniac user running pipelines, I want duplicate starts, in-flight locks, idempotency keys, and polling snapshots to behave correctly across multiple backend workers, so that a pipeline run is not accidentally duplicated or lost.

**Why this priority**: Execution coordination is central to pipeline correctness and currently spans process-local and persisted coordination state.

**Independent Test**: Can be tested by starting the same pipeline concurrently from different workers with and without an idempotency key and verifying one authoritative execution state.

**Acceptance Scenarios**:

1. **Given** a pipeline already has an active execution, **When** another non-idempotent execution is started for the same pipeline, **Then** the second request is rejected with the active execution id.
2. **Given** a request repeats the same idempotency key, **When** it reaches a different backend worker, **Then** it returns the original execution instead of creating a duplicate.
3. **Given** an execution is running or recently completed, **When** the frontend polls for status, **Then** it receives a consistent snapshot even if the original worker is not handling the poll.

---

### User Story 4 - Queued Heavy Runtime Workloads (Priority: P2)

As an operator, I want heavy tool contracts, judge assessments, and batch evaluation workloads to use a shared queue with global concurrency and retry policy, so that expensive work is controlled across workers and remains observable.

**Why this priority**: Heavy runtime work can exhaust CPU, memory, provider quotas, and request capacity if each worker maintains only local limits.

**Independent Test**: Can be tested by submitting more heavy tasks than the configured concurrency and confirming queued, running, succeeded, failed, and retry states are observable.

**Acceptance Scenarios**:

1. **Given** heavy tool work exceeds global concurrency, **When** additional work is submitted, **Then** it is queued or rejected according to capacity policy without bypassing user ownership checks.
2. **Given** a retryable heavy task fails transiently, **When** retry budget remains, **Then** the task is retried with backoff and records its final outcome.
3. **Given** a queued task is no longer needed or its owner is unauthorized, **When** the system attempts execution, **Then** the task is cancelled or rejected without mutating unrelated graph state.

---

### User Story 5 - Fast Repeated Reads And Computations (Priority: P2)

As a user or MCP client, I want repeated catalog reads, graph snapshots, exports, embeddings, and provider state checks to avoid unnecessary repeated work, so that common BrAIniac workflows stay responsive under load.

**Why this priority**: MCP tools, export snapshots, node catalogs, embeddings, and provider checks can be repeated frequently by users and agents.

**Independent Test**: Can be tested by repeating supported reads and computations and verifying responses remain correct after cache hits, invalidation events, and permission changes.

**Acceptance Scenarios**:

1. **Given** a user repeatedly reads node type and tool catalogs, **When** the catalog has not changed, **Then** the response is served quickly and remains authorization-safe.
2. **Given** an MCP client repeatedly exports the same authorized project snapshot, **When** the project graph has not changed, **Then** the export result remains consistent and avoids unnecessary rebuild work.
3. **Given** a text segment has already been embedded for the same model and normalized input, **When** the embedding is requested again, **Then** the system may reuse the result without exposing hidden graph paths or cross-owner data.

---

### User Story 6 - Provider Resilience (Priority: P2)

As a user running LLM or judge workloads, I want provider cooldowns, retry budgets, and circuit-breaker behavior to be shared across workers, so that upstream `429` or `503` failures do not trigger request storms or inconsistent fallback behavior.

**Why this priority**: BrAIniac already observes provider rate-limit and upstream errors in realistic LLM/Judge paths.

**Independent Test**: Can be tested by simulating provider throttling and confirming all workers respect cooldowns, retry limits, and fallback behavior.

**Acceptance Scenarios**:

1. **Given** an upstream provider returns repeated throttling errors, **When** additional provider calls are requested, **Then** workers share the cooldown state and avoid immediate retry storms.
2. **Given** a provider call has retry budget remaining, **When** a retryable failure occurs, **Then** retry behavior follows shared policy and records diagnostics.
3. **Given** provider calls are temporarily unavailable, **When** a pipeline can still produce a valid fallback result, **Then** execution records provider diagnostics without hiding the fallback source.

---

### User Story 7 - Realtime Runtime Progress (Priority: P3)

As a user watching long-running execution or assessment work, I want progress updates to be publishable from backend workers and consumable by UI or MCP-facing surfaces, so that I do not rely only on polling for runtime visibility.

**Why this priority**: Polling works today, but progress events become valuable once heavy queues and long-running assessments are introduced.

**Independent Test**: Can be tested by running a long execution and confirming progress events are emitted in order for authorized consumers while polling remains available.

**Acceptance Scenarios**:

1. **Given** a long-running execution updates node states, **When** progress changes, **Then** subscribed authorized consumers receive ordered progress events.
2. **Given** a consumer connects after execution has started, **When** progress history is available, **Then** the consumer receives the latest known state and subsequent updates.
3. **Given** the realtime channel is unavailable, **When** a user views execution status, **Then** polling still provides a complete status path.

### Edge Cases

- Redis or the shared runtime store is temporarily unavailable during authentication, rate limiting, execution start, queue submission, cache lookup, provider call, or progress publication.
- When Redis is unavailable, security-sensitive and correctness-sensitive operations fail closed; cache lookups are bypassed and realtime progress falls back to polling.
- Backend workers restart while sessions, locks, queued jobs, provider cooldowns, or progress streams are active.
- A user loses access to a project after a cache entry, queued job, or progress subscription has been created.
- Cached graph/export/catalog data becomes stale after project, pipeline, node, edge, node type, or tool mutations.
- Execution or queue records expire while a frontend or MCP client is still polling.
- Provider cooldown state must not permanently block service after transient upstream failures.
- Realtime consumers disconnect, reconnect, or connect after some events have already been emitted.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST store browser refresh-session state in a shared runtime store so refresh, rotation, replay rejection, and revoke behavior are consistent across backend workers.
- **FR-002**: System MUST keep browser refresh credentials inaccessible to JavaScript-readable storage and preserve the existing secure cookie contract.
- **FR-003**: System MUST enforce shared rate limits for authentication, judge workloads, pipeline execution starts, MCP access, and provider-bound calls.
- **FR-004**: System MUST return clear throttling responses that identify retryability without leaking secrets, tokens, provider keys, or unauthorized resource details.
- **FR-005**: System MUST coordinate active pipeline executions and idempotency keys across backend workers so duplicate starts and replay requests resolve deterministically.
- **FR-006**: System MUST keep execution polling functional across worker restarts or cross-worker request routing.
- **FR-007**: System MUST introduce shared queue behavior for heavy runtime workloads that need global concurrency, retry, backoff, cancellation, and observable lifecycle state.
- **FR-008**: System MUST apply ownership and authorization checks before queued work mutates project, pipeline, node, edge, dataset, or judge state.
- **FR-009**: System MUST support bounded caching for repeated catalogs, graph snapshots, exports, embeddings, provider state checks, and other explicitly approved expensive reads or computations.
- **FR-010**: System MUST invalidate or bypass cached data when relevant ownership, project, pipeline, node, edge, node type, tool, or dataset state changes.
- **FR-011**: System MUST ensure caches do not create hidden RAG graph paths or expose cross-owner data.
- **FR-012**: System MUST share provider cooldown, retry-budget, and circuit-breaker state across backend workers for all configured LLM, embedding, and judge provider adapters, including OpenRouter and Mistral judge providers.
- **FR-013**: System MUST record provider throttling, cooldown, fallback, and retry diagnostics in existing execution or judge-visible outputs where relevant.
- **FR-014**: System MUST support publishable progress events for long-running executions and assessments while keeping polling as a complete fallback path.
- **FR-015**: System MUST fail closed for Redis-backed refresh-session decisions, rate-limit decisions, execution coordination, queue submission, and provider cooldown decisions when Redis is unavailable.
- **FR-016**: System MUST degrade Redis-backed cache and realtime progress behavior when Redis is unavailable by bypassing cache and preserving polling as the complete status path.
- **FR-017**: System MUST expose health and diagnostics sufficient for operators to distinguish shared-store unavailable, degraded, throttled, queued, and normal states.
- **FR-018**: System MUST provide migration-safe behavior so local development and existing test workflows can run with documented configuration.
- **FR-UX**: User-facing changes MUST expose relevant throttling, queue, execution, provider, and diagnostic feedback in the workflow where the user acts.
- **FR-STACK**: Implementation MUST stay within the existing BrAIniac stack unless the implementation plan documents and approves an exception.
- **FR-SDD**: Behavior MUST align with the relevant `docs/sdd/` contracts or explicitly document the contract update required by this feature.

### Key Entities *(include if feature involves data)*

- **Refresh Session**: A browser session record with owner identity, refresh-token identity, expiry, rotation status, and revoke status.
- **Rate Limit Bucket**: A scoped counter or token bucket for an origin, user, client, route, provider, or workload type with reset timing and retry metadata.
- **Execution Coordination Record**: A shared record binding a pipeline to an active execution and binding idempotency keys to execution ids.
- **Runtime Job**: A queued heavy workload with owner, workload type, status, retry state, timestamps, cancellation state, and diagnostic outcome.
- **Cache Entry**: A bounded reusable value keyed by owner-safe scope, content identity, version or invalidation marker, and expiry.
- **Provider Resilience State**: Shared retry budget, cooldown, circuit state, and provider diagnostics for LLM, embedding, and judge providers.
- **Progress Event**: An ordered runtime event associated with an execution, assessment, or job and visible only to authorized consumers.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Valid browser refresh sessions continue to refresh successfully after backend worker restart or cross-worker routing in automated tests.
- **SC-002**: Replayed, expired, and revoked refresh credentials are rejected in automated tests with no JavaScript-readable refresh material.
- **SC-003**: Shared throttling prevents repeated auth, judge, MCP, execution, and provider-bound floods from exceeding configured limits across multiple workers.
- **SC-004**: Concurrent starts of the same pipeline produce at most one active non-idempotent execution and deterministic idempotency replay results.
- **SC-005**: Heavy workload concurrency remains within configured global limits under multi-worker load, with observable queued, running, retrying, succeeded, failed, and cancelled states.
- **SC-006**: Supported repeated reads or computations return correct authorized results after cache hits and after invalidation-triggering mutations.
- **SC-007**: Provider throttling simulations produce shared cooldown behavior and prevent immediate repeated upstream calls across workers.
- **SC-008**: Long-running runtime work emits progress events for authorized consumers while polling remains sufficient to reconstruct final status.
- **SC-009**: Redis outage tests show protected operations fail closed while cache and realtime progress degrade without corrupting durable data or blocking polling.
- **SC-010**: Existing MCP export, authoring, domain, auth, executor, RAG, judge, and frontend auth/session contract tests remain passable or are updated with explicit contract changes.
- **SC-TEST**: Required automated or documented manual checks demonstrate the feature works across backend, frontend, MCP, runtime, contract, and local Docker surfaces.

## Assumptions

- Redis is the approved shared runtime store for this feature and is deployed inside the existing Docker network for local and app profiles.
- `REDIS_REQUIRED=false` is a local-development startup allowance only; it does not permit in-memory fallback for critical refresh, rate-limit, execution coordination, queue, or provider-resilience decisions.
- PostgreSQL remains the source of truth for durable BrAIniac domain data such as users, projects, pipelines, nodes, edges, datasets, tools, and judge reports.
- File-backed artifacts may remain the durable storage path for large execution artifacts unless the implementation plan explicitly changes that boundary.
- Existing browser cookie security, MCP authorization, ownership checks, graph validation, and redaction rules remain mandatory.
- Realtime progress is additive; existing polling APIs remain supported.
- Vector search replacement is not part of this feature unless a later plan explicitly approves Redis Stack or another retrieval backend.
