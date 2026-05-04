# Implementation Plan: MCP Access For BrAIniac

**Branch**: `001-mcp-backend-vscode` | **Date**: 2026-05-04 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-mcp-backend-vscode/spec.md`

## Summary

Extend the completed MCP/export/auth hardening with three next planning slices.
First, move the browser frontend from access-token-only recovery to a safe web
refresh-token lifecycle using an HttpOnly, Secure, SameSite cookie and a
dedicated refresh endpoint. Second, add MCP authoring tools that allow an AI
agent to create projects, create pipelines, place nodes on the canvas, and
connect them with edges from a user's request. Third, plan the next
BrAIniac-domain tool slice that gives agents enough catalog, graph, validation,
edit, delete, search, binding, and layout tools to repair and refine generated
pipelines without relying on hidden database ids.

The authoring tools are explicit write operations: they must be non-read-only,
confirmation-appropriate, owner-scoped, graph-validated, and clear about canvas
layout spacing so generated nodes do not stack on top of one another. The
follow-up domain tools stay small and explicit: read-only discovery for node
types, graph/edges, search, and agent bindings; mutating edit/delete tools
require confirmation, ownership checks, and graph validation.

## Technical Context

**Language/Version**: TypeScript; backend uses existing `backend/package.json`
tooling (`typescript` 5.9.x, Node types 24.x). Frontend remains React/CRA with
the existing auth provider and API helper structure.
**Primary Dependencies**: Existing Express/Prisma backend, official
`@modelcontextprotocol/sdk`, existing MCP export resource builders in
`backend/src/mcp/resources/export.resources.ts`, export tools in
`backend/src/mcp/tools/export.tools.ts`, existing auth routes/services,
existing project/pipeline/node/edge application or data services, graph
validation services, redaction helpers, and existing script tests. The follow-up
MCP domain tools reuse existing node type, tool, node, edge, pipeline graph,
agent tool discovery, and validation services.
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
Add follow-up MCP domain contract tests for node-type discovery, graph/edge
inspection, config validation, node update/delete, edge delete, search results,
agent tool binding inspection, ownership, annotations, and auto-layout dry-run
or apply behavior where implemented.
**Target Platform**: Local Docker Compose BrAIniac backend consumed by VS Code
desktop MCP surfaces and other MCP-compatible clients.
**Project Type**: Web application with backend MCP adapter and VS Code
extension/client setup layer.
**Performance Goals**: Expired web sessions should refresh and retry the
original protected request once without visible workspace disruption when the
refresh cookie is valid. MCP authoring and follow-up domain tools should
complete ordinary local project/pipeline/node/edge reads and mutations within
normal backend API latency and must avoid expensive global graph layout.
**Constraints**: Do not remove export resources or `brainiac://.../export`
URIs. Do not expose secrets, credentials, provider keys, unauthorized resources,
or raw dataset content. Do not add a new transport, frontend framework, VS Code
webview, or new MCP/export client UI. Do not make users open a resource URI to
get the normal export JSON. Do not expose standard OAuth discovery endpoints
for local VS Code MCP unless DCR or a tested compatible client-registration
contract exists. Do not store browser refresh tokens in
localStorage/sessionStorage or any JavaScript-readable state. Do not create
hidden tool bindings, unsupported node types, duplicate edges, cross-pipeline
edges, or stacked canvas nodes. Do not let update/delete/layout tools bypass
graph validation, delete cross-owned resources, silently remove unrelated graph
state, or expose unsupported node types as creatable.
**Scale/Scope**: Applies to the three existing export tools:
`export_project_snapshot`, `export_pipeline_snapshot`, and
`export_node_snapshot`, plus frontend/browser auth stale-token handling and the
local VS Code OAuth discovery guard. The new planning scope adds browser web
refresh cookies, MCP authoring tools for project, pipeline, node placement, and
edge creation, plus the next MCP domain tools for node-type discovery,
graph/edge reads, config validation, node/edge edits/deletes, catalog search,
agent binding inspection, and pipeline auto-layout. VS Code dev-token fallback
remains unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/14-mcp-adapter-plan.md`, existing MCP
  export resources/tools under `backend/src/mcp/resources/export.resources.ts`
  and `backend/src/mcp/tools/export.tools.ts`, safe JSON/redaction serializers,
  current contracts under `specs/001-mcp-backend-vscode/contracts/`, and the
  existing node type/tool/node/edge services referenced by MCP authoring. Code
  remains the source of truth for runtime-backed node/tool support.
- **Technology stack**: Stays within the existing TypeScript backend, React
  frontend, and MCP SDK. No new framework, UI kit, queue, service boundary, or
  VS Code webview is introduced. A minimal refresh-session persistence addition
  is acceptable only if existing auth state cannot support cookie-backed
  rotation/revoke safely.
- **UX/adaptivity**: Export commands must produce immediately visible JSON in
  VS Code/MCP tool results. Resource URIs remain supplemental links, not the
  primary answer. Expired web sessions should refresh without disruption when
  safe, otherwise surface clear auth states. MCP-created nodes must open in the
  existing canvas with readable non-overlapping spacing. Follow-up domain tools
  must make node type ids, config requirements, graph edges, and agent tool
  bindings visible before mutation so agents can avoid guessing.
- **Simplicity**: Reuse existing auth, project, pipeline, node, edge, ownership,
  validation, snapshot, redaction, node type, tool catalog, and agent binding
  helpers. Add small route/tool adapters rather than a second graph builder,
  layout engine, auth service, or custom UI. Auto-layout, if implemented,
  remains a bounded backend placement helper over existing `ui_json`.
- **Tests**: Required checks are backend build, MCP export redaction contract
  test, MCP auth/ownership test, frontend auth/session tests for protected API
  401 handling, web refresh cookie tests, MCP authoring contract tests, an auth
  discovery guard test, and manual checks that export output is inline, no
  Dynamic Client Registration prompt appears, browser refresh works after idle,
  and MCP-created nodes are visibly spaced on the canvas. Follow-up checks cover
  node-type discovery, graph/edge inspection, safe node config preflight,
  update/delete ownership, validation after mutation, and layout dry-run/apply
  behavior.

Post-design re-check: PASS. The plan keeps business logic in existing backend
and frontend layers, adds refresh cookies without exposing browser refresh
material to JavaScript, makes MCP authoring explicit, validated, and
confirmation-appropriate, and exposes existing BrAIniac catalogs and graph
services rather than inventing a parallel authoring model.

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
|   |   |   |-- export.resources.ts
|   |   |   `-- node-type.resources.ts   # planned node type catalog resources
|   |   |-- tools/
|   |   |   |-- export.tools.ts
|   |   |   |-- authoring.tools.ts
|   |   |   `-- domain-discovery.tools.ts # planned node types, graph, search, binding tools
|   |   `-- mcp.transport.ts
|   |-- routes/
|   |   `-- resources/
|   |       `-- auth/
|   |           |-- oauth.routes.ts
|   |           `-- web-session.routes.ts
|   `-- serializers/
|       |-- mcp-safe-json.ts
|       `-- mcp-redaction.ts
`-- scripts/
    |-- mcp-export-redaction-test.mjs
    |-- mcp-auth-ownership-test.mjs
    |-- mcp-authoring-contract-test.mjs
    |-- mcp-domain-tools-contract-test.mjs # planned follow-up domain tool checks
    |-- web-session-refresh-test.mjs
    `-- vscode-oauth-token-lifecycle-test.mjs

frontend/
|-- src/
|   |-- lib/
|   |   `-- api.ts
|   |-- providers/
|   |   `-- AuthProvider.tsx
|   `-- App.test.tsx

vscode-extension/
|-- README.md
`-- scripts/
    `-- smoke-test.mjs
```

**Structure Decision**: Keep snapshot assembly in `export.resources.ts`; have
`export.tools.ts` call the same builders and return the redacted snapshot inline
alongside the existing resource URI. Add MCP authoring tools in a separate
`authoring.tools.ts` module that delegates to existing project, pipeline, node,
edge, ownership, and validation services. Add the follow-up domain
discovery/edit tools as small adapters over existing node type, tool catalog,
graph, node, edge, and agent binding services. Add browser refresh routes beside
the existing auth routes, with refresh material stored only as HttpOnly cookies
and server-side session state. Canvas placement remains normal node `ui_json`
metadata; `auto_layout_pipeline` stays bounded to deterministic `ui_json`
position updates or dry-run suggestions.

## Complexity Tracking

No constitution violations are planned.
