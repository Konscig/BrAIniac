# Data Model: MCP Access For BrAIniac

## MCP Connection

Represents one client connection to BrAIniac MCP.

Fields:

- `connection_id`: ephemeral identifier for logs/session correlation.
- `user_id`: authenticated BrAIniac user id resolved from the same token model
  used by existing API routes.
- `client_name`: optional MCP client label.
- `capabilities`: client/server capabilities negotiated by the MCP SDK.
- `created_at`: connection start timestamp.

Validation:

- Connection must have a valid authenticated user for owner-scoped resources.
- Failed auth returns an MCP-visible permission error, not an empty resource
  list that hides the cause.

## MCP Resource

Read-only MCP representation of BrAIniac context.

Fields:

- `uri`: stable `brainiac://...` URI.
- `name`: human-readable resource name.
- `mime_type`: usually `application/json` or `text/markdown`.
- `description`: concise user-facing purpose.
- `payload`: bounded JSON/text content from existing backend services.
- `diagnostics`: optional warnings/errors related to validation or runtime state.

Relationships:

- A project resource lists pipeline resource links.
- A pipeline resource links nodes, edges, validation, executions, agents, and
  export snapshots.
- A node resource links node type, tool binding, sub-pipeline, or agent config
  when present.

Validation:

- Resource handlers must enforce ownership before reading.
- Large payloads should be summarized or linked rather than embedded.
- Secrets and provider credentials are never included.

## MCP Tool

Callable MCP action exposed by BrAIniac.

Fields:

- `name`: snake_case action name.
- `title`: human-readable title.
- `description`: when to use the tool and what it returns.
- `input_schema`: validated input shape.
- `output_schema`: structured output shape where practical.
- `annotations`: MCP hints such as read-only or idempotent behavior.
- `phase`: `readonly`, `operation`, or `authoring`.

Validation:

- Read-only tools must not mutate BrAIniac state.
- Operation tools require explicit target ids and user input.
- Authoring tools are disabled until the authoring slice is planned and tested.
- Tool-level business errors return structured MCP tool errors.

## Project Context

Owner-scoped project summary exposed through MCP.

Fields:

- `project_id`
- `name`
- `pipeline_count`
- `pipelines`: resource links or summaries

Validation:

- Only projects owned by the authenticated user are visible.

## Pipeline Context

Owner-scoped pipeline summary and graph context.

Fields:

- `pipeline_id`
- `fk_project_id`
- `name`
- `nodes`
- `edges`
- `datasets`
- `validation_summary`
- `latest_execution`
- `report_summary`

Validation:

- Must preserve canonical graph semantics from SDD.
- Validation summaries come from `validatePipelineGraph`, not a separate MCP
  validator.

## Node Context

Pipeline node context for read-only inspection and later authoring.

Fields:

- `node_id`
- `fk_pipeline_id`
- `fk_type_id`
- `fk_sub_pipeline`
- `ui_json`
- `top_k`
- `node_type`
- `runtime_support_state`
- `tool_binding`
- `agent_config`

Validation:

- Unsupported node types are represented explicitly.
- Agent/tool relationships use explicit graph/tool binding semantics.

## Execution Context

Read-only projection of an executor snapshot.

Fields:

- `execution_id`
- `pipeline_id`
- `status`
- `request`
- `preflight`
- `summary`
- `final_result`
- `warnings`
- `error`
- `diagnostics`

Validation:

- Must come from existing executor snapshot APIs/services.
- Provider errors, empty agent output, and validation failures are distinct
  states.

## Export Snapshot

Redacted project or pipeline context generated for external review.

Fields:

- `scope`: `project` or `pipeline`
- `project_id`
- `pipeline_id`
- `generated_at`
- `graph`
- `nodes`
- `agents`
- `tools`
- `datasets`
- `validation`
- `executions`
- `redactions`

Validation:

- Must omit secrets, credentials, provider keys, and unauthorized resources.
- Raw dataset content is excluded by default; include only metadata and safe
  references unless a later explicit content-export option is approved.

## VS Code Integration State

Editor-side state for the later extension/client slice.

Fields:

- `server_url`
- `auth_state`
- `connection_state`
- `available_resources`
- `available_tools`
- `last_error`

Validation:

- Connection errors and auth errors must be visible to the user.
- The extension should rely on VS Code MCP resource/tool surfaces before adding
  custom UI.

