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
10. Invoke project, pipeline, and node export tools and confirm each export
   resource opens with a redaction report.
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
5. After completion, exchange returns an access token and the extension stores
   the credential in VS Code SecretStorage.
6. VS Code connects to `http://localhost:8080/mcp` with
   `Authorization: Bearer <stored token>`.
7. Use VS Code's built-in MCP tools/resources UI to browse BrAIniac context and
   invoke tools.

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

- [ ] `BrAIniac: Sign in` opens `/auth?vscode_state=...` in the external browser.
- [ ] Browser login completes `POST /auth/vscode/complete`; VS Code polling
  receives an authorized exchange result.
- [ ] The extension stores the returned credential in VS Code SecretStorage,
  not in `.vscode/mcp.json`, workspace files, or VS Code settings.
- [ ] The BrAIniac VS Code extension provider `brainiacMcp` offers
  `http://localhost:8080/mcp` using the stored session.
- [ ] Resource browsing shows projects, pipelines, graph, validation, nodes,
  tools, agents, and export resources for the authenticated user only.
- [ ] `list_projects` runs as a read-only tool without unnecessary confirmation.
- [ ] `validate_pipeline` returns the existing graph validation result shape.
- [ ] Export tools return resource links and the opened export resources include
  a redaction report.
- [ ] Invalid token, missing token, backend unavailable, forbidden resource, and
  tool runtime errors are visible to the user.
- [ ] Browser sign-in completes within 30 seconds after credentials are
  submitted in local dev.
- [ ] Expired or rejected credentials produce an actionable re-auth prompt
  within 5 seconds.
- [ ] The VS Code command/status flow remains usable in a narrow editor layout
  without hidden primary actions.
- [ ] `BrAIniac: Sign out` deletes the session and requires re-authentication.
- [ ] `BrAIniac: Use Dev Token` remains available as an explicit developer
  fallback and is not presented as the default setup path.

### Validation Notes

- Backend build and automated MCP checks passed with `npm --prefix backend run
  build`, `test:mcp:readonly`, `test:mcp:auth`, `test:mcp:perf`,
  `test:mcp:export`, and `test:contracts:freeze`.
- Full backend API regression passed after starting the backend on
  `http://localhost:8080` and running `npm --prefix backend run test`.
- VS Code extension scaffold smoke passed with `npm --prefix vscode-extension
  run test`.
- Manual VS Code UI verification is still required outside this headless
  environment: connect to `http://localhost:8080/mcp`, browse resources, invoke
  `list_projects`, `validate_pipeline`, one export tool, and confirm auth and
  backend error feedback.

## Out Of MVP

- Creating or editing agent nodes.
- Binding tools to agents.
- Starting executions automatically from model suggestions.
- Raw dataset content export.
- Custom VS Code webviews.
