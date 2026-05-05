import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireMcpUserId } from '../mcp.auth.js';
import { createMcpJsonEnvelope, toMcpJsonContent } from '../serializers/mcp-safe-json.js';
import { pipelineAgentsUri, pipelineNodeUri, pipelineUri, toolUri } from '../serializers/mcp-resource-uri.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';
import { listEdgesByPipeline } from '../../services/data/edge.service.js';
import { listNodesByPipeline } from '../../services/data/node.service.js';
import { getNodeTypeById } from '../../services/data/node_type.service.js';
import { getToolById } from '../../services/data/tool.service.js';

function normalizeName(value: string): string {
  return value.trim();
}

function readObjectSection(value: unknown, key: string): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const section = (value as Record<string, unknown>)[key];
  if (!section || typeof section !== 'object' || Array.isArray(section)) {
    return null;
  }
  return section as Record<string, unknown>;
}

export function registerAgentResources(server: McpServer): void {
  server.registerResource(
    'brainiac-pipeline-agents',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/agents', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Agents',
      description: 'Agent-capable nodes and ToolNode to AgentCall capability relationships.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      await ensurePipelineOwnedByUser(pipelineId, userId);

      const [nodes, edges] = await Promise.all([listNodesByPipeline(pipelineId), listEdgesByPipeline(pipelineId)]);
      const nodeTypes = new Map<number, NonNullable<Awaited<ReturnType<typeof getNodeTypeById>>>>();

      for (const nodeTypeId of [...new Set(nodes.map((node) => node.fk_type_id))]) {
        const nodeType = await getNodeTypeById(nodeTypeId);
        if (nodeType) {
          nodeTypes.set(nodeType.type_id, nodeType);
        }
      }

      const nodeById = new Map(nodes.map((node) => [node.node_id, node]));
      const agentNodes = nodes.filter((node) => normalizeName(nodeTypes.get(node.fk_type_id)?.name ?? '') === 'AgentCall');
      const agents = [];

      for (const agentNode of agentNodes) {
        const incomingToolEdges = edges.filter((edge) => edge.fk_to_node === agentNode.node_id).filter((edge) => {
          const fromNode = nodeById.get(edge.fk_from_node);
          return normalizeName(nodeTypes.get(fromNode?.fk_type_id ?? 0)?.name ?? '') === 'ToolNode';
        });

        const availableTools = [];
        for (const edge of incomingToolEdges) {
          const toolNode = nodeById.get(edge.fk_from_node);
          const toolNodeType = toolNode ? nodeTypes.get(toolNode.fk_type_id) : undefined;
          const tool = toolNodeType ? await getToolById(toolNodeType.fk_tool_id) : null;
          if (toolNode && tool) {
            availableTools.push({
              node_id: toolNode.node_id,
              tool_id: tool.tool_id,
              name: normalizeName(tool.name),
              node_resource_uri: pipelineNodeUri(pipelineId, toolNode.node_id),
              tool_resource_uri: toolUri(tool.tool_id),
            });
          }
        }

        agents.push({
          node_id: agentNode.node_id,
          label: `AgentCall ${agentNode.node_id}`,
          node_resource_uri: pipelineNodeUri(pipelineId, agentNode.node_id),
          agent_config: readObjectSection(agentNode.ui_json, 'agent'),
          available_tools: availableTools,
          tool_edges: incomingToolEdges.map((edge) => ({
            edge_id: edge.edge_id,
            from_tool_node_id: edge.fk_from_node,
            to_agent_node_id: edge.fk_to_node,
          })),
          diagnostics:
            availableTools.length === 0
              ? [{ code: 'AGENT_NO_TOOLNODE_CAPABILITIES', message: 'AgentCall has no incoming ToolNode capabilities' }]
              : [],
        });
      }

      const envelope = createMcpJsonEnvelope({
        kind: 'pipeline-agents',
        resourceUri: pipelineAgentsUri(pipelineId),
        data: { agents },
        links: [{ uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` }],
      });
      const content = toMcpJsonContent(envelope);
      return { contents: [{ ...content, uri: envelope.resource_uri }] };
    },
  );
}
