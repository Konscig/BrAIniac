import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolveCanvasPosition } from '../src/mcp/tools/authoring-layout.ts';

const authoringSource = await readFile(new URL('../src/mcp/tools/authoring.tools.ts', import.meta.url), 'utf8');
const layoutSource = await readFile(new URL('../src/mcp/tools/authoring-layout.ts', import.meta.url), 'utf8');
const serverSource = await readFile(new URL('../src/mcp/mcp.server.ts', import.meta.url), 'utf8');
const contractSource = await readFile(new URL('../../specs/001-mcp-backend-vscode/contracts/mcp-tools.md', import.meta.url), 'utf8');

for (const toolName of ['create_project', 'create_pipeline', 'create_pipeline_node', 'connect_pipeline_nodes']) {
  assert.match(authoringSource, new RegExp(`['"]${toolName}['"]`), `${toolName} must be registered`);
  assert.match(contractSource, new RegExp(`### \`${toolName}\``), `${toolName} must be documented in MCP tool contract`);
}

assert.match(serverSource, /registerAuthoringTools/, 'MCP server must register authoring tools');
assert.match(authoringSource, /readOnlyHint:\s*false/g, 'authoring tools must be non-read-only');
assert.match(authoringSource, /requireMcpScope\(extra,\s*'mcp:execute'\)/, 'authoring tools must require mutating scope');
assert.match(authoringSource, /ensureProjectOwnedByUser/, 'authoring tools must verify project ownership');
assert.match(authoringSource, /ensurePipelineOwnedByUser/, 'authoring tools must verify pipeline ownership');
assert.match(authoringSource, /validatePipelineGraph/, 'authoring tools must run graph validation after mutation');
assert.match(authoringSource, /tool_ref/, 'authoring tools must reject hidden tool_ref/tool_refs bindings');
assert.match(authoringSource, /MCP_DUPLICATE_EDGE/, 'authoring tools must reject duplicate edges');
assert.match(authoringSource, /MCP_CROSS_PIPELINE_EDGE/, 'authoring tools must reject cross-pipeline edges');
assert.match(layoutSource, /DEFAULT_X_GAP = 380/, 'layout helper must use readable default horizontal spacing');
assert.match(layoutSource, /DEFAULT_Y_GAP = 220/, 'layout helper must use readable default vertical spacing');
assert.match(layoutSource, /MIN_X_GAP = 340/, 'layout helper must enforce minimum horizontal spacing');
assert.match(layoutSource, /MIN_Y_GAP = 200/, 'layout helper must enforce minimum vertical spacing');

const derived = resolveCanvasPosition({
  layout: { direction: 'left_to_right', column: 1, row: 0, xGap: 360, yGap: 220 },
  existingNodes: [{ ui_json: { x: 0, y: 0 } }],
});
assert.deepEqual(derived.position, { x: 360, y: 0 });
assert.ok(derived.diagnostics.some((item) => item.code === 'MCP_LAYOUT_DERIVED'));

const adjusted = resolveCanvasPosition({
  position: { x: 0, y: 0 },
  layout: { xGap: 360, yGap: 220 },
  existingNodes: [{ ui_json: { x: 0, y: 0 } }],
});
assert.equal(adjusted.position.x >= 360, true, 'overlapping explicit position must be adjusted');
assert.ok(adjusted.diagnostics.some((item) => item.code === 'MCP_LAYOUT_ADJUSTED'));

console.log('MCP authoring contract checks OK');
