import type { JudgeToolSchema } from '../../../core/judge_provider/index.js';
import { handleGetLogs } from './get_logs.handler.js';
import { handleGetMetrics } from './get_metrics.handler.js';
import { handleGetNode } from './get_node.handler.js';

export type ToolHandler = (args: Record<string, any>, userId: number) => Promise<any>;

export const toolHandlers: Record<string, ToolHandler> = {
  getNode: handleGetNode,
  getMetrics: handleGetMetrics,
  getLogs: handleGetLogs,
};

export const toolSchemas: JudgeToolSchema[] = [
  {
    name: 'getNode',
    description: 'Fetch node details (type, ui_json, status). Argument: { node_id: int }.',
    parameters: {
      type: 'object',
      properties: { node_id: { type: 'integer' } },
      required: ['node_id'],
    },
  },
  {
    name: 'getMetrics',
    description: 'Fetch metric scores for an assessment. Argument: { assessment_id: int }.',
    parameters: {
      type: 'object',
      properties: { assessment_id: { type: 'integer' } },
      required: ['assessment_id'],
    },
  },
  {
    name: 'getLogs',
    description: 'Fetch per-item logs and tool_call_trace for an assessment. Argument: { assessment_id: int, item_id?: int }.',
    parameters: {
      type: 'object',
      properties: {
        assessment_id: { type: 'integer' },
        item_id: { type: 'integer' },
      },
      required: ['assessment_id'],
    },
  },
];
