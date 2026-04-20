import { HttpError } from '../../../../common/http-error.js';
import { getOpenRouterAdapter } from '../../../core/openrouter/openrouter.adapter.js';
import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { buildPrompt, readBoundedInteger, tryParseJsonFromText } from '../../pipeline/pipeline.executor.utils.js';
import {
  type AgentDirective,
  executeResolvedToolBinding,
  extractAgentArtifactAnswer,
  getHttpErrorCode,
  getHttpErrorStatus,
  isSoftOpenRouterError,
  mergeInputJson,
  normalizeToolLookupKey,
  parseAgentDirective,
  resolveAgentChatModel,
  resolveAgentToolBindings,
  resolveNodeSectionConfig,
  stringifyForAgent,
  summarizeAgentToolOutput,
} from './node-handler.shared.js';

function hasPositiveUsageTokens(usage: Record<string, any> | undefined): boolean {
  if (!usage || typeof usage !== 'object') return false;

  const tokenKeys = ['total_tokens', 'prompt_tokens', 'completion_tokens', 'input_tokens', 'output_tokens'];
  for (const key of tokenKeys) {
    const value = Number((usage as Record<string, any>)[key]);
    if (Number.isFinite(value) && value > 0) return true;
  }

  return false;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toObjectRecord(raw: unknown): Record<string, any> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, any>;
}

function isToolAdvertisingInput(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === undefined || value === null) return false;

  if (Array.isArray(value)) {
    return value.some((entry) => isToolAdvertisingInput(entry, depth + 1));
  }

  const record = toObjectRecord(value);
  if (!record) return false;

  const kind = typeof record.kind === 'string' ? record.kind.trim().toLowerCase() : '';
  const type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
  if (
    kind === 'tool_ref' ||
    type === 'tool_ref' ||
    kind === 'tool_refs' ||
    type === 'tool_refs' ||
    kind === 'tool_node' ||
    type === 'tool_node'
  ) {
    return true;
  }

  const nestedKeys = ['value', 'data', 'payload', 'output', 'contract_output'];
  return nestedKeys.some((key) => key in record && isToolAdvertisingInput(record[key], depth + 1));
}

function summarizeDirective(directive: AgentDirective): Record<string, any> {
  if (directive.kind === 'tool_call') {
    return {
      kind: directive.kind,
      tool_name: directive.toolName,
      input_keys: Object.keys(directive.input ?? {}).slice(0, 24),
    };
  }

  if (directive.kind === 'final') {
    return {
      kind: directive.kind,
      text_preview: directive.text.trim().slice(0, 240),
    };
  }

  return {
    kind: directive.kind,
  };
}

export const agentCallNodeHandler: NodeHandler = async (runtime, inputs, context) => {
  const adapter = getOpenRouterAdapter();
  const promptInputs = inputs.filter((entry) => !isToolAdvertisingInput(entry));
  const prompt = buildPrompt(promptInputs, context.input_json).trim();
  if (!prompt) {
    throw new HttpError(400, {
      code: 'EXECUTOR_AGENTCALL_INPUT_REQUIRED',
      error: 'agent call requires non-empty input context',
    });
  }

  const agentConfig = resolveNodeSectionConfig(runtime, 'agent');
  const llmConfig = resolveNodeSectionConfig(runtime, 'llm');

  const maxToolCalls = readBoundedInteger(agentConfig.maxToolCalls, 3, 1, 8);
  const maxAttempts = readBoundedInteger(agentConfig.maxAttempts, 1, 1, 5);
  const softRetryDelayMs = readBoundedInteger(agentConfig.softRetryDelayMs ?? llmConfig.softRetryDelayMs, 1200, 100, 15000);
  const agentModel = resolveAgentChatModel(runtime);
  const temperatureRaw = Number(agentConfig.temperature ?? llmConfig.temperature);
  const maxTokensRaw = Number(agentConfig.maxTokens ?? llmConfig.maxTokens);
  const configuredSystemPrompt = agentConfig.systemPrompt;
  const baseSystemPrompt =
    typeof configuredSystemPrompt === 'string' && configuredSystemPrompt.trim().length > 0
      ? configuredSystemPrompt
      : 'You are AgentCall runtime in a pipeline graph. Return concise, actionable output. Use JSON when structure is useful.';

  const toolResolution = await resolveAgentToolBindings(runtime, inputs);
  const availableTools = toolResolution.advertised;
  const toolText =
    availableTools.length > 0
      ? `Available tools:\n${availableTools
          .map((tool, index) => `${index + 1}. ${tool.name}${tool.desc ? ` - ${tool.desc}` : ''}`)
          .join('\n')}`
      : 'Available tools: none';

  const unresolvedToolText =
    toolResolution.unresolvedTools.length > 0
      ? `\nUnresolved tools (not callable): ${toolResolution.unresolvedTools.join(', ')}`
      : '';

  const toolProtocol = [
    'Tool protocol:',
    '1) To call a tool, respond with ONLY JSON:',
    '{"type":"tool_call","tool_name":"<name>","input":{...}}',
    '2) To finish, respond with ONLY JSON:',
    '{"type":"final","text":"<answer>"}',
    '3) One JSON object per response. No markdown wrappers.',
  ].join('\n');

  const systemPrompt = `${baseSystemPrompt}\n\n${toolProtocol}`;
  const messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: `${toolText}${unresolvedToolText}\n\nTask:\n${prompt}`,
    },
  ];

  let attemptsUsed = 0;
  let llmTurns = 0;
  let toolCallsExecuted = 0;
  let finalText = '';
  let finalModel = agentModel ?? '';
  let finalProviderResponseId = '';
  let finalUsage: Record<string, any> | undefined;
  let providerCallsAttempted = 0;
  let providerLastErrorCode = '';
  let providerLastErrorStatus: number | null = null;
  let providerSoftFailures = 0;
  let providerSuccessfulResponses = 0;
  let plannerFallbackUsed = false;
  let finalTextSource = '';
  let finalTextOrigin = '';
  let rawCompletionText = '';
  let lastDirectiveSummary: Record<string, any> | null = null;
  const toolCallTrace: Array<Record<string, any>> = [];

  const workingInputs = [...inputs];
  let workingInputJson: any = context.input_json;
  const attemptedToolKeys = new Set<string>();

  const runToolCall = async (requestedToolName: string, inputPatch: Record<string, any>, source: 'model' | 'fallback') => {
    const requestedKey = normalizeToolLookupKey(requestedToolName);
    const resolvedBinding = toolResolution.byKey.get(requestedKey);

    toolCallsExecuted += 1;

    if (!resolvedBinding) {
      toolCallTrace.push({
        index: toolCallsExecuted,
        requested_tool: requestedToolName,
        source,
        status: 'not_found',
      });

      messages.push({
        role: 'user',
        content: `Tool result:\n${stringifyForAgent({
          status: 'not_found',
          requested_tool: requestedToolName,
        })}`,
      });
      return;
    }

    const resolvedKey = normalizeToolLookupKey(resolvedBinding.name);
    attemptedToolKeys.add(resolvedKey);
    attemptedToolKeys.add(requestedKey);

    workingInputJson = mergeInputJson(workingInputJson, inputPatch);
    const toolContext = {
      dataset: context.dataset,
      input_json: workingInputJson,
    };

    try {
      const toolResult = await executeResolvedToolBinding(runtime, resolvedBinding, workingInputs, toolContext, {
        nodeId: runtime.node.node_id,
        topK: runtime.node.top_k,
      });

      workingInputs.push(toolResult.output);
      toolCallTrace.push({
        index: toolCallsExecuted,
        requested_tool: requestedToolName,
        resolved_tool: resolvedBinding.name,
        source,
        status: 'completed',
        output: summarizeAgentToolOutput(toolResult.output),
      });

      messages.push({
        role: 'user',
        content: `Tool result:\n${stringifyForAgent({
          status: 'completed',
          tool_name: resolvedBinding.name,
          output: summarizeAgentToolOutput(toolResult.output),
        })}`,
      });
    } catch (error) {
      const errorCode = getHttpErrorCode(error);
      const errorStatus = getHttpErrorStatus(error);
      const errorMessage = error instanceof Error ? error.message : 'tool call failed';

      toolCallTrace.push({
        index: toolCallsExecuted,
        requested_tool: requestedToolName,
        resolved_tool: resolvedBinding.name,
        source,
        status: 'failed',
        error: {
          ...(errorCode ? { code: errorCode } : {}),
          ...(errorStatus ? { status: errorStatus } : {}),
          message: errorMessage,
        },
      });

      messages.push({
        role: 'user',
        content: `Tool result:\n${stringifyForAgent({
          status: 'failed',
          tool_name: resolvedBinding.name,
          error: {
            ...(errorCode ? { code: errorCode } : {}),
            ...(errorStatus ? { status: errorStatus } : {}),
            message: errorMessage,
          },
        })}`,
      });
    }
  };

  while (llmTurns < maxToolCalls + 1) {
    llmTurns += 1;

    let completionText = '';
    let completionError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      attemptsUsed += 1;
      providerCallsAttempted += 1;
      try {
        const completion = await adapter.chatCompletion({
          ...(agentModel ? { model: agentModel } : {}),
          messages,
          ...(Number.isFinite(temperatureRaw) ? { temperature: temperatureRaw } : {}),
          ...(Number.isInteger(maxTokensRaw) && maxTokensRaw > 0 ? { maxTokens: maxTokensRaw } : {}),
        });

        finalModel = completion.model;
        finalProviderResponseId = typeof completion.responseId === 'string' ? completion.responseId.trim() : finalProviderResponseId;
        finalUsage = completion.usage;
        providerSuccessfulResponses += 1;
        providerLastErrorCode = '';
        providerLastErrorStatus = null;
        completionText = completion.text.trim();
        if (completionText.length > 0) break;
      } catch (error) {
        completionError = error;
        providerLastErrorCode = getHttpErrorCode(error) ?? '';
        providerLastErrorStatus = getHttpErrorStatus(error);
        const openRouterCode = getHttpErrorCode(error);
        const isOpenRouterError = typeof openRouterCode === 'string' && openRouterCode.startsWith('OPENROUTER_');
        const isRecoverableSoftError = isSoftOpenRouterError(error);
        if (!isRecoverableSoftError && !isOpenRouterError) {
          throw error;
        }
        providerSoftFailures += 1;

        const backoffMs = Math.max(0, Math.min(softRetryDelayMs * attempt, 30_000));
        if (backoffMs > 0) {
          await sleep(backoffMs);
        }

        if (isRecoverableSoftError && attempt < maxAttempts) {
          continue;
        }

        break;
      }
    }

    if (completionText.length > 0) {
      rawCompletionText = completionText;
      messages.push({
        role: 'assistant',
        content: completionText,
      });
    }

    const hasToolBudget = toolCallsExecuted < maxToolCalls;
    const directive: AgentDirective = completionText ? parseAgentDirective(completionText) : { kind: 'none', raw: null };
    lastDirectiveSummary = summarizeDirective(directive);

    if (directive.kind === 'tool_call' && hasToolBudget) {
      await runToolCall(directive.toolName, directive.input, 'model');
      continue;
    }

    if (directive.kind === 'final' && directive.text.trim().length > 0) {
      finalText = directive.text.trim();
      finalTextSource = 'directive.final';
      finalTextOrigin = 'model';
      break;
    }

    if (hasToolBudget) {
      const fallbackTool = toolResolution.orderedBindings.find((entry) => !attemptedToolKeys.has(entry.key));
      if (fallbackTool) {
        plannerFallbackUsed = true;
        await runToolCall(fallbackTool.binding.name, {}, 'fallback');
        continue;
      }
    }

    const fallbackAnswer = extractAgentArtifactAnswer(workingInputs);
    if (fallbackAnswer) {
      finalText = fallbackAnswer;
      finalTextSource = 'artifact.answer';
      finalTextOrigin = 'tool-artifact';
      break;
    }

    if (completionText.length > 0) {
      finalText = completionText;
      finalTextSource = 'raw.completion';
      finalTextOrigin = directive.kind === 'tool_call' ? 'model-tool-call-markup' : 'model';
      break;
    }

    break;
  }

  if (!finalText) {
    finalText = extractAgentArtifactAnswer(workingInputs) ?? 'AgentCall completed with empty answer.';
    finalTextSource = finalText === 'AgentCall completed with empty answer.' ? 'fallback.empty' : 'artifact.answer';
    finalTextOrigin = finalText === 'AgentCall completed with empty answer.' ? 'runtime' : 'tool-artifact';
  }

  const structuredOutput = tryParseJsonFromText(finalText);
  const providerSoftFailure = providerSoftFailures > 0 && providerSuccessfulResponses === 0;

  return {
    output: {
      kind: 'agent_call',
      provider: 'openrouter',
      model: finalModel,
      provider_response_id: finalProviderResponseId || null,
      text: finalText,
      final_text_source: finalTextSource || null,
      final_text_origin: finalTextOrigin || null,
      raw_completion_text: rawCompletionText || null,
      last_directive: lastDirectiveSummary,
      last_directive_kind: typeof lastDirectiveSummary?.kind === 'string' ? lastDirectiveSummary.kind : null,
      last_directive_tool_name: typeof lastDirectiveSummary?.tool_name === 'string' ? lastDirectiveSummary.tool_name : null,
      usage: finalUsage ?? null,
      provider_usage_complete: hasPositiveUsageTokens(finalUsage),
      provider_calls_attempted: providerCallsAttempted,
      provider_soft_failures: providerSoftFailures,
      provider_last_error:
        providerLastErrorCode || providerLastErrorStatus
          ? {
              ...(providerLastErrorCode ? { code: providerLastErrorCode } : {}),
              ...(providerLastErrorStatus ? { status: providerLastErrorStatus } : {}),
            }
          : null,
      attempts_used: attemptsUsed,
      llm_turns: llmTurns,
      max_attempts: maxAttempts,
      max_tool_calls: maxToolCalls,
      tool_calls_executed: toolCallsExecuted,
      tool_call_trace: toolCallTrace,
      provider_soft_failure: providerSoftFailure,
      planner_fallback_used: plannerFallbackUsed,
      ...(availableTools.length > 0 ? { available_tools: availableTools } : {}),
      ...(toolResolution.unresolvedTools.length > 0 ? { unresolved_tools: toolResolution.unresolvedTools } : {}),
      ...(structuredOutput !== null ? { structured_output: structuredOutput } : {}),
    },
    costUnits: Math.max(1, attemptsUsed + toolCallsExecuted),
  };
};
