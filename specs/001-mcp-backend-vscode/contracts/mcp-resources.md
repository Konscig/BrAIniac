# MCP Resources Contract

## URI Scheme

Use `brainiac://` URIs for BrAIniac-owned resources.

Resource templates:

- `brainiac://projects`
- `brainiac://projects/{projectId}`
- `brainiac://projects/{projectId}/pipelines`
- `brainiac://pipelines/{pipelineId}`
- `brainiac://pipelines/{pipelineId}/graph`
- `brainiac://pipelines/{pipelineId}/validation`
- `brainiac://pipelines/{pipelineId}/executions/{executionId}`
- `brainiac://pipelines/{pipelineId}/agents`
- `brainiac://pipelines/{pipelineId}/nodes/{nodeId}`
- `brainiac://pipelines/{pipelineId}/export`
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
- Resource content must be bounded. Large execution reports or exports should
  summarize and link to nested resources instead of embedding everything.

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

## Export Resource

`brainiac://pipelines/{pipelineId}/export` returns a redacted export snapshot.

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

