# Implementation Plan: MCP Access For BrAIniac

**Branch**: `001-mcp-backend-vscode` | **Date**: 2026-05-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-mcp-backend-vscode/spec.md`

## Summary

Refine the MCP export UX so project, pipeline, and node snapshot tools return
the redacted JSON snapshot inline in the tool result instead of forcing users to
open a `brainiac://.../export` resource URI. Export resources remain available
as secondary stable links for clients that prefer resource reads, but the
primary user-facing tool output must be immediately useful in VS Code chat and
other MCP clients.

This is a contract and UX correction over the existing MCP adapter. It does not
change export ownership, redaction, or graph validation. A separate auth UX
hardening slice is also required for two observed issues: VS Code should not
show a Dynamic Client Registration prompt during local extension-managed auth,
and the browser frontend should not keep using expired access tokens after
inactivity.

## Technical Context

**Language/Version**: TypeScript; backend uses existing `backend/package.json`
tooling (`typescript` 5.9.x, Node types 24.x). VS Code extension code is not
expected to change for this planning slice.
**Primary Dependencies**: Existing Express/Prisma backend, official
`@modelcontextprotocol/sdk`, existing MCP export resource builders in
`backend/src/mcp/resources/export.resources.ts`, export tools in
`backend/src/mcp/tools/export.tools.ts`, redaction helpers, and existing script
tests.
**Storage**: No new storage. Export snapshots are generated from existing
PostgreSQL/Prisma-backed project/pipeline/node state and existing filesystem
artifact references where already exposed by runtime services.
**Testing**: Extend backend MCP export contract coverage so export tools assert
inline `snapshot` JSON, `redaction_report`, retained `export_resource_uri`, and
secret redaction. Run `npm --prefix backend run build`,
`npm --prefix backend run test:mcp:export`, `npm --prefix backend run
test:mcp:auth`, and targeted VS Code extension smoke. Add frontend auth
lifecycle tests for protected API `401 invalid token` handling and an MCP/VS
Code auth metadata guard test that prevents standard `.well-known` discovery
from triggering unsupported Dynamic Client Registration in the local flow.
**Target Platform**: Local Docker Compose BrAIniac backend consumed by VS Code
desktop MCP surfaces and other MCP-compatible clients.
**Project Type**: Web application with backend MCP adapter and VS Code
extension/client setup layer.
**Performance Goals**: Export tool response should remain usable for ordinary
local project/pipeline/node snapshots. Large exports may include a bounded
`snapshot_preview` plus `export_resource_uri` only if payload size exceeds a
documented threshold, but seeded/local normal exports must return full inline
JSON. Expired web sessions must recover or redirect within one failed protected
API call, not continue with repeated stale-token requests.
**Constraints**: Do not remove export resources or `brainiac://.../export`
URIs. Do not expose secrets, credentials, provider keys, unauthorized resources,
or raw dataset content. Do not add a new transport, storage layer, or new
MCP/export client UI.
Do not make users open a resource URI to get the normal export JSON. Do not
expose standard OAuth discovery endpoints for local VS Code MCP unless DCR or a
tested compatible client-registration contract exists.
**Scale/Scope**: Applies to the three existing export tools:
`export_project_snapshot`, `export_pipeline_snapshot`, and
`export_node_snapshot`, plus frontend/browser auth stale-token handling and the
local VS Code OAuth discovery guard. Existing read-only resources,
validation/execution tools, and dev-token fallback remain unchanged.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/14-mcp-adapter-plan.md`, existing MCP
  export resources/tools under `backend/src/mcp/resources/export.resources.ts`
  and `backend/src/mcp/tools/export.tools.ts`, safe JSON/redaction serializers,
  and the current contracts under `specs/001-mcp-backend-vscode/contracts/`.
  Code currently returns resource links from export tools and JSON from export
  resources; the plan updates the tool contract to return JSON inline.
- **Technology stack**: Stays within the existing TypeScript backend and MCP
  SDK. No dependency, service boundary, database table, frontend framework, or
  VS Code webview is introduced.
- **UX/adaptivity**: Export commands must produce immediately visible JSON in
  VS Code/MCP tool results. Resource URIs remain supplemental links, not the
  primary answer. Redaction remains explicit in the same response. Expired web
  sessions and unsupported VS Code OAuth/DCR discovery must surface as clear
  auth states rather than confusing modal prompts or repeated console errors.
- **Simplicity**: Reuse the existing snapshot builders and redaction helpers;
  change only tool response shaping and tests. No duplicate export assembler or
  second export route is planned.
- **Tests**: Required checks are backend build, MCP export redaction contract
  test, MCP auth/ownership test, frontend auth/session tests for protected API
  401 handling, an auth discovery guard test, and quick manual VS Code check
  that an export tool result contains JSON without opening `brainiac://...` and
  that no Dynamic Client Registration prompt appears.

Post-design re-check: PASS. The plan narrows a UX defect in existing MCP export
tool output, keeps business logic in the backend adapter, and requires contract
tests before implementation.

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
|   |   |   `-- export.tools.ts          # planned inline JSON tool response
|   |   `-- mcp.transport.ts            # auth errors stay explicit for clients
|   |-- routes/
|   |   `-- resources/
|   |       `-- auth/
|   |           `-- oauth.routes.ts      # local metadata only, no incompatible well-known DCR
|   |   `-- serializers/
|   |       |-- mcp-safe-json.ts
|   |       `-- mcp-redaction.ts
`-- scripts/
    |-- mcp-export-redaction-test.mjs   # extend for inline snapshot contract
    |-- mcp-auth-ownership-test.mjs
    `-- vscode-oauth-token-lifecycle-test.mjs

frontend/
|-- src/
|   |-- lib/
|   |   `-- api.ts                      # planned stale-token/401 handling
|   |-- providers/
|   |   `-- AuthProvider.tsx            # planned session clearing/refresh state
|   `-- App.test.tsx                    # planned frontend auth lifecycle tests

vscode-extension/
|-- README.md                           # document expected export UX if needed
`-- scripts/
    `-- smoke-test.mjs                  # update only if static docs checks need it
```

**Structure Decision**: Keep snapshot assembly in `export.resources.ts`; have
`export.tools.ts` call the same builders and return the redacted snapshot inline
alongside the existing resource URI. This avoids drift between tool output and
resource reads.

## Complexity Tracking

No constitution violations are planned.
