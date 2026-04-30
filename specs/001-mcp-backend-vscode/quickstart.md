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

1. Add a temporary `.vscode/mcp.json` pointing to the backend MCP endpoint, or
   install the later BrAIniac VS Code extension.
2. Open VS Code MCP resource browsing.
3. Confirm BrAIniac resources are listed with readable names.
4. Invoke a read-only tool.
5. Invoke `validate_pipeline` for a seeded pipeline.
6. Invoke project, pipeline, and node export tools and confirm each export
   resource opens with a redaction report.
7. Confirm read-only tools do not request unnecessary confirmation.
8. Confirm permission/backend errors are visible in VS Code output/status.

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

### Manual Smoke Checklist

- [ ] `.vscode/mcp.json` can connect to `http://localhost:8080/mcp` with
  `Authorization: Bearer <token>`.
- [ ] The BrAIniac VS Code extension provider `brainiacMcp` offers the same
  backend URL and token flow through prompts/settings.
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
