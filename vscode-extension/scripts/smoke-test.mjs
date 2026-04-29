import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const extensionSource = await readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

assert.equal(packageJson.contributes.mcpServerDefinitionProviders[0].id, 'brainiacMcp');
assert.equal(packageJson.contributes.mcpServerDefinitionProviders[0].label, 'BrAIniac MCP');
assert.match(extensionSource, /registerMcpServerDefinitionProvider/);
assert.match(extensionSource, /http:\/\/localhost:8080\/mcp/);
assert.match(extensionSource, /Authorization/);
assert.match(extensionSource, /showInputBox/);
assert.match(readme, /Authentication required/);
assert.match(readme, /Backend unavailable/);

console.log('VS Code MCP extension smoke checks OK');
