import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const cache = await readFile(new URL('../src/runtime/cache.service.ts', import.meta.url), 'utf8');
const nodeTypes = await readFile(new URL('../src/services/application/node_type/node_type.application.service.ts', import.meta.url), 'utf8');
const toolSearch = await readFile(new URL('../src/services/application/tool/tool-search.application.service.ts', import.meta.url), 'utf8');
const exportsSource = await readFile(new URL('../src/mcp/resources/export.resources.ts', import.meta.url), 'utf8');
const openrouter = await readFile(new URL('../src/services/core/openrouter/openrouter.adapter.ts', import.meta.url), 'utf8');
const nodeApp = await readFile(new URL('../src/services/application/node/node.application.service.ts', import.meta.url), 'utf8');
const edgeApp = await readFile(new URL('../src/services/application/edge/edge.application.service.ts', import.meta.url), 'utf8');

assert.match(cache, /getRedisClient\(\)/, 'cache must degrade when Redis is unavailable');
assert.match(cache, /redisPattern/, 'cache invalidation must support patterns');
assert.match(nodeTypes, /catalog.*node-types/, 'node type catalog must use cache keys');
assert.match(toolSearch, /catalog.*tool-search/, 'tool search must use cache keys');
assert.match(exportsSource, /'mcp', 'export', 'pipeline'.*'user'/s, 'MCP export cache must be owner-scoped');
assert.match(openrouter, /openrouter.*embeddings/s, 'OpenRouter embeddings must be cached by model/content identity');
assert.match(nodeApp, /invalidatePipelineExportCache/, 'node mutations must invalidate export cache');
assert.match(edgeApp, /invalidatePipelineExportCache/, 'edge mutations must invalidate export cache');

console.log('[redis-cache-contract-test] ok');
