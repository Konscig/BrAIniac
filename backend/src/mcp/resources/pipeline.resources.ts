import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { requireMcpUserId } from '../mcp.auth.js';
import { createMcpJsonEnvelope, toMcpJsonContent, type McpResourceLink } from '../serializers/mcp-safe-json.js';
import {
  pipelineAgentsUri,
  pipelineExecutionUri,
  pipelineGraphUri,
  pipelineNodeUri,
  pipelineUri,
  pipelineValidationUri,
} from '../serializers/mcp-resource-uri.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';
import { validatePipelineGraph } from '../../services/core/graph_validation.service.js';
import { listEdgesByPipeline } from '../../services/data/edge.service.js';
import { listNodesByPipeline } from '../../services/data/node.service.js';
import { getNodeTypeById } from '../../services/data/node_type.service.js';
import { listPipelinesByOwner } from '../../services/data/pipeline.service.js';
import { getToolById } from '../../services/data/tool.service.js';
import { getPipelineExecutionForUser } from '../../services/application/pipeline/pipeline.executor.application.service.js';

function normalizeName(value: string): string {
  return value.trim();
}

function jsonResource(kind: string, resourceUri: string, data: unknown, links: McpResourceLink[] = []) {
  const envelope = createMcpJsonEnvelope({ kind, resourceUri, data, links });
  const content = toMcpJsonContent(envelope);
  return { contents: [{ ...content, uri: envelope.resource_uri }] };
}

async function getPipelineGraphData(pipelineId: number) {
  const [nodes, edges] = await Promise.all([listNodesByPipeline(pipelineId), listEdgesByPipeline(pipelineId)]);
  const nodeTypeIds = [...new Set(nodes.map((node) => node.fk_type_id))];
  const nodeTypes = await Promise.all(nodeTypeIds.map((nodeTypeId) => getNodeTypeById(nodeTypeId)));
  const nodeTypeById = new Map(nodeTypes.filter(Boolean).map((nodeType) => [nodeType!.type_id, nodeType!]));
  const toolIds = [...new Set([...nodeTypeById.values()].map((nodeType) => nodeType.fk_tool_id))];
  const tools = await Promise.all(toolIds.map((toolId) => getToolById(toolId)));
  const toolById = new Map(tools.filter(Boolean).map((tool) => [tool!.tool_id, tool!]));

  return {
    nodes: nodes.map((node) => {
      const nodeType = nodeTypeById.get(node.fk_type_id);
      const tool = nodeType ? toolById.get(nodeType.fk_tool_id) : undefined;

      return {
        node_id: node.node_id,
        fk_pipeline_id: node.fk_pipeline_id,
        fk_type_id: node.fk_type_id,
        fk_sub_pipeline: node.fk_sub_pipeline,
        top_k: node.top_k,
        ui_json: node.ui_json,
        output_json: node.output_json,
        resource_uri: pipelineNodeUri(pipelineId, node.node_id),
        node_type: nodeType
          ? {
              type_id: nodeType.type_id,
              name: normalizeName(nodeType.name),
              desc: normalizeName(nodeType.desc),
              fk_tool_id: nodeType.fk_tool_id,
            }
          : null,
        tool_binding: tool
          ? {
              tool_id: tool.tool_id,
              name: normalizeName(tool.name),
            }
          : null,
        runtime_support_state: nodeType ? 'supported' : 'unsupported',
      };
    }),
    edges: edges.map((edge) => ({
      edge_id: edge.edge_id,
      fk_from_node: edge.fk_from_node,
      fk_to_node: edge.fk_to_node,
    })),
  };
}

export function registerPipelineResources(server: McpServer): void {
  const pipelineTemplate = new ResourceTemplate('brainiac://pipelines/{pipelineId}', {
    list: async (extra) => {
      const userId = requireMcpUserId(extra);
      const pipelines = await listPipelinesByOwner(userId);

      return {
        resources: pipelines.map((pipeline) => ({
          uri: pipelineUri(pipeline.pipeline_id),
          name: `Pipeline ${pipeline.pipeline_id}: ${normalizeName(pipeline.name)}`,
          title: normalizeName(pipeline.name),
          description: `Project ${pipeline.fk_project_id}`,
          mimeType: 'application/json',
        })),
      };
    },
  });

  server.registerResource(
    'brainiac-pipeline',
    pipelineTemplate,
    {
      title: 'BrAIniac Pipeline',
      description: 'One owner-scoped pipeline with graph, validation, and agent resource links.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      const pipeline = await ensurePipelineOwnedByUser(pipelineId, userId);

      return jsonResource(
        'pipeline',
        pipelineUri(pipeline.pipeline_id),
        {
          pipeline_id: pipeline.pipeline_id,
          fk_project_id: pipeline.fk_project_id,
          name: normalizeName(pipeline.name),
          max_time: pipeline.max_time,
          max_cost: pipeline.max_cost,
          max_reject: pipeline.max_reject,
          score: pipeline.score,
          report_summary: pipeline.report_json ?? null,
        },
        [
          { uri: pipelineGraphUri(pipeline.pipeline_id), name: `Pipeline ${pipeline.pipeline_id} graph` },
          { uri: pipelineValidationUri(pipeline.pipeline_id), name: `Pipeline ${pipeline.pipeline_id} validation` },
          { uri: pipelineAgentsUri(pipeline.pipeline_id), name: `Pipeline ${pipeline.pipeline_id} agents` },
        ],
      );
    },
  );

  server.registerResource(
    'brainiac-pipeline-graph',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/graph', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Graph',
      description: 'Owner-scoped pipeline graph with node type and tool binding summaries.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const graph = await getPipelineGraphData(pipelineId);

      return jsonResource('pipeline-graph', pipelineGraphUri(pipelineId), graph, [
        { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
        { uri: pipelineAgentsUri(pipelineId), name: `Pipeline ${pipelineId} agents` },
      ]);
    },
  );

  server.registerResource(
    'brainiac-pipeline-validation',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/validation', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Validation',
      description: 'Owner-scoped pipeline graph validation from the existing validation service.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const validation = await validatePipelineGraph(pipelineId, 'default');

      return jsonResource('pipeline-validation', pipelineValidationUri(pipelineId), validation, [
        { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
        { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
      ]);
    },
  );

  server.registerResource(
    'brainiac-pipeline-execution',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/executions/{executionId}', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Execution',
      description: 'Owner-scoped bounded pipeline execution snapshot.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      const executionId = String(variables.executionId ?? '').trim();
      const snapshot = await getPipelineExecutionForUser(pipelineId, executionId, userId);

      return jsonResource('pipeline-execution', pipelineExecutionUri(pipelineId, executionId), snapshot, [
        { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
        { uri: pipelineValidationUri(pipelineId), name: `Pipeline ${pipelineId} validation` },
      ]);
    },
  );
}
