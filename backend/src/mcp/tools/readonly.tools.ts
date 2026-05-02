import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireMcpScope, requireMcpUserId } from '../mcp.auth.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import { pipelineAgentsUri, pipelineGraphUri, pipelineNodeUri, pipelineUri, pipelineValidationUri, projectUri, toolUri } from '../serializers/mcp-resource-uri.js';
import { listProjectsForUser } from '../../services/application/project/project.application.service.js';
import { ensureProjectOwnedByUser } from '../../services/core/ownership.service.js';
import { parseGraphValidationPreset, validatePipelineGraph } from '../../services/core/graph_validation.service.js';
import { getNodeById, listNodesByPipeline } from '../../services/data/node.service.js';
import { getNodeTypeById } from '../../services/data/node_type.service.js';
import { listPipelines, listPipelinesByOwner } from '../../services/data/pipeline.service.js';
import { getToolById } from '../../services/data/tool.service.js';
import { listToolEntries } from '../../services/application/tool/tool.application.service.js';
import { HttpError } from '../../common/http-error.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';

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

export function registerReadOnlyProjectTools(server: McpServer): void {
  server.registerTool(
    'list_projects',
    {
      title: 'List BrAIniac Projects',
      description: 'Return owner-scoped BrAIniac project summaries for the authenticated user.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (_args, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const userId = requireMcpUserId(extra);
      const projects = await listProjectsForUser(userId);

      return jsonToolResult({
        projects: projects.map((project) => ({
          project_id: project.project_id,
          name: normalizeName(project.name),
          resource_uri: projectUri(project.project_id),
        })),
        resource_links: projects.map((project) => ({
          uri: projectUri(project.project_id),
          name: `Project ${project.project_id}: ${normalizeName(project.name)}`,
        })),
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'list_pipelines',
    {
      title: 'List BrAIniac Pipelines',
      description: 'Return owner-scoped BrAIniac pipelines, optionally filtered by project.',
      inputSchema: {
        projectId: z.number().int().positive().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ projectId }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const userId = requireMcpUserId(extra);
      const pipelines =
        projectId !== undefined
          ? (await ensureProjectOwnedByUser(projectId, userId), await listPipelines(projectId))
          : await listPipelinesByOwner(userId);

      return jsonToolResult({
        pipelines: pipelines.map((pipeline) => ({
          pipeline_id: pipeline.pipeline_id,
          fk_project_id: pipeline.fk_project_id,
          name: normalizeName(pipeline.name),
          resource_uri: pipelineUri(pipeline.pipeline_id),
        })),
        resource_links: pipelines.map((pipeline) => ({
          uri: pipelineUri(pipeline.pipeline_id),
          name: `Pipeline ${pipeline.pipeline_id}: ${normalizeName(pipeline.name)}`,
        })),
        diagnostics: [],
      });
    },
  );
}

export function registerReadOnlyContextTools(server: McpServer): void {
  server.registerTool(
    'get_pipeline_context',
    {
      title: 'Get BrAIniac Pipeline Context',
      description: 'Return bounded owner-scoped pipeline context with graph and validation links.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        includeValidation: z.boolean().optional(),
        preset: z.enum(['default', 'production', 'dev']).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId, includeValidation, preset }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const userId = requireMcpUserId(extra);
      const pipeline = await ensurePipelineOwnedByUser(pipelineId, userId);
      const validationPreset = parseGraphValidationPreset(preset) ?? 'default';
      const validation = includeValidation ? await validatePipelineGraph(pipelineId, validationPreset) : undefined;

      return jsonToolResult({
        pipeline: {
          pipeline_id: pipeline.pipeline_id,
          fk_project_id: pipeline.fk_project_id,
          name: normalizeName(pipeline.name),
          max_time: pipeline.max_time,
          max_cost: pipeline.max_cost,
          max_reject: pipeline.max_reject,
          score: pipeline.score,
        },
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation_resource_uri: pipelineValidationUri(pipelineId),
        agent_resource_uri: pipelineAgentsUri(pipelineId),
        resource_links: [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
          { uri: pipelineValidationUri(pipelineId), name: `Pipeline ${pipelineId} validation` },
          { uri: pipelineAgentsUri(pipelineId), name: `Pipeline ${pipelineId} agents` },
        ],
        ...(validation ? { validation } : {}),
        diagnostics: validation && !validation.valid ? validation.errors : [],
      });
    },
  );

  server.registerTool(
    'list_pipeline_nodes',
    {
      title: 'List BrAIniac Pipeline Nodes',
      description: 'Return node summaries for one owner-scoped pipeline.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const userId = requireMcpUserId(extra);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const nodes = await listNodesByPipeline(pipelineId);

      return jsonToolResult({
        nodes: await Promise.all(
          nodes.map(async (node) => {
            const nodeType = await getNodeTypeById(node.fk_type_id);
            return {
              node_id: node.node_id,
              fk_type_id: node.fk_type_id,
              label: nodeType ? normalizeName(nodeType.name) : `Node ${node.node_id}`,
              resource_uri: pipelineNodeUri(pipelineId, node.node_id),
              runtime_support_state: nodeType ? 'supported' : 'unsupported',
            };
          }),
        ),
        resource_links: nodes.map((node) => ({
          uri: pipelineNodeUri(pipelineId, node.node_id),
          name: `Node ${node.node_id}`,
        })),
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'get_node_context',
    {
      title: 'Get BrAIniac Node Context',
      description: 'Return one node with type, tool binding, and agent context where available.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        nodeId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId, nodeId }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const userId = requireMcpUserId(extra);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const node = await getNodeById(nodeId);
      if (!node || node.fk_pipeline_id !== pipelineId) {
        throw new HttpError(404, { error: 'node not found' });
      }

      const nodeType = await getNodeTypeById(node.fk_type_id);
      const tool = nodeType ? await getToolById(nodeType.fk_tool_id) : null;

      return jsonToolResult({
        node,
        node_type: nodeType,
        tool_binding: tool
          ? {
              tool_id: tool.tool_id,
              name: normalizeName(tool.name),
              resource_uri: toolUri(tool.tool_id),
            }
          : null,
        agent_config: null,
        resource_links: [
          { uri: pipelineNodeUri(pipelineId, nodeId), name: `Node ${nodeId}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
          ...(tool ? [{ uri: toolUri(tool.tool_id), name: `Tool ${tool.tool_id}: ${normalizeName(tool.name)}` }] : []),
        ],
        diagnostics: nodeType ? [] : [{ code: 'NODE_TYPE_MISSING', message: 'node type is missing' }],
      });
    },
  );

  server.registerTool(
    'list_tool_catalog',
    {
      title: 'List BrAIniac Tool Catalog',
      description: 'Return BrAIniac tool catalog entries and resource links.',
      inputSchema: {},
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async (_args, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const tools = await listToolEntries();
      return jsonToolResult({
        tools: tools.map((tool) => ({
          tool_id: tool.tool_id,
          name: normalizeName(tool.name),
          resource_uri: toolUri(tool.tool_id),
        })),
        resource_links: tools.map((tool) => ({
          uri: toolUri(tool.tool_id),
          name: `Tool ${tool.tool_id}: ${normalizeName(tool.name)}`,
        })),
        diagnostics: [],
      });
    },
  );
}
