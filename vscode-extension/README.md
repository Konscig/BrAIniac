# BrAIniac MCP VS Code Extension

This extension registers the existing BrAIniac backend MCP endpoint with VS
Code's built-in MCP surfaces. It does not add custom views or mutate BrAIniac
state by itself.

## Setup

1. Start the BrAIniac backend with MCP enabled.
2. Confirm the MCP endpoint is reachable, for example `http://localhost:8080/mcp`.
3. Install or run the extension in VS Code.
4. When prompted, enter the backend MCP URL and an existing BrAIniac access token.

The default backend URL is `http://localhost:8080/mcp`. You can set
`brainiacMcp.backendUrl` and `brainiacMcp.accessToken` in VS Code settings to
avoid repeated prompts during local testing.

## Smoke Notes

- Resource browsing should list projects, pipelines, graph, validation, nodes,
  tools, agents, and export resources.
- `list_projects` should run without confirmation.
- `validate_pipeline` should return validation diagnostics for the selected
  pipeline.
- `export_project_snapshot`, `export_pipeline_snapshot`, and
  `export_node_snapshot` should return redacted export resource links.
- `start_pipeline_execution` should require explicit confirmation from VS Code.

## Troubleshooting States

- Connected: resources and tools appear in VS Code's MCP surface.
- Disconnected: verify the backend process is running and the endpoint URL is correct.
- Authentication required: provide an existing BrAIniac access token.
- Authentication failed: refresh the token through the BrAIniac auth flow.
- Backend unavailable: verify Docker/database/backend health before reconnecting.
- Tool failed: inspect the MCP tool result diagnostics for validation,
  permission, provider, or runtime details.
