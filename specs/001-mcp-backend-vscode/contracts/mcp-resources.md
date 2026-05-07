# MCP Resources Contract

## URI Scheme

Use `brainiac://` URIs for BrAIniac-owned resources.

Resource templates:

- `brainiac://projects`
- `brainiac://projects/{projectId}`
- `brainiac://projects/{projectId}/pipelines`
- `brainiac://projects/{projectId}/export`
- `brainiac://pipelines/{pipelineId}`
- `brainiac://pipelines/{pipelineId}/graph`
- `brainiac://pipelines/{pipelineId}/validation`
- `brainiac://pipelines/{pipelineId}/executions/{executionId}`
- `brainiac://pipelines/{pipelineId}/agents`
- `brainiac://pipelines/{pipelineId}/nodes/{nodeId}`
- `brainiac://pipelines/{pipelineId}/export`
- `brainiac://pipelines/{pipelineId}/nodes/{nodeId}/export`
- `brainiac://node-types`
- `brainiac://node-types/{nodeTypeId}`
- `brainiac://tools`
- `brainiac://tools/{toolId}`

## Common Resource Shape

```json
{
  "uri": "brainiac://pipelines/123",
  "name": "Pipeline 123",
  "mimeType": "application/json",
  "text": "{...json...}"
}
```

The JSON payload inside `text` uses:

```json
{
  "kind": "pipeline",
  "resource_uri": "brainiac://pipelines/123",
  "data": {},
  "links": [],
  "diagnostics": [],
  "redactions": []
}
```

## Discovery Rules

- List callbacks return only resources accessible to the authenticated user.
- Resource names must be descriptive enough for VS Code Quick Pick/resource
  browsing.
- Resource content must be bounded. Large execution reports may summarize and
  link to nested resources instead of embedding everything. Export resources
  remain available as stable JSON reads, but export tools must return the normal
  redacted snapshot JSON inline so users are not forced to open a URI for the
  primary export payload.

## Project Resources

`brainiac://projects` returns a list of project summaries.

Each project summary includes:

- `project_id`
- `name`
- `pipeline_count`
- `resource_uri`

`brainiac://projects/{projectId}` returns one project and links to its
pipelines.

## Pipeline Resources

`brainiac://pipelines/{pipelineId}` returns:

- pipeline metadata
- graph resource link
- validation resource link
- agent resource link
- latest execution summary if available
- export resource link

`brainiac://pipelines/{pipelineId}/graph` returns:

- nodes
- edges
- node type summaries
- tool bindings
- unsupported runtime states

## Validation Resources

`brainiac://pipelines/{pipelineId}/validation` returns the same validation
result shape as the existing graph validation contract:

- `valid`
- `errors`
- `warnings`
- `metrics`

The adapter must call the existing validation service.

## Execution Resources

`brainiac://pipelines/{pipelineId}/executions/{executionId}` returns a bounded
execution snapshot:

- `execution_id`
- `pipeline_id`
- `status`
- `request`
- `preflight`
- `summary`
- `final_result`
- `warnings`
- `error`

Provider errors and empty agent results must remain visible.

## Agent Resources

`brainiac://pipelines/{pipelineId}/agents` returns agent-capable nodes and their
tool capability relationships:

- `node_id`
- `label`
- `agent_config`
- `available_tools`
- `tool_edges`
- `diagnostics`

Tool relationships must be derived from the existing graph and `ToolNode ->
AgentCall` semantics.

## Node Type Resources

`brainiac://node-types` returns runtime-backed node types that can be inspected
by MCP clients.

Each node type summary includes:

- `node_type_id`
- `name`
- `category`
- `fk_tool_id`
- `runtime_support_state`
- `resource_uri`

`brainiac://node-types/{nodeTypeId}` returns one node type with safe config
expectations, defaults, related tool links, and MCP authoring support state.
Unsupported node types must be marked explicitly and must not be represented as
creatable unless runtime support exists.

## Export Resources

`brainiac://pipelines/{pipelineId}/export` returns a redacted export snapshot.
`brainiac://projects/{projectId}/export` returns a redacted export snapshot for
all accessible project pipelines and metadata. `brainiac://pipelines/{pipelineId}/nodes/{nodeId}/export`
returns a redacted export snapshot for one node plus the minimal surrounding
pipeline, node type, agent/tool, and edge context needed to understand it.

Must include:

- scope metadata
- graph
- nodes
- agents
- tools
- validation summary
- selected execution metadata
- redaction report

Must exclude:

- provider keys
- credentials
- raw secrets
- unauthorized project data
- raw dataset content by default

Export resource behavior:

- Resource reads return the same redacted JSON shape used by export tools.
- Resource URIs are supplemental stable references. They must not be the only
  output from `export_project_snapshot`, `export_pipeline_snapshot`, or
  `export_node_snapshot`.
