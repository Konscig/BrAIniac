# Contract: HTTP Runtime Behavior

This feature should preserve existing public response shapes unless an error or
diagnostic state is necessary.

## Runtime Unavailable Error

Used when Redis is required for a safe decision.

```json
{
  "ok": false,
  "code": "RUNTIME_REDIS_UNAVAILABLE",
  "error": "runtime coordination unavailable",
  "retryable": true
}
```

Status: `503`

## Rate Limit Error

Used when a shared bucket is exhausted.

```json
{
  "ok": false,
  "code": "RATE_LIMITED",
  "error": "request rate limit exceeded",
  "retryable": true,
  "retry_after_seconds": 30,
  "scope": "auth.login"
}
```

Status: `429`

## Execution Already Running Error

Preserve existing conflict semantics and include the active execution id.

```json
{
  "ok": false,
  "code": "PIPELINE_EXECUTION_ALREADY_RUNNING",
  "error": "pipeline execution is already running",
  "details": {
    "execution_id": "uuid"
  }
}
```

Status: `409`

## Queued Work Response

When an existing endpoint accepts asynchronous heavy work, include a lifecycle
pointer without hiding ownership checks.

```json
{
  "ok": true,
  "job": {
    "job_id": "opaque",
    "status": "queued",
    "workload_type": "judge-assessment",
    "created_at": "2026-05-15T00:00:00.000Z"
  }
}
```

Status: `202` for newly queued async-only work. Existing synchronous endpoints
must keep their current status unless explicitly migrated in tasks.

## Runtime Health

Route: `GET /runtime/health`

```json
{
  "ok": true,
  "redis": {
    "status": "ok",
    "latency_ms": 3
  },
  "queues": {
    "heavy_tool": { "status": "ok" },
    "judge": { "status": "ok" }
  }
}
```

When degraded:

```json
{
  "ok": false,
  "redis": {
    "status": "unavailable"
  },
  "degraded": ["cache", "progress"],
  "fail_closed": ["auth-refresh", "rate-limit", "execution", "queue", "provider"]
}
```

Status: `200` if the backend process is alive and can report degradation;
deployment health checks may use stricter policy separately.
