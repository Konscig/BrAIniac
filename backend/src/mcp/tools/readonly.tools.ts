import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { requireMcpUserId } from '../mcp.auth.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';
import { pipelineUri, projectUri } from '../serializers/mcp-resource-uri.js';
import { listProjectsForUser } from '../../services/application/project/project.application.service.js';
import { ensureProjectOwnedByUser } from '../../services/core/ownership.service.js';
import { listPipelines, listPipelinesByOwner } from '../../services/data/pipeline.service.js';

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
      const userId = requireMcpUserId(extra);
      const projects = await listProjectsForUser(userId);

      return jsonToolResult({
        projects: projects.map((project) => ({
          project_id: project.project_id,
          name: normalizeName(project.name),
          resource_uri: projectUri(project.project_id),
        })),
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
      });
    },
  );
}
