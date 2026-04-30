// Drives a single pipeline execution to completion and extracts the AssessItem
// agent_output. Used by the assessment orchestrator when given a dataset_id.

import { randomUUID } from 'node:crypto';
import prisma from '../../../db.js';
import { HttpError } from '../../../common/http-error.js';
import {
  startPipelineExecutionForUser,
  getPipelineExecutionForUser,
} from '../pipeline/pipeline.executor.application.service.js';
import type { PipelineExecutionSnapshot } from '../pipeline/pipeline.executor.types.js';
import type { AssessItem } from './judge.service.js';

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

/** После выполнения pipeline собирает обогащённый AssessItem.agent_output:
 *  - text — финальный ответ;
 *  - tool_call_trace — объединение trace всех AgentCall/ToolNode узлов в порядке выполнения;
 *  - structured_output — JSON из последнего узла, у которого он есть;
 *  - retrieved_ids — id-шники документов из retrieval-узлов;
 *  - loop_iterations / loop_terminated / loop_converged — телеметрия LoopGate, если есть.
 *  Источник истины: Node.output_json, который persistNodeOutputs пишет после исполнения.
 */
export async function extractAssessOutput(
  snapshot: PipelineExecutionSnapshot,
  pipelineId: number,
): Promise<AssessItem['agent_output']> {
  const text = extractAgentOutputText(snapshot);

  const nodes = await prisma.node.findMany({
    where: { fk_pipeline_id: pipelineId },
    select: { node_id: true, output_json: true },
  });

  const toolCallTrace: any[] = [];
  let structuredOutput: any | undefined;
  const retrievedIds: string[] = [];
  let loopIterations: number | undefined;
  let loopTerminated: boolean | undefined;
  let loopConverged: boolean | undefined;

  for (const n of nodes) {
    const out = (n.output_json ?? {}) as Record<string, any>;

    // Trace из AgentCall (см. agent-call-output.ts)
    if (Array.isArray(out.tool_call_trace) && out.tool_call_trace.length > 0) {
      for (const step of out.tool_call_trace) toolCallTrace.push(step);
    }

    // structured JSON-ответ из любого узла, который его дал
    if (out.structured_output && typeof out.structured_output === 'object') {
      structuredOutput = out.structured_output;
    }

    // Retrieval-узлы возвращают список id найденных документов под разными ключами
    const retrieved = out.retrieved_ids ?? out.retrieved_doc_ids ?? out.documents ?? out.docs;
    if (Array.isArray(retrieved)) {
      for (const r of retrieved) {
        if (typeof r === 'string') retrievedIds.push(r);
        else if (r && typeof r === 'object') {
          const id = (r as any).id ?? (r as any).doc_id ?? (r as any).document_id;
          if (typeof id === 'string') retrievedIds.push(id);
        }
      }
    }

    // LoopGate телеметрия
    if (typeof out.loop_iterations === 'number') loopIterations = out.loop_iterations;
    if (typeof out.iterations === 'number' && loopIterations === undefined) loopIterations = out.iterations;
    if (typeof out.loop_terminated === 'boolean') loopTerminated = out.loop_terminated;
    if (typeof out.loop_converged === 'boolean') loopConverged = out.loop_converged;
  }

  const agentOutput: AssessItem['agent_output'] = { text };
  if (toolCallTrace.length > 0) agentOutput.tool_call_trace = toolCallTrace;
  if (structuredOutput !== undefined) agentOutput.structured_output = structuredOutput;
  if (retrievedIds.length > 0) agentOutput.retrieved_ids = retrievedIds;
  if (loopIterations !== undefined) agentOutput.loop_iterations = loopIterations;
  if (loopTerminated !== undefined) agentOutput.loop_terminated = loopTerminated;
  if (loopConverged !== undefined) agentOutput.loop_converged = loopConverged;
  return agentOutput;
}
