# Node Role Profiles

## Canonical Roles
- `source`
- `transform`
- `control`
- `sink`

## Layer Separation
- Node: executable graph unit in the pipeline/runtime layer.
- Tool: reusable capability with input/output/config contracts.
- Executor kind: technical execution mode for a tool.
- Provider/adapter: low-level integration transport, not a node and not a tool.

## Recommended Default Matrix
| role | input.min | input.max | output.min | output.max |
|---|---:|---:|---:|---:|
| source | 0 | 2 | 1 | 5 |
| transform | 0 | 8 | 0 | 8 |
| control | 0 | 8 | 0 | 8 |
| sink | 0 | 10 | 0 | 2 |

These are recommended defaults, not hard constraints by themselves.

## AgentCall Profile
- role: `transform`
- internalRuntime: enabled
- bounded limits:
  - `maxAttempts`
  - `maxToolCalls`
  - `maxTimeMs`
  - `maxCostUsd`
  - `maxTokens`
- output envelope:
  - `status`
  - `answer`
  - `evidence`
  - `confidence`
  - `attemptsUsed`
  - `toolCallsUsed`
  - `timing`

Important:
- `AgentCall` may orchestrate tool calls internally.
- The tool set available to `AgentCall` must come through inbound graph edges only.
- `AgentCall` must not define its own hidden callable tool catalog in node config.
- The preferred edge artifacts are explicit `tool_ref` / `tool_refs` payloads; direct `ToolNode` outputs are also acceptable when connected by edges.

## ToolNode Profile
- role: `transform`
- purpose: execute one explicit tool as a graph step
- required tool binding: `ui_json.tool_id` or `ui_json.tool`
- required executor kind: one of the supported runtime kinds

## Layer Choice Rule
- Use `LLMCall` for a direct single model call.
- Use `ToolNode` when a reusable tool contract should be executed as a graph step.
- Use `AgentCall` when a bounded multi-step strategy is needed.

## Loop Policy
- Loops are allowed only with explicit loop policy.
- Recommended loop policy fields:
  - `enabled`
  - `maxIterations`
  - `stopCondition`
  - `onLimit`

## Fallback Policy
If `NodeType.config_json` is missing or incomplete:
- default role: `transform`
- default input range: `0..10`
- default output range: `0..10`
- validator returns a warning, not a hard failure, unless stricter project rules say otherwise

## Example NodeType.config_json
```json
{
  "role": "transform",
  "input": { "min": 1, "max": 3 },
  "output": { "min": 1, "max": 2 },
  "enforcementMode": "warn",
  "loop": {
    "enabled": true,
    "maxIterations": 3,
    "stopCondition": "quality >= 0.8",
    "onLimit": "break"
  },
  "agent": {
    "enabled": true,
    "maxAttempts": 3,
    "maxToolCalls": 8,
    "maxTimeMs": 20000,
    "maxCostUsd": 0.5,
    "maxTokens": 12000
  }
}
```
