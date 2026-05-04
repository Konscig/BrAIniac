import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpJsonEnvelope, toMcpJsonContent } from '../serializers/mcp-safe-json.js';
import { nodeTypeListUri, nodeTypeUri, toolUri } from '../serializers/mcp-resource-uri.js';
import {
  getNodeTypeCatalogEntryById,
  listNodeTypeCatalogEntries,
  type NodeTypeCatalogEntry,
} from '../../services/application/node_type/node_type.application.service.js';

function nodeTypeSummary(nodeType: NodeTypeCatalogEntry) {
  return {
    ...nodeType,
    resource_uri: nodeTypeUri(nodeType.node_type_id),
    tool_resource_uri: toolUri(nodeType.fk_tool_id),
  };
}

function jsonResource(kind: string, resourceUri: string, data: unknown) {
  const envelope = createMcpJsonEnvelope({ kind, resourceUri, data });
  const content = toMcpJsonContent(envelope);
  return { contents: [{ ...content, uri: envelope.resource_uri }] };
}

export function registerNodeTypeResources(server: McpServer): void {
  server.registerResource(
    'brainiac-node-types',
    nodeTypeListUri(),
    {
      title: 'BrAIniac Node Types',
      description: 'Runtime-backed BrAIniac node types available to MCP authoring tools.',
      mimeType: 'application/json',
    },
    async () => {
      const nodeTypes = await listNodeTypeCatalogEntries();
      return jsonResource('node-types', nodeTypeListUri(), {
        node_types: nodeTypes.map(nodeTypeSummary),
      });
    },
  );

  server.registerResource(
    'brainiac-node-type',
    new ResourceTemplate('brainiac://node-types/{nodeTypeId}', {
      list: async () => {
        const nodeTypes = await listNodeTypeCatalogEntries();
        return {
          resources: nodeTypes.map((nodeType) => ({
            uri: nodeTypeUri(nodeType.node_type_id),
            name: `Node Type ${nodeType.node_type_id}: ${nodeType.name}`,
            title: nodeType.name,
            description: nodeType.desc,
            mimeType: 'application/json',
          })),
        };
      },
    }),
    {
      title: 'BrAIniac Node Type',
      description: 'One runtime-backed BrAIniac node type catalog entry.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const nodeTypeId = Number(variables.nodeTypeId);
      const nodeType = await getNodeTypeCatalogEntryById(nodeTypeId);
      return jsonResource('node-type', nodeTypeUri(nodeType.node_type_id), {
        node_type: nodeTypeSummary(nodeType),
      });
    },
  );
}
