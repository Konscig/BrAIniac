# SDD-15: Redis Runtime Infrastructure

Redis is the shared runtime store for state that must be visible across backend workers:

- browser refresh sessions
- shared rate limits
- pipeline execution coordination and idempotency
- heavy workload queue/backpressure state
- bounded cache entries
- provider cooldown state
- realtime progress streams

Redis is not the source of truth for durable BrAIniac domain data. PostgreSQL, `.artifacts`, and existing project ownership checks remain authoritative.

## Outage Posture

Critical decisions fail closed when Redis is unavailable: refresh sessions, rate limits, execution coordination, queue admission, and provider cooldown decisions.

Optimization surfaces degrade: cache reads compute directly and progress events fall back to polling.

`REDIS_REQUIRED=false` is only a local startup allowance. It does not enable in-memory fallback for critical Redis-backed operations.

## Diagnostics

Runtime health is exposed at `/runtime/health`. Redis outage errors use `RUNTIME_REDIS_UNAVAILABLE`; throttling uses `RATE_LIMITED`; queue pressure uses `RUNTIME_QUEUE_BUSY`; provider cooldown uses `PROVIDER_COOLDOWN_ACTIVE`.
