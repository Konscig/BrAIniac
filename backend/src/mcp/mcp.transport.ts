import type { Express, Request, Response } from 'express';
import type { IncomingMessage } from 'node:http';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { resolveMcpAuthContext } from './mcp.auth.js';
import { createBrainiacMcpServer, mapMcpError } from './mcp.server.js';

export const DEFAULT_MCP_PATH = '/mcp';

export function isMcpEnabled(): boolean {
  return (process.env.MCP_ENABLED ?? 'false').toLowerCase() === 'true';
}

export function getMcpPath(): string {
  const configuredPath = (process.env.MCP_PATH ?? DEFAULT_MCP_PATH).trim();
  if (!configuredPath) {
    return DEFAULT_MCP_PATH;
  }
  return configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
}

function toSdkAuthInfo(context: Awaited<ReturnType<typeof resolveMcpAuthContext>>): AuthInfo {
  return {
    token: context.accessToken,
    clientId: `brainiac-user-${context.userId}`,
    scopes: context.scopes,
    extra: {
      userId: context.userId,
      email: context.user.email,
    },
  };
}

function sendMcpHttpError(res: Response, error: unknown): void {
  const mapped = mapMcpError(error);
  const status = mapped.code === 'UNAUTHORIZED' ? 401 : mapped.code === 'FORBIDDEN' ? 403 : 500;
  res.status(status).json(mapped);
}

export function mountBrainiacMcpTransport(app: Express): void {
  if (!isMcpEnabled()) {
    return;
  }

  const mcpPath = getMcpPath();

  app.all(mcpPath, async (req: Request, res: Response) => {
    try {
      const authContext = await resolveMcpAuthContext(req);
      const transport = new StreamableHTTPServerTransport();
      const server = createBrainiacMcpServer();

      (req as IncomingMessage & { auth?: AuthInfo }).auth = toSdkAuthInfo(authContext);
      await server.connect(transport as Transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      sendMcpHttpError(res, error);
    }
  });

  console.log(`[mcp] Streamable HTTP MCP endpoint mounted at ${mcpPath}`);
}
