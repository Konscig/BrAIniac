# MCP Tools Contract

## Tool Naming

Use snake_case names with clear verb-object structure. Prefer read-only tools
first and mark them with read-only annotations.

## MVP Read-Only Tools

### `list_projects`

Purpose: Return project summaries for the authenticated user.

Input:

```json
{}
```

Output:

```json
{
  "projects": [
    {
      "project_id": 1,
      "name": "Research",
      "resource_uri": "brainiac://projects/1"
    }
  ]
}
```

Behavior:

- Reuses existing project listing logic.
- Returns only owner-scoped projects.

### `list_pipelines`

Purpose: Return pipelines for an optional project.

Input:

```json
{
  "projectId": 1
}
```

Output:

```json
{
  "pipelines": [
    {
      "pipeline_id": 10,
      "fk_project_id": 1,
      "name": "RAG baseline",
      "resource_uri": "brainiac://pipelines/10"
    }
  ]
}
```

Behavior:

- If `projectId` is provided, verify project ownership first.
- If omitted, list pipelines owned by the user.

### `get_pipeline_context`

Purpose: Return a bounded pipeline context with graph links and diagnostics.

Input:

```json
{
  "pipelineId": 10,
  "includeValidation": true
}
```

Output:

```json
{
  "pipeline": {},
  "graph_resource_uri": "brainiac://pipelines/10/graph",
  "validation_resource_uri": "brainiac://pipelines/10/validation",
  "diagnostics": []
}
```

Behavior:

- Verifies pipeline ownership.
- Does not mutate the pipeline.
- Validation, when requested, calls the existing graph validation service.

### `list_pipeline_nodes`

Purpose: Return node summaries for one pipeline.

Input:

```json
{
  "pipelineId": 10
}
```

Output:

```json
{
  "nodes": [
    {
      "node_id": 100,
      "fk_type_id": 3,
      "label": "AgentCall",
      "resource_uri": "brainiac://pipelines/10/nodes/100",
      "runtime_support_state": "supported"
    }
  ]
}
```

### `get_node_context`

Purpose: Return one node with type, tool, and agent context where relevant.

Input:

```json
{
  "nodeId": 100
}
```

Output:

```json
{
  "node": {},
  "node_type": {},
  "tool_binding": {},
  "agent_config": {},
  "diagnostics": []
}
```

### `list_tool_catalog`

Purpose: Return tool catalog entries and resource links.

Input:

```json
{}
```

Output:

```json
{
  "tools": [
    {
      "tool_id": 7,
      "name": "DocumentLoader",
      "resource_uri": "brainiac://tools/7"
    }
  ]
}
```

## Operation Tools For Second Slice

### `validate_pipeline`

Purpose: Run graph validation through the existing validation service.

Input:

```json
{
  "pipelineId": 10,
  "preset": "default"
}
```

Output: existing validation result shape with `valid`, `errors`, `warnings`,
and `metrics`.

### `export_pipeline_snapshot`

Purpose: Generate a redacted export snapshot for one pipeline.

Input:

```json
{
  "pipelineId": 10,
  "includeExecutions": true
}
```

Output:

```json
{
  "export_resource_uri": "brainiac://pipelines/10/export",
  "redactions": []
}
```

### `start_pipeline_execution`

Purpose: Start execution through the existing executor service.

Input:

```json
{
  "pipelineId": 10,
  "preset": "default",
  "datasetId": 173,
  "inputJson": {
    "question": "What is Artemis II?"
  },
  "idempotencyKey": "client-generated-key"
}
```

Output: existing execution snapshot shape.

Rules:

- Disabled until read-only and validation/export tools pass tests.
- Requires explicit user input and target pipeline.
- Uses existing idempotency behavior.
- Mark with non-read-only annotations so clients request confirmation.

### `get_pipeline_execution`

Purpose: Retrieve execution snapshot through existing executor service.

Input:

```json
{
  "pipelineId": 10,
  "executionId": "uuid"
}
```

Output: existing execution snapshot shape.

## Deferred Agent Authoring Tools

Do not implement until a separate plan/task slice approves mutation semantics.

Candidate tools:

- `create_agent_node`
- `update_agent_config`
- `bind_tool_to_agent`
- `validate_agent_pipeline`

Rules:

- Must reuse existing node/edge/pipeline mutation services.
- Must validate graph after mutation.
- Must not create hidden tool bindings.
- Must return resource links to changed nodes/pipelines.

## Error Shape

Tool-level errors return MCP tool errors with user-visible text and structured
details:

```json
{
  "ok": false,
  "code": "FORBIDDEN",
  "message": "forbidden",
  "details": {}
}
```

Permission errors, validation failures, provider failures, empty agent output,
and unavailable backend states must remain distinguishable.

