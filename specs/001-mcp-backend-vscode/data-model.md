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
- Authoring tools are explicit mutating tools and must be registered only after
  contract tests cover ownership, validation, rollback/error behavior, and MCP
  annotations.
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

Redacted project, pipeline, or node context generated for external review.

Fields:

- `scope`: `project`, `pipeline`, or `node`
- `project_id`
- `pipeline_id`
- `node_id`
- `generated_at`
- `graph`
- `nodes`
- `agents`
- `tools`
- `datasets`
- `validation`
- `executions`
- `redaction_report`: explicit list/summary of omitted or masked fields
- `export_resource_uri`: optional secondary MCP resource URI for reopening the
  same export
- `resource_links`: optional related project/pipeline/node links

Validation:

- Must omit secrets, credentials, provider keys, and unauthorized resources.
- Raw dataset content is excluded by default; include only metadata and safe
  references unless a later explicit content-export option is approved.
- Export tools must return the redacted snapshot inline for ordinary project,
  pipeline, and node exports. Resource URIs are supplemental and must not be the
  only way to inspect the JSON from a normal export tool invocation.

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

## VS Code Auth Session

Editor-side authentication state for a signed-in BrAIniac user.

Fields:

- `account_id`: stable BrAIniac user/account identifier when known.
- `backend_url`: MCP backend URL associated with the session.
- `access_token`: stored only in VS Code SecretStorage.
- `refresh_token` or `refresh_code`: optional, stored only in SecretStorage if
  the backend supports refresh.
- `expires_at`: optional token expiry timestamp.
- `status`: `signed_out`, `signing_in`, `signed_in`, `expired`, or `error`.
- `last_error`: actionable auth/backend error message for the user.

Validation:

- Tokens must not be written to workspace config, repository files, logs, or
  normal VS Code settings.
- Expired or rejected tokens must trigger a visible re-auth path.
- Sign-out must delete SecretStorage entries and refresh MCP server definitions.

## Browser Auth Session

Browser-side authentication state for the BrAIniac web app. The browser may keep
the short-lived access token in current auth state, but the refresh credential is
server-issued cookie material and must not be readable by JavaScript.

Fields:

- `access_token`: bearer credential stored in browser auth state.
- `expires_at`: optional access token expiry timestamp if available to the
  frontend.
- `refresh_cookie`: HttpOnly, Secure, SameSite cookie set by the backend during
  login and refresh; not readable from frontend code.
- `refresh_session_id`: server-side refresh-session correlation id for rotation,
  revoke, audit, and replay detection.
- `refresh_expires_at`: server-side expiry timestamp for the refresh session.
- `status`: `signed_in`, `expired`, `refreshing`, `signed_out`, or `error`.
- `last_error`: user-visible session-expired or auth failure message.

Validation:

- Protected API `401` responses with invalid/expired-token semantics must call
  the supported web session refresh endpoint once with `credentials: include`,
  then retry the original protected request once if refresh succeeds.
- The app must redirect to `/auth` after clearing expired auth state rather than
  continuing to load projects, tools, node types, or graph data with the stale
  token.
- Browser refresh credentials must not be written to localStorage,
  sessionStorage, Redux-like stores, logs, URL parameters, or any
  JavaScript-readable storage.
- Refresh must reject expired, revoked, malformed, replayed, blocked, or
  cross-user cookies and must clear browser access-token state.
- Sign-out must revoke server-side refresh-session state and clear the cookie.

## MCP Authoring Request

Mutating MCP request that creates or edits BrAIniac project, pipeline, node, or
edge state for the authenticated user.

Fields:

- `operation`: `create_project`, `create_pipeline`, `create_pipeline_node`, or
  `connect_pipeline_nodes`; follow-up operations add `update_pipeline_node`,
  `delete_pipeline_node`, `delete_pipeline_edge`, and `auto_layout_pipeline`
  when applying layout changes.
- `project_id`: required for pipeline creation when not creating the project in
  the same request sequence.
- `pipeline_id`: required for node and edge creation.
- `node_type_id` or `node_type_name`: supported runtime node type reference for
  node creation.
- `label`: optional user-facing node label.
- `position`: optional explicit canvas position `{ "x": number, "y": number }`.
- `layout`: optional deterministic layout hint such as `{ "column": 0,
  "row": 0, "x_gap": 380, "y_gap": 220 }` when exact position is not supplied.
- `source_node_id` and `target_node_id`: required for edge creation.
- `idempotency_key`: optional client-provided key for retry-safe mutation where
  supported by existing services.

Validation:

- Every mutation must enforce the authenticated user's ownership before reading
  or writing project, pipeline, node, or edge state.
- Node creation must resolve to a supported node type and must not invent hidden
  tool bindings or legacy `tool_ref`/`tool_refs` behavior.
- Edge creation must reject duplicate edges, cross-pipeline endpoints, missing
  nodes, and unsafe graph states; validation diagnostics must be returned.
- Mutations must return resource links to changed project, pipeline, graph, and
  node resources.

## Node Type Catalog Entry

Runtime-backed BrAIniac node type information exposed through MCP so agents can
choose valid node ids and config before creating nodes.

Fields:

- `node_type_id`: database id used by node creation.
- `name`: user-facing node type name.
- `category`: grouping or capability label when available.
- `fk_tool_id`: related BrAIniac tool id when the node type binds a tool.
- `runtime_support_state`: `supported` or `unsupported`.
- `config_schema`: safe config expectations where available.
- `default_config`: safe defaults where available.
- `resource_uri`: node type or related tool resource link.

Validation:

- Unsupported node types must be visible only when explicitly requested and
  must not be presented as creatable.
- Secrets, provider keys, and hidden tool binding paths must not be exposed.

## Node Config Validation

Read-only preflight result for proposed node configuration.

Fields:

- `node_type_id`
- `config_json`
- `valid`
- `errors`
- `warnings`
- `normalized_config`: optional safe normalized preview if existing services
  can produce it.

Validation:

- Validation must not create or update nodes.
- Unsupported node types and invalid config must be distinguishable.

## Pipeline Graph Edit

Follow-up MCP mutation that updates or deletes existing graph elements.

Fields:

- `pipeline_id`
- `node_id`: required for node update/delete.
- `source_node_id` and `target_node_id`: required for edge delete.
- `label`: optional node label update.
- `config_json`: optional node configuration update.
- `ui_json`: optional canvas metadata update.
- `dry_run`: optional flag for layout proposals.

Validation:

- Edits must enforce ownership before reading or writing.
- Node updates must reject hidden `tool_ref`/`tool_refs` paths and unsupported
  node type behavior.
- Node and edge deletes must avoid unsafe partial graph state and return graph
  validation diagnostics after mutation.

## Canvas Layout Hint

Positioning metadata for MCP-created canvas nodes, stored in existing node
`ui_json` so the ReactFlow canvas can render the graph without extra client
logic.

Fields:

- `x`: finite canvas x-coordinate.
- `y`: finite canvas y-coordinate.
- `x_gap`: minimum horizontal spacing used when deriving positions; default
  should be large enough for BrAIniac node cards plus margin, about 380 pixels.
- `y_gap`: minimum vertical spacing used when deriving positions; default should
  avoid vertical overlap and leave room for expanded cards, about 220 pixels.
- `layout_direction`: `left_to_right` or `top_to_bottom`.

Validation:

- Authoring tools must accept explicit non-overlapping positions or derive
  deterministic positions from layout hints.
- If requested coordinates overlap existing or same-request nodes, the tool must
  either adjust to the next safe slot or reject with layout diagnostics.
- Tool descriptions must tell agents to avoid stacking nodes and prefer
  left-to-right or top-to-bottom spacing.

## Browser Auth Request

Transient backend/extension state used to complete browser login.

Fields:

- `state`: random CSRF/session correlation value.
- `mode`: `polling`.
- `login_url`: BrAIniac browser login URL containing the `state`.
- `created_at`
- `expires_at`
- `status`: `pending`, `authorized`, `failed`, `expired`, or `consumed`.
- `user_id`: set only after successful browser login.
- `completed_at`: set when the authenticated frontend completes the request.

Validation:

- `state` must be unguessable and single-use.
- Polling auth requests must expire quickly.
- The frontend must preserve `vscode_state` through normal BrAIniac login and
  call `POST /auth/vscode/complete` with the issued access token.
- Completion must validate that access token through the existing protected API
  auth path before marking the request authorized.
- The backend must issue credentials only after normal BrAIniac login succeeds.
- The extension must exchange only the active sign-in request `state`.
- Authorized exchange consumes the state and replay returns an explicit error.

## OAuth Authorization Grant

Backend-side authorization grant used when the VS Code auth path is verified or
migrated to OAuth 2.1-compatible behavior.

Fields:

- `authorization_code`: short-lived, single-use code issued after browser login.
- `code_challenge`: PKCE challenge supplied by the VS Code public client.
- `code_challenge_method`: `S256`.
- `redirect_uri`: registered/allowed VS Code redirect target or local bridge
  exchange target.
- `client_id`: VS Code extension/client identifier.
- `user_id`: authenticated BrAIniac user id.
- `scope`: MCP scopes granted for resources/tools.
- `expires_at`
- `consumed_at`

Validation:

- Authorization codes must be unguessable, short-lived, and single-use.
- Token exchange must verify the PKCE verifier before issuing tokens.
- Grants must bind to the authenticated user, client id, redirect URI, and
  approved scope.

## OAuth Token Lifecycle

Backend-issued token state used by VS Code MCP authorization.

Fields:

- `access_token`: short-lived bearer credential.
- `refresh_token`: longer-lived refresh credential, rotated when practical.
- `token_type`: `Bearer`.
- `scope`: granted MCP scopes.
- `expires_at`: access token expiry.
- `refresh_expires_at`: refresh credential expiry when supported.
- `revoked_at`: set on sign-out or explicit revoke.
- `session_id`: auth session correlation id for audit and revocation.

Validation:

- Refresh must reject expired, revoked, malformed, replayed, or cross-user
  credentials.
- Refresh should rotate refresh tokens where existing backend auth design
  supports it; otherwise the limitation must be documented and tested.
- Sign-out must revoke or invalidate refresh material and clear VS Code
  SecretStorage.
- MCP auth must enforce scopes and ownership after token validation.
