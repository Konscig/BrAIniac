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
- [X] T012 Wire the MCP transport into the existing Express app without changing existing routes in `backend/src/index.ts`
- [X] T013 Update `backend/scripts/mcp-auth-ownership-test.mjs` to assert missing, invalid, and cross-user tokens produce explicit MCP-visible errors
- [X] T014 Run `npm --prefix backend run build`, `npm --prefix backend run test:auth`, and `npm --prefix backend run test:ownership`

**Checkpoint**: MCP server starts, rejects unauthorized access, and existing auth/ownership behavior still passes.

---

## Phase 3: User Story 1 - Inspect BrAIniac From An AI Client (Priority: P1) MVP

**Goal**: An MCP-compatible client can browse owner-scoped BrAIniac projects, pipelines, nodes, agents, tools, validation state, and execution diagnostics without mutating anything.

**Independent Test**: Connect to the backend MCP endpoint with a seeded user, list resources/tools, fetch a pipeline graph and agent context, and confirm diagnostics are visible while cross-user data remains hidden.

### Tests for User Story 1

- [X] T015 [P] [US1] Write read-only MCP resource contract assertions for projects, pipelines, graph, nodes, agents, and tools in `backend/scripts/mcp-readonly-contract-test.mjs`
- [X] T016 [P] [US1] Extend ownership coverage for MCP project and pipeline resource isolation in `backend/scripts/mcp-auth-ownership-test.mjs`
- [X] T017 [P] [US1] Write MCP read-only timing checks for project listing under 2 seconds and pipeline/node resource reads under 1 second in `backend/scripts/mcp-performance-smoke-test.mjs`

### Implementation for User Story 1

- [X] T018 [P] [US1] Implement project resource registration for `brainiac://projects` and `brainiac://projects/{projectId}` in `backend/src/mcp/resources/project.resources.ts`
- [X] T019 [P] [US1] Implement read-only tool handlers `list_projects` and `list_pipelines` in `backend/src/mcp/tools/readonly.tools.ts`
- [X] T020 [US1] Register project resources and read-only project/pipeline tools in `backend/src/mcp/mcp.server.ts`
- [X] T021 [P] [US1] Implement pipeline resource registration for `brainiac://pipelines/{pipelineId}` and `brainiac://pipelines/{pipelineId}/graph` in `backend/src/mcp/resources/pipeline.resources.ts`
- [X] T022 [P] [US1] Implement node resource registration for `brainiac://pipelines/{pipelineId}/nodes/{nodeId}` in `backend/src/mcp/resources/node.resources.ts`
- [X] T023 [P] [US1] Implement tool catalog resources for `brainiac://tools` and `brainiac://tools/{toolId}` in `backend/src/mcp/resources/tool.resources.ts`
- [X] T024 [US1] Implement `get_pipeline_context`, `list_pipeline_nodes`, `get_node_context`, and `list_tool_catalog` in `backend/src/mcp/tools/readonly.tools.ts`
- [X] T025 [US1] Implement agent context extraction from existing node graph and `ToolNode -> AgentCall` semantics in `backend/src/mcp/resources/agent.resources.ts`
- [X] T026 [US1] Register pipeline, graph, node, tool catalog, and agent resources in `backend/src/mcp/mcp.server.ts`
- [X] T027 [US1] Add resource links and explicit diagnostics to read-only tool outputs in `backend/src/mcp/tools/readonly.tools.ts`
- [X] T028 [US1] Run `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:perf`, and `npm --prefix backend run test:contracts:freeze`

**Checkpoint**: User Story 1 is independently usable as read-only MCP MVP.

---

## Phase 4: User Story 2 - Operate Pipelines Through MCP Tools (Priority: P2)

**Goal**: A client can validate, start, poll, and inspect a pipeline run through MCP tools while reusing existing validation and executor services.

**Independent Test**: From an MCP client, validate a seeded pipeline, start a run with explicit input and idempotency key, poll the execution snapshot, and verify diagnostics/final result match existing backend behavior.

### Tests for User Story 2

- [X] T029 [P] [US2] Add MCP validation tool assertions comparing output to existing graph validation in `backend/scripts/mcp-readonly-contract-test.mjs`
- [X] T030 [P] [US2] Add MCP execution/idempotency assertions for start and poll flows in `backend/scripts/mcp-readonly-contract-test.mjs`

### Implementation for User Story 2

- [X] T031 [US2] Implement `validate_pipeline` by calling the existing graph validation service in `backend/src/mcp/tools/pipeline.tools.ts`
- [X] T032 [US2] Register `validate_pipeline` with read-only annotations in `backend/src/mcp/mcp.server.ts`
- [X] T033 [US2] Implement `start_pipeline_execution` by calling the existing executor application service in `backend/src/mcp/tools/pipeline.tools.ts`
- [X] T034 [US2] Implement `get_pipeline_execution` by calling the existing execution snapshot service in `backend/src/mcp/tools/pipeline.tools.ts`
- [X] T035 [US2] Register execution tools with non-read-only/idempotency annotations in `backend/src/mcp/mcp.server.ts`
- [X] T036 [US2] Add validation resource support for `brainiac://pipelines/{pipelineId}/validation` in `backend/src/mcp/resources/pipeline.resources.ts`
- [X] T037 [US2] Add execution resource support for `brainiac://pipelines/{pipelineId}/executions/{executionId}` in `backend/src/mcp/resources/pipeline.resources.ts`
- [X] T038 [US2] Run `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:executor:http`, and `npm --prefix backend run test:executor:coordination`

**Checkpoint**: Pipeline operation through MCP works without duplicating validation or executor logic.

---

## Phase 5: User Story 3 - Export Project Context For Reuse (Priority: P3)

**Goal**: A client can generate redacted project, pipeline, and node snapshots with graph, nodes, agents, tools, validation, execution metadata, and redaction report.

**Independent Test**: Request export snapshots for seeded project, pipeline, and node data and verify expected sections are present while secrets, credentials, unauthorized data, and raw dataset content are absent.

### Tests for User Story 3

- [X] T039 [P] [US3] Implement project, pipeline, and node export snapshot shape assertions in `backend/scripts/mcp-export-redaction-test.mjs`
- [X] T040 [P] [US3] Implement redaction assertions for token-like fields, provider credentials, unauthorized resources, and raw dataset content in `backend/scripts/mcp-export-redaction-test.mjs`

### Implementation for User Story 3

- [X] T041 [US3] Implement project, pipeline, and node export snapshot assembly using existing project, pipeline, node, edge, tool, validation, and execution services in `backend/src/mcp/resources/export.resources.ts`
- [X] T042 [US3] Apply redaction helpers to export snapshots and include a redaction report in `backend/src/mcp/resources/export.resources.ts`
- [X] T043 [US3] Register `brainiac://projects/{projectId}/export`, `brainiac://pipelines/{pipelineId}/export`, and `brainiac://pipelines/{pipelineId}/nodes/{nodeId}/export` resources in `backend/src/mcp/mcp.server.ts`
- [X] T044 [US3] Implement `export_project_snapshot`, `export_pipeline_snapshot`, and `export_node_snapshot` tools returning resource links in `backend/src/mcp/tools/export.tools.ts`
- [X] T045 [US3] Register project, pipeline, and node export tools with read-only/export annotations in `backend/src/mcp/mcp.server.ts`
- [X] T046 [US3] Run `npm --prefix backend run test:mcp:export` and `npm --prefix backend run test:mcp:auth`

**Checkpoint**: Export snapshot is reusable and redacted by default.

---

## Phase 6: User Story 4 - Use BrAIniac From VS Code (Priority: P4)

**Goal**: A developer can connect VS Code to the BrAIniac MCP backend, browse resources, invoke tools, and see connection/auth/tool errors clearly.

**Independent Test**: Configure VS Code against the local MCP endpoint, browse BrAIniac MCP resources, invoke a read-only tool and validation/export action, and verify auth/backend errors are visible.

### Tests for User Story 4

- [X] T047 [P] [US4] Add VS Code manual smoke checklist for `.vscode/mcp.json` setup, resource browsing, `validate_pipeline`, export invocation, and error feedback in `specs/001-mcp-backend-vscode/quickstart.md`
- [X] T048 [P] [US4] Create VS Code extension smoke test notes for server definition provider behavior in `vscode-extension/README.md`

### Implementation for User Story 4

- [X] T049 [US4] Create VS Code extension scaffold with `contributes.mcpServerDefinitionProviders` in `vscode-extension/package.json`
- [X] T050 [US4] Implement `brainiacMcp` server definition provider returning an HTTP MCP server definition in `vscode-extension/src/extension.ts`
- [X] T051 [US4] Implement token and backend URL resolution prompts in `vscode-extension/src/extension.ts`
- [X] T052 [US4] Add extension README setup instructions and troubleshooting states in `vscode-extension/README.md`
- [X] T053 [US4] Add and run VS Code extension build/test command in `vscode-extension/package.json`
- [X] T054 [US4] Manually verify the dev-token fallback connects VS Code to `http://localhost:8080/mcp`, lists resources, invokes `list_projects`, invokes `validate_pipeline`, invokes an export tool, and reports auth/backend errors using `specs/001-mcp-backend-vscode/quickstart.md`

**Checkpoint**: VS Code integration uses built-in MCP surfaces without custom UI.

---

## Phase 6.5: Completed Baseline Polish & Cross-Cutting Concerns

**Purpose**: Stabilize docs, tests, and guardrails for the baseline MCP and VS Code extension work completed before product browser auth and OAuth/token lifecycle hardening.

- [X] T055 [P] Document implemented MCP endpoint, auth requirements, and tool/resource list in `README.md`
- [X] T056 [P] Update SDD notes for MCP adapter scope and deferred agent authoring in `docs/sdd/14-mcp-adapter-plan.md`
- [X] T057 [P] Add explicit deferred agent authoring guard notes to `specs/001-mcp-backend-vscode/contracts/mcp-tools.md`
- [X] T058 Run `npm --prefix backend run build`, `npm --prefix backend run test`, `npm --prefix backend run test:contracts:freeze`, `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:perf`, and `npm --prefix backend run test:mcp:export`
- [X] T059 Validate `specs/001-mcp-backend-vscode/quickstart.md` end-to-end and record any manual VS Code gaps in `specs/001-mcp-backend-vscode/quickstart.md`

---

## Phase 7: User Story 4 Continuation - Product VS Code Browser Auth (Priority: P4)

**Goal**: Replace the developer-only manual access-token prompt with a VS Code extension sign-in flow that opens BrAIniac in the external browser, stores credentials in VS Code SecretStorage, and returns MCP HTTP server definitions using the stored session.

**Independent Test**: From VS Code, run `BrAIniac: Sign in`, complete browser login, confirm the extension stores a session without writing tokens to workspace files/settings, connect to the BrAIniac MCP server, browse resources, run `list_projects`, then sign out and verify MCP access requires re-authentication.

### Tests for Product VS Code Auth

- [X] T060 [P] [US4] Add backend browser-auth bridge contract tests for `POST /auth/vscode/start`, `POST /auth/vscode/complete`, `POST /auth/vscode/exchange`, polling pending state, authorized token exchange, expiry, replay, and invalid state in `backend/scripts/vscode-mcp-auth-flow-test.mjs`
- [X] T061 [P] [US4] Extend VS Code extension smoke tests for sign-in command, sign-out command, SecretStorage usage, no token-in-settings behavior, and provider split in `vscode-extension/scripts/smoke-test.mjs`
- [X] T062 [P] [US4] Document browser sign-in polling, dev-token fallback, and manual VS Code verification in `specs/001-mcp-backend-vscode/quickstart.md`
- [X] T063 [US4] Add automated smoke assertions for browser sign-in documentation, dev-token fallback wording, and no token-in-settings behavior in `vscode-extension/scripts/smoke-test.mjs`

### Backend Auth Bridge Implementation

- [X] T064 [US4] Add short-lived VS Code auth request state helpers with signed random `state`, expiry, pending/authorized/failed states, and single-use validation in `backend/src/services/application/auth/vscode-auth.application.service.ts`
- [X] T065 [US4] Add polling browser auth bridge routes for `POST /auth/vscode/start`, `POST /auth/vscode/complete`, and `POST /auth/vscode/exchange` in `backend/src/routes/resources/auth/vscode-auth.routes.ts`
- [X] T066 [US4] Update frontend auth flow to preserve `vscode_state` on `/auth`, call `POST /auth/vscode/complete` after successful or already-authenticated login, and continue normal web login if VS Code completion fails in `frontend/src/App.tsx`, `frontend/src/pages/auth-page.tsx`, and `frontend/src/lib/api.ts`
- [X] T067 [US4] Add frontend auth-flow verification for `/auth?vscode_state=...`, already-authenticated completion, completion failure fallback, and no web login regression in `frontend/src/App.test.tsx`, then run `CI=true npm --prefix frontend test -- --watchAll=false` and `npm --prefix frontend run build`
- [X] T068 [US4] Mount VS Code browser auth bridge routes under existing auth routing in `backend/src/routes/resources/auth/auth.routes.ts`
- [X] T069 [US4] Add contract/static assertions that the VS Code auth bridge reuses existing auth application services and does not directly import JWT signing helpers in `backend/scripts/vscode-mcp-auth-flow-test.mjs`
- [X] T070 [US4] Add `test:vscode:mcp-auth` script to `backend/package.json` for `backend/scripts/vscode-mcp-auth-flow-test.mjs`
- [X] T071 [US4] Run `npm --prefix backend run build`, `npm --prefix backend run test:vscode:mcp-auth`, `npm --prefix backend run test:auth`, and `npm --prefix backend run test:mcp:auth`

### VS Code Extension Auth Implementation

- [X] T072 [P] [US4] Split MCP server definition provider into `vscode-extension/src/mcpProvider.ts` with stored-session resolution and explicit unauthenticated state
- [X] T073 [P] [US4] Implement VS Code auth session manager with SecretStorage keys, session read/write/delete, expiry detection, and no settings token storage in `vscode-extension/src/auth.ts`
- [X] T074 [US4] Implement `BrAIniac: Sign in` command that starts `POST /auth/vscode/start`, opens `loginUrl` externally, polls `POST /auth/vscode/exchange`, handles pending/success/failure/timeout, and stores the session in `vscode-extension/src/auth.ts`
- [X] T075 [US4] Implement `BrAIniac: Sign out` and `BrAIniac: Reconnect MCP` commands that clear SecretStorage and refresh MCP definitions in `vscode-extension/src/extension.ts`
- [X] T076 [US4] Keep manual access-token prompt only behind an explicit developer fallback command `BrAIniac: Use Dev Token` in `vscode-extension/src/auth.ts`
- [X] T077 [US4] Update `vscode-extension/package.json` contributes for commands, configuration without token settings, activation events, and provider metadata
- [X] T078 [US4] Update `vscode-extension/README.md` with browser sign-in, sign-out, SecretStorage, backend URL, dev fallback, and troubleshooting instructions
- [X] T079 [US4] Run `npm --prefix vscode-extension run test`

### Product VS Code Auth Verification

- [X] T080 [US4] Update `specs/001-mcp-backend-vscode/contracts/vscode-client.md` with final route names, command names, SecretStorage behavior, polling exchange semantics, and fallback limitations
- [X] T081 [US4] Update `docs/sdd/14-mcp-adapter-plan.md` with the VS Code polling browser auth architecture and the rule that manual token paste is dev-only
- [X] T082 [US4] Manually verify VS Code browser sign-in connects to `http://localhost:8080/mcp`, lists resources, invokes `list_projects`, invokes `validate_pipeline`, invokes an export tool, signs out, checks dev-token fallback, confirms local sign-in/re-auth timing targets, checks narrow editor layout feedback, and reports auth/backend errors using `specs/001-mcp-backend-vscode/quickstart.md`
- [X] T083 [US4] Run final validation: `npm --prefix backend run build`, `npm --prefix backend run test:vscode:mcp-auth`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:readonly`, `CI=true npm --prefix frontend test -- --watchAll=false`, `npm --prefix frontend run build`, and `npm --prefix vscode-extension run test`

**Checkpoint**: VS Code integration no longer depends on pasted tokens for the normal user path; credentials are browser-acquired, stored in SecretStorage, and removable by sign-out.

---

## Phase 8: User Story 4 Continuation - OAuth 2.1 And Token Refresh Hardening (Priority: P4)

**Goal**: Fix the VS Code token refresh problem and verify or migrate the auth flow to OAuth 2.1-compatible MCP authorization with PKCE, refresh, revoke, scoped authorization, and a documented metadata exposure decision that does not trigger unsupported local DCR prompts.

**Independent Test**: From VS Code, sign in through the browser, force or simulate access-token expiry, confirm the extension refreshes the token without manual token paste, browse MCP resources, invoke `list_projects`, revoke/sign out, verify refresh no longer works, and confirm expired/revoked refresh credentials trigger visible browser re-authentication.

### OAuth 2.1 Decision Gate

- [X] T084 [US4] Audit current backend auth bridge against MCP/VS Code OAuth 2.1 requirements and record a blocking decision before T085 and T089-T093: verify-as-compatible or migrate, exact endpoint names, metadata exposure decision, redirect strategy, PKCE decision, refresh/revoke contract, and MCP scope mapping in `docs/sdd/14-mcp-adapter-plan.md` and `specs/001-mcp-backend-vscode/contracts/vscode-client.md`

### Tests for OAuth 2.1 And Token Lifecycle

- [X] T085 [P] [US4] Add backend OAuth/token lifecycle contract tests for the documented metadata exposure decision, PKCE verifier/challenge validation, authorization-code single-use behavior, refresh success, refresh expiry, refresh replay/reuse rejection, revoke/sign-out invalidation, scope enforcement, and no unsupported local `.well-known` discovery in `backend/scripts/vscode-oauth-token-lifecycle-test.mjs`
- [X] T086 [P] [US4] Extend VS Code extension smoke tests for near-expiry access-token refresh, expired refresh fallback to browser sign-in, revoked refresh handling, no token-in-settings/logs behavior, and MCP provider refresh before returning server definitions in `vscode-extension/scripts/smoke-test.mjs`
- [X] T087 [P] [US4] Update auth documentation and manual verification steps for OAuth 2.1 compatibility, refresh, revoke, forced expiry, and failure recovery in `specs/001-mcp-backend-vscode/quickstart.md` and `vscode-extension/README.md`
- [X] T088 [US4] Add contract/static assertions that OAuth/token lifecycle code reuses existing BrAIniac auth services and ownership checks instead of directly minting ad hoc MCP-only credentials in `backend/scripts/vscode-oauth-token-lifecycle-test.mjs`

### Backend OAuth/Authorization Implementation

- [X] T089 [US4] Implement or adapt OAuth 2.1-compatible authorization routes for the MCP backend without exposing standard local `.well-known` discovery unless DCR or tested client registration exists in `backend/src/routes/resources/auth/oauth.routes.ts` and route wiring under `backend/src/routes/resources/auth/auth.routes.ts`
- [X] T090 [US4] Implement PKCE-bound authorization-code issuance/exchange or a documented MCP/VS Code-compatible equivalent in `backend/src/services/application/auth/oauth-token.application.service.ts`
- [X] T091 [US4] Implement refresh-token issuance, secure storage/validation, rotation where supported, expiry handling, and explicit errors for invalid/revoked/replayed refresh credentials in `backend/src/services/application/auth/oauth-token.application.service.ts`
- [X] T092 [US4] Implement token revocation/sign-out invalidation for VS Code sessions in `backend/src/routes/resources/auth/oauth.routes.ts` and the auth application service layer
- [X] T093 [US4] Add MCP scope mapping for read-only resources, execution tools, export tools, and developer fallback limits in `backend/src/mcp/mcp.auth.ts` and `backend/src/mcp/mcp.server.ts`
- [X] T094 [US4] Add `test:vscode:oauth` script to `backend/package.json` for `backend/scripts/vscode-oauth-token-lifecycle-test.mjs`
- [X] T095 [US4] Run `npm --prefix backend run build`, `npm --prefix backend run test:vscode:oauth`, `npm --prefix backend run test:vscode:mcp-auth`, `npm --prefix backend run test:auth`, and `npm --prefix backend run test:mcp:auth`

### VS Code Extension Token Lifecycle Implementation

- [X] T096 [P] [US4] Extend `vscode-extension/src/auth.ts` session model to store access token, refresh token, expiry, scope, backend URL, and auth mode only in SecretStorage
- [X] T097 [US4] Implement access-token freshness checks and refresh-before-use behavior before `vscode-extension/src/mcpProvider.ts` returns MCP server definitions
- [X] T098 [US4] Implement refresh failure handling that clears unsafe session state, shows an actionable re-auth prompt, and starts browser sign-in without falling back to silent manual token prompts in `vscode-extension/src/auth.ts`
- [X] T099 [US4] Update `BrAIniac: Sign out` to call backend revoke when refresh material exists, clear SecretStorage, and refresh MCP definitions in `vscode-extension/src/extension.ts` and `vscode-extension/src/auth.ts`
- [X] T100 [US4] Keep `BrAIniac: Use Dev Token` dev-only and ensure dev-token sessions cannot be treated as refreshable OAuth sessions in `vscode-extension/src/auth.ts`
- [X] T101 [US4] Run `npm --prefix vscode-extension run test`

### OAuth/Refresh Verification

- [ ] T102 [US4] Manually verify browser sign-in, forced access-token expiry, automatic refresh, resource browsing, `list_projects`, `validate_pipeline`, export invocation, revoked refresh failure, sign-out/revoke, dev-token fallback isolation, visible re-auth prompts, and narrow editor layout feedback for refresh success, refresh failure, revoke/sign-out, and re-auth states using `specs/001-mcp-backend-vscode/quickstart.md`
- [X] T103 [US4] Run final OAuth/token lifecycle validation: `npm --prefix backend run build`, `npm --prefix backend run test:vscode:oauth`, `npm --prefix backend run test:vscode:mcp-auth`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:readonly`, `npm --prefix backend run test:contracts:freeze`, `CI=true npm --prefix frontend test -- --watchAll=false`, `npm --prefix frontend run build`, and `npm --prefix vscode-extension run test`

**Checkpoint**: VS Code auth survives access-token expiry through refresh, rejects revoked/invalid refresh credentials, clears credentials on sign-out, and satisfies the documented OAuth 2.1/MCP authorization contract or records any remaining hosted-SaaS hardening as deferred.

---

## Final Phase: OAuth-Inclusive Polish & Cross-Cutting Concerns

**Purpose**: Stabilize docs, tests, and guardrails after Phase 8 token lifecycle work is complete.

- [X] T104 [P] Reconcile OAuth/token lifecycle implementation notes across `README.md`, `vscode-extension/README.md`, `docs/sdd/14-mcp-adapter-plan.md`, and `specs/001-mcp-backend-vscode/contracts/vscode-client.md`
- [X] T105 [P] Validate `specs/001-mcp-backend-vscode/quickstart.md` end-to-end after OAuth/refresh implementation and record any remaining manual VS Code gaps in that file
- [X] T106 Run final cross-slice validation after T103 and documentation reconciliation: `npm --prefix backend run build`, `npm --prefix backend run test`, `npm --prefix backend run test:contracts:freeze`, `npm --prefix backend run test:vscode:oauth`, `npm --prefix backend run test:vscode:mcp-auth`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:readonly`, `CI=true npm --prefix frontend test -- --watchAll=false`, `npm --prefix frontend run build`, and `npm --prefix vscode-extension run test`

---

## Phase 9: User Story 3 Continuation - Inline JSON Export Tool UX (Priority: P3)

**Goal**: Make project, pipeline, and node export tools return the redacted JSON snapshot inline in the tool result while keeping `brainiac://.../export` URIs only as secondary stable links.

**Independent Test**: From an MCP client or backend contract script, invoke `export_project_snapshot`, `export_pipeline_snapshot`, and `export_node_snapshot` for seeded data and verify each tool result includes `snapshot`, `redaction_report`, `export_resource_uri`, `resource_links`, and no unredacted secrets without requiring a separate resource-open step.

### Tests for Inline JSON Export UX

- [X] T107 [US3] Extend `backend/scripts/mcp-export-redaction-test.mjs` to assert `export_project_snapshot`, `export_pipeline_snapshot`, and `export_node_snapshot` tool results include inline `snapshot`, `redaction_report`, secondary `export_resource_uri`, and `resource_links`
- [X] T108 [US3] Extend `backend/scripts/mcp-export-redaction-test.mjs` to assert inline export tool snapshots preserve existing redaction behavior for token-like fields, provider credentials, unauthorized resources, and raw dataset content
- [X] T109 [US3] Add static contract assertions in `backend/scripts/mcp-export-redaction-test.mjs` that export tools reuse `buildProjectExportSnapshot`, `buildPipelineExportSnapshot`, `buildNodeExportSnapshot`, and `redactMcpSecrets` instead of duplicating snapshot assembly

### Implementation for Inline JSON Export UX

- [X] T110 [US3] Update `backend/src/mcp/tools/export.tools.ts` so `export_project_snapshot`, `export_pipeline_snapshot`, and `export_node_snapshot` return redacted inline `snapshot` JSON plus `redaction_report`, `export_resource_uri`, `resource_links`, and `diagnostics`
- [X] T111 [US3] Ensure `backend/src/mcp/tools/export.tools.ts` keeps `brainiac://projects/{projectId}/export`, `brainiac://pipelines/{pipelineId}/export`, and `brainiac://pipelines/{pipelineId}/nodes/{nodeId}/export` as secondary links without making them the only export payload
- [X] T112 [US3] Update `backend/src/mcp/resources/export.resources.ts` only if needed so resource reads and inline tool output use the same redacted snapshot shape and redaction report naming

### Documentation And Verification For Inline JSON Export UX

- [X] T113 [P] [US3] Update `docs/sdd/14-mcp-adapter-plan.md` to record that export tools return inline JSON snapshots and export resource URIs are secondary references
- [X] T114 [P] [US3] Update `README.md` and `vscode-extension/README.md` to describe the export tool UX as inline JSON with secondary resource links
- [X] T115 [P] [US3] Update `specs/001-mcp-backend-vscode/quickstart.md` validation notes after implementation and keep the manual checkbox unchecked until verified in VS Code
- [X] T116 [US3] Run `npm --prefix backend run build`, `npm --prefix backend run test:mcp:export`, and `npm --prefix backend run test:mcp:auth`
- [ ] T117 [US3] Manually verify in VS Code MCP that project, pipeline, and node export tool results show inline JSON snapshots with `redaction_report` without opening `brainiac://.../export`, then mark the quickstart export checkbox
- [X] T118 [US3] Run final inline export validation: `npm --prefix backend run build`, `npm --prefix backend run test:mcp:export`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:readonly`, and `npm --prefix vscode-extension run test`

**Checkpoint**: Export tool UX no longer forces users to open a resource URI to inspect normal JSON exports; resource URIs remain available as secondary stable MCP resources.

---

## Phase 10: Auth UX Hardening - DCR Prompt And Browser Token Expiry (Priority: P4)

**Goal**: Prevent VS Code from showing an unsupported Dynamic Client Registration prompt in the local extension-managed flow and prevent the browser frontend from repeatedly using expired access tokens after inactivity.

**Independent Test**: Start local Docker/VS Code MCP, run `BrAIniac: Sign in`, and verify no DCR/client-id prompt appears. In the browser frontend, simulate or force an invalid/expired access token and verify protected API calls clear or refresh auth state and redirect to `/auth` with an actionable session-expired message instead of repeating `401 invalid token` requests.

### Tests for Auth UX Hardening

- [X] T119 [P] [US4] Add backend/static assertions in `backend/scripts/vscode-oauth-token-lifecycle-test.mjs` that local `.well-known` OAuth discovery endpoints are not exposed unless DCR/client registration support is implemented
- [X] T120 [P] [US4] Add frontend tests in `frontend/src/App.test.tsx` for protected API `401 invalid token` handling that clears stale `brainiac.tokens` and redirects to `/auth`
- [X] T121 [P] [US4] Add frontend API-layer tests in `frontend/src/lib/api.test.ts` for `frontend/src/lib/api.ts` to classify invalid/expired token responses without masking unrelated backend errors

### Implementation for Auth UX Hardening

- [X] T122 [US4] Ensure `backend/src/index.ts` and `backend/src/routes/resources/auth/oauth.routes.ts` do not expose standard `/.well-known/oauth-authorization-server` or `/.well-known/oauth-protected-resource` for the local extension-managed flow unless full DCR support is added
- [X] T123 [US4] Update `frontend/src/lib/api.ts` to detect protected API `401` invalid/expired token responses and emit a typed auth-expired signal
- [X] T124 [US4] Update `frontend/src/providers/AuthProvider.tsx` and `frontend/src/App.tsx` so auth-expired signals clear browser auth state, stop stale protected requests, and navigate to `/auth` with a session-expired message
- [X] T125 [US4] Update `frontend/src/pages/auth-page.tsx` if needed to display the session-expired reason without breaking normal login, signup, or VS Code `vscode_state` completion

### Documentation And Verification For Auth UX Hardening

- [X] T126 [P] [US4] Update `specs/001-mcp-backend-vscode/contracts/vscode-client.md` to state that local extension-managed auth must not trigger VS Code Dynamic Client Registration prompts unless DCR support exists
- [X] T127 [P] [US4] Update `specs/001-mcp-backend-vscode/quickstart.md` and `vscode-extension/README.md` with troubleshooting for DCR prompt avoidance and browser session-expired handling
- [X] T128 [US4] Run `npm --prefix backend run build`, `npm --prefix backend run test:vscode:oauth`, `$env:CI='true'; npm --prefix frontend test -- --watchAll=false`, `npm --prefix frontend run build`, and `npm --prefix vscode-extension run test`
- [ ] T129 [US4] Manually verify VS Code sign-in has no Dynamic Client Registration prompt and browser frontend expired-token handling redirects to `/auth` instead of repeating `401 invalid token`

**Checkpoint**: Local VS Code auth stays extension-managed without unsupported DCR prompts, and stale browser tokens recover through refresh or visible re-authentication instead of repeated invalid-token failures.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies.
- **Foundational (Phase 2)**: Depends on Setup and blocks every user story.
- **US1 Read-only inspection (Phase 3)**: Depends on Foundational. This is the MVP.
- **US2 Pipeline operation (Phase 4)**: Depends on US1 because operation tools reuse resource links, auth mapping, and MCP server registration.
- **US3 Export (Phase 5)**: Depends on US1 and can proceed before or after US2 if export excludes execution start behavior.
- **US4 VS Code integration (Phase 6)**: Depends on a stable backend MCP endpoint from US1; validation/export checks depend on US2/US3.
- **US4 Product Browser Auth (Phase 7)**: Depends on Phase 6 scaffold plus stable backend MCP/auth behavior. It replaces manual token prompt as the primary user path.
- **US4 OAuth/token lifecycle hardening (Phase 8)**: Depends on Phase 7 browser auth and manual extension verification. It fixes refresh behavior and upgrades or verifies OAuth 2.1 compatibility.
- **Baseline Polish (Phase 6.5)**: Depends on Phase 6 and captures completed pre-browser-auth stabilization.
- **Final OAuth-inclusive Polish**: Depends on all selected stories, including Phase 8 OAuth/token lifecycle hardening.
- **US3 Inline JSON export continuation (Phase 9)**: Depends on completed US3 export resources/tools and can be implemented after T106 without changing auth or VS Code sign-in behavior.
- **Auth UX hardening (Phase 10)**: Depends on Phase 7/8 auth infrastructure and can run after T106; it may be implemented before or after Phase 9 because it touches different files.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational and is the recommended MVP scope.
- **US2 (P2)**: Requires US1 MCP adapter foundation and server registration.
- **US3 (P3)**: Requires US1 resource serializers/redaction foundation; execution metadata benefits from US2.
- **US4 (P4)**: Requires US1 backend endpoint; full validation/export demo requires US2 and US3.
- **US4 continuation (P4)**: Requires the existing VS Code extension scaffold and backend auth routes.
- **US4 OAuth/token lifecycle continuation (P4)**: Requires the existing browser sign-in flow and SecretStorage session model.
- **US3 inline export continuation (P3)**: Requires existing export snapshot builders and redaction helpers from US3; independently testable through export contract scripts.
- **US4 auth UX hardening (P4)**: Requires existing browser auth provider, frontend API layer, and VS Code auth routes; independently testable through frontend auth tests and VS Code manual sign-in.

### Within Each User Story

- Tests are written before implementation tasks in each story phase.
- Resource serializers/auth helpers before resource registrations.
- Resource registrations before tools that return resource links.
- Existing services are reused before introducing any new facade.
- Agent authoring stays deferred until a later separate plan/task set.
- Browser auth tasks must preserve existing token issuance and must not store tokens in repository/workspace files.
- OAuth/token lifecycle tasks must preserve existing BrAIniac auth/ownership rules and must not mint MCP-only credentials outside the auth service layer.
- Inline export UX tasks must preserve existing export ownership/redaction rules and must not make `brainiac://.../export` links the only normal export payload.
- Auth UX hardening tasks must not enable standard OAuth discovery endpoints without implementing DCR/client registration, and browser token recovery must not store VS Code refresh material in browser localStorage.

### Parallel Opportunities

- T002, T003, and T004 can run in parallel after T001 is clear.
- T005, T006, and T007 can run in parallel.
- US1 resource modules T018, T021, T022, T023 can run in parallel after T005-T012.
- US1 tests T015 and T016 can run in parallel before implementation.
- US3 tests T039 and T040 can run in parallel.
- US4 documentation/test notes T047 and T048 can run in parallel.
- Product auth tests T060, T061, and T062 can run in parallel; T063 follows
  T061 because both edit `vscode-extension/scripts/smoke-test.mjs`.
- Backend auth bridge tasks T064-T071 must be sequential after T060.
- Frontend completion and verification tasks T066-T067 can run after T060 and before manual product
  auth verification.
- Extension split tasks T072 and T073 can run in parallel after T061.
- T084 blocks T085 and T089-T093 because it records the exact OAuth compatibility, migration, and metadata exposure contract before coding auth routes or contract tests.
- OAuth/token lifecycle tests and docs T085-T087 can run in parallel after T084 is complete; T088 follows T085 because both edit `backend/scripts/vscode-oauth-token-lifecycle-test.mjs`.
- Extension session-model task T096 can run in parallel with backend audit task T084, but T089-T093 wait for T084 and provider refresh behavior T097 depends on the session model and backend refresh contract.
- Inline export tests T107-T109 should run before implementation but are sequential because they edit the same contract script. Documentation tasks T113-T115 can run in parallel with implementation after T110-T112 behavior is clear. T116 and T118 are sequential validation gates.
- Auth UX tests T119-T121 can run before implementation. Backend DCR guard T122 can run independently from frontend stale-token handling T123-T125. T128 and T129 are sequential validation gates.

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

## Parallel Example: Product VS Code Browser Auth

```bash
Task: "T060 [P] [US4] Add backend browser-auth bridge contract tests in backend/scripts/vscode-mcp-auth-flow-test.mjs"
Task: "T061 [P] [US4] Extend VS Code extension smoke tests in vscode-extension/scripts/smoke-test.mjs"
Task: "T062 [P] [US4] Document browser sign-in polling in specs/001-mcp-backend-vscode/quickstart.md"
Task: "T072 [P] [US4] Split MCP server definition provider in vscode-extension/src/mcpProvider.ts"
Task: "T073 [P] [US4] Implement VS Code auth session manager in vscode-extension/src/auth.ts"
```

## Parallel Example: OAuth 2.1 And Token Refresh

```bash
Task: "T084 [US4] Record OAuth 2.1 compatibility/migration and metadata exposure decision in docs/sdd/14-mcp-adapter-plan.md and specs/001-mcp-backend-vscode/contracts/vscode-client.md"
```

After T084 is complete:

```bash
Task: "T085 [P] [US4] Add backend OAuth/token lifecycle and local discovery guard contract tests in backend/scripts/vscode-oauth-token-lifecycle-test.mjs"
Task: "T086 [P] [US4] Extend VS Code extension smoke tests in vscode-extension/scripts/smoke-test.mjs"
Task: "T087 [P] [US4] Update OAuth/refresh documentation in specs/001-mcp-backend-vscode/quickstart.md and vscode-extension/README.md"
Task: "T096 [P] [US4] Extend VS Code auth session model in vscode-extension/src/auth.ts"
```

## Parallel Example: Inline JSON Export UX

```bash
Task: "T113 [P] [US3] Update docs/sdd/14-mcp-adapter-plan.md with inline export contract"
Task: "T114 [P] [US3] Update README.md and vscode-extension/README.md with inline export UX"
Task: "T115 [P] [US3] Update specs/001-mcp-backend-vscode/quickstart.md validation notes"
```

## Parallel Example: Auth UX Hardening

```bash
Task: "T119 [P] [US4] Add backend/static assertions for local OAuth discovery guard"
Task: "T120 [P] [US4] Add frontend tests for protected API 401 invalid-token handling"
Task: "T126 [P] [US4] Update vscode-client contract with DCR prompt avoidance"
Task: "T127 [P] [US4] Update quickstart and vscode-extension README troubleshooting"
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
5. US4 product browser auth and SecretStorage.
6. US4 OAuth/token lifecycle hardening and refresh/revoke verification.
7. US3 inline JSON export tool UX correction.
8. US4 auth UX hardening for DCR prompt avoidance and browser stale-token recovery.
9. A future separate feature for agent authoring tools.

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
