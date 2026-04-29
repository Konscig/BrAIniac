import assert from 'node:assert/strict';
import {
  createMcpJsonEnvelope,
  toMcpJsonContent,
} from '../src/mcp/serializers/mcp-safe-json.ts';
import {
  parseBrainiacResourceUri,
  pipelineAgentsUri,
  pipelineGraphUri,
  pipelineNodeUri,
  pipelineUri,
  projectListUri,
  projectPipelinesUri,
  projectUri,
  toolListUri,
  toolUri,
} from '../src/mcp/serializers/mcp-resource-uri.ts';

const expectedResources = [
  { kind: 'projects', uri: projectListUri() },
  { kind: 'project', uri: projectUri(1) },
  { kind: 'project-pipelines', uri: projectPipelinesUri(1) },
  { kind: 'pipeline', uri: pipelineUri(10) },
  { kind: 'pipeline-graph', uri: pipelineGraphUri(10) },
  { kind: 'pipeline-node', uri: pipelineNodeUri(10, 100) },
  { kind: 'pipeline-agents', uri: pipelineAgentsUri(10) },
  { kind: 'tools', uri: toolListUri() },
  { kind: 'tool', uri: toolUri(7) },
];

for (const resource of expectedResources) {
  const parsed = parseBrainiacResourceUri(resource.uri);
  assert.equal(parsed.kind, resource.kind, `${resource.uri} must parse to ${resource.kind}`);
}

const graphEnvelope = createMcpJsonEnvelope({
  kind: 'pipeline-graph',
  resourceUri: pipelineGraphUri(10),
  data: {
    nodes: [{ node_id: 100, resource_uri: pipelineNodeUri(10, 100) }],
    edges: [],
  },
  links: [
    { uri: pipelineUri(10), name: 'Pipeline 10' },
    { uri: pipelineAgentsUri(10), name: 'Pipeline 10 agents' },
  ],
  diagnostics: [{ severity: 'info', code: 'MCP_CONTRACT', message: 'contract shape check' }],
});

const content = toMcpJsonContent(graphEnvelope);
assert.equal(content.mimeType, 'application/json');
assert.equal(content.uri, pipelineGraphUri(10));

const parsedContent = JSON.parse(content.text);
assert.equal(parsedContent.kind, 'pipeline-graph');
assert.equal(parsedContent.resource_uri, pipelineGraphUri(10));
assert.ok(Array.isArray(parsedContent.links), 'resource payload must include links');
assert.ok(Array.isArray(parsedContent.diagnostics), 'resource payload must include diagnostics');
assert.ok(Array.isArray(parsedContent.redactions), 'resource payload must include redactions');

console.log('MCP read-only resource contract checks OK');
