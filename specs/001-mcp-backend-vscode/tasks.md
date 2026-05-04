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

## Phase 11: User Story 4 Continuation - Browser Web Refresh Cookie (Priority: P4)

**Goal**: Move browser frontend session recovery from access-token-only cleanup to a safe refresh-token lifecycle backed by an HttpOnly, Secure, SameSite cookie.

**Independent Test**: Log in through the browser frontend, force access-token expiry while the refresh cookie remains valid, confirm one refresh request with `credentials: include` returns a new access token and retries the original protected request, then revoke/expire the refresh session and confirm the app redirects to `/auth` without repeated `401 invalid token` requests.

### Tests for Browser Web Refresh Cookie

- [X] T130 [P] [US4] Add browser web-session endpoint contract with exact method/path, response shape, cookie name/options, refresh failure codes, and sign-out behavior in `specs/001-mcp-backend-vscode/contracts/web-session.md`
- [X] T131 [P] [US4] Record the local Docker/browser strategy for `Secure` refresh cookies on `http://localhost` or HTTPS dev origin in `specs/001-mcp-backend-vscode/quickstart.md`, `.env.example`, and local `.env.docker`
- [X] T132 [US4] Decide and encode browser refresh-session storage as Prisma-backed persistence or explicitly documented dev-only in-memory state in `backend/src/services/application/auth/web-session.application.service.ts` and `backend/prisma/schema.prisma`
- [X] T133 [P] [US4] Add backend web-session refresh cookie contract tests for login cookie issue, refresh success, rotation/replay rejection, revoke/sign-out clearing, cookie attributes, and no JavaScript-readable refresh material in `backend/scripts/web-session-refresh-test.mjs`
- [X] T134 [P] [US4] Add frontend API-layer tests for one protected API `401 invalid token` triggering refresh with `credentials: include`, one retry of the original request, and fallback on refresh failure in `frontend/src/lib/api.test.ts`
- [X] T135 [P] [US4] Add frontend auth-provider/user-flow tests for refresh success, refresh failure redirect to `/auth`, and no refresh token in browser auth state in `frontend/src/App.test.tsx`
- [X] T136 [US4] Add `test:web-session-refresh` script for `backend/scripts/web-session-refresh-test.mjs` in `backend/package.json`

### Implementation for Browser Web Refresh Cookie

- [X] T137 [US4] Implement server-side browser refresh-session lifecycle helpers for issue, rotate, replay reject, revoke, expiry, storage choice, and cookie options in `backend/src/services/application/auth/web-session.application.service.ts`
- [X] T138 [US4] Implement web session refresh and revoke routes that match `contracts/web-session.md` and use HttpOnly, Secure, SameSite cookies in `backend/src/routes/resources/auth/web-session.routes.ts`
- [X] T139 [US4] Mount web session routes and update normal browser login/sign-out wiring to set and clear refresh cookies in `backend/src/routes/resources/auth/auth.routes.ts` and `backend/src/services/application/auth/auth.application.service.ts`
- [X] T140 [US4] Update protected API request handling to call the web refresh endpoint with `credentials: include`, update only access-token state, retry the original request once, and preserve unrelated backend errors in `frontend/src/lib/api.ts`
- [X] T141 [US4] Update browser auth state handling to avoid any refresh-token storage, represent `refreshing`/`expired` states, and redirect to `/auth` on refresh failure in `frontend/src/providers/AuthProvider.tsx`, `frontend/src/App.tsx`, and `frontend/src/pages/auth-page.tsx`

### Verification for Browser Web Refresh Cookie

- [X] T142 [US4] Run `npm --prefix backend run build`, `npm --prefix backend run test:web-session-refresh`, `$env:CI='true'; npm --prefix frontend test -- --watchAll=false`, and `npm --prefix frontend run build`
- [ ] T143 [US4] Manually verify the browser web refresh cookie checklist in `specs/001-mcp-backend-vscode/quickstart.md` and record the result in the quickstart validation notes

**Checkpoint**: Browser frontend refreshes expired access tokens through cookie-backed web sessions without exposing refresh material to JavaScript or looping on stale-token `401` responses.

---

## Phase 12: User Story 5 - Build BrAIniac Pipelines Through MCP Authoring Tools (Priority: P5)

**Goal**: Let an authenticated MCP agent create a project, create a pipeline, place supported nodes on the canvas with readable spacing, and connect nodes with graph edges.

**Independent Test**: From an MCP client, create a project and pipeline, add at least three supported nodes with non-overlapping positions, connect them with edges, then read the pipeline graph and verify ownership, validation output, resource links, and visible node spacing.

### Tests for MCP Authoring Tools

- [X] T144 [P] [US5] Add MCP authoring contract tests for `create_project`, `create_pipeline`, `create_pipeline_node`, and `connect_pipeline_nodes` happy paths in `backend/scripts/mcp-authoring-contract-test.mjs`
- [X] T145 [US5] Extend MCP authoring contract tests for unsupported node type rejection, hidden `tool_ref`/`tool_refs` rejection, duplicate edge rejection, cross-pipeline edge rejection, ownership enforcement, validation diagnostics, non-read-only annotations, and non-overlapping layout assertions in `backend/scripts/mcp-authoring-contract-test.mjs`
- [X] T146 [US5] Add `test:mcp:authoring` script for `backend/scripts/mcp-authoring-contract-test.mjs` in `backend/package.json`

### Implementation for MCP Authoring Tools

- [X] T147 [P] [US5] Implement deterministic MCP canvas layout helper with minimum spacing and overlap diagnostics in `backend/src/mcp/tools/authoring-layout.ts`
- [X] T148 [US5] Add or expose owner-scoped service methods needed for MCP project, pipeline, node, and edge creation in `backend/src/services/application/project/project.application.service.ts`, `backend/src/services/data/pipeline.service.ts`, `backend/src/services/application/node/node.application.service.ts`, and `backend/src/services/application/edge/edge.application.service.ts`
- [X] T149 [US5] Implement `create_project` and `create_pipeline` MCP authoring handlers with ownership checks, resource links, validation output, and confirmation-appropriate annotations in `backend/src/mcp/tools/authoring.tools.ts`
- [X] T150 [US5] Implement `create_pipeline_node` and `connect_pipeline_nodes` MCP authoring handlers with supported node-type validation, `ui_json.position` placement, duplicate/cross-pipeline edge rejection, graph validation, and diagnostics in `backend/src/mcp/tools/authoring.tools.ts`
- [X] T151 [US5] Register MCP authoring tools in `backend/src/mcp/mcp.server.ts` without changing read-only, export, validation, execution, or auth tool behavior

### Documentation And Verification For MCP Authoring Tools

- [X] T152 [P] [US5] Update `README.md`, `docs/sdd/14-mcp-adapter-plan.md`, and `specs/001-mcp-backend-vscode/quickstart.md` with MCP authoring usage, confirmation semantics, and canvas spacing guidance
- [X] T153 [US5] Reconcile implemented MCP authoring input/output schemas, annotations, diagnostics, and layout guidance with `specs/001-mcp-backend-vscode/contracts/mcp-tools.md`
- [X] T154 [US5] Run `npm --prefix backend run build`, `npm --prefix backend run test:mcp:authoring`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:readonly`, and `npm --prefix backend run test:contracts:freeze`
- [ ] T155 [US5] Manually verify the MCP authoring checklist in `specs/001-mcp-backend-vscode/quickstart.md` by opening the created pipeline in the web canvas and confirming nodes are readable, spaced, connected, owner-scoped, and validation diagnostics are visible

**Checkpoint**: MCP can build a basic BrAIniac pipeline from explicit agent tool calls, and the created canvas is readable instead of stacked.

---

## Phase 13: User Story 5 Continuation - BrAIniac Domain Discovery And Editing Tools (Priority: P5)

**Goal**: Let an authenticated MCP agent discover creatable node types, inspect graph edges and agent tool bindings, validate node configuration before mutation, update or delete mistaken graph elements, search catalogs, and optionally apply readable backend-derived layout.

**Independent Test**: Satisfy SC-015 from an MCP client: list and inspect node types, read graph and edge state for an owned pipeline, validate both valid and invalid node config without mutation, update a test node, delete a test edge and node, search node types/tools, inspect an agent node's tool bindings, run auto-layout in dry-run and apply mode, and verify ownership, annotations, graph validation, and resource links.

### Tests for BrAIniac Domain Discovery And Editing Tools

- [X] T156 [US5] Add MCP domain tool contract tests for `list_node_types`, `get_node_type`, node-type resource links, unsupported visibility rules, and no hidden `tool_ref`/`tool_refs` exposure in `backend/scripts/mcp-domain-tools-contract-test.mjs`
- [X] T157 [US5] Add MCP graph inspection tests for `get_pipeline_graph`, `list_pipeline_edges`, ownership enforcement, graph resource parity, duplicate-edge visibility, and validation summary output in `backend/scripts/mcp-domain-tools-contract-test.mjs`
- [X] T158 [US5] Add MCP node config preflight tests for `validate_node_config` valid config, invalid config, unsupported node type, read-only annotations, and no database mutation in `backend/scripts/mcp-domain-tools-contract-test.mjs`
- [X] T159 [US5] Add MCP graph edit tests for `update_pipeline_node`, `delete_pipeline_node`, `delete_pipeline_edge`, ownership enforcement, affected-edge diagnostics, non-read-only annotations, and graph validation after mutation in `backend/scripts/mcp-domain-tools-contract-test.mjs`
- [X] T160 [US5] Add MCP catalog search and agent binding tests for `search_node_types`, `search_tools`, and `get_agent_tool_bindings` bounded results, explicit `ToolNode -> AgentCall` bindings, unresolved tools, and diagnostics in `backend/scripts/mcp-domain-tools-contract-test.mjs`
- [X] T161 [US5] Add MCP layout tests for `auto_layout_pipeline` dry-run no-mutation behavior, apply-mode `ui_json` updates, graph-structure preservation, ownership, non-read-only annotations, and spacing diagnostics in `backend/scripts/mcp-domain-tools-contract-test.mjs`
- [X] T162 [US5] Add `test:mcp:domain-tools` script for `backend/scripts/mcp-domain-tools-contract-test.mjs` in `backend/package.json`

### Implementation for BrAIniac Domain Discovery Tools

- [X] T163 [P] [US5] Add MCP node type URI helpers for `brainiac://node-types` and `brainiac://node-types/{nodeTypeId}` in `backend/src/mcp/serializers/mcp-resource-uri.ts`
- [X] T164 [P] [US5] Add or expose node type catalog service helpers for supported creatable node types, safe config summaries, defaults, related tool ids, and unsupported-state filtering in `backend/src/services/data/node_type.service.ts` and `backend/src/services/application/node_type/node_type.application.service.ts`
- [X] T165 [US5] Implement node type resources for `brainiac://node-types` and `brainiac://node-types/{nodeTypeId}` with ownership-safe public catalog data in `backend/src/mcp/resources/node-type.resources.ts`
- [X] T166 [US5] Implement `list_node_types` and `get_node_type` MCP handlers with read-only annotations, safe config/default output, related tool links, and unsupported-state diagnostics in `backend/src/mcp/tools/domain-discovery.tools.ts`
- [X] T167 [US5] Implement `get_pipeline_graph` and `list_pipeline_edges` MCP handlers by reusing existing pipeline graph, edge, ownership, resource-link, and validation services in `backend/src/mcp/tools/domain-discovery.tools.ts`

### Implementation for BrAIniac Domain Editing Tools

- [X] T168 [P] [US5] Add or expose node config validation helpers that can preflight supported node type config without creating or updating nodes in `backend/src/services/application/node/node-config-validation.service.ts`
- [X] T169 [US5] Implement `validate_node_config` MCP handler with read-only annotations, field-level diagnostics where available, unsupported node type errors, and no mutation in `backend/src/mcp/tools/domain-discovery.tools.ts`
- [X] T170 [P] [US5] Add or expose owner-scoped node update and delete service methods that preserve graph validation semantics and affected-edge behavior in `backend/src/services/application/node/node.application.service.ts`
- [X] T171 [P] [US5] Add or expose owner-scoped edge delete service methods with duplicate/missing/cross-pipeline diagnostics in `backend/src/services/application/edge/edge.application.service.ts`
- [X] T172 [US5] Implement `update_pipeline_node`, `delete_pipeline_node`, and `delete_pipeline_edge` MCP handlers with confirmation-appropriate annotations, hidden binding rejection, resource links, and graph validation output in `backend/src/mcp/tools/domain-discovery.tools.ts`
- [X] T173 [P] [US5] Implement bounded node type and BrAIniac tool catalog search helpers in `backend/src/services/application/tool/tool-search.application.service.ts` and `backend/src/services/application/node_type/node-type-search.application.service.ts`
- [X] T174 [US5] Implement `search_node_types`, `search_tools`, and `get_agent_tool_bindings` MCP handlers with bounded read-only results, explicit agent tool capability edges, unresolved-tool diagnostics, and resource links in `backend/src/mcp/tools/domain-discovery.tools.ts`
- [X] T175 [US5] Extend the existing MCP authoring layout helper to produce full-pipeline dry-run proposals and apply-mode `ui_json` updates without changing graph structure in `backend/src/mcp/tools/authoring-layout.ts`
- [X] T176 [US5] Implement `auto_layout_pipeline` MCP handler with dry-run default, apply-mode confirmation annotations, ownership checks, spacing diagnostics, and validation output in `backend/src/mcp/tools/domain-discovery.tools.ts`
- [X] T177 [US5] Register node type resources and BrAIniac domain discovery/editing tools in `backend/src/mcp/mcp.server.ts` without changing existing read-only, export, validation, execution, auth, or primitive authoring behavior

### Documentation And Verification For BrAIniac Domain Discovery And Editing Tools

- [X] T178 [P] [US5] Update `README.md` and `docs/sdd/14-mcp-adapter-plan.md` with node type discovery, graph repair, catalog search, agent binding, delete/update confirmation, and auto-layout guidance
- [X] T179 [P] [US5] Reconcile implemented schemas, annotations, resource links, diagnostics, and resource templates with `specs/001-mcp-backend-vscode/contracts/mcp-tools.md` and `specs/001-mcp-backend-vscode/contracts/mcp-resources.md`
- [ ] T180 [P] [US5] Update `specs/001-mcp-backend-vscode/quickstart.md` with final manual checks and expected outputs for BrAIniac domain discovery/editing tools
- [ ] T181 [US5] Run the SC-015 automated gate with `npm --prefix backend run build`, `npm --prefix backend run test:mcp:domain-tools`, `npm --prefix backend run test:mcp:authoring`, `npm --prefix backend run test:mcp:auth`, `npm --prefix backend run test:mcp:readonly`, and `npm --prefix backend run test:contracts:freeze`
- [ ] T182 [US5] Manually verify the SC-015 follow-up MCP domain tool checklist in `specs/001-mcp-backend-vscode/quickstart.md` against a seeded local pipeline and record remaining gaps in the quickstart validation notes

**Checkpoint**: MCP agents can discover valid BrAIniac node types and tools, inspect and repair graph state, validate config before mutation, and clean up or lay out generated pipelines without hidden database-id assumptions.

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
- **US4 Browser web refresh cookie (Phase 11)**: Depends on Phase 10 stale-token cleanup and existing backend browser auth. It replaces the browser fallback-only behavior with safe cookie-backed refresh.
- **US5 MCP authoring tools (Phase 12)**: Depends on US1 MCP adapter foundation, US2 validation, US3 resources/links, and stable auth/ownership behavior. It can run after Phase 9/10 and does not depend on browser web refresh cookies.
- **US5 BrAIniac domain discovery/editing tools (Phase 13)**: Depends on US1 read-only graph/resource foundations and US5 primitive authoring behavior. It can run after Phase 12 because update/delete/layout tools build on the same ownership, resource URI, validation, and canvas placement contracts.

### User Story Dependencies

- **US1 (P1)**: Independent after Foundational and is the recommended MVP scope.
- **US2 (P2)**: Requires US1 MCP adapter foundation and server registration.
- **US3 (P3)**: Requires US1 resource serializers/redaction foundation; execution metadata benefits from US2.
- **US4 (P4)**: Requires US1 backend endpoint; full validation/export demo requires US2 and US3.
- **US4 continuation (P4)**: Requires the existing VS Code extension scaffold and backend auth routes.
- **US4 OAuth/token lifecycle continuation (P4)**: Requires the existing browser sign-in flow and SecretStorage session model.
- **US3 inline export continuation (P3)**: Requires existing export snapshot builders and redaction helpers from US3; independently testable through export contract scripts.
- **US4 auth UX hardening (P4)**: Requires existing browser auth provider, frontend API layer, and VS Code auth routes; independently testable through frontend auth tests and VS Code manual sign-in.
- **US4 browser web refresh cookie (P4)**: Requires existing browser auth provider, frontend API layer, and backend auth service; independently testable through web-session refresh tests and browser idle/expiry manual checks.
- **US5 MCP authoring (P5)**: Requires existing MCP auth, resource URI helpers, project/pipeline/node/edge services, and graph validation; independently testable through MCP authoring contract tests and canvas manual verification.
- **US5 domain discovery/editing continuation (P5)**: Requires existing MCP auth, node type/tool catalog services, graph resources, primitive authoring tools, and graph validation; independently testable through MCP domain tool contract tests and seeded pipeline manual checks.

### Within Each User Story

- Tests are written before implementation tasks in each story phase.
- Resource serializers/auth helpers before resource registrations.
- Resource registrations before tools that return resource links.
- Existing services are reused before introducing any new facade.
- Browser auth tasks must preserve existing token issuance and must not store tokens in repository/workspace files.
- OAuth/token lifecycle tasks must preserve existing BrAIniac auth/ownership rules and must not mint MCP-only credentials outside the auth service layer.
- Inline export UX tasks must preserve existing export ownership/redaction rules and must not make `brainiac://.../export` links the only normal export payload.
- Auth UX hardening tasks must not enable standard OAuth discovery endpoints without implementing DCR/client registration, and browser token recovery must not store VS Code refresh material in browser localStorage.
- Browser web refresh cookie tasks must never store refresh credentials in localStorage, sessionStorage, app state, URL parameters, logs, or any JavaScript-readable location.
- MCP authoring tasks must use explicit mutating tool annotations, preserve ownership checks, validate the graph after mutation, avoid hidden tool bindings, and keep created nodes non-overlapping on the canvas.
- MCP domain discovery/editing tasks must expose supported node type ids and config expectations before mutation, keep graph/search/binding tools read-only, require confirmation for update/delete/layout apply mode, and run graph validation after every graph mutation.

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
- Browser web refresh contract tasks T130-T131 can run in parallel. T132 must land before T137-T139 if storage changes are needed. Tests T133-T135 can run in parallel after T130-T132. T137-T139 are sequential backend auth work; T140-T141 are frontend integration work after the refresh contract is stable. T142-T143 are sequential validation gates.
- MCP authoring test T144 can start before implementation, then T145 extends the same script. T147 can run in parallel with T144. T148 must land before T149-T150 if existing services do not already expose the required mutations. T152 can run in parallel after the tool behavior is clear; T153-T155 are sequential contract reconciliation and validation gates.
- MCP domain tool tests T156-T161 are sequential because they share `backend/scripts/mcp-domain-tools-contract-test.mjs`. T163, T164, T168, T170, T171, and T173 can run in parallel after contract tests are clear because they touch different helpers/services. T165-T167 depend on URI and node type service helpers. T169 depends on T168. T172 depends on T170-T171. T174 depends on T173. T176 depends on T175. T177 and T181-T182 are sequential integration and validation gates.

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

## Parallel Example: Browser Web Refresh Cookie

```bash
Task: "T130 [P] [US4] Add browser web-session endpoint contract in specs/001-mcp-backend-vscode/contracts/web-session.md"
Task: "T131 [P] [US4] Record local Docker/browser strategy for Secure refresh cookies in quickstart.md, .env.example, and local .env.docker"
Task: "T133 [P] [US4] Add backend web-session refresh cookie contract tests in backend/scripts/web-session-refresh-test.mjs"
Task: "T134 [P] [US4] Add frontend API-layer refresh/retry tests in frontend/src/lib/api.test.ts"
Task: "T135 [P] [US4] Add frontend auth-provider/user-flow tests in frontend/src/App.test.tsx"
```

## Parallel Example: MCP Authoring Tools

```bash
Task: "T144 [P] [US5] Add MCP authoring happy-path contract tests in backend/scripts/mcp-authoring-contract-test.mjs"
Task: "T147 [P] [US5] Implement deterministic MCP canvas layout helper in backend/src/mcp/tools/authoring-layout.ts"
Task: "T152 [P] [US5] Update README.md, docs/sdd/14-mcp-adapter-plan.md, and quickstart.md with authoring usage"
```

## Parallel Example: BrAIniac Domain Discovery And Editing Tools

```bash
Task: "T163 [P] [US5] Add MCP node type URI helpers in backend/src/mcp/serializers/mcp-resource-uri.ts"
Task: "T164 [P] [US5] Add node type catalog service helpers in backend/src/services/application/node/node-type.application.service.ts"
Task: "T168 [P] [US5] Add node config validation helpers in backend/src/services/application/node/node-config-validation.service.ts"
Task: "T173 [P] [US5] Implement catalog search helpers in backend/src/services/application/tool/tool-search.application.service.ts and backend/src/services/application/node/node-type-search.application.service.ts"
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
9. US4 browser web refresh cookie lifecycle.
10. US5 MCP authoring tools for project, pipeline, node placement, and edge creation.
11. US5 BrAIniac domain discovery/editing tools for node type discovery, graph repair, config validation, search, agent bindings, and auto-layout.

### Scope Guard

Do not implement composite one-shot prompt-to-pipeline generation,
`update_agent_config`, or `bind_tool_to_agent` in this task set. The planned
authoring slice is limited to explicit primitive tools for project creation,
pipeline creation, supported node creation with canvas placement, and edge
creation plus explicit follow-up domain tools for discovery, update/delete
repair, config preflight, search, agent binding inspection, and bounded
auto-layout. Do not add hidden tool binding, automatic execution, or broad
prompt-to-pipeline orchestration.

## Notes

- Keep MCP as an adapter over existing backend services.
- Do not query Prisma directly from MCP handlers when an application/core
  service exists.
- Do not duplicate graph validation, pipeline execution, auth, ownership, or
  agent runtime logic.
- Mark read-only tools with read-only annotations and mutating/execution tools
  with confirmation-appropriate annotations.
