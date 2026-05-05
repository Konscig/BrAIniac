import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireMcpScope, requireMcpUserId } from '../mcp.auth.js';
import { pipelineExportUri, pipelineNodeExportUri, projectExportUri } from '../serializers/mcp-resource-uri.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import {
  buildNodeExportSnapshot,
  buildPipelineExportSnapshot,
  buildProjectExportSnapshot,
} from '../resources/export.resources.js';
import { redactMcpSecrets } from '../serializers/mcp-redaction.js';

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

function exportSnapshotToolResult(
  exportResourceUri: string,
  snapshot: Record<string, unknown>,
  resourceLinks: Array<{ uri: string; name: string; description?: string }>,
) {
  const redacted = redactMcpSecrets(snapshot);
  return jsonToolResult({
    inline: true,
    export_resource_uri: exportResourceUri,
    snapshot: redacted.value,
    redaction_report: redacted.redactions,
    resource_links: resourceLinks,
    diagnostics: [],
  });
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
      requireMcpScope(extra, 'mcp:export');
      const userId = requireMcpUserId(extra);
      const snapshot = await buildProjectExportSnapshot(projectId, userId);
      return exportSnapshotToolResult(projectExportUri(projectId), snapshot, [
        { uri: projectExportUri(projectId), name: `Project ${projectId} export` },
      ]);
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
      requireMcpScope(extra, 'mcp:export');
      const userId = requireMcpUserId(extra);
      const snapshot = await buildPipelineExportSnapshot(pipelineId, userId);
      return exportSnapshotToolResult(pipelineExportUri(pipelineId), snapshot, [
        { uri: pipelineExportUri(pipelineId), name: `Pipeline ${pipelineId} export` },
      ]);
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
      requireMcpScope(extra, 'mcp:export');
      const userId = requireMcpUserId(extra);
      const snapshot = await buildNodeExportSnapshot(pipelineId, nodeId, userId);
      return exportSnapshotToolResult(pipelineNodeExportUri(pipelineId, nodeId), snapshot, [
        { uri: pipelineNodeExportUri(pipelineId, nodeId), name: `Node ${nodeId} export` },
      ]);
    },
  );
}
