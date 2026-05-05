import assert from 'node:assert/strict';
import { HttpError } from '../src/common/http-error.ts';
import { resolveMcpAuthContext } from '../src/mcp/mcp.auth.ts';
import { mapMcpError } from '../src/mcp/mcp.server.ts';

function requestWithAuthorization(authorization) {
  return {
    headers: {
      authorization,
    },
  };
}

async function assertMappedError(name, action, expectedCode) {
  try {
    await action();
    assert.fail(`${name}: expected an error`);
  } catch (error) {
    const mapped = mapMcpError(error);
    assert.equal(mapped.ok, false, `${name}: mapped error must be a failed result`);
    assert.equal(mapped.code, expectedCode, `${name}: unexpected MCP error code`);
    assert.equal(typeof mapped.message, 'string', `${name}: message must be visible`);
    assert.ok(mapped.message.length > 0, `${name}: message must not be empty`);
  }
}

await assertMappedError(
  'missing bearer token',
  () => resolveMcpAuthContext(requestWithAuthorization(undefined)),
  'UNAUTHORIZED',
);

await assertMappedError(
  'invalid bearer token',
  () => resolveMcpAuthContext(requestWithAuthorization('Bearer not-a-valid-token')),
  'UNAUTHORIZED',
);

await assertMappedError(
  'cross-user project ownership denial',
  () => {
    throw new HttpError(403, { error: 'forbidden' });
  },
  'FORBIDDEN',
);

await assertMappedError(
  'cross-user pipeline ownership denial',
  () => {
    throw new HttpError(403, { error: 'forbidden', resource: 'pipeline' });
  },
  'FORBIDDEN',
);

await assertMappedError(
  'missing owner-scoped project',
  () => {
    throw new HttpError(404, { error: 'not found', resource: 'project' });
  },
  'NOT_FOUND',
);

console.log('MCP auth and ownership visible error checks OK');
