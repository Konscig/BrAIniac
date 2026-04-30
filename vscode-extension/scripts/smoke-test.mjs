import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const extensionSource = await readFile(new URL('../src/extension.ts', import.meta.url), 'utf8');
const mcpProviderSource = await readOptional('../src/mcpProvider.ts');
const authSource = await readOptional('../src/auth.ts');
const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');
const quickstart = await readFile(
  new URL('../../specs/001-mcp-backend-vscode/quickstart.md', import.meta.url),
  'utf8',
);

async function readOptional(path) {
  try {
    return await readFile(new URL(path, import.meta.url), 'utf8');
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return '';
    }
    throw error;
  }
}

assert.equal(packageJson.contributes.mcpServerDefinitionProviders[0].id, 'brainiacMcp');
assert.equal(packageJson.contributes.mcpServerDefinitionProviders[0].label, 'BrAIniac MCP');
assert.match(mcpProviderSource, /registerMcpServerDefinitionProvider/);
assert.match(mcpProviderSource, /http:\/\/localhost:8080\/mcp/);
assert.match(mcpProviderSource, /Authorization/);
assert.doesNotMatch(mcpProviderSource, /getConfiguration\('brainiacMcp'\)\.get<string>\('accessToken'\)/);

const commandIds = (packageJson.contributes.commands ?? []).map((command) => command.command);
assert.ok(commandIds.includes('brainiacMcp.signIn'), 'sign-in command must be contributed');
assert.ok(commandIds.includes('brainiacMcp.signOut'), 'sign-out command must be contributed');
assert.ok(commandIds.includes('brainiacMcp.reconnect'), 'reconnect command must be contributed');
assert.ok(commandIds.includes('brainiacMcp.useDevToken'), 'dev-token fallback command must be explicit');

const configurationProperties = packageJson.contributes.configuration?.properties ?? {};
assert.ok(configurationProperties['brainiacMcp.backendUrl'], 'backend URL setting must remain configurable');
assert.equal(configurationProperties['brainiacMcp.accessToken'], undefined, 'access token must not be a VS Code setting');

assert.match(extensionSource, /registerCommand\(['"]brainiacMcp\.signIn['"]/);
assert.match(extensionSource, /registerCommand\(['"]brainiacMcp\.signOut['"]/);
assert.match(extensionSource, /registerCommand\(['"]brainiacMcp\.reconnect['"]/);
assert.match(extensionSource, /registerCommand\(['"]brainiacMcp\.useDevToken['"]/);
assert.doesNotMatch(extensionSource, /showInputBox\(\{[\s\S]*access token/i);

assert.match(authSource, /SecretStorage|secretStorage/);
assert.match(authSource, /\/auth\/vscode\/start/);
assert.match(authSource, /\/auth\/vscode\/exchange/);
assert.match(authSource, /openExternal/);
assert.match(authSource, /delete\(/);
assert.doesNotMatch(authSource, /workspace\.getConfiguration\(['"]brainiacMcp['"]\)\.get<string>\(['"]accessToken['"]\)/);

assert.match(readme, /Authentication required/);
assert.match(readme, /Backend unavailable/);
assert.match(readme, /BrAIniac: Sign in/);
assert.match(readme, /BrAIniac: Sign out/);
assert.match(readme, /SecretStorage/);
assert.match(readme, /BrAIniac: Use Dev Token/);
assert.doesNotMatch(readme, /brainiacMcp\.accessToken/);

assert.match(quickstart, /BrAIniac: Sign in/);
assert.match(quickstart, /\/auth\?vscode_state=/);
assert.match(quickstart, /\/auth\/vscode\/complete/);
assert.match(quickstart, /SecretStorage/);
assert.match(quickstart, /Dev-Token Fallback/);
assert.match(quickstart, /BrAIniac: Use Dev Token/);
assert.match(quickstart, /not the target user experience/);
assert.match(quickstart, /Do not put it in[\s\S]*settings/);

console.log('VS Code MCP extension smoke checks OK');
