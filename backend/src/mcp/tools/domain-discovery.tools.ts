import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireMcpScope } from '../mcp.auth.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import { nodeTypeUri, toolUri } from '../serializers/mcp-resource-uri.js';
import {
  getNodeTypeCatalogEntryById,
  listNodeTypeCatalogEntries,
  type NodeTypeCatalogEntry,
} from '../../services/application/node_type/node_type.application.service.js';

function jsonToolResult(structuredContent: Record<string, unknown>) {
  return {
    structuredContent,
    content: [
      {
        type: 'text' as const,
        text: toMcpToolJsonText(structuredContent),
      },
    ],
  };
}

function nodeTypeSummary(nodeType: NodeTypeCatalogEntry) {
  return {
    ...nodeType,
    resource_uri: nodeTypeUri(nodeType.node_type_id),
    tool_resource_uri: toolUri(nodeType.fk_tool_id),
  };
}

export function registerDomainDiscoveryTools(server: McpServer): void {
  server.registerTool(
    'list_node_types',
    {
      title: 'List BrAIniac Node Types',
      description: 'Return runtime-backed BrAIniac node types and safe config summaries for MCP authoring.',
      inputSchema: {
        includeUnsupported: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ includeUnsupported }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const nodeTypes = await listNodeTypeCatalogEntries({ includeUnsupported });
      return jsonToolResult({
        node_types: nodeTypes.map(nodeTypeSummary),
        resource_links: nodeTypes.map((nodeType) => ({
          uri: nodeTypeUri(nodeType.node_type_id),
          name: `Node Type ${nodeType.node_type_id}: ${nodeType.name}`,
        })),
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'get_node_type',
    {
      title: 'Get BrAIniac Node Type',
      description: 'Return one BrAIniac node type with safe config expectations, defaults, related tool link, and authoring support state.',
      inputSchema: {
        nodeTypeId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ nodeTypeId }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const nodeType = await getNodeTypeCatalogEntryById(nodeTypeId);
      return jsonToolResult({
        node_type: nodeTypeSummary(nodeType),
        resource_links: [
          { uri: nodeTypeUri(nodeType.node_type_id), name: `Node Type ${nodeType.node_type_id}: ${nodeType.name}` },
          { uri: toolUri(nodeType.fk_tool_id), name: `Tool ${nodeType.fk_tool_id}` },
        ],
        diagnostics: nodeType.runtime_support_state === 'supported' ? [] : [{ code: 'NODE_TYPE_UNSUPPORTED', message: 'node type is not creatable through MCP authoring' }],
      });
    },
  );
}
