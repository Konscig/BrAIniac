import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpError, isHttpError } from '../common/http-error.js';
import { registerAgentResources } from './resources/agent.resources.js';
import { registerNodeResources } from './resources/node.resources.js';
import { registerPipelineResources } from './resources/pipeline.resources.js';
import { registerProjectResources } from './resources/project.resources.js';
import { registerToolResources } from './resources/tool.resources.js';
import { registerReadOnlyContextTools, registerReadOnlyProjectTools } from './tools/readonly.tools.js';

export const BRAINIAC_MCP_SERVER_NAME = 'brainiac-mcp';
export const BRAINIAC_MCP_SERVER_VERSION = '0.1.0';

const BRAINIAC_MCP_INSTRUCTIONS = [
  'Use BrAIniac MCP as an authenticated adapter over existing BrAIniac backend services.',
  'Resources and read-only tools are owner-scoped to the bearer token user.',
  'Do not assume missing resources are public; permission and validation errors are explicit.',
  'Large payloads are summarized or exposed as linked resources.',
].join(' ');

export type McpErrorCode = 'UNAUTHORIZED' | 'FORBIDDEN' | 'VALIDATION' | 'NOT_FOUND' | 'RUNTIME';

export type McpVisibleError = {
  ok: false;
  code: McpErrorCode;
  message: string;
  details: Record<string, unknown>;
};

function codeFromStatus(status: number): McpErrorCode {
  if (status === 401) {
    return 'UNAUTHORIZED';
  }
  if (status === 403) {
    return 'FORBIDDEN';
  }
  if (status === 404) {
    return 'NOT_FOUND';
  }
  if (status === 400 || status === 422) {
    return 'VALIDATION';
  }
  return 'RUNTIME';
}

function objectDetails(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export function mapMcpError(error: unknown): McpVisibleError {
  if (isHttpError(error)) {
    return {
      ok: false,
      code: codeFromStatus(error.status),
      message: error.message,
      details: objectDetails(error.body),
    };
  }

  if (error instanceof HttpError) {
    return {
      ok: false,
      code: codeFromStatus(error.status),
      message: error.message,
      details: objectDetails(error.body),
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      code: 'RUNTIME',
      message: error.message,
      details: {},
    };
  }

  return {
    ok: false,
    code: 'RUNTIME',
    message: 'runtime error',
    details: {},
  };
}

export function createBrainiacMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: BRAINIAC_MCP_SERVER_NAME,
      version: BRAINIAC_MCP_SERVER_VERSION,
    },
    {
      instructions: BRAINIAC_MCP_INSTRUCTIONS,
      capabilities: {
        resources: {},
        tools: {},
        logging: {},
      },
    },
  );

  registerProjectResources(server);
  registerPipelineResources(server);
  registerNodeResources(server);
  registerToolResources(server);
  registerAgentResources(server);
  registerReadOnlyProjectTools(server);
  registerReadOnlyContextTools(server);

  return server;
}
