# BrAIniac MCP VS Code Extension

This extension registers the existing BrAIniac backend MCP endpoint with VS
Code's built-in MCP surfaces. It does not add custom views or mutate BrAIniac
state by itself.

## Setup

1. Start the BrAIniac backend with MCP enabled.
2. Confirm the MCP endpoint is reachable, for example `http://localhost:8080/mcp`.
3. Install or run the extension in VS Code.
4. Run `BrAIniac: Sign in`.
5. Complete BrAIniac login in the external browser.
6. Return to VS Code and connect the `BrAIniac MCP` server.

The default backend URL is `http://localhost:8080/mcp`. You can set
`brainiacMcp.backendUrl` in VS Code settings. Access tokens are stored only in
VS Code SecretStorage.

## Commands

- `BrAIniac: Sign in`: starts browser sign-in, opens BrAIniac `/auth` with a
  VS Code auth state, polls the backend, and stores the returned session in
  SecretStorage.
- `BrAIniac: Sign out`: deletes the stored SecretStorage session and refreshes
  MCP server definitions.
- `BrAIniac: Reconnect MCP`: refreshes MCP server definitions after backend URL
  or auth state changes.
- `BrAIniac: Use Dev Token`: explicit local-development fallback for pasting an
  existing BrAIniac access token into SecretStorage. It is not the default setup
  path.

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
- Authentication required: run `BrAIniac: Sign in`.
- Authentication failed: retry browser sign-in; use `BrAIniac: Use Dev Token`
  only as a local debugging fallback.
- Backend unavailable: verify Docker/database/backend health before reconnecting.
- Sign-in timed out: finish browser login within the local polling window, then
  run `BrAIniac: Sign in` again.
- Token expired; sign in again: run `BrAIniac: Sign in` to replace the stored
  SecretStorage session.
- Tool failed: inspect the MCP tool result diagnostics for validation,
  permission, provider, or runtime details.
