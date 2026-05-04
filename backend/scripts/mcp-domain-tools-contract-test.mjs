import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

async function readProjectFile(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

const toolContract = await readProjectFile('../../specs/001-mcp-backend-vscode/contracts/mcp-tools.md');
const resourceContract = await readProjectFile('../../specs/001-mcp-backend-vscode/contracts/mcp-resources.md');

for (const toolName of ['list_node_types', 'get_node_type']) {
  assert.match(toolContract, new RegExp(`### \`${toolName}\``), `${toolName} must be documented in MCP tool contract`);
}

for (const toolName of ['get_pipeline_graph', 'list_pipeline_edges']) {
  assert.match(toolContract, new RegExp(`### \`${toolName}\``), `${toolName} must be documented in MCP tool contract`);
}

assert.match(toolContract, /### `validate_node_config`/, 'validate_node_config must be documented in MCP tool contract');

for (const toolName of ['update_pipeline_node', 'delete_pipeline_node', 'delete_pipeline_edge']) {
  assert.match(toolContract, new RegExp(`### \`${toolName}\``), `${toolName} must be documented in MCP tool contract`);
}

for (const toolName of ['search_node_types', 'search_tools', 'get_agent_tool_bindings']) {
  assert.match(toolContract, new RegExp(`### \`${toolName}\``), `${toolName} must be documented in MCP tool contract`);
}

for (const resourceUri of ['brainiac://node-types', 'brainiac://node-types/{nodeTypeId}']) {
  assert.match(resourceContract, new RegExp(resourceUri.replace(/[{}]/g, '\\$&')), `${resourceUri} must be documented`);
}

assert.match(toolContract, /runtime_support_state/, 'node type discovery must expose runtime support state');
assert.match(toolContract, /safe summaries of required config/, 'node type discovery must expose safe config summaries');
assert.match(resourceContract, /Unsupported node types must be marked explicitly/, 'node type resources must document unsupported state');
assert.doesNotMatch(toolContract, /hidden `tool_ref`\/`tool_refs` exposure/, 'contracts must not allow hidden tool bindings');
assert.match(toolContract, /owner-scoped pipeline graph/, 'graph inspection must be owner scoped');
assert.match(toolContract, /nodes, edges, node types, tool bindings, validation summary/, 'graph inspection must return graph and validation context');
assert.match(toolContract, /check existing\s+connections before calling `connect_pipeline_nodes`/, 'edge listing must support duplicate-edge preflight');
assert.match(toolContract, /Must not mutate state/, 'node config validation must be read-only');
assert.match(toolContract, /field-level diagnostics/, 'node config validation must expose diagnostics when available');
assert.match(toolContract, /distinguish unsupported node types from invalid config/, 'node config validation must distinguish unsupported type from invalid config');
assert.match(toolContract, /Mutating and confirmation-appropriate/, 'graph edit tools must require confirmation');
assert.match(toolContract, /graph validation after mutation/, 'graph edit tools must run validation after mutation');
assert.match(toolContract, /Must not delete nodes outside the target owned pipeline/, 'node delete must enforce pipeline ownership');
assert.match(toolContract, /cross-pipeline endpoints/, 'edge delete must reject cross-pipeline endpoints');
assert.match(toolContract, /Search runtime-backed node types by query/, 'node type search must be documented');
assert.match(toolContract, /Search BrAIniac tool catalog entries by query/, 'tool search must be documented');
assert.match(toolContract, /ToolNode -> AgentCall/, 'agent binding tool must expose explicit tool capability edges');
assert.match(toolContract, /unresolved tools/, 'agent binding tool must expose unresolved tool diagnostics');

console.log('MCP domain tool contract checks OK');
