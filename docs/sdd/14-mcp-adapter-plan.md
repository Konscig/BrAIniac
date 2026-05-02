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
  and run them through MCP redaction helpers before returning content. The
  export tools return the redacted JSON snapshot inline with
  `redaction_report`, while `brainiac://.../export` URIs remain secondary
  stable resource links.
- VS Code integration starts as a server definition provider and relies on
  VS Code built-in MCP browsing, tool confirmation, logging, and auth prompts.
- Product VS Code auth uses a local polling browser bridge: the extension calls
  `POST /auth/vscode/start`, opens the frontend `/auth?vscode_state=...` URL,
  the frontend completes normal BrAIniac login and calls
  `POST /auth/vscode/complete`, then the extension polls
  `POST /auth/vscode/exchange` and stores the returned session in VS Code
  SecretStorage.
- OAuth/token lifecycle hardening keeps the local polling browser bridge as the
  browser handoff but upgrades the exchanged session to an OAuth-compatible
  token lifecycle. The implementation records the following local product
  contract before route coding:
  - local metadata endpoints: `GET /auth/oauth/authorization-server` and
    `GET /auth/oauth/protected-resource`;
  - refresh token endpoint: `POST /auth/oauth/token` with
    `grant_type=refresh_token`;
  - revoke endpoint: `POST /auth/oauth/revoke`;
  - redirect strategy: VS Code continues using the polling bridge state as the
    local redirect substitute; hosted redirect URI registration remains
    deferred;
  - PKCE decision: public-client PKCE remains the target for hosted OAuth, while
    this local bridge documents an equivalent single-use, high-entropy polling
    state and refresh-token lifecycle until VS Code can drive OAuth directly;
  - scopes: `mcp:read`, `mcp:execute`, `mcp:export`, and `mcp:dev-token`.
  Standard `/.well-known/oauth-authorization-server` and
  `/.well-known/oauth-protected-resource` discovery endpoints are not exposed
  in the local extension-managed flow because they make VS Code start Dynamic
  Client Registration, which BrAIniac does not support locally.

## Guardrails

- MCP handlers must verify existing owner-scoped auth before returning resource
  content.
- MCP must call existing application/core services where they exist instead of
  duplicating validation, execution, ownership, or route DTO behavior.
- Export snapshots must redact provider keys, credentials, token-like values,
  and raw dataset content markers by default.
- `start_pipeline_execution` is non-read-only and must remain confirmation
  appropriate for MCP clients.
- Manual access-token paste is not the product path. It may exist only as an
  explicit `BrAIniac: Use Dev Token` local-development fallback and must store
  the token in VS Code SecretStorage, never in workspace files or VS Code
  settings.
- The VS Code extension must not implement a second MCP server. It only
  registers the backend HTTP MCP server and manages setup/auth state.
- Refresh and revoke behavior must reuse the backend auth application layer.
  Access tokens used by MCP may carry MCP scopes, but MCP handlers still enforce
  existing owner-scoped auth after token validation.
- Browser frontend protected API calls that receive invalid/expired-token
  `401` responses must clear stale `brainiac.tokens` and move the user to
  re-authentication instead of repeating failed requests.

## Deferred Agent Authoring

Agent mutation tools are not part of this adapter slice. `create_agent_node`,
`update_agent_config`, `bind_tool_to_agent`, and related graph mutation helpers
require a separate plan that defines confirmation semantics, rollback/error
behavior, graph validation after mutation, and UI expectations.
