import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HttpError } from '../../common/http-error.js';
import { createEdgeForUser, listEdgesForPipelineForUser } from '../../services/application/edge/edge.application.service.js';
import { createNodeForUser, getNodeByIdForUser, listNodesForPipelineForUser } from '../../services/application/node/node.application.service.js';
import { createProjectForUser } from '../../services/application/project/project.application.service.js';
import { validatePipelineGraph } from '../../services/core/graph_validation.service.js';
import { ensurePipelineOwnedByUser, ensureProjectOwnedByUser } from '../../services/core/ownership.service.js';
import { createPipeline } from '../../services/data/pipeline.service.js';
import { getNodeTypeById, listNodeTypes } from '../../services/data/node_type.service.js';
import { requireMcpScope, requireMcpUserId } from '../mcp.auth.js';
import { pipelineGraphUri, pipelineNodeUri, pipelineUri, projectUri } from '../serializers/mcp-resource-uri.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import { resolveCanvasPosition } from './authoring-layout.js';

const DEFAULT_PIPELINE_LIMITS = {
  max_time: 120,
  max_cost: 100,
  max_reject: 0.15,
} as const;

function normalizeName(value: string): string {
  return value.trim();
}

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

function rejectHiddenToolBindings(value: unknown): void {
  if (!value || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    for (const item of value) {
      rejectHiddenToolBindings(item);
    }
    return;
  }

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'tool_ref' || key === 'tool_refs') {
      throw new HttpError(400, {
        ok: false,
        code: 'MCP_HIDDEN_TOOL_BINDING',
        error: 'hidden tool_ref/tool_refs bindings are not supported',
      });
    }
    rejectHiddenToolBindings(nested);
  }
}

async function resolveNodeType(input: { nodeTypeId?: number; nodeTypeName?: string }) {
  if (input.nodeTypeId !== undefined) {
    const nodeType = await getNodeTypeById(input.nodeTypeId);
    if (!nodeType) {
      throw new HttpError(404, { error: 'node type not found', code: 'MCP_NODE_TYPE_NOT_FOUND' });
    }
    return nodeType;
  }

  const normalizedName = input.nodeTypeName?.trim().toLowerCase();
  if (!normalizedName) {
    throw new HttpError(400, { error: 'nodeTypeId or nodeTypeName is required', code: 'MCP_NODE_TYPE_REQUIRED' });
  }

  const nodeType = (await listNodeTypes()).find((candidate) => normalizeName(candidate.name).toLowerCase() === normalizedName);
  if (!nodeType) {
    throw new HttpError(404, { error: 'node type not found', code: 'MCP_NODE_TYPE_NOT_FOUND' });
  }
  return nodeType;
}

function nodeUiJson(input: {
  label?: string;
  uiJson?: Record<string, unknown>;
  position: { x: number; y: number };
}): Record<string, unknown> {
  const uiJson = { ...(input.uiJson ?? {}) };
  rejectHiddenToolBindings(uiJson);
  return {
    ...uiJson,
    x: input.position.x,
    y: input.position.y,
    position: input.position,
    ...(input.label ? { label: input.label.trim() } : {}),
  };
}

export function registerAuthoringTools(server: McpServer): void {
  server.registerTool(
    'create_project',
    {
      title: 'Create BrAIniac Project',
      description: 'Create a BrAIniac project for the authenticated user. This mutates project state.',
      inputSchema: {
        name: z.string().trim().min(1).max(256),
        description: z.string().trim().max(512).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ name }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      const project = await createProjectForUser(name.trim(), userId);

      return jsonToolResult({
        project: {
          project_id: project.project_id,
          name: normalizeName(project.name),
          resource_uri: projectUri(project.project_id),
        },
        resource_links: [{ uri: projectUri(project.project_id), name: `Project ${project.project_id}` }],
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'create_pipeline',
    {
      title: 'Create BrAIniac Pipeline',
      description: 'Create a pipeline inside an owned BrAIniac project. This mutates pipeline state.',
      inputSchema: {
        projectId: z.number().int().positive(),
        name: z.string().trim().min(1).max(256),
        maxTime: z.number().int().positive().optional(),
        maxCost: z.number().positive().optional(),
        maxReject: z.number().min(0).max(1).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ projectId, name, maxTime, maxCost, maxReject }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      await ensureProjectOwnedByUser(projectId, userId);
      const pipeline = await createPipeline({
        fk_project_id: projectId,
        name: name.trim(),
        max_time: maxTime ?? DEFAULT_PIPELINE_LIMITS.max_time,
        max_cost: maxCost ?? DEFAULT_PIPELINE_LIMITS.max_cost,
        max_reject: maxReject ?? DEFAULT_PIPELINE_LIMITS.max_reject,
      });
      const validation = await validatePipelineGraph(pipeline.pipeline_id, 'default');

      return jsonToolResult({
        pipeline: {
          pipeline_id: pipeline.pipeline_id,
          project_id: projectId,
          name: normalizeName(pipeline.name),
          resource_uri: pipelineUri(pipeline.pipeline_id),
        },
        graph_resource_uri: pipelineGraphUri(pipeline.pipeline_id),
        validation,
        resource_links: [
          { uri: projectUri(projectId), name: `Project ${projectId}` },
          { uri: pipelineUri(pipeline.pipeline_id), name: `Pipeline ${pipeline.pipeline_id}` },
          { uri: pipelineGraphUri(pipeline.pipeline_id), name: `Pipeline ${pipeline.pipeline_id} graph` },
        ],
        diagnostics: validation.valid ? [] : validation.errors,
      });
    },
  );

  server.registerTool(
    'create_pipeline_node',
    {
      title: 'Create BrAIniac Pipeline Node',
      description:
        'Create a supported node on an owned pipeline canvas. Provide explicit spaced positions or layout hints; do not stack nodes at the same coordinates.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        nodeTypeId: z.number().int().positive().optional(),
        nodeTypeName: z.string().trim().min(1).max(64).optional(),
        label: z.string().trim().min(1).max(256).optional(),
        position: z.object({ x: z.number(), y: z.number() }).optional(),
        layout: z
          .object({
            direction: z.enum(['left_to_right', 'top_to_bottom']).optional(),
            column: z.number().int().min(0).optional(),
            row: z.number().int().min(0).optional(),
            xGap: z.number().positive().optional(),
            yGap: z.number().positive().optional(),
          })
          .optional(),
        uiJson: z.record(z.string(), z.unknown()).optional(),
        topK: z.number().int().positive().optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ pipelineId, nodeTypeId, nodeTypeName, label, position, layout, uiJson, topK }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const nodeType = await resolveNodeType({
        ...(nodeTypeId !== undefined ? { nodeTypeId } : {}),
        ...(nodeTypeName !== undefined ? { nodeTypeName } : {}),
      });
      const existingNodes = await listNodesForPipelineForUser(pipelineId, userId);
      const layoutResult = resolveCanvasPosition({
        ...(position !== undefined ? { position } : {}),
        ...(layout !== undefined ? { layout } : {}),
        existingNodes,
      });
      const node = await createNodeForUser(
        {
          fk_pipeline_id: pipelineId,
          fk_type_id: nodeType.type_id,
          top_k: topK ?? 1,
          ui_json: nodeUiJson({
            ...(label !== undefined ? { label } : {}),
            ...(uiJson !== undefined ? { uiJson } : {}),
            position: layoutResult.position,
          }),
        },
        userId,
      );
      const validation = await validatePipelineGraph(pipelineId, 'default');

      return jsonToolResult({
        node: {
          node_id: node.node_id,
          pipeline_id: pipelineId,
          label: label?.trim() || normalizeName(nodeType.name),
          resource_uri: pipelineNodeUri(pipelineId, node.node_id),
          ui_json: node.ui_json,
        },
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation,
        resource_links: [
          { uri: pipelineNodeUri(pipelineId, node.node_id), name: `Node ${node.node_id}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
        ],
        diagnostics: [...layoutResult.diagnostics, ...(validation.valid ? [] : validation.errors)],
      });
    },
  );

  server.registerTool(
    'connect_pipeline_nodes',
    {
      title: 'Connect BrAIniac Pipeline Nodes',
      description: 'Connect two existing nodes in the same owned pipeline. Duplicate and cross-pipeline edges are rejected.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        sourceNodeId: z.number().int().positive(),
        targetNodeId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ pipelineId, sourceNodeId, targetNodeId }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const [sourceNode, targetNode, existingEdges] = await Promise.all([
        getNodeByIdForUser(sourceNodeId, userId),
        getNodeByIdForUser(targetNodeId, userId),
        listEdgesForPipelineForUser(pipelineId, userId),
      ]);

      if (sourceNode.fk_pipeline_id !== pipelineId || targetNode.fk_pipeline_id !== pipelineId) {
        throw new HttpError(400, { error: 'cross-pipeline edge is not allowed', code: 'MCP_CROSS_PIPELINE_EDGE' });
      }
      if (existingEdges.some((edge) => edge.fk_from_node === sourceNodeId && edge.fk_to_node === targetNodeId)) {
        throw new HttpError(400, { error: 'duplicate edge is not allowed', code: 'MCP_DUPLICATE_EDGE' });
      }

      const edge = await createEdgeForUser(sourceNodeId, targetNodeId, userId);
      const validation = await validatePipelineGraph(pipelineId, 'default');

      return jsonToolResult({
        edge: {
          edge_id: edge.edge_id,
          pipeline_id: pipelineId,
          source_node_id: sourceNodeId,
          target_node_id: targetNodeId,
        },
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation,
        resource_links: [
          { uri: pipelineNodeUri(pipelineId, sourceNodeId), name: `Source node ${sourceNodeId}` },
          { uri: pipelineNodeUri(pipelineId, targetNodeId), name: `Target node ${targetNodeId}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
        ],
        diagnostics: validation.valid ? [] : validation.errors,
      });
    },
  );
}
