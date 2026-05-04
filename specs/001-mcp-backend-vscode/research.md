# Research: MCP Access For BrAIniac

## Decision: Use The Official TypeScript MCP SDK

Use the official MCP TypeScript SDK for server construction, resource
registration, tool registration, schemas, and transport wiring. The default
implementation target is the stable `@modelcontextprotocol/sdk` package with
`zod` schemas. The SDK docs describe the server flow as creating an `McpServer`,
registering tools/resources, creating a transport, and connecting the server to
that transport. If the official v2 split packages are stable when implementation
starts, record that package switch in the implementation notes before coding.

**Rationale**: BrAIniac is already TypeScript. The SDK prevents a custom MCP
protocol implementation and gives standard resource/tool behavior expected by
VS Code and other MCP clients.

**Alternatives considered**:

- Hand-roll JSON-RPC/MCP messages: rejected because it duplicates protocol
  logic and increases compatibility risk.
- Separate standalone MCP service: rejected for MVP because it creates another
  deployment boundary and would still need to call the same backend auth and
  ownership logic.

References:

- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- https://modelcontextprotocol.io/docs/sdk

## Decision: Streamable HTTP Endpoint Mounted In Backend

Expose MCP through a backend HTTP endpoint, mounted alongside the existing
Express API. Prefer Streamable HTTP for the backend endpoint. Keep stdio only as
an optional future wrapper if a client requires local process spawning.

**Rationale**: The existing backend already runs as an HTTP service with auth,
CORS, and route contracts. VS Code supports HTTP MCP server definitions, and a
backend-mounted endpoint lets the MCP adapter reuse current application services
without introducing a second runtime.

**Alternatives considered**:

- stdio-only server: useful for local tools, but worse fit for the running web
  backend and browser/editor clients.
- SSE-only transport: rejected because current MCP SDK docs treat Streamable
  HTTP as the modern transport and SSE as backward compatibility.

References:

- https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/server.md
- https://code.visualstudio.com/api/extension-guides/ai/mcp

## Decision: Resources For Read-Only Context, Tools For Actions

Model BrAIniac context as MCP resources: projects, pipelines, nodes, agents,
tool bindings, validation summaries, execution snapshots, and export snapshots.
Model callable actions as MCP tools: initially read-only helper tools for
listing and fetching, then validation/export tools, then execution tools, and
finally agent-authoring tools.

**Rationale**: MCP resources are host-controlled read-only context, while tools
are model-callable actions. This maps cleanly to the requested read-only-first
implementation and prevents accidental mutations through resource browsing.

**Alternatives considered**:

- Put everything behind tools: rejected because it makes read-only context
  harder for clients to browse and attach.
- Put validation/execution as resources only: rejected because validation and
  execution are explicit operations with input and error states.

References:

- https://modelcontextprotocol.io/specification/2025-11-25/server/resources
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools

## Decision: Reuse Existing Backend Services And Route Contracts

The MCP adapter must call existing application services or small route-equivalent
facades, not copy validation/execution/ownership logic. Existing public route
contracts remain source-of-truth for behavior:

- `GET /projects`
- `GET /pipelines`
- `GET /nodes`
- `GET /tools`
- `POST /pipelines/:id/validate-graph`
- `POST /pipelines/:id/execute`
- `GET /pipelines/:id/executions/:executionId`

**Rationale**: The user's direction is to use existing API surfaces and avoid
duplicating business logic. Internally, the cleanest adapter implementation is
to share the same application service layer those routes already use, while
keeping MCP result shapes documented separately.

**Alternatives considered**:

- MCP handlers issue HTTP requests back into the same backend: rejected for MVP
  unless needed for test parity, because it adds failure modes and latency.
- MCP handlers query Prisma directly: rejected because it bypasses auth,
  ownership, DTO validation, graph validation, and executor contracts.

## Decision: Read-Only First, Agent Authoring Later

MVP includes read-only resources and read-only tools. The second slice can add
safe operation tools like validation and export. Execution tools come after
idempotency/error behavior is proven. Agent creation/editing tools are deferred
until read-only and validation flows are stable.

**Rationale**: The feature has security and UX risk. A read-only adapter proves
MCP discovery, auth, ownership, resource URI design, schema contracts, and VS
Code connection behavior without mutating projects.

**Alternatives considered**:

- Add agent creation immediately: rejected because it depends on stable node,
  edge, tool binding, validation, and UX semantics.
- Make all tools available at launch: rejected because MCP clients may invoke
  model-callable tools unexpectedly unless annotations and confirmations are
  correct.

## Decision: VS Code Uses Built-In MCP Server Registration First

Plan the VS Code client as a small extension that registers the BrAIniac MCP
HTTP server definition and resolves connection/auth details. Avoid custom
webviews in the first extension slice.

**Rationale**: VS Code supports MCP resources, tools, tool annotations,
authorization, server definition providers, and HTTP server definitions. Using
those built-in surfaces avoids a custom UI while the backend contract stabilizes.

**Alternatives considered**:

- Full custom VS Code sidebar/webview immediately: rejected because it duplicates
  web UI concepts and increases frontend work before MCP contracts are stable.
- Only `.vscode/mcp.json`: useful for quickstart, but an extension is still
  needed for smoother setup and auth resolution.

References:

- https://code.visualstudio.com/api/extension-guides/ai/mcp

## Decision: Product VS Code Client Uses Browser Auth, Not Manual Token Paste

The VS Code extension should start a user-facing sign-in flow instead of asking
users to paste an access token into settings or `.vscode/mcp.json`. The target
production shape is the official VS Code MCP authorization path: the MCP server
advertises authorization metadata, VS Code drives OAuth 2.1/2.0 browser login,
and the resulting token is attached to HTTP MCP requests. For the local/dev
slice, BrAIniac uses a transitional browser polling bridge: the extension opens
BrAIniac login in the external browser with `vscode_state`, the frontend
preserves that state during normal login and calls `POST /auth/vscode/complete`
with the issued access token, then the extension polls/exchanges the authorized
short-lived `state`, stores credentials in VS Code SecretStorage, and returns an
HTTP MCP server definition with an Authorization header.

**Rationale**: Manual token handling is acceptable for smoke tests, but it is
not a product-grade VS Code MCP client. Users expect the installed extension to
initiate sign-in, use the browser, remember the credential securely, and recover
from expiration. VS Code's MCP documentation explicitly supports extension
server definition providers and OAuth-based MCP authorization.

**Alternatives considered**:

- Keep prompting for access tokens: rejected as the primary UX because it leaks
  auth implementation details and encourages storing secrets in workspace files.
- Build a custom VS Code webview login form: rejected because it duplicates the
  BrAIniac web login and is weaker than browser-based auth.
- Make the extension a separate MCP client/server process: rejected because VS
  Code already provides the MCP client/host and the backend already exposes the
  MCP server.

References:

- https://code.visualstudio.com/api/extension-guides/ai/mcp
- https://modelcontextprotocol.io/docs/learn

## Decision: Harden VS Code Auth To OAuth 2.1 Token Lifecycle Semantics

Treat the current polling browser-auth bridge as a transitional local flow and
add an explicit implementation slice to verify or migrate it to OAuth
2.1-compatible behavior for MCP/VS Code. The target behavior is authorization
code with PKCE for the VS Code public client, protected resource/authorization
metadata discovery where applicable, scoped access for MCP resources/tools,
access-token refresh before expiry, revocation on sign-out, replay protection,
and visible re-authentication when refresh fails.

**Rationale**: The current access-token exchange solves first sign-in but leaves
the extension brittle when the token expires. MCP authorization guidance is
based on OAuth-style authorization for HTTP transports, and VS Code documents
OAuth 2.1/2.0 support for MCP authorization. Token refresh and revoke behavior
must be contract-tested before the extension can be considered product-grade.

**Alternatives considered**:

- Keep the current polling flow and ask users to sign in again on every access
  token expiry: rejected because it fails the product requirement for a usable
  VS Code integration and does not fix the observed refresh problem.
- Store longer-lived access tokens in SecretStorage without refresh: rejected
  because it increases blast radius and still lacks revoke/session lifecycle
  semantics.
- Build a separate auth service: rejected because the existing backend auth
  services and Express routes are the correct source of truth for BrAIniac
  users and ownership.

References:

- https://modelcontextprotocol.io/docs/tutorials/security/authorization
- https://modelcontextprotocol.io/specification/2025-03-26/basic/authorization
- https://code.visualstudio.com/api/extension-guides/mcp

## Decision: Export Tools Return Inline JSON Snapshots

Change `export_project_snapshot`, `export_pipeline_snapshot`, and
`export_node_snapshot` so the tool result includes a redacted `snapshot` object
and `redaction_report` inline. Keep `export_resource_uri` and `resource_links`
as secondary stable references for clients that want to reopen the same export
as an MCP resource.

**Rationale**: Users invoke an export tool expecting the exported JSON, not just
a URI that may or may not be opened by the host client. VS Code currently shows
the `brainiac://.../export` URI as a separate resource, which makes the export
tool feel broken even though the resource exists. Inline JSON makes the tool
result immediately useful in chat, logs, and copy/review workflows while
preserving MCP resource compatibility.

**Alternatives considered**:

- Keep link-only exports: rejected because it is poor UX in VS Code and hides
  the actual payload behind a second client-specific action.
- Remove export resources entirely: rejected because resources are still useful
  for browsing, repeated reads, and clients that prefer resource attachment.
- Add a separate `get_export_json` tool: rejected because it duplicates the
  existing export tools and forces users to learn two commands for one action.

References:

- Existing implementation in `backend/src/mcp/tools/export.tools.ts`
- Existing resource contract in `backend/src/mcp/resources/export.resources.ts`

## Decision: Keep Local VS Code Auth Extension-Managed Until DCR Is Supported

Do not expose standard `.well-known` OAuth discovery endpoints for the local
BrAIniac MCP server while the backend does not support Dynamic Client
Registration or a complete VS Code-compatible OAuth client-registration path.
Keep the existing extension-managed `BrAIniac: Sign in` flow using
`/auth/vscode/start`, `/auth/vscode/exchange`, and refresh/revoke endpoints.

**Rationale**: VS Code interprets standard OAuth discovery metadata as a signal
that it can drive its built-in OAuth flow. If the server advertises metadata but
does not support automatic client registration, VS Code shows a confusing
"Dynamic Client Registration not supported" prompt and asks users for a client
id. That is not the intended local product UX.

**Alternatives considered**:

- Implement full DCR immediately: rejected for this slice because the local
  extension-managed auth path already works and DCR needs a separate security
  review and contract.
- Keep `.well-known` metadata and tell users to cancel the prompt: rejected
  because it creates a repeated confusing modal and undermines sign-in UX.

## Decision: Browser Frontend Must Handle Expired Access Tokens

Add a frontend session lifecycle fix so protected API calls that receive
`401 invalid token` refresh through the supported backend web-session endpoint
when a valid refresh cookie exists. If refresh fails, clear `brainiac.tokens`,
redirect to `/auth`, and show a session-expired message. Clearing and visible
re-authentication remains the fallback and is preferable to repeatedly calling
protected APIs with a stale token.

**Rationale**: The current browser app stores access tokens in localStorage and
blindly attaches them to every protected API request. After token expiry or
backend restart, project/tool/node loading produces repeated `401 invalid
token` errors while the UI remains on the workspace. Users experience this as
random breakage after inactivity.

**Alternatives considered**:

- Increase access token TTL: rejected because it only delays the failure and
  weakens token hygiene.
- Ignore 401s and show data load errors: rejected because the stored auth state
  remains invalid and every subsequent request repeats the failure.
- Reuse VS Code refresh tokens for the web app: rejected because VS Code
  SecretStorage sessions are editor-side and should not become browser
  localStorage refresh material without a separate web-session design.

## Decision: Browser Web Refresh Uses HttpOnly Secure SameSite Cookie

Add a dedicated browser web-session refresh contract. Normal login and refresh
set a backend-owned refresh cookie with `HttpOnly`, `Secure`, and `SameSite`
attributes. The frontend calls the refresh endpoint with `credentials: include`
after the first protected API `401 invalid token`, receives a new short-lived
access token, updates in-memory/auth state, and retries the original request
once. The frontend never reads or stores the refresh credential.

**Rationale**: A browser refresh token in localStorage would fix the immediate
401 loop but would create a larger XSS blast radius. HttpOnly cookie refresh
keeps the long-lived credential outside JavaScript while still giving the web
app a normal session recovery path after inactivity. Rotation, replay rejection,
revocation, cookie clearing on sign-out, and fallback to `/auth` become backend
contract behavior instead of ad hoc frontend retries.

**Alternatives considered**:

- Store refresh tokens in localStorage/sessionStorage: rejected because
  JavaScript-readable refresh material is the main thing this slice is avoiding.
- Reuse VS Code SecretStorage refresh credentials in the browser: rejected
  because editor and browser sessions have different storage and threat models.
- Only increase access-token TTL: rejected because it delays the stale-token UX
  and weakens expiry/revoke behavior.
- Refresh silently on every 401 without cookie/session semantics: rejected
  because replay, revoke, expiry, and sign-out remain undefined.

## Decision: MCP Authoring Tools Are Explicit Mutating Tools With Layout Hints

Add MCP tools that let an authenticated agent create a project, create a
pipeline, create canvas-positioned nodes, and connect nodes with edges. The
tools should be explicit operations such as `create_project`,
`create_pipeline`, `create_pipeline_node`, and `connect_pipeline_nodes`, marked
non-read-only and confirmation-appropriate. They reuse existing backend
mutation, ownership, and validation services rather than inventing a second
graph model.

Node creation tools accept explicit positions or deterministic layout hints.
Tool descriptions must tell agents to avoid stacking nodes and to place related
nodes with clear spacing, preferably left-to-right for sequential flows or
top-to-bottom for branching groups. A default layout gap around 380 px
horizontally and 220 px vertically is the preferred recommendation because it
accounts for the existing ReactFlow node card dimensions, not just the abstract
coordinate point.

**Rationale**: The read-only MCP surface is useful for inspection, but users now
want agents to build real BrAIniac pipelines from requests. Mutating tools need
clear boundaries because they affect persistent project state. Explicit node
positions are part of the contract because a technically valid graph is still a
bad UX if every node appears stacked at the same canvas coordinate.

**Alternatives considered**:

- Add one giant `build_pipeline_from_prompt` tool first: rejected because it
  hides intermediate mutations, validation failures, and user confirmations.
- Rely on the frontend to auto-layout everything later: rejected because MCP
  clients need the created graph to be readable immediately when opened.
- Let agents omit positions entirely: rejected because that recreates stacked
  canvas nodes and makes the tool output feel broken.
- Allow unsupported node/tool bindings as placeholders: rejected because hidden
  runtime behavior is unsafe and hard to debug.

## Decision: Add BrAIniac-Domain MCP Discovery And Repair Tools After Primitive Authoring

Agents need more than primitive create/connect tools to build useful pipelines
without hidden assumptions. The next tool slice should add read-only discovery
for node types, direct graph/edge inspection, search over node types/tools, and
agent tool-binding inspection, plus confirmation-appropriate edit/delete tools
for node config, node placement, node deletion, edge deletion, and optional
backend-derived layout.

**Rationale**: `list_tool_catalog` exposes BrAIniac tools, but node creation
requires valid node type ids and config expectations. Agents also need the
current graph and edges as structured tool output before repair operations, and
they need safe delete/update operations to correct mistakes instead of creating
replacement nodes. Keeping these tools small preserves the current service
boundaries and makes each mutation testable.

**Alternatives considered**:

- One composite "build or repair pipeline" tool: rejected for now because it
  would hide multiple graph mutations behind one broad operation and make
  confirmation, rollback, and diagnostics harder to reason about.
- Only resources, no tool wrappers: rejected because MCP clients often handle
  structured tool results more reliably during step-by-step agent planning.
- Add a full graph layout engine: rejected for this slice; deterministic
  `ui_json` placement helpers are enough and match the simplicity constraint.
