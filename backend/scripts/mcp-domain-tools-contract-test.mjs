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

for (const resourceUri of ['brainiac://node-types', 'brainiac://node-types/{nodeTypeId}']) {
  assert.match(resourceContract, new RegExp(resourceUri.replace(/[{}]/g, '\\$&')), `${resourceUri} must be documented`);
}

assert.match(toolContract, /runtime_support_state/, 'node type discovery must expose runtime support state');
assert.match(toolContract, /safe summaries of required config/, 'node type discovery must expose safe config summaries');
assert.match(resourceContract, /Unsupported node types must be marked explicitly/, 'node type resources must document unsupported state');
assert.doesNotMatch(toolContract, /hidden `tool_ref`\/`tool_refs` exposure/, 'contracts must not allow hidden tool bindings');

console.log('MCP domain tool contract checks OK');
