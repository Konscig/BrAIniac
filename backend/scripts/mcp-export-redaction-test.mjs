import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  pipelineExportUri,
  pipelineNodeExportUri,
  projectExportUri,
  parseBrainiacResourceUri,
} from '../src/mcp/serializers/mcp-resource-uri.ts';
import { redactMcpSecrets } from '../src/mcp/serializers/mcp-redaction.ts';

const exportResources = [
  { kind: 'project-export', uri: projectExportUri(1) },
  { kind: 'pipeline-export', uri: pipelineExportUri(10) },
  { kind: 'pipeline-node-export', uri: pipelineNodeExportUri(10, 100) },
];

for (const resource of exportResources) {
  assert.equal(parseBrainiacResourceUri(resource.uri).kind, resource.kind);
}

const sample = {
  project: { project_id: 1, name: 'Research' },
  graph: {
    nodes: [
      {
        node_id: 100,
        ui_json: {
          providerApiKey: 'sk-or-v1-secretsecretsecret',
          dataset_content: 'raw private dataset text',
        },
      },
    ],
  },
  tools: [{ tool_id: 7, config_json: { credential: 'Bearer abc.def.ghi' } }],
};

const redacted = redactMcpSecrets(sample);
assert.equal(redacted.value.graph.nodes[0].ui_json.providerApiKey, '[REDACTED]');
assert.equal(redacted.value.graph.nodes[0].ui_json.dataset_content, '[REDACTED]');
assert.equal(redacted.value.tools[0].config_json.credential, '[REDACTED]');
assert.ok(redacted.redactions.some((item) => item.reason === 'secret-like field'));
assert.ok(redacted.redactions.some((item) => item.reason === 'raw dataset content'));

const exportResourceSource = await readFile(new URL('../src/mcp/resources/export.resources.ts', import.meta.url), 'utf8');
assert.match(exportResourceSource, /validatePipelineGraph/, 'export snapshots must include validation from existing service');
assert.match(exportResourceSource, /ensurePipelineOwnedByUser/, 'export snapshots must verify pipeline ownership');
assert.match(exportResourceSource, /redaction_report/, 'export snapshots must include redaction report');

console.log('MCP export redaction checks OK');
