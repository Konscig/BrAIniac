import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireMcpUserId } from '../mcp.auth.js';
import { pipelineExportUri, pipelineNodeExportUri, projectExportUri } from '../serializers/mcp-resource-uri.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import {
  buildNodeExportSnapshot,
  buildPipelineExportSnapshot,
  buildProjectExportSnapshot,
  redactionReportForSnapshot,
} from '../resources/export.resources.js';

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

export function registerExportTools(server: McpServer): void {
  server.registerTool(
    'export_project_snapshot',
    {
      title: 'Export BrAIniac Project Snapshot',
      description: 'Return a redacted project export resource link and redaction report.',
      inputSchema: {
        projectId: z.number().int().positive(),
        includePipelines: z.boolean().optional(),
        includeExecutions: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ projectId }, extra) => {
      const userId = requireMcpUserId(extra);
      const snapshot = await buildProjectExportSnapshot(projectId, userId);
      return jsonToolResult({
        export_resource_uri: projectExportUri(projectId),
        redactions: redactionReportForSnapshot(snapshot),
        resource_links: [{ uri: projectExportUri(projectId), name: `Project ${projectId} export` }],
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'export_pipeline_snapshot',
    {
      title: 'Export BrAIniac Pipeline Snapshot',
      description: 'Return a redacted pipeline export resource link and redaction report.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        includeExecutions: z.boolean().optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId }, extra) => {
      const userId = requireMcpUserId(extra);
      const snapshot = await buildPipelineExportSnapshot(pipelineId, userId);
      return jsonToolResult({
        export_resource_uri: pipelineExportUri(pipelineId),
        redactions: redactionReportForSnapshot(snapshot),
        resource_links: [{ uri: pipelineExportUri(pipelineId), name: `Pipeline ${pipelineId} export` }],
        diagnostics: [],
      });
    },
  );

  server.registerTool(
    'export_node_snapshot',
    {
      title: 'Export BrAIniac Node Snapshot',
      description: 'Return a redacted node export resource link and redaction report.',
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
      const userId = requireMcpUserId(extra);
      const snapshot = await buildNodeExportSnapshot(pipelineId, nodeId, userId);
      return jsonToolResult({
        export_resource_uri: pipelineNodeExportUri(pipelineId, nodeId),
        redactions: redactionReportForSnapshot(snapshot),
        resource_links: [{ uri: pipelineNodeExportUri(pipelineId, nodeId), name: `Node ${nodeId} export` }],
        diagnostics: [],
      });
    },
  );
}
