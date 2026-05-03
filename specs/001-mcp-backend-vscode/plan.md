# Implementation Plan: MCP Access For BrAIniac

**Branch**: `001-mcp-backend-vscode` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-mcp-backend-vscode/spec.md`

## Summary

Extend the completed MCP/export/auth hardening with two next planning slices.
First, move the browser frontend from access-token-only recovery to a safe web
refresh-token lifecycle using an HttpOnly, Secure, SameSite cookie and a
dedicated refresh endpoint. Second, add MCP authoring tools that allow an AI
agent to create projects, create pipelines, place nodes on the canvas, and
connect them with edges from a user's request.

The authoring tools are explicit write operations: they must be non-read-only,
confirmation-appropriate, owner-scoped, graph-validated, and clear about canvas
layout spacing so generated nodes do not stack on top of one another.

## Technical Context

**Language/Version**: TypeScript; backend uses existing `backend/package.json`
tooling (`typescript` 5.9.x, Node types 24.x). Frontend remains React/CRA with
the existing auth provider and API helper structure.
**Primary Dependencies**: Existing Express/Prisma backend, official
`@modelcontextprotocol/sdk`, existing MCP export resource builders in
`backend/src/mcp/resources/export.resources.ts`, export tools in
`backend/src/mcp/tools/export.tools.ts`, existing auth routes/services,
existing project/pipeline/node/edge application or data services, graph
validation services, redaction helpers, and existing script tests.
**Storage**: Add only server-side web refresh-session state if existing auth
services cannot already represent browser refresh rotation/revoke. Browser
refresh credentials are carried in HttpOnly cookies and must not be stored in
localStorage. MCP authoring writes existing PostgreSQL/Prisma project,
pipeline, node, edge, and `ui_json` state.
**Testing**: Add backend web refresh cookie contract tests for issue, refresh,
rotation/replay rejection, revoke/sign-out, cookie attributes, and no
JavaScript-readable refresh material. Add frontend auth-flow tests for one
failed protected request triggering refresh, retry, and fallback to `/auth`
when refresh fails. Add MCP authoring contract tests for create project,
create pipeline, create canvas-positioned nodes, connect edges, ownership,
graph validation, duplicate/cross-pipeline edge rejection, and layout spacing.
**Target Platform**: Local Docker Compose BrAIniac backend consumed by VS Code
desktop MCP surfaces and other MCP-compatible clients.
**Project Type**: Web application with backend MCP adapter and VS Code
extension/client setup layer.
**Performance Goals**: Expired web sessions should refresh and retry the
original protected request once without visible workspace disruption when the
refresh cookie is valid. MCP authoring tools should complete ordinary local
project/pipeline/node/edge creation within normal backend API latency and must
avoid layout algorithms that require expensive global graph layout.
**Constraints**: Do not remove export resources or `brainiac://.../export`
URIs. Do not expose secrets, credentials, provider keys, unauthorized resources,
or raw dataset content. Do not add a new transport, frontend framework, VS Code
webview, or new MCP/export client UI.
Do not make users open a resource URI to get the normal export JSON. Do not
expose standard OAuth discovery endpoints for local VS Code MCP unless DCR or a
tested compatible client-registration contract exists. Do not store browser
refresh tokens in localStorage/sessionStorage or any JavaScript-readable state.
Do not create hidden tool bindings, unsupported node types, duplicate edges,
cross-pipeline edges, or stacked canvas nodes.
**Scale/Scope**: Applies to the three existing export tools:
`export_project_snapshot`, `export_pipeline_snapshot`, and
`export_node_snapshot`, plus frontend/browser auth stale-token handling and the
local VS Code OAuth discovery guard. The new planning scope adds browser web
refresh cookies and MCP authoring tools for project, pipeline, node placement,
and edge creation. VS Code dev-token fallback remains unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/14-mcp-adapter-plan.md`, existing MCP
  export resources/tools under `backend/src/mcp/resources/export.resources.ts`
  and `backend/src/mcp/tools/export.tools.ts`, safe JSON/redaction serializers,
  and the current contracts under `specs/001-mcp-backend-vscode/contracts/`.
  Code currently returns resource links from export tools and JSON from export
  resources; the plan updates the tool contract to return JSON inline.
- **Technology stack**: Stays within the existing TypeScript backend, React
  frontend, and MCP SDK. No new framework, UI kit, queue, service boundary, or
  VS Code webview is introduced. A minimal refresh-session persistence addition
  is acceptable only if existing auth state cannot support cookie-backed
  rotation/revoke safely.
- **UX/adaptivity**: Export commands must produce immediately visible JSON in
  VS Code/MCP tool results. Resource URIs remain supplemental links, not the
  primary answer. Redaction remains explicit in the same response. Expired web
  sessions should refresh without user disruption when safe, otherwise surface
  clear auth states. MCP-created nodes must open in the existing canvas with
  readable non-overlapping spacing.
- **Simplicity**: Reuse existing auth, project, pipeline, node, edge, ownership,
  validation, snapshot, and redaction helpers. Add small route/tool adapters
  rather than a second graph builder, layout engine, auth service, or custom UI.
- **Tests**: Required checks are backend build, MCP export redaction contract
  test, MCP auth/ownership test, frontend auth/session tests for protected API
  401 handling, web refresh cookie tests, MCP authoring contract tests, an auth
  discovery guard test, and manual checks that export output is inline, no
  Dynamic Client Registration prompt appears, browser refresh works after idle,
  and MCP-created nodes are visibly spaced on the canvas.

Post-design re-check: PASS. The plan keeps business logic in existing backend
and frontend layers, adds refresh cookies without exposing browser refresh
material to JavaScript, and makes MCP authoring explicit, validated, and
confirmation-appropriate.

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
|   |-- mcp/
|   |   |-- resources/
|   |   |   `-- export.resources.ts      # existing snapshot builders/resources
|   |   |-- tools/
|   |   |   |-- export.tools.ts          # inline JSON tool response
|   |   |   `-- authoring.tools.ts       # planned project/pipeline/node/edge tools
|   |   `-- mcp.transport.ts            # auth errors stay explicit for clients
|   |-- routes/
|   |   `-- resources/
|   |       `-- auth/
|   |           |-- oauth.routes.ts      # local metadata only, no incompatible well-known DCR
|   |           `-- web-session.routes.ts # planned HttpOnly refresh cookie lifecycle
|   |   `-- serializers/
|   |       |-- mcp-safe-json.ts
|   |       `-- mcp-redaction.ts
`-- scripts/
    |-- mcp-export-redaction-test.mjs
    |-- mcp-auth-ownership-test.mjs
    |-- mcp-authoring-contract-test.mjs # planned mutating tool contract
    |-- web-session-refresh-test.mjs    # planned cookie refresh contract
    `-- vscode-oauth-token-lifecycle-test.mjs

frontend/
|-- src/
|   |-- lib/
|   |   `-- api.ts                      # planned refresh-and-retry protected calls
|   |-- providers/
|   |   `-- AuthProvider.tsx            # planned web refresh/session state
|   `-- App.test.tsx                    # planned frontend auth lifecycle tests

vscode-extension/
|-- README.md                           # document expected export UX if needed
`-- scripts/
    `-- smoke-test.mjs                  # update only if static docs checks need it
```

**Structure Decision**: Keep snapshot assembly in `export.resources.ts`; have
`export.tools.ts` call the same builders and return the redacted snapshot inline
alongside the existing resource URI. Add MCP authoring tools in a separate
`authoring.tools.ts` module that delegates to existing project, pipeline, node,
edge, ownership, and validation services. Add browser refresh routes beside the
existing auth routes, with refresh material stored only as HttpOnly cookies and
server-side session state. Canvas placement remains normal node `ui_json`
metadata; do not introduce a separate layout engine.

## Complexity Tracking

No constitution violations are planned.
