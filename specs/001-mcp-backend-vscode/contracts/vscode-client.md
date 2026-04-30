# VS Code Client Contract

## Scope

The VS Code slice connects VS Code to the BrAIniac MCP backend using VS Code's
built-in MCP support. The extension registers the backend MCP server and owns
setup/auth state. VS Code remains the MCP host/client for resource browsing,
tool invocation, confirmations, logs, and auth prompts.

## Configuration

Supported MVP configuration:

```json
{
  "servers": {
    "brainiac": {
      "type": "http",
      "uri": "http://localhost:8080/mcp",
      "headers": {
        "Authorization": "Bearer ${input:brainiacToken}"
      }
    }
  }
}
```

Manual configuration is a developer fallback only. The product flow is the
extension-driven sign-in path below.

## Product Auth Flow

Preferred production flow:

```text
User installs BrAIniac VS Code extension
  -> extension registers provider id brainiacMcp
  -> user starts/connects BrAIniac MCP
  -> VS Code/MCP auth opens BrAIniac authorization in external browser
  -> user logs in with normal BrAIniac credentials
  -> extension polls/exchanges the auth state with the backend
  -> token is stored in VS Code SecretStorage
  -> MCP HTTP requests include Authorization: Bearer <token>
```

Implementation uses a transitional local browser polling flow before full OAuth
metadata/DCR support:

- extension command `BrAIniac: Sign in` starts a short-lived auth request;
- extension opens the BrAIniac web login in the external browser;
- BrAIniac frontend preserves `vscode_state` during normal login and completes
  the auth request through the backend;
- extension polls/exchanges by `state` until it receives a credential result or
  timeout;
- extension stores credentials in SecretStorage;
- extension refreshes MCP server definitions.

Manual access-token prompt remains available only as `BrAIniac: Use Dev Token`
or equivalent dev fallback.

## Browser Auth Bridge Contract

Full OAuth metadata, Dynamic Client Registration, refresh/revoke, and hosted
SaaS OAuth hardening are deferred. The local bridge MUST keep state/route
semantics narrow enough to replace with OAuth later.

### `POST /auth/vscode/start`

Purpose: create a short-lived VS Code browser-auth request.

Input:

```json
{
  "callback": "polling",
  "mcpBaseUrl": "http://localhost:8080/mcp"
}
```

Output:

```json
{
  "state": "random-single-use-state",
  "loginUrl": "http://localhost:3000/auth?vscode_state=random-single-use-state",
  "expiresAt": "2026-04-30T12:00:00.000Z",
  "pollIntervalMs": 1000
}
```

Rules:

- `state` is random, unguessable, single-use, and expires quickly.
- `loginUrl` opens the normal BrAIniac browser login flow.
- No access token is returned from this endpoint.

### Browser Login Completion

The frontend-aware completion path is the product path for this slice.

Flow:

```text
Browser opens http://localhost:3000/auth?vscode_state=<state>
  -> user submits normal BrAIniac login
  -> frontend receives normal /auth/login tokens
  -> frontend calls POST /auth/vscode/complete with Authorization: Bearer <accessToken>
  -> backend validates token through existing auth middleware
  -> backend marks <state> authorized for the authenticated user
```

### `POST /auth/vscode/complete`

Purpose: allow the authenticated BrAIniac frontend session to authorize a
pending VS Code polling request.

Input:

```json
{
  "state": "random-single-use-state"
}
```

Headers:

```http
Authorization: Bearer <accessToken>
```

Output:

```json
{
  "status": "authorized",
  "expiresAt": "2026-04-30T12:00:00.000Z"
}
```

Rules:

- Completion requires a valid existing BrAIniac access token and MUST reuse the
  same auth middleware or token verification path as protected API routes.
- The bridge MUST NOT issue a token by directly signing JWTs.
- Invalid, expired, missing, failed, or already consumed states return
  distinguishable errors.
- The frontend MUST preserve the exact `vscode_state` query parameter while the
  user logs in. If state is missing after login, the frontend continues normal
  web login but cannot complete VS Code sign-in.
- If the browser already has a valid BrAIniac web session/token when `/auth`
  opens with `vscode_state`, the frontend should complete that state without
  requiring another password entry.

### `POST /auth/vscode/exchange`

Purpose: exchange an authorized polling `state` for the existing BrAIniac access
token.

Input:

```json
{
  "state": "random-single-use-state"
}
```

Pending output:

```json
{
  "status": "pending",
  "expiresAt": "2026-04-30T12:00:00.000Z"
}
```

Authorized output:

```json
{
  "status": "authorized",
  "accessToken": "...",
  "tokenType": "Bearer",
  "expiresAt": "2026-04-30T13:00:00.000Z"
}
```

Error output:

```json
{
  "ok": false,
  "code": "INVALID_STATE",
  "message": "invalid or expired VS Code auth state"
}
```

Rules:

- Authorized exchange consumes the state; replay returns an explicit error.
- Pending exchange never returns a token.
- Invalid, expired, reused, or failed states return distinguishable errors.
- Tokens returned here are stored only in VS Code SecretStorage.
- `expiresAt` in the authorized response MAY be omitted when the existing token
  issuer does not expose a reliable expiry timestamp to the bridge.

## Extension Provider

When implemented, the extension contributes an MCP server definition provider
with:

- provider id: `brainiacMcp`
- label: `BrAIniac MCP`
- server definition type: HTTP
- URI setting: local/backend MCP URL
- auth resolution: use stored SecretStorage session; if absent or expired,
  start browser sign-in or return an actionable sign-in requirement

## Extension Commands

- `BrAIniac: Sign in`: opens browser auth and stores a session.
- `BrAIniac: Sign out`: deletes stored credentials and refreshes server definitions.
- `BrAIniac: Reconnect MCP`: refreshes MCP server definitions after backend URL
  or auth state changes.
- `BrAIniac: Use Dev Token`: optional fallback for local development only.

## Required User Feedback

- Connected
- Disconnected
- Authentication required
- Authentication failed
- Backend unavailable
- Tool failed with validation/permission/runtime diagnostics
- Sign-in started
- Sign-in timed out
- Signed out
- Token expired; sign in again

## UX Rules

- Prefer VS Code's built-in MCP resource browser and tool confirmation dialogs.
- Do not add custom sidebars or webviews in the first extension slice.
- Do not make manual token paste the default path.
- Store tokens only in VS Code SecretStorage.
- Read-only tools should be annotated so VS Code can avoid unnecessary
  confirmation.
- Non-read-only tools must require explicit confirmation.

## Deferred Work

- Marketplace packaging and hosted SaaS OAuth hardening
- Custom tree view
- Inline MCP Apps UI
- Agent authoring commands
