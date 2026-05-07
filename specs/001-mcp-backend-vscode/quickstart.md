# Quickstart: MCP Access For BrAIniac

## Prerequisites

- Docker Compose environment can start the existing BrAIniac backend and
  database.
- A BrAIniac user exists and can obtain an access token through the existing
  auth route.
- Seed data exists for node types/tool contracts and at least one project with a
  pipeline.

## Backend Development Flow

1. Install backend dependencies after the MCP SDK dependency is added:

   ```bash
   npm --prefix backend install @modelcontextprotocol/sdk zod
   ```

2. Start database and backend using the existing workflow:

   ```bash
   docker-compose up db
   npm --prefix backend run prisma:generate
   npm --prefix backend run dev
   ```

3. Verify the existing API still works:

   ```bash
   npm --prefix backend run test:auth
   npm --prefix backend run test:ownership
   npm --prefix backend run test:contracts:freeze
   ```

4. Verify read-only MCP discovery after implementation:

   ```bash
   npm --prefix backend run test:mcp:readonly
   npm --prefix backend run test:mcp:auth
   npm --prefix backend run test:mcp:perf
   ```

5. Verify export redaction after export tool/resource implementation:

   ```bash
   npm --prefix backend run test:mcp:export
   ```

## Manual MCP Client Check

1. Start backend on the local API port.
2. Configure an MCP client to use the backend MCP endpoint.
3. Authenticate using an existing BrAIniac access token.
4. Browse resources:
   - projects
   - pipelines
   - pipeline graph
   - pipeline validation
   - nodes
   - tools
   - agents
5. Confirm no resources from another user are visible.
6. Confirm validation warnings/errors appear as diagnostics.
7. Confirm exports omit secrets and raw credentials.

## VS Code Check

1. Install or run the BrAIniac VS Code extension.
2. Run `BrAIniac: Sign in`.
3. Confirm the extension opens the BrAIniac `/auth?vscode_state=...` browser
   URL.
4. Complete normal BrAIniac login in the browser.
5. Confirm VS Code reports a signed-in or connected state without asking for a
   pasted token.
6. Open VS Code MCP resource browsing.
7. Confirm BrAIniac resources are listed with readable names.
8. Invoke a read-only tool.
9. Invoke `validate_pipeline` for a seeded pipeline.
10. Invoke project, pipeline, and node export tools and confirm each tool result
   includes the redacted JSON snapshot inline, including a `redaction_report`,
   without requiring the user to open a separate `brainiac://.../export`
   resource. The resource URI may still be present as a secondary link.
11. Confirm read-only tools do not request unnecessary confirmation.
12. Confirm permission/backend errors are visible in VS Code output/status.

## Target VS Code Client Flow

The product client should not require users to paste tokens into config files.
The intended flow is:

1. Install the BrAIniac VS Code extension.
2. Run `BrAIniac: Sign in` or connect the `BrAIniac MCP` server.
3. The extension calls `POST /auth/vscode/start`, opens the returned BrAIniac
   `loginUrl` in the external browser, and polls `POST /auth/vscode/exchange`
   with the returned `state`.
4. The BrAIniac frontend preserves `vscode_state` on `/auth`, performs normal
   `/auth/login` or reuses an already authenticated browser session, then calls
   `POST /auth/vscode/complete` with
   `Authorization: Bearer <accessToken>` and `{ "state": "<vscode_state>" }`.
5. After completion, exchange returns an access token, refresh token, expiry,
   scope, and session id. The extension stores the credential in VS Code
   SecretStorage.
6. VS Code connects to `http://localhost:8080/mcp` with
   `Authorization: Bearer <stored token>`.
7. Use VS Code's built-in MCP tools/resources UI to browse BrAIniac context and
   invoke tools.
8. Before returning an expired MCP server definition, the extension refreshes
   the access token through `POST /auth/oauth/token` with
   `grant_type=refresh_token`.
9. `BrAIniac: Sign out` calls `POST /auth/oauth/revoke` when refresh material
   exists, clears SecretStorage, and refreshes MCP server definitions.

Manual `.vscode/mcp.json` token configuration remains useful for local
debugging, but it is not the target user experience.

## Dev-Token Fallback

Manual token entry is available only for local debugging and smoke isolation.
Use it when browser sign-in is unavailable or when validating the backend MCP
endpoint without the product auth bridge.

1. Obtain an access token from the normal BrAIniac auth route:

   ```bash
   curl -s http://localhost:8080/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"<email>","password":"<password>"}'
   ```

2. In VS Code, run `BrAIniac: Use Dev Token`.
3. Paste the token only into the extension prompt. Do not put it in
   `.vscode/mcp.json`, workspace files, or `brainiacMcp.*` settings.
4. Run `BrAIniac: Reconnect MCP` and verify the MCP server uses the stored
   SecretStorage session.
5. Run `BrAIniac: Sign out` and confirm subsequent MCP access requires either
   browser sign-in or another explicit dev-token fallback.

### Manual Smoke Checklist

- [X] `BrAIniac: Sign in` opens `/auth?vscode_state=...` in the external browser.
- [X] Browser login completes `POST /auth/vscode/complete`; VS Code polling
  receives an authorized exchange result.
- [X] The extension stores the returned credential in VS Code SecretStorage,
  not in `.vscode/mcp.json`, workspace files, or VS Code settings.
- [X] The BrAIniac VS Code extension provider `brainiacMcp` offers
  `http://localhost:8080/mcp` using the stored session.
- [X] Resource browsing shows projects, pipelines, graph, validation, nodes,
  tools, agents, and export resources for the authenticated user only.
- [X] `list_projects` runs as a read-only tool without unnecessary confirmation.
- [X] `validate_pipeline` returns the existing graph validation result shape.
- [ ] Export tools return inline redacted JSON snapshots with a
  `redaction_report`; `brainiac://.../export` links remain secondary and are not
  required to inspect the normal export payload.
- [X] Invalid token, missing token, backend unavailable, forbidden resource, and
  tool runtime errors are visible to the user.
- [X] Browser sign-in completes within 30 seconds after credentials are
  submitted in local dev.
- [X] Expired or rejected credentials produce an actionable re-auth prompt
  within 5 seconds.
- [X] The VS Code command/status flow remains usable in a narrow editor layout
  without hidden primary actions.
- [X] `BrAIniac: Sign out` deletes the session and requires re-authentication.
- [X] `BrAIniac: Use Dev Token` remains available as an explicit developer
  fallback and is not presented as the default setup path.

### OAuth/Refresh Follow-Up Checklist

- [X] Verify or migrate the VS Code auth flow to OAuth 2.1-compatible browser
  authorization with PKCE or documented MCP/VS Code-compatible behavior.
- [X] Automated smoke coverage simulates near-expiry access-token refresh before
  MCP server definitions return an expired token.
- [X] Automated smoke coverage verifies refresh failure clears unsafe state and
  starts the browser sign-in path instead of falling back to silent manual token
  prompts.
- [X] Automated smoke coverage confirms refresh/revoke credentials are stored
  only in SecretStorage and never written to workspace files, settings, or logs.
- [X] Backend OAuth contract coverage confirms MCP scopes restrict read,
  execute, export, and developer fallback behavior as documented in
  `contracts/vscode-client.md`.
- [ ] Confirm refresh success, refresh failure, revoke/sign-out, and re-auth
  prompts remain usable in a real VS Code narrow editor layout without hidden
  primary actions.
- [X] Run `npm --prefix backend run test:contracts:freeze` and OAuth lifecycle
  validation before marking automated OAuth validation complete.
- [ ] Confirm VS Code local sign-in does not show a "Dynamic Client
  Registration not supported" prompt; if it appears, verify standard
  `.well-known` OAuth discovery is disabled or full DCR support is implemented.
- [ ] Leave the browser web app idle until the access token is rejected, then
  confirm protected API calls do not keep repeating `401 invalid token`; the app
  must refresh or redirect to `/auth` with a clear session-expired message.

### OAuth/Refresh Command Checks

1. Start backend and run:

   ```bash
   npm --prefix backend run test:vscode:oauth
   ```

2. Confirm the script checks:
   - `GET /auth/oauth/authorization-server`
   - `GET /auth/oauth/protected-resource`
   - standard `/.well-known/oauth-*` discovery remains unavailable locally
   - `POST /auth/oauth/token`
   - `POST /auth/oauth/revoke`
   - refresh-token rotation and replay rejection
   - revoked refresh failure
   - MCP scope output

3. In VS Code, confirm `BrAIniac: Use Dev Token` remains isolated: dev-token
   sessions do not include refresh material and must not be treated as
   refreshable OAuth sessions.

### Browser Web Refresh Cookie Checks

Local Docker note: the production cookie contract is `HttpOnly; Secure;
SameSite=Lax; Path=/auth/web`. Because the local frontend/backend run on
plain `http://localhost`, `.env.docker` sets `WEB_REFRESH_COOKIE_SECURE=false`
for local development only. Hosted or HTTPS development environments must leave
the refresh cookie secure.

1. Start backend and frontend, then log in through the normal browser `/auth`
   flow.
2. Confirm login sets a refresh cookie with `HttpOnly`, `Secure`, and
   `SameSite` attributes. The refresh credential must not appear in
   localStorage, sessionStorage, app state snapshots, URL parameters, or logs.
3. Force access-token expiry or replace the stored access token with an expired
   token while keeping the refresh cookie valid.
4. Open a protected workspace route. The first protected API failure should call
   the web refresh endpoint with `credentials: include`, store only the new
   access token in frontend auth state, and retry the original request once.
5. Revoke or expire the refresh session, then repeat the protected route check.
   The app should clear access-token state, redirect to `/auth`, and avoid a
   loop of repeated `401 invalid token` requests.
6. Sign out and confirm the backend revokes the refresh session and clears the
   cookie.

Automated coverage target:

```bash
npm --prefix backend run test:web-session-refresh
npm --prefix frontend test -- --watchAll=false
```

### MCP Authoring Tool Checks

1. Connect an authenticated MCP client to `http://localhost:8080/mcp`.
2. Invoke `create_project` for a new test project.
3. Invoke `create_pipeline` inside that project.
4. Invoke `create_pipeline_node` at least three times with explicit positions
   or layout hints that keep nodes separated on the canvas.
5. Invoke `connect_pipeline_nodes` to connect those nodes into a simple
   sequential workflow.
6. Read `brainiac://pipelines/<id>/graph` and `validate_pipeline`; confirm
   ownership is enforced, resource links are returned, graph validation uses the
   existing result shape, and duplicate/cross-pipeline edges are rejected.
7. Open the pipeline in the web canvas and confirm the nodes are not stacked or
   overlapping. If a tool omitted positions, confirm the backend derived
   readable left-to-right or top-to-bottom spacing.

Automated coverage target:

```bash
npm --prefix backend run test:mcp:authoring
```

### Follow-Up MCP Domain Tool Checks

1. Invoke `list_node_types` and confirm supported runtime node types include
   ids, names, related tool ids, `runtime_support_state`, resource URIs, and
   safe config/default summaries.
2. Invoke `get_node_type` for a creatable node type and confirm the response is
   enough to choose `nodeTypeId` and draft valid config without hidden ids.
3. Invoke `get_pipeline_graph` and `list_pipeline_edges` for a seeded pipeline;
   confirm nodes, edges, tool bindings, resource links, and diagnostics match
   the graph resource. If validation is requested, confirm invalid graphs return
   validation diagnostics instead of a successful-only response.
4. Invoke `validate_node_config` with valid and invalid config; confirm it does
   not mutate state and returns distinguishable diagnostics.
5. Invoke `update_pipeline_node` to change label/config/position, then read the
   graph and validation output. The result should include the node resource URI,
   graph URI, validation result, and diagnostics if validation fails.
6. Invoke `delete_pipeline_edge` and `delete_pipeline_node` on test-only graph
   elements and confirm ownership, affected-edge behavior, and validation
   diagnostics. Destructive operations should be presented as mutating
   confirmation-appropriate MCP calls by the client.
7. Invoke `search_node_types` and `search_tools` with capability-style queries
   and confirm results are bounded and useful for agent selection.
8. Invoke `get_agent_tool_bindings` for an agent node and confirm explicit
   `ToolNode -> AgentCall` bindings and unresolved tools are visible.
9. Invoke `auto_layout_pipeline` first with `dryRun: true`, then on a test
   pipeline with confirmation; confirm it changes only `ui_json` placement and
   leaves graph structure unchanged. The dry-run response should return the
   same proposed updates without persisting them.

### Validation Notes

- Backend build and automated MCP checks passed with `npm --prefix backend run
  build`, `test:mcp:readonly`, `test:mcp:auth`, `test:mcp:perf`,
  `test:mcp:export`, and `test:contracts:freeze`.
- Full backend API regression passed after starting the backend on
  `http://localhost:8080` and running `npm --prefix backend run test`.
- VS Code extension scaffold smoke passed with `npm --prefix vscode-extension
  run test`.
- Manual VS Code UI verification passed for dev-token fallback and browser
  sign-in against `http://localhost:8080/mcp`: resource browsing,
  `list_projects`, `validate_pipeline`, one export tool, sign-out, and
  auth/backend error feedback were checked.
- OAuth/token lifecycle automated validation passed for local metadata endpoints,
  disabled standard `.well-known` discovery, refresh-token rotation, replay
  rejection, revoke invalidation, scoped MCP authorization, VS Code
  SecretStorage-only session behavior, provider refresh-before-use, and re-auth
  fallback on refresh failure.
- Inline export automated validation passed for project, pipeline, and node
  tool responses containing inline redacted `snapshot`, `redaction_report`,
  secondary `export_resource_uri`, and `resource_links`.
- Browser stale-token automated validation passed for protected API
  `401 invalid token` responses clearing `brainiac.tokens` and surfacing a
  session-expired state.
- Remaining manual gap: verify the full OAuth refresh/revoke UX inside a real VS
  Code window, including forced access-token expiry, automatic refresh,
  revoked-refresh recovery, re-auth prompts, and narrow editor layout feedback.

## Out Of MVP

- Starting executions automatically from model suggestions.
- Composite one-shot prompt-to-pipeline generation before primitive authoring
  tools are tested.
- Raw dataset content export.
- Custom VS Code webviews.
