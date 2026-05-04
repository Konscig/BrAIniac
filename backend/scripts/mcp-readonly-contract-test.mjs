import assert from 'node:assert/strict';
import {
  createMcpJsonEnvelope,
  toMcpJsonContent,
} from '../src/mcp/serializers/mcp-safe-json.ts';
import {
  parseBrainiacResourceUri,
  pipelineAgentsUri,
  pipelineExecutionUri,
  pipelineGraphUri,
  pipelineNodeUri,
  pipelineUri,
  projectListUri,
  projectPipelinesUri,
  projectUri,
  pipelineValidationUri,
  toolListUri,
  toolUri,
} from '../src/mcp/serializers/mcp-resource-uri.ts';
import { readFile } from 'node:fs/promises';

const expectedResources = [
  { kind: 'projects', uri: projectListUri() },
  { kind: 'project', uri: projectUri(1) },
  { kind: 'project-pipelines', uri: projectPipelinesUri(1) },
  { kind: 'pipeline', uri: pipelineUri(10) },
  { kind: 'pipeline-graph', uri: pipelineGraphUri(10) },
  { kind: 'pipeline-validation', uri: pipelineValidationUri(10) },
  { kind: 'pipeline-execution', uri: pipelineExecutionUri(10, 'execution-1') },
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

const pipelineToolsSource = await readFile(new URL('../src/mcp/tools/pipeline.tools.ts', import.meta.url), 'utf8');
assert.match(pipelineToolsSource, /validatePipelineGraph/, 'validate_pipeline must reuse graph validation service');
assert.match(pipelineToolsSource, /startPipelineExecutionForUser/, 'start_pipeline_execution must reuse executor service');
assert.match(pipelineToolsSource, /getPipelineExecutionForUser/, 'get_pipeline_execution must reuse execution snapshot service');
assert.match(
  pipelineToolsSource,
  /validate_pipeline[\s\S]*readOnlyHint:\s*true/,
  'validation tool contract must preserve read-only semantics',
);
assert.match(
  pipelineToolsSource,
  /start_pipeline_execution[\s\S]*readOnlyHint:\s*false/,
  'execution start tool contract must be non-read-only',
);

console.log('MCP read-only resource contract checks OK');
