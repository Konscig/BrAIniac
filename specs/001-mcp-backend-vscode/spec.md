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
- Q: How should frontend VS Code auth changes be verified? -> A: add frontend test/build verification covering `vscode_state`, already-authenticated completion, and completion failure fallback.

### Session 2026-05-02

- Q: What is the next auth change after manual VS Code verification passed? -> A: fix the VS Code token refresh problem and add explicit token lifecycle coverage.
- Q: Should the current auth bridge remain if it is not OAuth 2.1-compatible? -> A: no, verify the current flow against MCP/VS Code OAuth 2.1 expectations and migrate it to OAuth 2.1 with PKCE, refresh, revoke, and compatible metadata/client-registration support if gaps exist.
- Q: How should completed manual extension checks be represented? -> A: mark the existing manual VS Code/dev-token and browser sign-in verification tasks as passed, then add separate follow-up tasks for OAuth/token lifecycle hardening.
- Q: What must be decided before OAuth/token lifecycle implementation starts? -> A: record endpoint names, metadata exposure decision, redirect strategy, PKCE decision, refresh/revoke contract, and scope mapping before coding OAuth routes.
- Q: How should Phase 8 public auth contract changes be validated? -> A: include contract-freeze or an explicitly equivalent OAuth contract gate in final validation.
- Q: Which layout states need renewed VS Code manual coverage? -> A: refresh success, refresh failure, revoke/sign-out, and re-auth prompts must be checked in narrow editor layouts.
- Q: How should MCP export snapshot tools return data? -> A: project,
  pipeline, and node export tools must return the redacted JSON snapshot inline
  in the tool result; `brainiac://.../export` resource URIs may remain as
  secondary links but must not be the only way to get the JSON.
- Q: Why does VS Code show "Dynamic Client Registration not supported"? -> A:
  because standard OAuth discovery metadata can make VS Code try its built-in
  OAuth/DCR flow. Local BrAIniac must either fully support that flow or keep
  standard discovery endpoints disabled and use the extension-managed browser
  sign-in path only.
- Q: Why does the web app later show `invalid token` after inactivity? -> A:
  the browser frontend stores an access token but does not refresh it or clear
  the session on protected API `401` responses. Add a web-session lifecycle
  plan so expired access tokens trigger refresh or visible re-authentication.

### Session 2026-05-03

- Q: How should the browser frontend refresh sessions safely? -> A: add a web
  refresh-token contract using an HttpOnly, Secure, SameSite cookie; the
  frontend must not store refresh tokens in localStorage or expose them to
  JavaScript.
- Q: Which MCP write tools should be planned next? -> A: add authoring tools
  that let an agent create a project, create a pipeline, place nodes on the
  canvas, and connect nodes with edges from a user's request.
- Q: How should MCP-created nodes be positioned? -> A: authoring tools must
  accept or derive canvas positions with minimum spacing so nodes do not stack
  on top of each other; tool descriptions must state the layout expectation.

### Session 2026-05-04

- Q: Which BrAIniac-domain MCP tools are still missing for practical agent
  authoring? -> A: plan a small follow-up tool slice for node-type discovery,
  graph/edge inspection, node config validation, node/edge updates and deletes,
  search over node types/tools, agent tool-binding inspection, and optional
  automatic pipeline layout.
- Q: How should the follow-up BrAIniac-domain MCP tools be acceptance-tested? -> A:
  require an MCP client to discover node types, inspect graph/edges, validate
  config without mutation, update/delete test graph elements, search catalogs,
  inspect agent tool bindings, and verify auto-layout dry-run/apply behavior.

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
4. **Given** a user invokes an export tool from VS Code or another MCP client,
   **When** the tool completes, **Then** the response includes the redacted JSON
   snapshot inline and does not require opening a separate `brainiac://...`
   resource URI to inspect the normal export content.

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

---

### User Story 5 - Build BrAIniac Pipelines Through MCP Authoring Tools (Priority: P5)

An AI agent receives a user's natural-language pipeline request and uses MCP
authoring tools to create a BrAIniac project, create a pipeline, place runtime
supported nodes on the canvas, and connect them with graph edges.

**Why this priority**: Once read-only, execution, export, and auth flows are
stable, AI-assisted pipeline construction becomes the next high-value MCP
workflow. It must be explicit and confirmation-friendly because it mutates user
projects.

**Independent Test**: From an MCP client, create a project and pipeline, add at
least three nodes with non-overlapping canvas positions, connect them with
edges, then read the pipeline graph and verify ownership, validation output,
resource links, and visible node spacing.

**Acceptance Scenarios**:

1. **Given** a user asks an agent to build a simple RAG pipeline, **When** the
   agent invokes MCP authoring tools, **Then** BrAIniac contains a new project,
   a new pipeline, supported runtime nodes, and explicit edges matching the
   requested workflow.
2. **Given** the agent creates multiple nodes, **When** the pipeline is opened
   in the web canvas, **Then** nodes have distinct `ui_json` positions with
   enough horizontal/vertical spacing to avoid stacked or overlapping nodes.
3. **Given** a requested node/tool type is unsupported or missing, **When** the
   authoring tool is invoked, **Then** the tool returns a clear diagnostic and
   does not create hidden unsupported graph behavior.
4. **Given** an agent needs to refine or repair a generated pipeline, **When**
   it invokes BrAIniac-domain MCP tools, **Then** it can discover supported node
   types, inspect current graph edges and agent tool bindings, validate node
   config without mutation, update or delete test graph elements with
   confirmation, search node/tool catalogs, and use auto-layout dry-run/apply
   behavior while preserving ownership and graph validation.

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
- A VS Code access token expires while the refresh credential is still valid;
  the extension should refresh without requiring manual token paste or hidden
  repeated retries.
- The browser web app keeps an expired access token in localStorage and receives
  `401 invalid token` while loading projects, tools, node types, graph data, or
  other protected API resources; the app should refresh if supported or clear
  the session and redirect to login with an actionable message.
- VS Code MCP discovers standard OAuth metadata for a server that does not
  support dynamic client registration and opens a client-registration prompt;
  local extension-managed auth must avoid advertising incompatible discovery
  metadata until the backend supports the full flow.
- A refresh token is expired, revoked, malformed, replayed, or belongs to a
  different user/session; the extension should clear unsafe state and prompt
  for browser re-authentication.
- A browser web refresh cookie is absent, expired, revoked, malformed, replayed,
  or blocked by SameSite/Secure policy; the frontend should clear access-token
  state and redirect to `/auth` with a session-expired message.
- An MCP authoring request omits node positions or gives overlapping positions;
  the backend/tool layer must derive safe spaced positions or reject the request
  with actionable layout diagnostics.
- An MCP authoring request would create duplicate edges, cross-pipeline edges,
  cycles without explicit loop policy, hidden tool injection, or unsupported
  node/tool bindings; the mutation must fail or be rolled back and return graph
  validation diagnostics.
- OAuth metadata, PKCE verifier/challenge, redirect URI, token endpoint, or
  revoke endpoint behavior is missing or incompatible with VS Code/MCP OAuth
  expectations; implementation must not start until the exact endpoint names,
  metadata exposure decision, redirect strategy, PKCE decision,
  refresh/revoke contract, and MCP scope mapping are recorded.
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
  for the selected scope to support external review or AI-assisted work. Export
  tool responses MUST include the redacted JSON snapshot inline; export resource
  URIs MAY remain as supplemental stable links but MUST NOT be the only returned
  export payload for normal project, pipeline, or node snapshots.
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
- **FR-012c**: The VS Code integration MUST refresh expired access tokens when
  a valid refresh credential exists, store refresh material only in VS Code
  SecretStorage, and fall back to visible browser re-authentication when refresh
  fails or is unsafe.
- **FR-012d**: The MCP/VS Code auth flow MUST be verified against OAuth 2.1
  expectations for public clients without making VS Code enter unsupported
  Dynamic Client Registration. If the current polling bridge is not compatible,
  the implementation MUST migrate to OAuth 2.1 authorization code with PKCE,
  token refresh, token revocation, scoped authorization, and either full
  dynamic client registration or a tested static client-registration contract
  before exposing standard OAuth discovery metadata. Before OAuth
  implementation tasks start, the plan MUST record exact endpoint names,
  discovery/metadata exposure decision, redirect strategy, PKCE decision,
  refresh/revoke contract, and scope mapping.
- **FR-012e**: The backend MUST NOT expose standard VS Code/MCP OAuth discovery
  endpoints such as `/.well-known/oauth-authorization-server` or
  `/.well-known/oauth-protected-resource` for the local extension-managed flow
  unless dynamic client registration or an explicitly compatible client
  registration contract is implemented and tested. The extension-managed
  `BrAIniac: Sign in` flow remains the local product path.
- **FR-012f**: The browser frontend MUST handle expired or invalid access
  tokens for protected API calls by refreshing through a supported backend
  session endpoint or by clearing stored auth state and redirecting to `/auth`
  with an actionable session-expired message. It MUST NOT leave the user on the
  workspace with repeated `401 invalid token` console errors.
- **FR-012g**: The browser frontend MUST refresh expired access tokens through
  a dedicated web session refresh endpoint backed by an HttpOnly, Secure,
  SameSite refresh cookie. Browser refresh credentials MUST NOT be stored in
  localStorage, sessionStorage, Redux-like state, or any JavaScript-readable
  storage. Refresh replay, revoke, expiry, and sign-out MUST be covered by
  backend contract tests and frontend auth-flow tests.
- **FR-013**: The VS Code integration MUST remain usable in normal editor
  layouts, including narrow sidebars, without clipped critical actions or
  overlapping controls. OAuth refresh success, refresh failure,
  revoke/sign-out, and re-auth prompts MUST be included in this layout
  verification.
- **FR-014**: The feature MUST preserve existing BrAIniac web UI behavior and
  public runtime contracts unless a contract update is explicitly documented.
  OAuth/token lifecycle changes MUST run `test:contracts:freeze` or an
  explicitly documented equivalent OAuth contract gate before completion.
- **FR-015**: Required automated or documented manual checks MUST demonstrate
  the feature works across discovery, pipeline operation, export, permissions,
  diagnostics, and VS Code user flows.
- **FR-016**: MCP MUST expose explicit non-read-only authoring tools for
  creating projects, creating pipelines, creating canvas-positioned nodes, and
  connecting nodes with edges. These tools MUST reuse existing BrAIniac
  mutation services where available, enforce ownership, return resource links,
  and run graph validation after mutations.
- **FR-017**: MCP authoring tools that create or place nodes MUST require
  explicit canvas positions or derive deterministic positions with documented
  minimum spacing. Tool descriptions MUST tell agents not to stack nodes and
  SHOULD recommend left-to-right or top-to-bottom spacing suitable for the
  existing ReactFlow canvas.
- **FR-018**: MCP authoring tools MUST NOT create hidden tool bindings, legacy
  `tool_ref`/`tool_refs` paths, unsupported node types, duplicate edges, or
  cross-pipeline edges. If a requested graph cannot be represented safely, the
  tool MUST return diagnostics and avoid partial unsafe mutation.
- **FR-019**: MCP MUST expose BrAIniac-domain discovery tools that let agents
  list and inspect supported node types, retrieve full pipeline graphs and
  edges, search node types/tools by capability, and inspect agent tool bindings
  without relying on prior knowledge of internal database ids.
- **FR-020**: MCP MUST expose explicit confirmation-appropriate authoring edit
  tools for validating node configuration before mutation, updating existing
  pipeline nodes, deleting nodes, deleting edges, and optionally applying a
  backend-derived pipeline layout. These tools MUST enforce ownership, preserve
  graph validation semantics, and reject unsafe partial graph states.

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
- **OAuth Token Lifecycle**: The backend-issued access/refresh/revoke state
  used by VS Code to keep MCP authorization valid without storing tokens outside
  SecretStorage.
- **Browser Web Session**: A browser auth lifecycle using a JavaScript-readable
  access token plus an HttpOnly refresh cookie that can rotate or revoke the web
  session without exposing refresh material to frontend code.
- **MCP Authoring Tool**: A non-read-only MCP tool that mutates BrAIniac project,
  pipeline, node, or edge state on behalf of the authenticated user.
- **Canvas Layout Hint**: Positioning metadata stored in node `ui_json` that
  keeps MCP-created nodes visible and separated in the existing web canvas.
- **Node Type Catalog**: The BrAIniac runtime-backed catalog of creatable node
  types, their ids, config expectations, defaults, and tool relationships.

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
  secrets or provider credentials, and MCP export tool responses expose that
  JSON inline without requiring a separate resource-open step.
- **SC-006**: VS Code users can connect, browse resources, invoke a validation
  action, and view results with no hidden critical controls in standard editor
  layouts.
- **SC-007**: Diagnostic states for provider errors, empty agent output,
  validation failures, and permission failures are distinguishable in all
  tested MCP and VS Code flows.
- **SC-008**: Required automated or documented manual checks cover read-only
  discovery, execution tools, export, authorization boundaries, diagnostic
  states, frontend auth behavior, and VS Code integration behavior.
- **SC-009**: VS Code can recover from an expired access token through refresh
  when refresh is valid, and it prompts for browser sign-in when refresh is
  expired, revoked, or invalid.
- **SC-010**: OAuth/token lifecycle contract checks prove PKCE or documented
  compatibility, refresh, revoke, scope enforcement, no token storage outside
  SecretStorage, and no standard OAuth discovery metadata in the local
  extension-managed flow unless DCR or tested client registration is present.
- **SC-011**: When a browser frontend access token expires or is rejected,
  protected API calls do not keep retrying with the stale token; the user is
  either refreshed transparently or redirected to login with a clear
  session-expired state.
- **SC-012**: VS Code does not show a Dynamic Client Registration prompt during
  the local BrAIniac extension-managed sign-in flow.
- **SC-013**: A browser user can remain idle until access-token expiry and then
  continue after one refresh request without re-entering credentials when the
  HttpOnly refresh cookie is valid; revoked or expired refresh cookies redirect
  to `/auth` without repeated `401 invalid token` requests.
- **SC-014**: An MCP client can create a project, create a pipeline, add at
  least three supported nodes, and connect them with edges; reopening the
  pipeline graph shows non-overlapping node positions and validation diagnostics.
- **SC-015**: An MCP client can complete the follow-up BrAIniac-domain tool
  checklist against a seeded pipeline: node type discovery, graph/edge
  inspection, node config preflight with no mutation, node/edge update/delete,
  catalog search, agent tool-binding inspection, and auto-layout dry-run/apply
  behavior all pass `test:mcp:domain-tools` and documented manual verification.

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
