# Contract: Redis Runtime Keyspace

## Availability Policy

When Redis is unavailable:

- Refresh-session decisions return `503` or refresh-specific `401` after cookie
  clearing where the current auth contract requires it.
- Rate-limit checks for protected surfaces fail closed with `503`.
- Execution coordination and queue submission fail closed with `503`.
- Provider cooldown checks fail closed with `503` for new provider-bound calls.
- Cache reads are bypassed.
- Progress events are not published; polling remains authoritative.

## Key Prefix

All keys use:

```text
brainiac:{env}:{domain}:...
```

`env` is configured by `REDIS_KEY_PREFIX` or derived from the runtime
environment. Tests must use a separate prefix and clean it after completion.

## Required Domains

| Domain | Example | TTL |
|--------|---------|-----|
| `auth:web-refresh` | `brainiac:dev:auth:web-refresh:{hash}` | refresh lifetime |
| `rl` | `brainiac:dev:rl:auth:ip:{hash}` | rate window |
| `exec:inflight` | `brainiac:dev:exec:inflight:pipeline:{id}` | coordination stale window |
| `exec:idempotency` | `brainiac:dev:exec:idempotency:user:{id}:pipeline:{id}:{hash}` | idempotency window |
| `exec:snapshot` | `brainiac:dev:exec:snapshot:{executionId}` | execution cache window |
| `cache` | `brainiac:dev:cache:export:user:{id}:project:{id}:v{n}` | cache policy |
| `provider` | `brainiac:dev:provider:openrouter:circuit` | cooldown/budget policy |
| `progress` | `brainiac:dev:progress:execution:{executionId}` | stream trim policy |

## Atomicity Requirements

- Refresh rotation must atomically reject replay of the old token.
- Rate-limit increment and expiry must be atomic.
- Execution in-flight claim must be atomic and single-winner.
- Idempotency claim must be atomic and deterministic for replays.
- Provider circuit transitions must avoid concurrent workers reopening the same
  provider flood.

## Data Protection

- Raw refresh tokens, access tokens, provider keys, passwords, and dataset
  contents must not appear in Redis key names.
- Cache values must be scoped by user/project/public-safe version as applicable.
- Redis diagnostics exposed through health routes must not include secret
  values or raw key names with sensitive hashes.
