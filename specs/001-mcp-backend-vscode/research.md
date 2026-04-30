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
