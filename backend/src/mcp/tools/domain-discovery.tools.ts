import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireMcpScope, requireMcpUserId } from '../mcp.auth.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import { nodeTypeUri, pipelineAgentsUri, pipelineGraphUri, pipelineNodeUri, pipelineUri, pipelineValidationUri, toolUri } from '../serializers/mcp-resource-uri.js';
import {
  getNodeTypeCatalogEntryById,
  listNodeTypeCatalogEntries,
  type NodeTypeCatalogEntry,
} from '../../services/application/node_type/node_type.application.service.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';
import { parseGraphValidationPreset, validatePipelineGraph } from '../../services/core/graph_validation.service.js';
import { validateNodeConfigForType } from '../../services/application/node/node-config-validation.service.js';
import { deletePipelineEdgeForUser } from '../../services/application/edge/edge.application.service.js';
import { deletePipelineNodeForUser, updatePipelineNodeForUser } from '../../services/application/node/node.application.service.js';
import { listEdgesByPipeline } from '../../services/data/edge.service.js';
import { listNodesByPipeline } from '../../services/data/node.service.js';
import { getNodeTypeById } from '../../services/data/node_type.service.js';
import { getToolById } from '../../services/data/tool.service.js';

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

function normalizeName(value: string): string {
  return value.trim();
}

function rejectHiddenToolBindings(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'tool_ref' || key === 'tool_refs') {
      throw new Error('hidden tool_ref/tool_refs bindings are not supported');
    }
    rejectHiddenToolBindings(nested);
  }
}

async function getPipelineGraphSummary(pipelineId: number) {
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
              resource_uri: nodeTypeUri(nodeType.type_id),
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
      };
    }),
    edges: edges.map((edge) => ({
      edge_id: edge.edge_id,
      fk_from_node: edge.fk_from_node,
      fk_to_node: edge.fk_to_node,
    })),
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

  server.registerTool(
    'get_pipeline_graph',
    {
      title: 'Get BrAIniac Pipeline Graph',
      description: 'Return an owner-scoped BrAIniac pipeline graph with nodes, edges, node types, tool bindings, validation summary, and resource links.',
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
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const graph = await getPipelineGraphSummary(pipelineId);
      const validationPreset = parseGraphValidationPreset(preset) ?? 'default';
      const validation = includeValidation ? await validatePipelineGraph(pipelineId, validationPreset) : undefined;

      return jsonToolResult({
        graph,
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation_resource_uri: pipelineValidationUri(pipelineId),
        agent_resource_uri: pipelineAgentsUri(pipelineId),
        ...(validation ? { validation } : {}),
        resource_links: [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
          { uri: pipelineValidationUri(pipelineId), name: `Pipeline ${pipelineId} validation` },
          { uri: pipelineAgentsUri(pipelineId), name: `Pipeline ${pipelineId} agents` },
        ],
        diagnostics: validation && !validation.valid ? validation.errors : [],
      });
    },
  );

  server.registerTool(
    'list_pipeline_edges',
    {
      title: 'List BrAIniac Pipeline Edges',
      description: 'Return edges for one owner-scoped pipeline so agents can check current connections before mutating the graph.',
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
      const edges = await listEdgesByPipeline(pipelineId);

      return jsonToolResult({
        edges: edges.map((edge) => ({
          edge_id: edge.edge_id,
          fk_from_node: edge.fk_from_node,
          fk_to_node: edge.fk_to_node,
        })),
        graph_resource_uri: pipelineGraphUri(pipelineId),
        resource_links: [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
        ],
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'validate_node_config',
    {
      title: 'Validate BrAIniac Node Config',
      description: 'Dry-run validation for a BrAIniac node type and proposed configJson before creating or updating a node.',
      inputSchema: {
        nodeTypeId: z.number().int().positive(),
        configJson: z.unknown().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ nodeTypeId, configJson }, extra) => {
      requireMcpScope(extra, 'mcp:read');
      const validation = await validateNodeConfigForType(nodeTypeId, configJson);
      return jsonToolResult({
        validation,
        node_type_resource_uri: nodeTypeUri(nodeTypeId),
        resource_links: [{ uri: nodeTypeUri(nodeTypeId), name: `Node Type ${nodeTypeId}` }],
        diagnostics: [...validation.errors, ...validation.warnings],
      });
    },
  );

  server.registerTool(
    'update_pipeline_node',
    {
      title: 'Update BrAIniac Pipeline Node',
      description: 'Update an existing node label, config_json, or ui_json.position in an owned pipeline.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        nodeId: z.number().int().positive(),
        label: z.string().trim().min(1).optional(),
        configJson: z.unknown().optional(),
        uiJson: z.record(z.string(), z.unknown()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
      },
    },
    async ({ pipelineId, nodeId, label, configJson, uiJson }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      rejectHiddenToolBindings(configJson);
      rejectHiddenToolBindings(uiJson);
      const node = await updatePipelineNodeForUser(
        pipelineId,
        nodeId,
        {
          ...(label !== undefined ? { label } : {}),
          ...(configJson !== undefined ? { config_json: configJson } : {}),
          ...(uiJson !== undefined ? { ui_json: uiJson } : {}),
        },
        userId,
      );
      const validation = await validatePipelineGraph(pipelineId, 'default');

      return jsonToolResult({
        node: {
          node_id: node.node_id,
          pipeline_id: pipelineId,
          resource_uri: pipelineNodeUri(pipelineId, node.node_id),
          ui_json: node.ui_json,
        },
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation,
        resource_links: [
          { uri: pipelineNodeUri(pipelineId, node.node_id), name: `Node ${node.node_id}` },
          { uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` },
        ],
        diagnostics: validation.valid ? [] : validation.errors,
      });
    },
  );

  server.registerTool(
    'delete_pipeline_node',
    {
      title: 'Delete BrAIniac Pipeline Node',
      description: 'Delete a node from an owned pipeline and return affected edge diagnostics plus graph validation.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        nodeId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ pipelineId, nodeId }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      const deletion = await deletePipelineNodeForUser(pipelineId, nodeId, userId);
      const validation = await validatePipelineGraph(pipelineId, 'default');

      return jsonToolResult({
        deleted_node: deletion,
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation,
        resource_links: [{ uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` }],
        diagnostics: [
          ...deletion.affected_edges.map((edge) => ({
            code: 'MCP_AFFECTED_EDGE_DELETED',
            message: 'edge was removed by node deletion',
            edge,
          })),
          ...(validation.valid ? [] : validation.errors),
        ],
      });
    },
  );

  server.registerTool(
    'delete_pipeline_edge',
    {
      title: 'Delete BrAIniac Pipeline Edge',
      description: 'Delete one edge from an owned pipeline by source and target node ids.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        sourceNodeId: z.number().int().positive(),
        targetNodeId: z.number().int().positive(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
      },
    },
    async ({ pipelineId, sourceNodeId, targetNodeId }, extra) => {
      requireMcpScope(extra, 'mcp:execute');
      const userId = requireMcpUserId(extra);
      const edge = await deletePipelineEdgeForUser(pipelineId, sourceNodeId, targetNodeId, userId);
      const validation = await validatePipelineGraph(pipelineId, 'default');

      return jsonToolResult({
        deleted_edge: edge,
        graph_resource_uri: pipelineGraphUri(pipelineId),
        validation,
        resource_links: [{ uri: pipelineGraphUri(pipelineId), name: `Pipeline ${pipelineId} graph` }],
        diagnostics: validation.valid ? [] : validation.errors,
      });
    },
  );
}
