# Data Model: Redis Runtime Infrastructure

Redis records are runtime records, not durable BrAIniac domain models. Keys must
include an environment prefix so local/test/prod data cannot collide.

## Naming Rules

- Prefix: `brainiac:{env}:...`
- User-scoped keys include `user:{userId}` or a hashed token identity.
- Project and pipeline scoped keys include `project:{projectId}` or
  `pipeline:{pipelineId}` after ownership has been checked.
- Secrets and raw refresh tokens are never stored as key names or plain values.
  Store hashes or opaque ids only.
- All non-queue runtime records must have explicit TTL unless documented as a
  stream/queue lifecycle record with its own cleanup policy.

## Refresh Session

**Purpose**: Shared browser refresh lifecycle.

**Key**: `brainiac:{env}:auth:web-refresh:{refreshTokenHash}`

**Fields**:
- `session_id`: opaque session id
- `user_id`: BrAIniac user id
- `refresh_token_hash`: hash of refresh token
- `issued_at`: ISO timestamp
- `expires_at`: ISO timestamp
- `rotated_from_hash`: optional previous refresh hash
- `revoked_at`: optional ISO timestamp

**Validation rules**:
- TTL must match remaining refresh lifetime.
- Refresh rotation must atomically remove or invalidate the old token before
  accepting the new token.
- Replay of old, expired, or revoked token returns `WEB_REFRESH_INVALID`.

**State transitions**:
`issued -> rotated -> expired`
`issued -> revoked`
`rotated -> replay_rejected`

## Rate Limit Bucket

**Purpose**: Shared abuse and cost protection.

**Key examples**:
- `brainiac:{env}:rl:auth:ip:{ipHash}`
- `brainiac:{env}:rl:judge:user:{userId}`
- `brainiac:{env}:rl:mcp:user:{userId}:tool:{toolName}`
- `brainiac:{env}:rl:provider:{provider}:{modelOrKind}`

**Fields**:
- `count` or token-bucket counters
- `window_started_at`
- `reset_at`
- `scope`
- `limit`

**Validation rules**:
- Increment and expiry must be atomic.
- Responses expose retry timing but not raw key material.
- Authenticated limits use user identity after auth; unauthenticated limits use
  origin/IP-safe hash.

## Execution Coordination Record

**Purpose**: Cross-worker in-flight lock and idempotency pointer.

**Key examples**:
- `brainiac:{env}:exec:inflight:pipeline:{pipelineId}`
- `brainiac:{env}:exec:idempotency:user:{userId}:pipeline:{pipelineId}:{idempotencyHash}`
- `brainiac:{env}:exec:snapshot:{executionId}`

**Fields**:
- `execution_id`
- `pipeline_id`
- `user_id`
- `idempotency_hash`, optional
- `status`
- `updated_at`
- `expires_at`

**Validation rules**:
- In-flight claim uses atomic `SET NX PX` semantics or equivalent.
- Idempotency claim is unique per user, pipeline, and idempotency key hash.
- Snapshot cache never replaces the durable `.artifacts` snapshot path.

**State transitions**:
`claimed -> running -> completed -> expired`
`claimed -> stale -> reclaimed`

## Runtime Job

**Purpose**: Queue-backed heavy workload lifecycle.

**Queue names**:
- `brainiac:{env}:queue:heavy-tool`
- `brainiac:{env}:queue:judge`
- `brainiac:{env}:queue:batch-eval`

**Fields**:
- `job_id`
- `owner_user_id`
- `workload_type`
- `resource_ids`
- `status`: `queued | active | retrying | succeeded | failed | cancelled`
- `attempt`
- `max_attempts`
- `next_retry_at`
- `created_at`
- `updated_at`
- `diagnostics`

**Validation rules**:
- Authorization and ownership are checked before enqueue and again before
  mutation/execution.
- Jobs do not contain secrets or raw provider keys.
- Cancellation does not remove unrelated graph or execution state.

## Cache Entry

**Purpose**: Safe reuse of approved repeated reads/computations.

**Key examples**:
- `brainiac:{env}:cache:node-types:v{catalogVersion}`
- `brainiac:{env}:cache:export:user:{userId}:project:{projectId}:v{graphVersion}`
- `brainiac:{env}:cache:embedding:{modelHash}:{contentHash}`

**Fields**:
- `value`
- `scope`
- `content_hash`
- `version`
- `created_at`
- `expires_at`

**Validation rules**:
- Cache keys include owner or public-safe scope.
- Cache invalidates or bypasses on relevant mutations.
- Cache hits must not create hidden RAG graph paths.

## Provider Resilience State

**Purpose**: Shared cooldown, retry budget, and circuit state.

**Key examples**:
- `brainiac:{env}:provider:{provider}:cooldown`
- `brainiac:{env}:provider:{provider}:model:{modelHash}:budget`
- `brainiac:{env}:provider:{provider}:circuit`

**Fields**:
- `provider`
- `model_hash`, optional
- `state`: `closed | open | half_open`
- `cooldown_until`
- `failure_count`
- `last_error_code`
- `updated_at`

**Validation rules**:
- Retryable upstream failures update shared state.
- Cooldown TTL must expire automatically.
- Diagnostics are copied into execution or judge-visible outputs when relevant.

## Progress Event

**Purpose**: Ordered realtime runtime visibility.

**Stream examples**:
- `brainiac:{env}:progress:execution:{executionId}`
- `brainiac:{env}:progress:assessment:{assessmentId}`

**Fields**:
- `event_id`
- `resource_type`
- `resource_id`
- `sequence`
- `event_type`
- `status`
- `payload`
- `created_at`

**Validation rules**:
- Consumers must pass authorization checks before subscribing.
- Events are bounded by retention length/time.
- Polling remains complete when streams are unavailable or expired.
