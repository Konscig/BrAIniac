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

Purpose: Generate and return a redacted JSON export snapshot for one pipeline.

Input:

```json
{
  "pipelineId": 10,
  "includeExecutions": true,
  "inline": true
}
```

Output:

```json
{
  "export_resource_uri": "brainiac://pipelines/10/export",
  "snapshot": {
    "scope": {
      "type": "pipeline",
      "pipeline_id": 10
    },
    "pipeline": {},
    "graph": {
      "nodes": [],
      "edges": []
    },
    "node_types": [],
    "tools": [],
    "validation": {},
    "execution_metadata": {}
  },
  "redaction_report": [],
  "resource_links": [
    {
      "uri": "brainiac://pipelines/10/export",
      "name": "Pipeline 10 export"
    }
  ],
  "diagnostics": []
}
```

Behavior:

- The tool response must include the redacted JSON snapshot inline for normal
  project sizes. The URI is a secondary stable reference, not the primary
  payload.
- If a future size guard prevents full inline output, return a bounded
  `snapshot_preview`, explicit diagnostic, and the `export_resource_uri`.
- The same snapshot builder and redaction logic must back both the tool output
  and the export resource.

### `export_project_snapshot`

Purpose: Generate and return a redacted JSON export snapshot for one project.

Input:

```json
{
  "projectId": 1,
  "includePipelines": true,
  "includeExecutions": true,
  "inline": true
}
```

Output:

```json
{
  "export_resource_uri": "brainiac://projects/1/export",
  "snapshot": {
    "scope": {
      "type": "project",
      "project_id": 1
    },
    "project": {},
    "pipelines": []
  },
  "redaction_report": [],
  "resource_links": [
    {
      "uri": "brainiac://projects/1/export",
      "name": "Project 1 export"
    }
  ],
  "diagnostics": []
}
```

### `export_node_snapshot`

Purpose: Generate and return a redacted JSON export snapshot for one node plus
minimal related pipeline, type, agent/tool, and edge context.

Input:

```json
{
  "pipelineId": 10,
  "nodeId": 100,
  "inline": true
}
```

Output:

```json
{
  "export_resource_uri": "brainiac://pipelines/10/nodes/100/export",
  "snapshot": {
    "scope": {
      "type": "node",
      "pipeline_id": 10,
      "node_id": 100
    },
    "pipeline": {},
    "graph": {
      "nodes": [],
      "edges": []
    },
    "node_types": [],
    "tools": [],
    "validation": {},
    "execution_metadata": {}
  },
  "redaction_report": [],
  "resource_links": [
    {
      "uri": "brainiac://pipelines/10/nodes/100/export",
      "name": "Node 100 export"
    }
  ],
  "diagnostics": []
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

## Planned MCP Authoring Tools

These tools mutate persistent BrAIniac state and must be marked non-read-only
and confirmation-appropriate in MCP annotations. They reuse existing backend
project, pipeline, node, edge, ownership, and graph-validation services.
Implementation lives in `backend/src/mcp/tools/authoring.tools.ts`; layout
derivation and overlap avoidance live in
`backend/src/mcp/tools/authoring-layout.ts`.

### `create_project`

Purpose: Create an owner-scoped BrAIniac project for the authenticated user.

Input:

```json
{
  "name": "Customer Support RAG",
  "description": "Optional short description"
}
```

Output:

```json
{
  "project": {
    "project_id": 25,
    "name": "Customer Support RAG",
    "resource_uri": "brainiac://projects/25"
  },
  "resource_links": []
}
```

Rules:

- Requires authenticated user ownership context.
- Must reject empty or duplicate-unsafe names according to existing project
  service behavior.

### `create_pipeline`

Purpose: Create a pipeline inside an owned project.

Input:

```json
{
  "projectId": 25,
  "name": "Answer Questions From Documents",
  "maxTime": 120,
  "maxCost": 1.5,
  "maxReject": 3
}
```

Output:

```json
{
  "pipeline": {
    "pipeline_id": 44,
    "project_id": 25,
    "name": "Answer Questions From Documents",
    "resource_uri": "brainiac://pipelines/44"
  },
  "graph_resource_uri": "brainiac://pipelines/44/graph",
  "validation": {}
}
```

Rules:

- Verifies the project belongs to the authenticated user.
- Runs or returns graph validation in the existing validation result shape.

### `create_pipeline_node`

Purpose: Create a supported node on a pipeline canvas with readable placement.

Input:

```json
{
  "pipelineId": 44,
  "nodeTypeId": 7,
  "label": "Retrieve Documents",
  "position": { "x": 380, "y": 220 },
  "layout": {
    "direction": "left_to_right",
    "column": 1,
    "row": 0,
    "xGap": 380,
    "yGap": 220
  },
  "uiJson": {}
}
```

Output:

```json
{
  "node": {
    "node_id": 101,
    "pipeline_id": 44,
    "label": "Retrieve Documents",
    "resource_uri": "brainiac://pipelines/44/nodes/101",
    "ui_json": {
      "x": 380,
      "y": 220,
      "position": { "x": 380, "y": 220 }
    }
  },
  "graph_resource_uri": "brainiac://pipelines/44/graph",
  "validation": {},
  "diagnostics": []
}
```

Rules:

- Tool description must tell agents: place nodes with explicit spacing; do not
  stack multiple nodes at the same or near-identical coordinates.
- Requires `position` or enough `layout` data to derive a deterministic
  non-overlapping position.
- Recommended default spacing is about 380 px horizontally and 220 px
  vertically. The gap is intended to account for the visible node card
  width/height plus breathing room, not only the abstract coordinate point.
- Values below 340 px horizontally or 200 px vertically are treated as too
  tight for MCP-generated layouts and are raised to the minimum safe gap.
- Stores both top-level `x`/`y` and nested `position` in `ui_json` so the
  existing web canvas and MCP clients can read the same placement.
- Must reject unsupported node types and hidden `tool_ref`/`tool_refs`
  behavior.
- Must return layout diagnostics if requested placement overlaps existing or
  same-request nodes and cannot be adjusted safely.

### `connect_pipeline_nodes`

Purpose: Connect two nodes in the same owned pipeline with a graph edge.

Input:

```json
{
  "pipelineId": 44,
  "sourceNodeId": 101,
  "targetNodeId": 102
}
```

Output:

```json
{
  "edge": {
    "pipeline_id": 44,
    "source_node_id": 101,
    "target_node_id": 102
  },
  "graph_resource_uri": "brainiac://pipelines/44/graph",
  "validation": {},
  "diagnostics": []
}
```

Rules:

- Both nodes must belong to the target pipeline and authenticated user.
- Duplicate edges, cross-pipeline edges, missing endpoints, and unsafe graph
  states must fail with structured diagnostics.
- Graph validation must run after mutation and return the existing validation
  result shape.

### Shared Authoring Rules

- Return resource links to changed project, pipeline, graph, and node resources.
- Avoid partial unsafe mutation; use service-level rollback or preflight
  validation where existing service boundaries allow it.
- Do not start executions automatically from model suggestions.
- Composite "build pipeline from plan" helpers may be considered later only
  after the explicit primitive tools are tested.

## Planned BrAIniac Domain Discovery And Editing Tools

These tools fill the practical gaps an agent has after the primitive authoring
slice: discovering creatable node types, reading the current graph as structured
tool output, validating config before mutation, and repairing mistakes.
Implementation lives in `backend/src/mcp/tools/domain-discovery.tools.ts`.

### `list_node_types`

Purpose: Return runtime-backed BrAIniac node types that can be inspected or
created through MCP.

Input:

```json
{
  "includeUnsupported": false
}
```

Output includes `node_type_id`, `name`, `category`, `fk_tool_id`,
`runtime_support_state`, `resource_uri`, and safe summaries of required config
and defaults when available.

### `get_node_type`

Purpose: Return one node type's config expectations, defaults, related tool,
input/output handle metadata where available, and MCP authoring support state.

### `get_pipeline_graph`

Purpose: Return the owner-scoped pipeline graph directly as structured tool
output: nodes, edges, node types, tool bindings, validation summary, and graph
resource links.

Input:

```json
{
  "pipelineId": 44,
  "includeValidation": true,
  "preset": "default"
}
```

### `list_pipeline_edges`

Purpose: Return edges for one owner-scoped pipeline so agents can check existing
connections before calling `connect_pipeline_nodes`.

### `validate_node_config`

Purpose: Dry-run validation for a node type and proposed `configJson` before
creating or updating a node.

Input:

```json
{
  "nodeTypeId": 7,
  "configJson": {}
}
```

Rules:

- Must not mutate state.
- Must return clear field-level diagnostics where existing validators can
  provide them.
- Must distinguish unsupported node types from invalid config.

### `update_pipeline_node`

Purpose: Update an existing pipeline node's label, `config_json`, or
`ui_json.position`.

Input:

```json
{
  "pipelineId": 44,
  "nodeId": 101,
  "label": "Retrieve Documents",
  "configJson": {},
  "uiJson": { "x": 380, "y": 220, "position": { "x": 380, "y": 220 } }
}
```

Rules:

- Mutating and confirmation-appropriate.
- Must enforce pipeline ownership and reject hidden `tool_ref`/`tool_refs`
  behavior.
- Must run graph validation after mutation and return diagnostics.

### `delete_pipeline_node`

Purpose: Delete an owned pipeline node, with explicit diagnostics for affected
edges and validation state.

Input:

```json
{
  "pipelineId": 44,
  "nodeId": 101
}
```

Rules:

- Mutating and confirmation-appropriate.
- Must not delete nodes outside the target owned pipeline.
- Must either remove dependent edges through existing service behavior or reject
  with actionable diagnostics if safe deletion cannot be guaranteed.

### `delete_pipeline_edge`

Purpose: Delete one edge from an owned pipeline.

Input:

```json
{
  "pipelineId": 44,
  "sourceNodeId": 101,
  "targetNodeId": 102
}
```

Rules:

- Mutating and confirmation-appropriate.
- Must reject missing, duplicate-ambiguous, or cross-pipeline endpoints.
- Must run graph validation after deletion.

### `search_node_types`

Purpose: Search runtime-backed node types by query, category, capability, or
related tool so agents do not need to scan a large catalog.

### `search_tools`

Purpose: Search BrAIniac tool catalog entries by query or capability, returning
tool ids and linked node types where known.

### `get_agent_tool_bindings`

Purpose: Return tools available to a specific agent node, explicit
`ToolNode -> AgentCall` capability edges, unresolved tools, and diagnostics.

Input:

```json
{
  "pipelineId": 44,
  "agentNodeId": 103
}
```

### `auto_layout_pipeline`

Purpose: Derive non-overlapping canvas positions for an owned pipeline.

Input:

```json
{
  "pipelineId": 44,
  "direction": "left_to_right",
  "dryRun": true
}
```

Rules:

- `dryRun: true` returns proposed `ui_json` position changes without mutation.
- `dryRun: false` is mutating and confirmation-appropriate.
- Must preserve graph structure and update only canvas placement metadata.
- Must use the existing bounded layout helper strategy; do not add an expensive
  global graph layout engine for this slice.

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
