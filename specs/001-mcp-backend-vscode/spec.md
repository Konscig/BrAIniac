# Feature Specification: MCP Access For BrAIniac

**Feature Branch**: `001-mcp-backend-vscode`
**Created**: 2026-04-29
**Status**: Draft
**Input**: User description: "Implement MCP for BrAIniac: MCP server capability, tools/resources for nodes, pipelines, agents, project export, plus VS Code client/extension."

## Clarifications

### Session 2026-04-29

- Q: Which export scopes must MCP support? -> A: project, pipeline, node.
- Q: Should analysis findings add explicit verification tasks? -> A: yes, add checks.
- Q: Should `MCP_ALLOWED_HOSTS` remain in scope? -> A: remove the variable.
- Q: Should tool catalog resources live in their own file? -> A: yes, separate file.
- Q: Should VS Code extension have a build/test task? -> A: yes, add task.

### Session 2026-04-30

- Q: Which auth contract should the VS Code MCP client use for the next slice? -> A: explicit backend browser-auth contract in `contracts/vscode-client.md`.
- Q: Should full OAuth/DCR be implemented immediately? -> A: no, defer full OAuth/DCR; implement a polling browser-auth bridge now while keeping the route/state model compatible with future OAuth.
- Q: How should the VS Code extension receive browser login completion? -> A: polling flow: extension starts an auth request, opens BrAIniac login URL, then polls/exchanges by `state`.
- Q: How should documentation and smoke checks be represented? -> A: split documentation updates from automated smoke assertions.
- Q: What is the old manual-token VS Code verification? -> A: dev-token fallback verification only, not the product path.
- Q: How does browser login mark a VS Code auth state authorized? -> A: frontend-aware login preserves `vscode_state` and calls `POST /auth/vscode/complete` with the normal BrAIniac access token after successful login.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect BrAIniac From An AI Client (Priority: P1)

A developer connects an MCP-compatible AI client to BrAIniac and can discover
projects, pipelines, nodes, agent configuration, validation state, and execution
diagnostics without opening the web UI.

**Why this priority**: Read-only discovery is the safest MVP and gives AI tools
useful project context before any mutation or export capability is introduced.

**Independent Test**: Connect a supported MCP client to a seeded BrAIniac
workspace, list available resources, open a pipeline, inspect its nodes and
agent/tool relationships, and verify that validation warnings and execution
diagnostics are visible.

**Acceptance Scenarios**:

1. **Given** a user has access to a BrAIniac project with at least one pipeline,
   **When** they browse MCP resources, **Then** they can see projects,
   pipelines, nodes, edges, agent settings, tool bindings, and validation
   summaries for resources they are allowed to access.
2. **Given** a pipeline has graph warnings or failed execution diagnostics,
   **When** the user opens its MCP resource, **Then** the diagnostic state is
   shown as context and is not presented as a successful final answer.

---

### User Story 2 - Operate Pipelines Through MCP Tools (Priority: P2)

A developer uses MCP tools to validate a pipeline, run a pipeline with explicit
input, poll execution status, and inspect the resulting summary and trace data.

**Why this priority**: Pipeline operation is the core useful workflow for
AI-assisted debugging, but it must build on safe discovery and existing
validation behavior.

**Independent Test**: From an MCP client, validate a known pipeline, run it with
explicit user input, poll until completion, and verify that the returned result
contains status, preflight information, warnings, final output, and tool/agent
diagnostics.

**Acceptance Scenarios**:

1. **Given** a user selects a valid pipeline, **When** they call a validation
   tool, **Then** they receive deterministic validation errors, warnings, and
   metrics for the current graph.
2. **Given** a user starts a pipeline run with explicit input, **When** the
   execution completes, **Then** they can retrieve status, summary, final
   result, node output previews, and agent/tool trace data.
3. **Given** a user starts the same operation repeatedly with the same
   idempotency intent, **When** the client retries, **Then** the workflow avoids
   duplicate executions and reports the existing run.

---

### User Story 3 - Export Project Context For Reuse (Priority: P3)

A developer exports a BrAIniac project, pipeline, or single node through MCP so
that AI tools, reviews, and external workflows can reuse a complete,
privacy-aware snapshot of the selected scope and its relevant configuration.

**Why this priority**: Export is valuable for collaboration and debugging, but
it has higher privacy and scope risk than read-only inspection or controlled
pipeline operations.

**Independent Test**: Request exports for a project, a single pipeline, and a
single node, then verify that each export includes the expected graph, node,
agent, tool, dataset reference, validation summary, and metadata for its scope
while excluding secrets and unauthorized resources.

**Acceptance Scenarios**:

1. **Given** a user requests a pipeline export, **When** the export is produced,
   **Then** it includes the pipeline graph, node configuration, agent settings,
   tool references, validation summary, and execution metadata needed to
   understand the pipeline.
2. **Given** a user requests a project or node export, **When** the export is
   produced, **Then** it includes only the project-owned or node-relevant context
   needed to understand that selected scope.
3. **Given** an export would include secrets, credentials, provider keys, or
   unauthorized project data, **When** the export is generated, **Then** those
   values are omitted or redacted and the export reports what was redacted.

---

### User Story 4 - Use BrAIniac From VS Code (Priority: P4)

A developer installs or configures a VS Code client/extension that connects to
BrAIniac MCP, shows connection state, exposes available resources and tools, and
helps run common project workflows from the editor.

**Why this priority**: VS Code integration is the target developer experience,
but it depends on a stable MCP surface first.

**Independent Test**: Install/configure the VS Code integration, connect it to a
local BrAIniac workspace, browse project resources, invoke validation and export
actions, and verify clear feedback for success, failure, and authentication
states.

**Acceptance Scenarios**:

1. **Given** a developer has BrAIniac running locally, **When** they configure
   the VS Code integration, **Then** the editor shows a connected state and
   lists available BrAIniac resources and actions.
2. **Given** the BrAIniac service is unavailable or access is denied, **When**
   the VS Code integration tries to connect, **Then** the user receives a clear
   actionable status without repeated hidden retries.

### Edge Cases

- The connected user has no projects or no accessible pipelines.
- A project contains unsupported node types or nodes hidden from the current
  product UI.
- A graph contains validation errors, warnings, guarded cycles, or unsupported
  edges.
- A pipeline execution is already running, stale, failed, or retried by the
  client.
- An agent run returns provider errors, empty output, or tool-call failures.
- Export content contains secrets, provider credentials, private dataset
  content, or resources outside the user's access scope.
- BrAIniac is unavailable, misconfigured, or returns partial data while the
  VS Code integration is connected.
- A VS Code browser-auth request expires before login completes or is exchanged
  with an invalid or reused `state`.
- The BrAIniac login page receives `vscode_state` but login fails, the state is
  lost during navigation, or completion is attempted without a valid BrAIniac
  access token.
- The workflow is used on narrow editor sidebars and common desktop layouts
  without hidden or overlapping primary controls.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Users MUST be able to connect an MCP-compatible client to
  BrAIniac and discover available BrAIniac capabilities.
- **FR-002**: Users MUST be able to browse resources for projects, pipelines,
  nodes, edges, agents, tool bindings, validation summaries, executions, and
  exportable snapshots within their access scope.
- **FR-003**: Resources MUST represent unsupported, hidden, invalid, or
  diagnostic states explicitly rather than omitting them silently.
- **FR-004**: Users MUST be able to validate a pipeline through an MCP tool and
  receive graph errors, warnings, and metrics consistent with BrAIniac's
  canonical graph validation behavior.
- **FR-005**: Users MUST be able to start a pipeline execution through an MCP
  tool only with explicit user-provided input and an explicit target pipeline.
- **FR-006**: Users MUST be able to retrieve execution status, preflight
  details, warnings, final result, node output previews, and agent/tool
  diagnostics for a pipeline run.
- **FR-007**: The MCP surface MUST expose agent and tool relationships using
  the canonical BrAIniac graph semantics, including explicit tool capability
  relationships for agents.
- **FR-008**: Users MUST be able to export project, pipeline, and node snapshots
  that include enough graph, node, agent, tool, validation, and metadata context
  for the selected scope to support external review or AI-assisted work.
- **FR-009**: Exports MUST omit or redact secrets, credentials, provider keys,
  unauthorized resources, and private content not explicitly included by the
  user's access and export choice.
- **FR-010**: Mutating or execution tools MUST require authorization and MUST
  respect project ownership and access boundaries.
- **FR-011**: Tool responses MUST distinguish successful results, validation
  failures, provider failures, empty agent output, unavailable service states,
  and permission errors.
- **FR-012**: The VS Code integration MUST provide setup, connection status,
  resource browsing, tool invocation entry points, result display, and clear
  error feedback.
- **FR-012a**: The VS Code integration MUST use browser sign-in with polling
  token exchange as the primary local product path: backend `start` returns a
  BrAIniac frontend login URL containing `vscode_state`, the frontend preserves
  that state through normal login and calls `POST /auth/vscode/complete` with
  the issued BrAIniac access token, and the extension exchanges the authorized
  state. Credentials MUST be stored only in VS Code SecretStorage.
- **FR-012b**: Manual access-token entry MUST remain available only as an
  explicit developer fallback and MUST NOT be the default VS Code setup path.
- **FR-013**: The VS Code integration MUST remain usable in normal editor
  layouts, including narrow sidebars, without clipped critical actions or
  overlapping controls.
- **FR-014**: The feature MUST preserve existing BrAIniac web UI behavior and
  public runtime contracts unless a contract update is explicitly documented.
- **FR-015**: Required automated or documented manual checks MUST demonstrate
  the feature works across discovery, pipeline operation, export, permissions,
  diagnostics, and VS Code user flows.

### Key Entities

- **MCP Connection**: A client session that represents a user's access to
  BrAIniac capabilities and resources.
- **MCP Resource**: A read-only representation of BrAIniac project context such
  as projects, pipelines, nodes, edges, agents, tool bindings, executions, or
  exports.
- **MCP Tool**: A callable capability for controlled BrAIniac actions such as
  pipeline validation, execution, status retrieval, and export generation.
- **Project**: A BrAIniac workspace unit containing pipelines and related
  metadata.
- **Pipeline**: A graph of nodes and edges that can be validated, executed,
  inspected, and exported.
- **Node**: A pipeline graph element, including agent and tool-capable nodes,
  with configuration and runtime support state.
- **Agent**: A pipeline behavior unit whose model configuration, tool
  availability, output, and diagnostics can be inspected.
- **Export Snapshot**: A generated package of project, pipeline, or node context
  with redaction and metadata describing its scope.
- **VS Code Integration State**: The editor-side connection, resource browsing,
  command, result, and error state shown to the user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can connect an MCP-compatible client to a local
  BrAIniac workspace and inspect a known pipeline within 5 minutes of starting
  setup.
- **SC-002**: 100% of resources returned to a user are limited to projects and
  pipelines the user is authorized to access.
- **SC-003**: Pipeline validation results returned through MCP match the
  existing BrAIniac validation result for the same graph in 100% of tested
  cases.
- **SC-004**: A developer can validate, start, poll, and inspect a pipeline run
  from an MCP client without opening the web UI.
- **SC-005**: Export snapshots for seeded projects contain the expected graph,
  node, agent, tool, validation, and metadata sections while exposing zero
  secrets or provider credentials.
- **SC-006**: VS Code users can connect, browse resources, invoke a validation
  action, and view results with no hidden critical controls in standard editor
  layouts.
- **SC-007**: Diagnostic states for provider errors, empty agent output,
  validation failures, and permission failures are distinguishable in all
  tested MCP and VS Code flows.
- **SC-008**: Required automated or documented manual checks cover read-only
  discovery, execution tools, export, authorization boundaries, diagnostic
  states, and VS Code integration behavior.

## Assumptions

- The first release supports local development and trusted authenticated users
  before broader remote or multi-tenant deployment hardening.
- MCP clients are treated as user-facing integrations and must follow the same
  ownership and access rules as the existing application.
- Existing BrAIniac graph validation, execution, agent/tool, dataset, and export
  concepts remain the source of truth; MCP exposes them rather than creating a
  parallel project model.
- VS Code is the first editor integration target; other MCP-capable clients are
  supported through the same BrAIniac MCP surface where compatible.
- Export defaults favor metadata and graph context over raw dataset content
  unless the user explicitly requests and is authorized to include content.
