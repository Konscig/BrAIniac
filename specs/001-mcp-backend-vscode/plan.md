# Implementation Plan: MCP Access For BrAIniac

**Branch**: `001-mcp-backend-vscode` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-mcp-backend-vscode/spec.md`

## Summary

Evolve the VS Code MCP slice from a developer-only token prompt into a product
client flow: a BrAIniac VS Code extension registers the backend HTTP MCP server,
starts sign-in from VS Code, opens the BrAIniac login in an external browser,
stores the resulting credential in VS Code secret storage, and lets VS Code's
built-in MCP client use BrAIniac resources/tools on behalf of the signed-in
user. The backend remains the MCP server and source of truth; the extension is a
client-side setup/auth adapter, not a duplicate MCP implementation.

The current polling browser-auth bridge is accepted only as a transitional local
slice. The next implementation work must fix the observed token refresh problem
and either verify that the auth flow already satisfies the MCP/VS Code OAuth
2.1 expectations or migrate it to an OAuth 2.1-compatible authorization-code
with PKCE flow. That migration includes token refresh, revocation/sign-out,
protected resource/authorization metadata, and scoped authorization for MCP
resources/tools. Manual token entry remains only an explicit developer fallback.

## Technical Context

**Language/Version**: TypeScript; backend uses existing `backend/package.json`
tooling (`typescript` 5.9.x, Node types 24.x); VS Code extension uses
TypeScript and VS Code extension APIs matching the contributed engine version.
**Primary Dependencies**: Existing Express/Prisma backend, official
`@modelcontextprotocol/sdk`, VS Code `vscode.lm.registerMcpServerDefinitionProvider`
API, VS Code `SecretStorage`, `vscode.env.openExternal`, BrAIniac frontend
login state propagation, browser auth polling/exchange plumbing, and the
backend auth/JWT services. OAuth 2.1 work should prefer existing Express routes
and auth services first; any OAuth helper dependency must be justified by the
implementation task that introduces it.
**Storage**: Backend continues using PostgreSQL/Prisma and existing artifact
filesystem state. Extension stores access/refresh credential material only in
VS Code SecretStorage. No token should be stored in workspace files, logs, or
normal settings.
**Testing**: Backend MCP/auth contract scripts, existing `test:auth`,
`test:ownership`, `test:contracts:freeze`, targeted MCP tests, VS Code
extension smoke tests for provider/auth state, OAuth 2.1/token lifecycle
contract checks, documented manual VS Code MCP connection checks, and renewed
narrow-layout checks for refresh/revoke/re-auth states.
**Target Platform**: Local Docker Compose BrAIniac web app plus VS Code desktop
extension. Browser login targets the BrAIniac frontend/backend origin; MCP
endpoint remains the backend HTTP endpoint.
**Project Type**: Web application with backend MCP adapter and VS Code
extension/client setup layer.
**Performance Goals**: Sign-in should require one browser round trip and
complete within 30 seconds in local dev after the user submits credentials.
MCP server definition resolution should return immediately when a stored valid
credential exists. Expired access tokens should refresh before user-visible
failure when a valid refresh credential exists; failed refresh should produce an
actionable re-auth prompt within 5 seconds.
**Constraints**: Do not implement a second MCP server in the extension. Do not
store tokens in `.vscode/mcp.json`, repository files, logs, or plain settings.
Do not duplicate backend auth/ownership rules. OAuth 2.1 migration must preserve
existing BrAIniac web login behavior, use PKCE for public clients, support
refresh/revoke semantics, and keep manual token entry dev-only.
**Scale/Scope**: One authenticated BrAIniac account per VS Code profile for the
local/dev product slice. Multi-account account switching, marketplace packaging,
and hosted SaaS hardening remain follow-up slices after OAuth/token lifecycle
behavior is correct locally.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/14-mcp-adapter-plan.md`,
  `docs/sdd/09-backend-runtime-truth-snapshot.md`, existing backend auth routes
  under `backend/src/routes/resources/auth/`, MCP transport/auth code under
  `backend/src/mcp/`, and the VS Code extension auth/provider files under
  `vscode-extension/src/`.
- **Technology stack**: Stays in the current TypeScript backend and VS Code
  extension shape. No new service boundary is introduced. OAuth 2.1 should be
  implemented through existing Express/auth services unless a narrowly scoped
  helper dependency is justified.
- **UX/adaptivity**: The user-facing flow remains explicit: sign in, connected,
  token refreshed, expired session, refresh failed, backend unavailable, sign
  out, and retry states. Manual token copy/paste is not the primary UX.
- **Simplicity**: Keep backend as MCP server and extension as auth/setup
  adapter. The OAuth/token lifecycle change is limited to auth routes/services,
  frontend login completion, extension session handling, and MCP auth metadata.
- **Tests**: Required checks include backend auth polling bridge contract tests,
  OAuth 2.1 metadata/PKCE/refresh/revoke contract tests, extension smoke tests
  for provider/sign-in/refresh/sign-out paths, MCP auth/ownership tests,
  `test:contracts:freeze` or an explicitly documented equivalent OAuth contract
  gate, and a manual VS Code flow covering browser login, resource browsing,
  tool invocation, token refresh, expired refresh, sign-out, narrow-layout
  feedback, and backend unavailable states.

Post-design re-check: PASS. The design keeps MCP business behavior in the
backend, introduces no new service boundary, and upgrades manual/polling token
handling toward OAuth 2.1-compatible authorization with explicit token lifecycle
coverage.

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
|   |           |-- vscode-auth.routes.ts
|   |           `-- oauth.routes.ts             # planned OAuth 2.1 metadata/token/revoke surface if absent
|   `-- services/
|       |-- application/
|       |   `-- auth/
|       |       |-- vscode-auth.application.service.ts
|       |       `-- oauth-token.application.service.ts
|       `-- core/
|           `-- jwt.service.ts
`-- scripts/
    |-- mcp-auth-ownership-test.mjs
    |-- vscode-mcp-auth-flow-test.mjs
    `-- vscode-oauth-token-lifecycle-test.mjs # planned OAuth/token lifecycle contract test

frontend/
|-- src/
|   |-- App.tsx
|   |-- pages/
|   |   `-- auth-page.tsx
|   `-- lib/
|       `-- api.ts

vscode-extension/
|-- package.json
|-- src/
|   |-- extension.ts
|   |-- auth.ts
|   `-- mcpProvider.ts
|-- scripts/
|   `-- smoke-test.mjs
`-- README.md
```

**Structure Decision**: Keep the MCP server in `backend/src/mcp/`. Auth changes
belong in the existing backend auth service/route layer and the existing VS Code
extension auth/session layer. OAuth 2.1 metadata and refresh/revoke endpoints
are added only if the current implementation lacks equivalent behavior.

## Complexity Tracking

No constitution violations are planned. The added complexity is token lifecycle
state across VS Code, browser, and backend. It is justified because access-token
only polling currently fails once the token expires, and MCP/VS Code product
auth expects OAuth-compatible browser authorization, refresh, and revocation
instead of repeated manual token entry.
