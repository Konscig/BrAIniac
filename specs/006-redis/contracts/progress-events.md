# Contract: Runtime Progress Events

Progress events are additive. Polling remains the complete status path.

## Subscription Surface

Planned route:

```text
GET /pipelines/:pipelineId/executions/:executionId/events
```

The route may use Server-Sent Events. Consumers must be authorized for the
pipeline before receiving events.

## Event Shape

```json
{
  "event_id": "opaque",
  "sequence": 12,
  "resource_type": "execution",
  "resource_id": "execution-uuid",
  "event_type": "node_state_updated",
  "status": "running",
  "created_at": "2026-05-15T00:00:00.000Z",
  "payload": {
    "pipeline_id": 123,
    "node_id": 456,
    "node_status": "completed"
  }
}
```

## Event Types

- `execution_queued`
- `execution_started`
- `preflight_completed`
- `node_state_updated`
- `execution_succeeded`
- `execution_failed`
- `job_queued`
- `job_retrying`
- `job_cancelled`
- `provider_cooldown`

## Fallback

If Redis progress streams are unavailable, expired, or disconnected, clients use:

```text
GET /pipelines/:pipelineId/executions/:executionId
```

The polling response remains authoritative for final status and diagnostics.
