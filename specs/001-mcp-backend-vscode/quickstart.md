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
5. Confirm read-only tools do not request unnecessary confirmation.
6. Confirm permission/backend errors are visible in VS Code output/status.

## Out Of MVP

- Creating or editing agent nodes.
- Binding tools to agents.
- Starting executions automatically from model suggestions.
- Raw dataset content export.
- Custom VS Code webviews.
