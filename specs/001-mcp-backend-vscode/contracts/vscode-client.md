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
  -> backend returns authorization result to VS Code/extension callback
  -> token is stored in VS Code SecretStorage
  -> MCP HTTP requests include Authorization: Bearer <token>
```

Implementation may use a transitional local browser callback flow before full
OAuth metadata/DCR support:

- extension command `BrAIniac: Sign in` starts a short-lived auth request;
- extension opens the BrAIniac web login in the external browser;
- backend redirects to a localhost or VS Code URI callback with a validated
  state and credential result;
- extension stores credentials in SecretStorage;
- extension refreshes MCP server definitions.

Manual access-token prompt remains available only as `BrAIniac: Use Dev Token`
or equivalent dev fallback.

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
