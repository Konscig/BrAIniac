import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { createMcpJsonEnvelope, toMcpJsonContent } from '../src/mcp/serializers/mcp-safe-json.ts';
import {
  parseBrainiacResourceUri,
  pipelineNodeUri,
  pipelineUri,
  projectListUri,
} from '../src/mcp/serializers/mcp-resource-uri.ts';

async function measure(name, budgetMs, action) {
  const start = performance.now();
  await action();
  const elapsedMs = performance.now() - start;
  assert.ok(elapsedMs < budgetMs, `${name} took ${elapsedMs.toFixed(2)}ms, expected under ${budgetMs}ms`);
  return elapsedMs;
}

const projectListMs = await measure('project listing contract path', 2000, () => {
  for (let i = 0; i < 500; i += 1) {
    parseBrainiacResourceUri(projectListUri());
  }
});

const pipelineReadMs = await measure('pipeline resource read contract path', 1000, () => {
  for (let i = 0; i < 500; i += 1) {
    const uri = pipelineUri(10);
    const content = toMcpJsonContent(
      createMcpJsonEnvelope({
        kind: 'pipeline',
        resourceUri: uri,
        data: { pipeline_id: 10, name: 'perf-smoke' },
      }),
    );
    JSON.parse(content.text);
  }
});

const nodeReadMs = await measure('node resource read contract path', 1000, () => {
  for (let i = 0; i < 500; i += 1) {
    const uri = pipelineNodeUri(10, 100);
    parseBrainiacResourceUri(uri);
  }
});

console.log(
  `MCP performance smoke checks OK: projects=${projectListMs.toFixed(2)}ms, pipeline=${pipelineReadMs.toFixed(2)}ms, node=${nodeReadMs.toFixed(2)}ms`,
);
