# Tasks: MCP Access For BrAIniac

**Input**: Design documents from `specs/001-mcp-backend-vscode/`
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`

**Tests**: Required by BrAIniac Constitution and this feature plan. Write the
smallest reliable backend scripts and VS Code checks that prove each story.

**Organization**: Tasks are grouped by user story so read-only MCP can ship as
the MVP before operation tools, export, and VS Code integration.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it touches different files and does not depend on unfinished tasks.
- **[Story]**: User story label from `spec.md`.
- Every task includes concrete file paths.

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Add MCP dependency and file structure without changing business behavior.

- [X] T001 Add `@modelcontextprotocol/sdk` and `zod` dependencies plus `test:mcp:readonly`, `test:mcp:auth`, `test:mcp:perf`, and `test:mcp:export` scripts in `backend/package.json`
- [X] T002 [P] Create MCP adapter directories `backend/src/mcp/resources/`, `backend/src/mcp/tools/`, and `backend/src/mcp/serializers/`
- [X] T003 [P] Create empty backend MCP test script placeholders in `backend/scripts/mcp-readonly-contract-test.mjs`, `backend/scripts/mcp-auth-ownership-test.mjs`, `backend/scripts/mcp-performance-smoke-test.mjs`, and `backend/scripts/mcp-export-redaction-test.mjs`
- [X] T004 Add MCP environment defaults and comments for `MCP_ENABLED` and `MCP_PATH` in `.env.example` and `.env.docker`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Build the thin adapter foundation that all MCP resources/tools use.

**CRITICAL**: No user story work should begin until this phase is complete.

- [X] T005 Implement BrAIniac MCP URI helpers for `brainiac://` resource templates in `backend/src/mcp/serializers/mcp-resource-uri.ts`
- [X] T006 Implement safe JSON response helpers with bounded text payloads in `backend/src/mcp/serializers/mcp-safe-json.ts`
- [X] T007 Implement secret redaction helpers for provider keys, credentials, token-like fields, and raw dataset content markers in `backend/src/mcp/serializers/mcp-redaction.ts`
- [X] T008 Implement MCP auth context resolution by reusing access-token verification and user lookup in `backend/src/mcp/mcp.auth.ts`
- [X] T009 Implement shared MCP error mapping for unauthorized, forbidden, validation, not-found, and runtime errors in `backend/src/mcp/mcp.server.ts`
- [X] T010 Register a BrAIniac `McpServer` instance with instructions and capability metadata in `backend/src/mcp/mcp.server.ts`
- [X] T011 Mount the Streamable HTTP MCP transport behind `MCP_ENABLED` at `MCP_PATH` in `backend/src/mcp/mcp.transport.ts`
- [ ] T012 Wire the MCP transport into the existing Express app without changing existing routes in `backend/src/index.ts`
- [ ] T013 Update `backend/scripts/mcp-auth-ownership-test.mjs` to assert missing, invalid, and cross-user tokens produce explicit MCP-visible errors
- [ ] T014 Run `npm --prefix backend run build`, `npm --prefix backend run test:auth`, and `npm --prefix backend run test:ownership`

**Checkpoint**: MCP server starts, rejects unauthorized access, and existing auth/ownership behavior still passes.

---

## Phase 3: User Story 1 - Inspect BrAIniac From An AI Client (Priority: P1) MVP

**Goal**: An MCP-compatible client can browse owner-scoped BrAIniac projects, pipelines, nodes, agents, tools, validation state, and execution diagnostics without mutating anything.

**Independent Test**: Connect to the backend MCP endpoint with a seeded user, list resources/tools, fetch a pipeline graph and agent context, and confirm diagnostics are visible while cross-user data remains hidden.

### Tests for User Story 1

- [ ] T015 [P] [US1] Write read-only MCP resource contract assertions for projects, pipelines, graph, nodes, agents, and tools in `backend/scripts/mcp-readonly-contract-test.mjs`
- [ ] T016 [P] [US1] Extend ownership coverage for MCP project and pipeline resource isolation in `backend/scripts/mcp-auth-ownership-test.mjs`
- [ ] T017 [P] [US1] Write MCP read-only timing checks for project listing under 2 seconds and pipeline/node resource reads under 1 second in `backend/scripts/mcp-performance-smoke-test.mjs`

### Implementation for User Story 1

- [ ] T018 [P] [US1] Implement project resource registration for `brainiac://projects` and `brainiac://projects/{projectId}` in `backend/src/mcp/resources/project.resources.ts`
- [ ] T019 [P] [US1] Implement read-only tool handlers `list_projects` and `list_pipelines` in `backend/src/mcp/tools/readonly.tools.ts`
- [ ] T020 [US1] Register project resources and read-only project/pipeline tools in `backend/src/mcp/mcp.server.ts`
- [ ] T021 [P] [US1] Implement pipeline resource registration for `brainiac://pipelines/{pipelineId}` and `brainiac://pipelines/{pipelineId}/graph` in `backend/src/mcp/resources/pipeline.resources.ts`
- [ ] T022 [P] [US1] Implement node resource registration for `brainiac://pipelines/{pipelineId}/nodes/{nodeId}` in `backend/src/mcp/resources/node.resources.ts`
- [ ] T023 [P] [US1] Implement tool catalog resources for `brainiac://tools` and `brainiac://tools/{toolId}` in `backend/src/mcp/resources/tool.resources.ts`
- [ ] T024 [US1] Implement `get_pipeline_context`, `list_pipeline_nodes`, `get_node_context`, and `list_tool_catalog` in `backend/src/mcp/tools/readonly.tools.ts`
- [ ] T025 [US1] Implement agent context extraction from existing node graph and `ToolNode -> AgentCall` semantics in `backend/src/mcp/resources/agent.resources.ts`
- [ ] T026 [US1] Register pipeline, graph, node, tool catalog, and agent resources in `backend/src/mcp/mcp.server.ts`
- [ ] T027 [US1] Add resource links and explicit diagnostics to read-only tool outputs in `backend/src/mcp/tools/readonly.tools.ts`
- [ ] T028 [US1] Run `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:perf`, and `npm --prefix backend run test:contracts:freeze`

**Checkpoint**: User Story 1 is independently usable as read-only MCP MVP.

---

## Phase 4: User Story 2 - Operate Pipelines Through MCP Tools (Priority: P2)

**Goal**: A client can validate, start, poll, and inspect a pipeline run through MCP tools while reusing existing validation and executor services.

**Independent Test**: From an MCP client, validate a seeded pipeline, start a run with explicit input and idempotency key, poll the execution snapshot, and verify diagnostics/final result match existing backend behavior.

### Tests for User Story 2

- [ ] T029 [P] [US2] Add MCP validation tool assertions comparing output to existing graph validation in `backend/scripts/mcp-readonly-contract-test.mjs`
- [ ] T030 [P] [US2] Add MCP execution/idempotency assertions for start and poll flows in `backend/scripts/mcp-readonly-contract-test.mjs`

### Implementation for User Story 2

- [ ] T031 [US2] Implement `validate_pipeline` by calling the existing graph validation service in `backend/src/mcp/tools/pipeline.tools.ts`
- [ ] T032 [US2] Register `validate_pipeline` with read-only annotations in `backend/src/mcp/mcp.server.ts`
- [ ] T033 [US2] Implement `start_pipeline_execution` by calling the existing executor application service in `backend/src/mcp/tools/pipeline.tools.ts`
- [ ] T034 [US2] Implement `get_pipeline_execution` by calling the existing execution snapshot service in `backend/src/mcp/tools/pipeline.tools.ts`
- [ ] T035 [US2] Register execution tools with non-read-only/idempotency annotations in `backend/src/mcp/mcp.server.ts`
- [ ] T036 [US2] Add validation resource support for `brainiac://pipelines/{pipelineId}/validation` in `backend/src/mcp/resources/pipeline.resources.ts`
- [ ] T037 [US2] Add execution resource support for `brainiac://pipelines/{pipelineId}/executions/{executionId}` in `backend/src/mcp/resources/pipeline.resources.ts`
- [ ] T038 [US2] Run `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:executor:http`, and `npm --prefix backend run test:executor:coordination`

**Checkpoint**: Pipeline operation through MCP works without duplicating validation or executor logic.

---

## Phase 5: User Story 3 - Export Project Context For Reuse (Priority: P3)

**Goal**: A client can generate redacted project, pipeline, and node snapshots with graph, nodes, agents, tools, validation, execution metadata, and redaction report.

**Independent Test**: Request export snapshots for seeded project, pipeline, and node data and verify expected sections are present while secrets, credentials, unauthorized data, and raw dataset content are absent.

### Tests for User Story 3

- [ ] T039 [P] [US3] Implement project, pipeline, and node export snapshot shape assertions in `backend/scripts/mcp-export-redaction-test.mjs`
- [ ] T040 [P] [US3] Implement redaction assertions for token-like fields, provider credentials, unauthorized resources, and raw dataset content in `backend/scripts/mcp-export-redaction-test.mjs`

### Implementation for User Story 3

- [ ] T041 [US3] Implement project, pipeline, and node export snapshot assembly using existing project, pipeline, node, edge, tool, validation, and execution services in `backend/src/mcp/resources/export.resources.ts`
- [ ] T042 [US3] Apply redaction helpers to export snapshots and include a redaction report in `backend/src/mcp/resources/export.resources.ts`
- [ ] T043 [US3] Register `brainiac://projects/{projectId}/export`, `brainiac://pipelines/{pipelineId}/export`, and `brainiac://pipelines/{pipelineId}/nodes/{nodeId}/export` resources in `backend/src/mcp/mcp.server.ts`
- [ ] T044 [US3] Implement `export_project_snapshot`, `export_pipeline_snapshot`, and `export_node_snapshot` tools returning resource links in `backend/src/mcp/tools/export.tools.ts`
- [ ] T045 [US3] Register project, pipeline, and node export tools with read-only/export annotations in `backend/src/mcp/mcp.server.ts`
- [ ] T046 [US3] Run `npm --prefix backend run test:mcp:export` and `npm --prefix backend run test:mcp:auth`

**Checkpoint**: Export snapshot is reusable and redacted by default.

---

## Phase 6: User Story 4 - Use BrAIniac From VS Code (Priority: P4)

**Goal**: A developer can connect VS Code to the BrAIniac MCP backend, browse resources, invoke tools, and see connection/auth/tool errors clearly.

**Independent Test**: Configure VS Code against the local MCP endpoint, browse BrAIniac MCP resources, invoke a read-only tool and validation/export action, and verify auth/backend errors are visible.

### Tests for User Story 4

- [ ] T047 [P] [US4] Add VS Code manual smoke checklist for `.vscode/mcp.json` setup, resource browsing, `validate_pipeline`, export invocation, and error feedback in `specs/001-mcp-backend-vscode/quickstart.md`
- [ ] T048 [P] [US4] Create VS Code extension smoke test notes for server definition provider behavior in `vscode-extension/README.md`

### Implementation for User Story 4

- [ ] T049 [US4] Create VS Code extension scaffold with `contributes.mcpServerDefinitionProviders` in `vscode-extension/package.json`
- [ ] T050 [US4] Implement `brainiacMcp` server definition provider returning an HTTP MCP server definition in `vscode-extension/src/extension.ts`
- [ ] T051 [US4] Implement token and backend URL resolution prompts in `vscode-extension/src/extension.ts`
- [ ] T052 [US4] Add extension README setup instructions and troubleshooting states in `vscode-extension/README.md`
- [ ] T053 [US4] Add and run VS Code extension build/test command in `vscode-extension/package.json`
- [ ] T054 [US4] Manually verify VS Code connects to `http://localhost:8080/mcp`, lists resources, invokes `list_projects`, invokes `validate_pipeline`, invokes an export tool, and reports auth/backend errors using `specs/001-mcp-backend-vscode/quickstart.md`

**Checkpoint**: VS Code integration uses built-in MCP surfaces without custom UI.

---

## Final Phase: Polish & Cross-Cutting Concerns

**Purpose**: Stabilize docs, tests, and guardrails after desired stories are complete.

- [ ] T055 [P] Document implemented MCP endpoint, auth requirements, and tool/resource list in `README.md`
- [ ] T056 [P] Update SDD notes for MCP adapter scope and deferred agent authoring in `docs/sdd/14-mcp-adapter-plan.md`
- [ ] T057 [P] Add explicit deferred agent authoring guard notes to `specs/001-mcp-backend-vscode/contracts/mcp-tools.md`
- [ ] T058 Run `npm --prefix backend run build`, `npm --prefix backend run test`, `npm --prefix backend run test:contracts:freeze`, `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:perf`, and `npm --prefix backend run test:mcp:export`
- [ ] T059 Validate `specs/001-mcp-backend-vscode/quickstart.md` end-to-end and record any manual VS Code gaps in `specs/001-mcp-backend-vscode/quickstart.md`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **US1 Read-only inspection (Phase 3)**: Depends on Foundational. This is the MVP.
- **US2 Pipeline operation (Phase 4)**: Depends on US1 because operation tools reuse resource links, auth mapping, and MCP server registration.
- **US3 Export (Phase 5)**: Depends on US1 and can proceed before or after US2 if export excludes execution start behavior.
- **US4 VS Code integration (Phase 6)**: Depends on a stable backend MCP endpoint from US1; validation/export checks depend on US2/US3.
- **Final Polish**: Depends on all selected stories.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational and is the recommended MVP scope.
- **US2 (P2)**: Requires US1 MCP adapter foundation and server registration.
- **US3 (P3)**: Requires US1 resource serializers/redaction foundation; execution metadata benefits from US2.
- **US4 (P4)**: Requires US1 backend endpoint; full validation/export demo requires US2 and US3.

### Within Each User Story

- Tests are written before implementation tasks in each story phase.
- Resource serializers/auth helpers before resource registrations.
- Resource registrations before tools that return resource links.
- Existing services are reused before introducing any new facade.
- Agent authoring stays deferred until a later separate plan/task set.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001 is clear.
- T005, T006, and T007 can run in parallel.
- US1 resource modules T018, T021, T022, T023 can run in parallel after T005-T012.
- US1 tests T015 and T016 can run in parallel before implementation.
- US3 tests T039 and T040 can run in parallel.
- US4 documentation/test notes T047 and T048 can run in parallel.

---

## Parallel Example: User Story 1

```bash
Task: "T015 [P] [US1] Write read-only MCP resource contract assertions in backend/scripts/mcp-readonly-contract-test.mjs"
Task: "T016 [P] [US1] Extend ownership coverage in backend/scripts/mcp-auth-ownership-test.mjs"
Task: "T017 [P] [US1] Write MCP read-only timing checks in backend/scripts/mcp-performance-smoke-test.mjs"
Task: "T018 [P] [US1] Implement project resources in backend/src/mcp/resources/project.resources.ts"
Task: "T021 [P] [US1] Implement pipeline resources in backend/src/mcp/resources/pipeline.resources.ts"
Task: "T022 [P] [US1] Implement node resources in backend/src/mcp/resources/node.resources.ts"
Task: "T023 [P] [US1] Implement tool catalog resources in backend/src/mcp/resources/tool.resources.ts"
```

---

## Implementation Strategy

### MVP First

1. Complete Phase 1 and Phase 2.
2. Complete Phase 3 only.
3. Validate with `test:mcp:readonly`, `test:mcp:auth`, `test:mcp:perf`, and `test:contracts:freeze`.
4. Demo read-only MCP resource browsing and read-only tools.

### Incremental Delivery

1. US1 read-only inspection.
2. US2 validation/execution tools.
3. US3 redacted export snapshots.
4. US4 VS Code extension/provider.
5. A future separate feature for agent authoring tools.

### Scope Guard

Do not implement `create_agent_node`, `update_agent_config`, or
`bind_tool_to_agent` in this task set. Those tools are intentionally deferred so
the MCP adapter can prove read-only, validation, execution, export, auth, and
VS Code behavior first.

## Notes

- Keep MCP as an adapter over existing backend services.
- Do not query Prisma directly from MCP handlers when an application/core
  service exists.
- Do not duplicate graph validation, pipeline execution, auth, ownership, or
  agent runtime logic.
- Mark read-only tools with read-only annotations and mutating/execution tools
  with confirmation-appropriate annotations.
