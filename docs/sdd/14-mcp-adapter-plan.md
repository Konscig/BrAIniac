# SDD 14: MCP Adapter Plan

## Runtime Scope

The MCP implementation is a thin backend adapter over existing BrAIniac
application, ownership, validation, executor, and export-safe serialization
logic. It adds MCP protocol resources/tools but does not introduce a second
graph model, auth model, executor, agent runtime, or persistent MCP business
store.

## Implemented Surface

- Owner-scoped project, pipeline, graph, validation, execution, node, agent,
  tool, and export resources use `brainiac://` URIs.
- Read-only inspection tools expose project, pipeline, node, agent, and tool
  context with explicit diagnostics and resource links.
- Pipeline operation tools reuse `validatePipelineGraph`,
  `startPipelineExecutionForUser`, and `getPipelineExecutionForUser`.
- Export tools/resources assemble bounded project, pipeline, and node snapshots
  and run them through MCP redaction helpers before returning content.
- VS Code integration starts as a server definition provider and relies on
  VS Code built-in MCP browsing, tool confirmation, logging, and auth prompts.

## Guardrails

- MCP handlers must verify existing owner-scoped auth before returning resource
  content.
- MCP must call existing application/core services where they exist instead of
  duplicating validation, execution, ownership, or route DTO behavior.
- Export snapshots must redact provider keys, credentials, token-like values,
  and raw dataset content markers by default.
- `start_pipeline_execution` is non-read-only and must remain confirmation
  appropriate for MCP clients.

## Deferred Agent Authoring

Agent mutation tools are not part of this adapter slice. `create_agent_node`,
`update_agent_config`, `bind_tool_to_agent`, and related graph mutation helpers
require a separate plan that defines confirmation semantics, rollback/error
behavior, graph validation after mutation, and UI expectations.
