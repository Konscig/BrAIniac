# Implementation Plan: MCP Access For BrAIniac

**Branch**: `001-mcp-backend-vscode` | **Date**: 2026-04-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-mcp-backend-vscode/spec.md`

## Summary

Implement BrAIniac MCP as a thin backend adapter layer over the existing
authenticated application/API contracts. The first implementation slice is
read-only: discover projects, pipelines, nodes, tool catalog entries, agent/tool
relationships, validation summaries, execution snapshots, and project,
pipeline, and node export snapshots.
Later slices can add execution tools and then agent-creation/editing tools, but
only by reusing the same backend services and route contracts already used by
the web API.

## Technical Context

**Language/Version**: TypeScript, backend compiler/tooling from `backend/package.json` (`typescript` 5.9.x, Node types 24.x), VS Code extension TypeScript tooling to be added only for the extension slice
**Primary Dependencies**: Existing backend Express/Prisma services plus the official MCP TypeScript SDK. Default implementation target is the stable `@modelcontextprotocol/sdk` package with `zod` schemas; if the official v2 split packages are stable at implementation time, document the package switch before coding. Use SDK server/resources/tools APIs and Streamable HTTP transport. VS Code slice uses VS Code MCP server definition provider APIs.
**Storage**: Existing PostgreSQL via Prisma and existing executor/artifact filesystem state. MCP adds no persistent business storage in the MVP.
**Testing**: Backend MCP contract/smoke scripts, existing `test:auth`, `test:ownership`, `test:contracts:freeze`, `test:executor:*`, targeted RAG/execution tests when non-read-only tools are enabled, and VS Code extension smoke/manual checks for the extension slice.
**Target Platform**: Local Docker Compose web app; backend exposes MCP endpoint alongside existing Express API. VS Code connects to the backend MCP endpoint.
**Project Type**: Web application with backend adapter and later VS Code extension/client.
**Performance Goals**: Read-only resource listing for seeded projects should complete in under 2 seconds locally; individual pipeline/node resources should resolve in under 1 second; large exports should return resource links or bounded summaries rather than embedding unbounded payloads. These targets must be covered by a lightweight MCP smoke/performance check.
**Constraints**: MCP MUST NOT duplicate graph validation, executor, auth, ownership, agent runtime, or export business logic. MCP tools/resources call existing application services or route-equivalent service facades. First slice is read-only; write/create-agent tools are deferred until read-only contracts are stable.
**Scale/Scope**: One authenticated user's BrAIniac workspace at a time. MVP covers local/dev trusted usage and owner-scoped resources, not multi-tenant public hosting hardening.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **SDD/code truth**: Reviewed `docs/sdd/02-graph-constitution.md`,
  `05-preflight-contract.md`, `09-backend-runtime-truth-snapshot.md`,
  `11-backend-contract-freeze.md`, `12-frontend-rag-alignment.md`, and
  `13-real-issues-fix-list.md`; reviewed existing backend route/service shape
  under `backend/src/routes/resources/*`, `backend/src/services/application/*`,
  `backend/src/services/core/ownership.service.ts`, and
  `backend/src/services/core/graph_validation.service.ts`.
- **Technology stack**: Stays in the existing TypeScript/Express backend. Adds
  the official MCP TypeScript SDK as the only new backend integration dependency
  needed for protocol compliance. VS Code extension tooling is deferred to its
  own slice.
- **UX/adaptivity**: MCP resources/tools expose explicit diagnostic states,
  permission errors, validation failures, provider failures, and unsupported
  node states. VS Code integration uses built-in MCP resource/tool surfaces
  first; no custom UI surface is planned for MVP.
- **Simplicity**: MCP is an adapter over existing application services and API
  contracts. No new graph model, executor, auth model, agent runtime, or hidden
  dataset behavior is introduced.
- **Tests**: MVP requires MCP contract tests for resource/tool schemas,
  authorization/ownership tests, read-only smoke tests, export redaction tests,
  and regression coverage with existing backend freeze/executor tests.

Post-design re-check: PASS. The contracts below keep MCP as a bounded adapter,
phase write/create-agent tools after read-only stability, and avoid any
constitution violation requiring a complexity exception.

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
`-- checklists/
    `-- requirements.md
```

### Source Code (repository root)

```text
backend/
|-- package.json
|-- src/
|   |-- index.ts
|   |-- mcp/
|   |   |-- mcp.server.ts
|   |   |-- mcp.transport.ts
|   |   |-- mcp.auth.ts
|   |   |-- resources/
|   |   |   |-- project.resources.ts
|   |   |   |-- pipeline.resources.ts
|   |   |   |-- node.resources.ts
|   |   |   |-- tool.resources.ts
|   |   |   |-- agent.resources.ts
|   |   |   `-- export.resources.ts
|   |   |-- tools/
|   |   |   |-- readonly.tools.ts
|   |   |   |-- pipeline.tools.ts
|   |   |   |-- export.tools.ts
|   |   |   `-- agent-authoring.tools.ts
|   |   `-- serializers/
|   |       |-- mcp-resource-uri.ts
|   |       |-- mcp-safe-json.ts
|   |       `-- mcp-redaction.ts
|   |-- routes/
|   `-- services/
`-- scripts/
    |-- mcp-readonly-contract-test.mjs
    |-- mcp-auth-ownership-test.mjs
    |-- mcp-performance-smoke-test.mjs
    `-- mcp-export-redaction-test.mjs

vscode-extension/             # Deferred until backend MCP read-only slice passes
|-- package.json
|-- src/
|   `-- extension.ts
`-- README.md
```

**Structure Decision**: Add a `backend/src/mcp/` adapter module and backend
MCP test scripts. Keep business logic in existing `services/application`,
`services/core`, and route DTO helpers. Add `vscode-extension/` only when the
backend MCP endpoint is stable enough to connect from VS Code.

## Complexity Tracking

No constitution violations are planned. The new MCP SDK dependency
(`@modelcontextprotocol/sdk` plus schema validation with `zod`, unless the
official stable docs require the v2 split packages at implementation time) is
justified because MCP protocol compliance, resource/tool registration, transport
handling, and VS Code compatibility should come from the official SDK rather
than a custom protocol implementation.
