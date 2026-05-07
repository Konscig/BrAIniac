import { ResourceTemplate, type McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { HttpError } from '../../common/http-error.js';
import { getProjectByIdForUser } from '../../services/application/project/project.application.service.js';
import { validatePipelineGraph } from '../../services/core/graph_validation.service.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';
import { listEdgesByPipeline } from '../../services/data/edge.service.js';
import { getNodeById, listNodesByPipeline } from '../../services/data/node.service.js';
import { getNodeTypeById } from '../../services/data/node_type.service.js';
import { getPipelineById, listPipelines } from '../../services/data/pipeline.service.js';
import { getToolById } from '../../services/data/tool.service.js';
import { requireMcpUserId } from '../mcp.auth.js';
import { redactMcpSecrets } from '../serializers/mcp-redaction.js';
import {
  pipelineExportUri,
  pipelineGraphUri,
  pipelineNodeExportUri,
  pipelineNodeUri,
  pipelineUri,
  projectExportUri,
  projectUri,
  toolUri,
} from '../serializers/mcp-resource-uri.js';
import { createMcpJsonEnvelope, toMcpJsonContent, type McpResourceLink } from '../serializers/mcp-safe-json.js';

type ExportScope = 'project' | 'pipeline' | 'node';

function normalizeName(value: string): string {
  return value.trim();
}

function jsonExportResource(kind: string, resourceUri: string, rawSnapshot: Record<string, unknown>, links: McpResourceLink[] = []) {
  const redacted = redactMcpSecrets(rawSnapshot);
  const data = {
    ...redacted.value,
    redaction_report: redacted.redactions,
  };
  const envelope = createMcpJsonEnvelope({
    kind,
    resourceUri,
    data,
    links,
    redactions: redacted.redactions,
  });
  const content = toMcpJsonContent(envelope);
  return { contents: [{ ...content, uri: envelope.resource_uri }] };
}

async function collectPipelineSnapshot(pipelineId: number, scope: ExportScope, nodeId?: number) {
  const pipeline = await getPipelineById(pipelineId);
  if (!pipeline) {
    throw new HttpError(404, { error: 'pipeline not found' });
  }

  const [nodes, edges, validation] = await Promise.all([
    listNodesByPipeline(pipelineId),
    listEdgesByPipeline(pipelineId),
    validatePipelineGraph(pipelineId, 'default'),
  ]);
  const scopedNodes = nodeId === undefined ? nodes : nodes.filter((node) => node.node_id === nodeId);
  if (nodeId !== undefined && scopedNodes.length === 0) {
    throw new HttpError(404, { error: 'node not found' });
  }

  const nodeTypeIds = [...new Set(scopedNodes.map((node) => node.fk_type_id))];
  const nodeTypes = (await Promise.all(nodeTypeIds.map((typeId) => getNodeTypeById(typeId)))).filter(Boolean);
  const toolIds = [...new Set(nodeTypes.map((nodeType) => nodeType!.fk_tool_id))];
  const tools = (await Promise.all(toolIds.map((toolId) => getToolById(toolId)))).filter(Boolean);
  const scopedNodeIds = new Set(scopedNodes.map((node) => node.node_id));
  const scopedEdges =
    nodeId === undefined
      ? edges
      : edges.filter((edge) => scopedNodeIds.has(edge.fk_from_node) || scopedNodeIds.has(edge.fk_to_node));

  return {
    scope: {
      type: scope,
      pipeline_id: pipeline.pipeline_id,
      ...(nodeId !== undefined ? { node_id: nodeId } : {}),
    },
    pipeline: {
      pipeline_id: pipeline.pipeline_id,
      fk_project_id: pipeline.fk_project_id,
      name: normalizeName(pipeline.name),
      max_time: pipeline.max_time,
      max_cost: pipeline.max_cost,
      max_reject: pipeline.max_reject,
      score: pipeline.score,
    },
    graph: {
      nodes: scopedNodes.map((node) => ({
        node_id: node.node_id,
        fk_pipeline_id: node.fk_pipeline_id,
        fk_type_id: node.fk_type_id,
        fk_sub_pipeline: node.fk_sub_pipeline,
        top_k: node.top_k,
        ui_json: node.ui_json,
        output_json: node.output_json,
        resource_uri: pipelineNodeUri(pipelineId, node.node_id),
      })),
      edges: scopedEdges.map((edge) => ({
        edge_id: edge.edge_id,
        fk_from_node: edge.fk_from_node,
        fk_to_node: edge.fk_to_node,
      })),
    },
    node_types: nodeTypes.map((nodeType) => ({
      type_id: nodeType!.type_id,
      fk_tool_id: nodeType!.fk_tool_id,
      name: normalizeName(nodeType!.name),
      desc: normalizeName(nodeType!.desc),
      config_json: nodeType!.config_json,
    })),
    tools: tools.map((tool) => ({
      tool_id: tool!.tool_id,
      name: normalizeName(tool!.name),
      config_json: tool!.config_json,
      resource_uri: toolUri(tool!.tool_id),
    })),
    validation,
    execution_metadata: {
      latest_report_summary: pipeline.report_json ?? null,
    },
  };
}

export async function buildPipelineExportSnapshot(pipelineId: number, userId: number) {
  await ensurePipelineOwnedByUser(pipelineId, userId);
  return collectPipelineSnapshot(pipelineId, 'pipeline');
}

export async function buildNodeExportSnapshot(pipelineId: number, nodeId: number, userId: number) {
  await ensurePipelineOwnedByUser(pipelineId, userId);
  const node = await getNodeById(nodeId);
  if (!node || node.fk_pipeline_id !== pipelineId) {
    throw new HttpError(404, { error: 'node not found' });
  }
  return collectPipelineSnapshot(pipelineId, 'node', nodeId);
}

export async function buildProjectExportSnapshot(projectId: number, userId: number) {
  const project = await getProjectByIdForUser(projectId, userId);
  const pipelines = await listPipelines(project.project_id);
  const pipelineSnapshots = await Promise.all(
    pipelines.map((pipeline) => collectPipelineSnapshot(pipeline.pipeline_id, 'pipeline')),
  );

  return {
    scope: {
      type: 'project' as const,
      project_id: project.project_id,
    },
    project: {
      project_id: project.project_id,
      name: normalizeName(project.name),
    },
    pipelines: pipelineSnapshots,
  };
}

export function redactionReportForSnapshot(snapshot: Record<string, unknown>) {
  return redactMcpSecrets(snapshot).redactions;
}

export function registerExportResources(server: McpServer): void {
  server.registerResource(
    'brainiac-project-export',
    new ResourceTemplate('brainiac://projects/{projectId}/export', { list: undefined }),
    {
      title: 'BrAIniac Project Export',
      description: 'Redacted owner-scoped project export snapshot.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const projectId = Number(variables.projectId);
      const snapshot = await buildProjectExportSnapshot(projectId, userId);

      return jsonExportResource('project-export', projectExportUri(projectId), snapshot, [
        { uri: projectUri(projectId), name: `Project ${projectId}` },
      ]);
    },
  );

  server.registerResource(
    'brainiac-pipeline-export',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/export', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Export',
      description: 'Redacted owner-scoped pipeline export snapshot.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      const snapshot = await buildPipelineExportSnapshot(pipelineId, userId);

      return jsonExportResource('pipeline-export', pipelineExportUri(pipelineId), snapshot, [
        { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
        { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
      ]);
    },
  );

  server.registerResource(
    'brainiac-pipeline-node-export',
    new ResourceTemplate('brainiac://pipelines/{pipelineId}/nodes/{nodeId}/export', { list: undefined }),
    {
      title: 'BrAIniac Pipeline Node Export',
      description: 'Redacted owner-scoped node export snapshot with minimal surrounding context.',
      mimeType: 'application/json',
    },
    async (_uri, variables, extra) => {
      const userId = requireMcpUserId(extra);
      const pipelineId = Number(variables.pipelineId);
      const nodeId = Number(variables.nodeId);
      const snapshot = await buildNodeExportSnapshot(pipelineId, nodeId, userId);

      return jsonExportResource('pipeline-node-export', pipelineNodeExportUri(pipelineId, nodeId), snapshot, [
        { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
        { uri: pipelineNodeUri(pipelineId, nodeId), name: `Node ${nodeId}` },
      ]);
    },
  );
}
