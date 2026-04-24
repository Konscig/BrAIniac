import type { NodeExecutionContext, NodeHandlerResult, RuntimeNode } from '../../pipeline/pipeline.executor.types.js';
import { mergeInputJson, normalizeToolLookupKey, stringifyForAgent } from './node-handler.common.js';
import type { AgentToolResolution } from './agent-tool-discovery.js';
import { executeResolvedToolBinding } from './agent-tool-execution.js';
import { getHttpErrorCode, getHttpErrorStatus } from './agent-directive-parser.js';
import { summarizeAgentToolOutput } from './agent-output-summary.js';
import type { AgentMessage } from './agent-provider-call.js';

type AgentToolCallSource = 'model';

type RunAgentToolCallOptions = {
  index: number;
  requestedToolName: string;
  inputPatch: Record<string, any>;
  source: AgentToolCallSource;
  runtime: RuntimeNode;
  context: NodeExecutionContext;
  toolResolution: AgentToolResolution;
  workingInputs: any[];
  workingInputJson: any;
  attemptedToolKeys: Set<string>;
};

type RunAgentToolCallResult = {
  nextInputJson: any;
  traceEntry: Record<string, any>;
  followupMessage: AgentMessage;
};

function buildToolResultMessage(payload: Record<string, any>): AgentMessage {
  return {
    role: 'user',
    content: `Tool result:\n${stringifyForAgent(payload)}`,
  };
}

export async function runAgentToolCall(options: RunAgentToolCallOptions): Promise<RunAgentToolCallResult> {
  const {
    index,
    requestedToolName,
    inputPatch,
    source,
    runtime,
    context,
    toolResolution,
    workingInputs,
    workingInputJson,
    attemptedToolKeys,
  } = options;

  const requestedKey = normalizeToolLookupKey(requestedToolName);
  const resolvedBinding = toolResolution.byKey.get(requestedKey);

  if (!resolvedBinding) {
    return {
      nextInputJson: workingInputJson,
      traceEntry: {
        index,
        requested_tool: requestedToolName,
        source,
        status: 'not_found',
      },
      followupMessage: buildToolResultMessage({
        status: 'not_found',
        requested_tool: requestedToolName,
      }),
    };
  }

  const resolvedKey = normalizeToolLookupKey(resolvedBinding.name);
  attemptedToolKeys.add(resolvedKey);
  attemptedToolKeys.add(requestedKey);

  const nextInputJson = mergeInputJson(workingInputJson, inputPatch);
  const toolContext = {
    dataset: context.dataset,
    input_json: nextInputJson,
  };

  try {
    const toolResult: NodeHandlerResult = await executeResolvedToolBinding(runtime, resolvedBinding, workingInputs, toolContext, {
      nodeId: runtime.node.node_id,
      topK: runtime.node.top_k,
    });

    workingInputs.push(toolResult.output);
    const outputSummary = summarizeAgentToolOutput(toolResult.output);

    return {
      nextInputJson,
      traceEntry: {
        index,
        requested_tool: requestedToolName,
        resolved_tool: resolvedBinding.name,
        source,
        status: 'completed',
        output: outputSummary,
      },
      followupMessage: buildToolResultMessage({
        status: 'completed',
        tool_name: resolvedBinding.name,
        output: outputSummary,
      }),
    };
  } catch (error) {
    const errorCode = getHttpErrorCode(error);
    const errorStatus = getHttpErrorStatus(error);
    const errorMessage = error instanceof Error ? error.message : 'tool call failed';

    return {
      nextInputJson,
      traceEntry: {
        index,
        requested_tool: requestedToolName,
        resolved_tool: resolvedBinding.name,
        source,
        status: 'failed',
        error: {
          ...(errorCode ? { code: errorCode } : {}),
          ...(errorStatus ? { status: errorStatus } : {}),
          message: errorMessage,
        },
      },
      followupMessage: buildToolResultMessage({
        status: 'failed',
        tool_name: resolvedBinding.name,
        error: {
          ...(errorCode ? { code: errorCode } : {}),
          ...(errorStatus ? { status: errorStatus } : {}),
          message: errorMessage,
        },
      }),
    };
  }
}
