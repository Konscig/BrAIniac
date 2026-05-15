# Quickstart: Redis Runtime Infrastructure

## 1. Start dependencies

```powershell
docker compose up -d db redis
```

For the app profile:

```powershell
docker compose --profile app up -d --build
```

## 2. Backend environment

Expected Redis-related variables:

```text
REDIS_URL=redis://redis:6379
REDIS_KEY_PREFIX=brainiac:dev
REDIS_REQUIRED=true
REDIS_CONNECT_TIMEOUT_MS=5000
RUNTIME_CACHE_ENABLED=true
RUNTIME_PROGRESS_ENABLED=true
```

Local development may set `REDIS_REQUIRED=false` only to allow backend startup
for non-critical read/dev flows while Redis is absent. It must not enable
in-memory fallback for refresh sessions, rate limits, execution coordination,
queue submission, or provider-resilience decisions; those critical operations
still fail closed. Production keeps `REDIS_REQUIRED=true`.

## 3. Install backend dependencies

```powershell
npm --prefix backend install
```

The implementation should add direct dependencies for Redis runtime access and
queue lifecycle handling.

## 4. Run focused checks

```powershell
npm --prefix backend run build
npm --prefix backend run test:web-session-refresh
npm --prefix backend run test:executor:coordination
npm --prefix backend run test:executor:http
npm --prefix backend run test:contracts:freeze
```

Planned Redis-specific checks:

```powershell
node --loader ts-node/esm backend/scripts/redis-runtime-contract-test.mjs
node --loader ts-node/esm backend/scripts/redis-outage-contract-test.mjs
node --loader ts-node/esm backend/scripts/redis-web-session-contract-test.mjs
node --loader ts-node/esm backend/scripts/redis-rate-limit-test.mjs
node --loader ts-node/esm backend/scripts/redis-queue-contract-test.mjs
node --loader ts-node/esm backend/scripts/redis-cache-contract-test.mjs
node --loader ts-node/esm backend/scripts/redis-provider-resilience-test.mjs
node --loader ts-node/esm backend/scripts/redis-progress-contract-test.mjs
```

## 5. Manual verification

1. Sign in through the browser, wait for access-token expiry, and verify refresh
   works with Redis available.
2. Restart backend workers and verify refresh, revoke, and replay behavior still
   uses shared state.
3. Stop Redis and verify protected operations fail closed while cache reads
   bypass Redis and execution polling still works.
4. Start concurrent pipeline executions and verify only one non-idempotent
   execution is active.
5. Trigger provider throttling simulation and verify shared cooldown diagnostics.
6. Run a long execution and verify progress events appear; then disable Redis
   progress and verify polling remains complete.
