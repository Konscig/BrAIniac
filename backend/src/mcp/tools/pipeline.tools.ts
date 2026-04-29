import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { HttpError } from '../../common/http-error.js';
import { parseGraphValidationPreset, validatePipelineGraph } from '../../services/core/graph_validation.service.js';
import {
  getPipelineExecutionForUser,
  startPipelineExecutionForUser,
} from '../../services/application/pipeline/pipeline.executor.application.service.js';
import { ensurePipelineOwnedByUser } from '../../services/core/ownership.service.js';
import { requireMcpUserId } from '../mcp.auth.js';
import { pipelineExecutionUri, pipelineUri, pipelineValidationUri } from '../serializers/mcp-resource-uri.js';
import { toMcpToolJsonText } from '../serializers/mcp-safe-json.js';

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

function normalizePreset(rawPreset: string | undefined) {
  const preset = parseGraphValidationPreset(rawPreset);
  if (rawPreset !== undefined && rawPreset.trim() !== '' && !preset) {
    throw new HttpError(400, { error: 'invalid preset' });
  }
  return preset ?? 'default';
}

export function registerPipelineOperationTools(server: McpServer): void {
  server.registerTool(
    'validate_pipeline',
    {
      title: 'Validate BrAIniac Pipeline',
      description: 'Run graph validation through the existing BrAIniac graph validation service.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        preset: z.enum(['default', 'production', 'dev']).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId, preset }, extra) => {
      const userId = requireMcpUserId(extra);
      await ensurePipelineOwnedByUser(pipelineId, userId);
      const validationPreset = normalizePreset(preset);
      const validation = await validatePipelineGraph(pipelineId, validationPreset);

      return jsonToolResult({
        ...validation,
        pipeline_id: pipelineId,
        preset: validationPreset,
        validation_resource_uri: pipelineValidationUri(pipelineId),
        resource_links: [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          { uri: pipelineValidationUri(pipelineId), name: `Pipeline ${pipelineId} validation` },
        ],
        diagnostics: validation.valid ? [] : validation.errors,
      });
    },
  );

  server.registerTool(
    'start_pipeline_execution',
    {
      title: 'Start BrAIniac Pipeline Execution',
      description: 'Start a pipeline run through the existing BrAIniac executor service.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        preset: z.enum(['default', 'production', 'dev']).optional(),
        datasetId: z.number().int().positive().optional(),
        inputJson: z.unknown().optional(),
        idempotencyKey: z.string().trim().min(1).max(200).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId, preset, datasetId, inputJson, idempotencyKey }, extra) => {
      const userId = requireMcpUserId(extra);
      const validationPreset = normalizePreset(preset);
      const snapshot = await startPipelineExecutionForUser(
        pipelineId,
        userId,
        {
          preset: validationPreset,
          ...(datasetId !== undefined ? { dataset_id: datasetId } : {}),
          ...(inputJson !== undefined ? { input_json: inputJson } : {}),
        },
        idempotencyKey,
      );

      return jsonToolResult({
        ...snapshot,
        execution_resource_uri: pipelineExecutionUri(pipelineId, snapshot.execution_id),
        resource_links: [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          {
            uri: pipelineExecutionUri(pipelineId, snapshot.execution_id),
            name: `Pipeline ${pipelineId} execution ${snapshot.execution_id}`,
          },
        ],
        diagnostics: snapshot.error ? [snapshot.error] : [],
      });
    },
  );

  server.registerTool(
    'get_pipeline_execution',
    {
      title: 'Get BrAIniac Pipeline Execution',
      description: 'Return a bounded execution snapshot through the existing BrAIniac executor service.',
      inputSchema: {
        pipelineId: z.number().int().positive(),
        executionId: z.string().trim().min(1),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
      },
    },
    async ({ pipelineId, executionId }, extra) => {
      const userId = requireMcpUserId(extra);
      const snapshot = await getPipelineExecutionForUser(pipelineId, executionId, userId);

      return jsonToolResult({
        ...snapshot,
        execution_resource_uri: pipelineExecutionUri(pipelineId, snapshot.execution_id),
        resource_links: [
          { uri: pipelineUri(pipelineId), name: `Pipeline ${pipelineId}` },
          {
            uri: pipelineExecutionUri(pipelineId, snapshot.execution_id),
            name: `Pipeline ${pipelineId} execution ${snapshot.execution_id}`,
          },
        ],
        diagnostics: snapshot.error ? [snapshot.error] : [],
      });
    },
  );
}
