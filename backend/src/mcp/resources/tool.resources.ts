import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpJsonEnvelope, toMcpJsonContent } from '../serializers/mcp-safe-json.js';
import { toolListUri, toolUri } from '../serializers/mcp-resource-uri.js';
import { getToolEntryById, listToolEntries } from '../../services/application/tool/tool.application.service.js';

function normalizeName(value: string): string {
  return value.trim();
}

function toolSummary(tool: { tool_id: number; name: string; config_json: unknown }) {
  return {
    tool_id: tool.tool_id,
    name: normalizeName(tool.name),
    config_json: tool.config_json,
    resource_uri: toolUri(tool.tool_id),
  };
}

function jsonResource(kind: string, resourceUri: string, data: unknown) {
  const envelope = createMcpJsonEnvelope({ kind, resourceUri, data });
  const content = toMcpJsonContent(envelope);
  return { contents: [{ ...content, uri: envelope.resource_uri }] };
}

export function registerToolResources(server: McpServer): void {
  server.registerResource(
    'brainiac-tools',
    toolListUri(),
    {
      title: 'BrAIniac Tool Catalog',
      description: 'BrAIniac tool catalog entries available to pipeline nodes.',
      mimeType: 'application/json',
    },
    async () => {
      const tools = await listToolEntries();
      return jsonResource('tools', toolListUri(), {
        tools: tools.map(toolSummary),
      });
    },
  );

  server.registerResource(
    'brainiac-tool',
    new ResourceTemplate('brainiac://tools/{toolId}', {
      list: async () => {
        const tools = await listToolEntries();
        return {
          resources: tools.map((tool) => ({
            uri: toolUri(tool.tool_id),
            name: `Tool ${tool.tool_id}: ${normalizeName(tool.name)}`,
            title: normalizeName(tool.name),
            description: 'BrAIniac tool catalog entry',
            mimeType: 'application/json',
          })),
        };
      },
    }),
    {
      title: 'BrAIniac Tool',
      description: 'One BrAIniac tool catalog entry.',
      mimeType: 'application/json',
    },
    async (_uri, variables) => {
      const toolId = Number(variables.toolId);
      const tool = await getToolEntryById(toolId);
      return jsonResource('tool', toolUri(tool.tool_id), {
        tool: toolSummary(tool),
      });
    },
  );
}
