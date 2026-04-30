// Drives a single pipeline execution to completion and extracts the AssessItem
// agent_output. Used by the assessment orchestrator when given a dataset_id.

import { randomUUID } from 'node:crypto';
import { HttpError } from '../../../common/http-error.js';
import {
  startPipelineExecutionForUser,
  getPipelineExecutionForUser,
} from '../pipeline/pipeline.executor.application.service.js';
import type { PipelineExecutionSnapshot } from '../pipeline/pipeline.executor.types.js';

const POLL_INTERVAL_MS = 750;
const DEFAULT_TIMEOUT_MS = 180_000;

function isTerminal(status: string): boolean {
  return status === 'succeeded' || status === 'failed';
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runPipelineForItem(
  pipelineId: number,
  userId: number,
  question: string,
  options: { timeoutMs?: number } = {},
): Promise<PipelineExecutionSnapshot> {
  const idempotencyKey = `assess-${pipelineId}-${randomUUID()}`;
  const initial = await startPipelineExecutionForUser(
    pipelineId,
    userId,
    {
      preset: 'default',
      input_json: { question, user_query: question },
    },
    idempotencyKey,
  );

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const deadline = Date.now() + timeoutMs;

  let snapshot = initial;
  while (!isTerminal(snapshot.status)) {
    if (Date.now() > deadline) {
      throw new HttpError(504, {
        code: 'JUDGE_PIPELINE_RUN_TIMEOUT',
        error: 'pipeline execution did not finish within timeout',
        details: { pipeline_id: pipelineId, execution_id: snapshot.execution_id, timeout_ms: timeoutMs },
      });
    }
    await sleep(POLL_INTERVAL_MS);
    snapshot = await getPipelineExecutionForUser(pipelineId, snapshot.execution_id, userId);
  }

  return snapshot;
}

export function extractAgentOutputText(snapshot: PipelineExecutionSnapshot): string {
  const final = snapshot.final_result;
  if (!final) return '';
  if (typeof final.text === 'string' && final.text.length > 0) return final.text;
  if (typeof final.output_preview === 'string') {
    // output_preview is JSON-encoded preview; pull "text" if present
    try {
      const parsed = JSON.parse(final.output_preview);
      if (parsed && typeof parsed === 'object') {
        const preview = (parsed as any).preview;
        if (preview && typeof preview === 'object') {
          if (typeof preview.text === 'string') return preview.text;
          if (typeof preview.answer === 'string') return preview.answer;
        }
        if (typeof (parsed as any).text === 'string') return (parsed as any).text;
      }
    } catch {
      // ignore — fall back to raw preview
    }
    return final.output_preview;
  }
  return '';
}
