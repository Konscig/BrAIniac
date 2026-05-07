import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireMcpUserId } from '../mcp.auth.js';
import { createMcpJsonEnvelope, toMcpJsonContent, type McpResourceLink } from '../serializers/mcp-safe-json.js';
import { pipelineGraphUri, pipelineNodeUri, pipelineUri, toolUri } from '../serializers/mcp-resource-uri.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';
import { getNodeById } from '../../services/data/node.service.js';
import { getNodeTypeById } from '../../services/data/node_type.service.js';
import { getToolById } from '../../services/data/tool.service.js';
import { HttpError } from '../../common/http-error.js';

function normalizeName(value: string): string {
  return value.trim();
}

function jsonResource(kind: string, resourceUri: string, data: unknown, links: McpResourceLink[] = []) {
  const envelope = createMcpJsonEnvelope({ kind, resourceUri, data, links });
  const content = toMcpJsonContent(envelope);
  return { contents: [{ ...content, uri: envelope.resource_uri }] };
}

export function registerNodeResources(server: McpServer): void {
  server.registerResource(
    'brainiac-pipeline-node',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/nodes/{nodeId}', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Node',
      description: 'Owner-scoped pipeline node with type, tool, and runtime context.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      const nodeId = Number(variables.nodeId);

      await ensurePipelineOwnedByUser(pipelineId, userId);
      const node = await getNodeById(nodeId);
      if (!node || node.fk_pipeline_id !== pipelineId) {
        throw new HttpError(404, { error: 'node not found' });
      }

      const nodeType = await getNodeTypeById(node.fk_type_id);
      const tool = nodeType ? await getToolById(nodeType.fk_tool_id) : null;

      return jsonResource(
        'pipeline-node',
        pipelineNodeUri(pipelineId, nodeId),
        {
          node: {
            node_id: node.node_id,
            fk_pipeline_id: node.fk_pipeline_id,
            fk_type_id: node.fk_type_id,
            fk_sub_pipeline: node.fk_sub_pipeline,
            top_k: node.top_k,
            ui_json: node.ui_json,
            output_json: node.output_json,
          },
          node_type: nodeType
            ? {
                type_id: nodeType.type_id,
                fk_tool_id: nodeType.fk_tool_id,
                name: normalizeName(nodeType.name),
                desc: normalizeName(nodeType.desc),
                config_json: nodeType.config_json,
              }
            : null,
          tool_binding: tool
            ? {
                tool_id: tool.tool_id,
                name: normalizeName(tool.name),
                resource_uri: toolUri(tool.tool_id),
              }
            : null,
          runtime_support_state: nodeType ? 'supported' : 'unsupported',
          agent_config: null,
        },
        [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
        ],
      );
    },
  );
}
