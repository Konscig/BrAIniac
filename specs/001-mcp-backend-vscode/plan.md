# Implementation Plan: MCP Access For BrAIniac

**Branch**: `001-mcp-backend-vscode` | **Date**: 2026-04-30 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-mcp-backend-vscode/spec.md`

## Summary

Evolve the VS Code MCP slice from a developer-only token prompt into a product
client flow: a BrAIniac VS Code extension registers the backend HTTP MCP server,
starts sign-in from VS Code, opens the BrAIniac login in an external browser,
stores the resulting credential in VS Code secret storage, and lets VS Code's
built-in MCP client use BrAIniac resources/tools on behalf of the signed-in
user. The backend remains the MCP server and source of truth; the extension is a
client-side setup/auth adapter, not a duplicate MCP implementation.

The desired long-term production shape is OAuth-compatible MCP authorization
where VS Code can drive the auth flow directly. Full OAuth metadata, Dynamic
Client Registration, refresh/revoke, and hosted SaaS hardening are explicitly
deferred from this slice. The next implementation slice uses a polling
browser-auth bridge: the extension starts an auth request, opens a BrAIniac
login URL, then exchanges a validated short-lived `state` for the existing
BrAIniac access token after browser login succeeds. Manual token entry remains
only an explicit developer fallback.

## Technical Context

**Language/Version**: TypeScript; backend uses existing `backend/package.json`
tooling (`typescript` 5.9.x, Node types 24.x); VS Code extension uses
TypeScript and VS Code extension APIs matching the contributed engine version.
**Primary Dependencies**: Existing Express/Prisma backend, official
`@modelcontextprotocol/sdk`, VS Code `vscode.lm.registerMcpServerDefinitionProvider`
API, VS Code `SecretStorage`, `vscode.env.openExternal`, and browser auth
polling/exchange plumbing. Full production auth should align with VS Code MCP
OAuth support in a later slice. Manual access-token input remains a dev fallback
only.
**Storage**: Backend continues using PostgreSQL/Prisma and existing artifact
filesystem state. Extension stores access/refresh credential material only in
VS Code SecretStorage. No token should be stored in workspace files or normal
settings.
**Testing**: Backend MCP/auth contract scripts, existing `test:auth`,
`test:ownership`, `test:contracts:freeze`, targeted MCP tests, VS Code
extension smoke tests for provider/auth state, and documented manual VS Code
MCP connection checks.
**Target Platform**: Local Docker Compose BrAIniac web app plus VS Code desktop
extension. Browser login targets the BrAIniac frontend/backend origin; MCP
endpoint remains the backend HTTP endpoint.
**Project Type**: Web application with backend MCP adapter and VS Code
extension/client setup layer.
**Performance Goals**: Sign-in should require one browser round trip and
complete within 30 seconds in local dev after the user submits credentials.
MCP server definition resolution should return immediately when a stored valid
credential exists. Failed or expired credentials should produce an actionable
re-auth prompt within 5 seconds.
**Constraints**: Do not implement a second MCP server in the extension. Do not
store tokens in `.vscode/mcp.json`, repository files, or plain settings. Do not
duplicate backend auth/ownership rules. Prefer route/state naming that can be
replaced by official VS Code/MCP OAuth behavior later; the local polling bridge
must be documented as temporary and compatible with a future OAuth replacement.
**Scale/Scope**: One authenticated BrAIniac account per VS Code profile for the
local/dev product slice. Multi-account account switching, hosted SaaS OAuth
hardening, and marketplace packaging are follow-up slices.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/14-mcp-adapter-plan.md`,
  `docs/sdd/09-backend-runtime-truth-snapshot.md`, existing backend auth routes
  under `backend/src/routes/resources/auth/`, MCP transport/auth code under
  `backend/src/mcp/`, and the VS Code extension scaffold under
  `vscode-extension/src/extension.ts`.
- **Technology stack**: Stays in the current TypeScript backend and VS Code
  extension shape. No new service boundary is introduced. Any OAuth helper
  dependency must be justified during implementation; the preferred first pass
  uses Express routes and VS Code APIs directly.
- **UX/adaptivity**: The user-facing flow becomes explicit: Sign in, connected,
  expired session, backend unavailable, sign out, and retry states. Manual token
  copy/paste is not the primary UX.
- **Simplicity**: Keep backend as MCP server and extension as auth/setup
  adapter. Avoid custom sidebars/webviews until VS Code built-in MCP surfaces
  prove insufficient.
- **Tests**: Required checks include backend auth polling bridge contract tests,
  extension smoke tests for provider/sign-in/sign-out paths, MCP auth/ownership
  tests, and a manual VS Code flow covering browser login, resource browsing,
  tool invocation, expired token, and backend unavailable states.

Post-design re-check: PASS. The design keeps MCP business behavior in the
backend, introduces no new service boundary, and replaces manual token handling
with a user-facing auth flow using existing BrAIniac identity.

## Project Structure

### Documentation (this feature)

```text
specs/001-mcp-backend-vscode/
|-- plan.md
|-- research.md
|-- data-model.md
|-- quickstart.md
|-- contracts/
|   |-- mcp-resources.md
|   |-- mcp-tools.md
|   `-- vscode-client.md
|-- checklists/
|   `-- requirements.md
`-- tasks.md
```

### Source Code (repository root)

```text
backend/
|-- src/
|   |-- index.ts
|   |-- mcp/
|   |   |-- mcp.auth.ts
|   |   |-- mcp.server.ts
|   |   `-- mcp.transport.ts
|   |-- routes/
|   |   `-- resources/
|   |       `-- auth/
|   |           |-- auth.routes.ts
|   |           `-- vscode-auth.routes.ts       # planned polling browser auth bridge
|   `-- services/
|       |-- application/
|       |   `-- auth/
|       `-- core/
|           `-- jwt.service.ts
`-- scripts/
    |-- mcp-auth-ownership-test.mjs
    `-- vscode-mcp-auth-flow-test.mjs          # planned polling auth bridge contract test

vscode-extension/
|-- package.json
|-- src/
|   |-- extension.ts
|   |-- auth.ts                                # planned sign-in/sign-out/secret storage
|   `-- mcpProvider.ts                         # planned server definition provider
|-- scripts/
|   `-- smoke-test.mjs
`-- README.md
```

**Structure Decision**: Keep the MCP server in `backend/src/mcp/`. Add only the
minimum backend auth bridge needed for polling browser sign-in, and split
extension auth from provider registration so token storage/re-auth behavior can
be tested without changing MCP tool/resource implementations.

## Complexity Tracking

No constitution violations are planned. The only added complexity is auth flow
state between VS Code, browser, and backend. It is justified because manual
token copy/paste is not acceptable for the product UX. The simpler manual-token
alternative remains as an explicit developer fallback, not the primary design.
