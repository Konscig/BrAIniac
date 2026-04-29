# VS Code Client Contract

## Scope

The first VS Code slice connects VS Code to the BrAIniac MCP backend using
VS Code's built-in MCP support. It should register the backend MCP server and
let VS Code provide resource browsing, tool invocation, confirmations, logs, and
auth prompts.

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

The extension slice may replace manual config with a server definition provider.

## Extension Provider

When implemented, the extension contributes an MCP server definition provider
with:

- provider id: `brainiacMcp`
- label: `BrAIniac MCP`
- server definition type: HTTP
- URI setting: local backend MCP URL
- auth resolution: prompt for existing BrAIniac access token or reuse a later
  auth integration

## Required User Feedback

- Connected
- Disconnected
- Authentication required
- Authentication failed
- Backend unavailable
- Tool failed with validation/permission/runtime diagnostics

## UX Rules

- Prefer VS Code's built-in MCP resource browser and tool confirmation dialogs.
- Do not add custom sidebars or webviews in the first extension slice.
- Read-only tools should be annotated so VS Code can avoid unnecessary
  confirmation.
- Non-read-only tools must require explicit confirmation.

## Deferred Work

- OAuth/DCR flow
- Custom tree view
- Inline MCP Apps UI
- Agent authoring commands

