import { HttpError } from '../../../../common/http-error.js';
import { getOpenRouterAdapter } from '../../../core/openrouter/openrouter.adapter.js';
import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { buildPrompt, readBoundedInteger } from '../../pipeline/pipeline.executor.utils.js';
import { resolveAgentChatModel, resolveNodeSectionConfig } from './node-handler.common.js';
import { type AgentDirective, parseAgentDirective } from './agent-directive-parser.js';
import { isToolAdvertisingInput, resolveAgentToolBindings } from './agent-tool-discovery.js';
import { buildAgentCallOutput, resolveEmptyAgentFinalText, summarizeDirective } from './agent-call-output.js';
import { buildAgentMessages, buildAgentSystemPrompt } from './agent-prompt-builder.js';
import { requestAgentCompletion, type AgentMessage } from './agent-provider-call.js';
import { runAgentToolCall } from './agent-tool-call-runner.js';
import { extractAgentArtifactAnswer } from './agent-output-summary.js';
import { resolveAgentTurnDecision } from './agent-turn-resolution.js';

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
  const inputRecord = context.input_json && typeof context.input_json === 'object' ? (context.input_json as Record<string, unknown>) : {};
  const runModel = typeof inputRecord.model === 'string' && inputRecord.model.trim().length > 0 ? inputRecord.model.trim() : undefined;

  const maxToolCalls = readBoundedInteger(agentConfig.maxToolCalls, 3, 1, 8);
  const maxAttempts = readBoundedInteger(agentConfig.maxAttempts, 1, 1, 5);
  const softRetryDelayMs = readBoundedInteger(agentConfig.softRetryDelayMs ?? llmConfig.softRetryDelayMs, 1200, 100, 15000);
  const agentModel = resolveAgentChatModel(runtime) ?? runModel;
  const temperatureRaw = Number(agentConfig.temperature ?? llmConfig.temperature);
  const maxTokensRaw = Number(agentConfig.maxTokens ?? llmConfig.maxTokens);
  const configuredSystemPrompt = agentConfig.systemPrompt;
  const systemPromptText =
    typeof configuredSystemPrompt === 'string' && configuredSystemPrompt.trim().length > 0
      ? configuredSystemPrompt
      : 'You are AgentCall runtime in a pipeline graph. Return concise, actionable output. Use JSON when structure is useful.';

  const toolResolution = await resolveAgentToolBindings(runtime, inputs);
  const availableTools = toolResolution.advertised;
  const systemPrompt = buildAgentSystemPrompt(systemPromptText);
  const messages: AgentMessage[] = buildAgentMessages(systemPrompt, availableTools, toolResolution.unresolvedTools, prompt);

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
  let providerLastErrorMessage = '';
  let providerLastErrorDetails: Record<string, any> | undefined;
  let providerSoftFailures = 0;
  let providerSuccessfulResponses = 0;
  let finalTextSource = '';
  let finalTextOrigin = '';
  let rawCompletionText = '';
  let lastDirectiveSummary: Record<string, any> | null = null;
  const toolCallTrace: Array<Record<string, any>> = [];

  const workingInputs = [...inputs];
  let workingInputJson: any = context.input_json;
  const attemptedToolKeys = new Set<string>();

  while (llmTurns < maxToolCalls + 1) {
    llmTurns += 1;
    const providerTurn = await requestAgentCompletion({
      adapter,
      ...(agentModel ? { model: agentModel } : {}),
      messages,
      temperatureRaw,
      maxTokensRaw,
      maxAttempts,
      softRetryDelayMs,
    });
    attemptsUsed += providerTurn.attemptsUsed;
    providerCallsAttempted += providerTurn.providerCallsAttempted;
    providerSoftFailures += providerTurn.providerSoftFailures;
    providerSuccessfulResponses += providerTurn.providerSuccessfulResponses;
    providerLastErrorCode = providerTurn.providerLastErrorCode;
    providerLastErrorStatus = providerTurn.providerLastErrorStatus;
    providerLastErrorMessage = providerTurn.providerLastErrorMessage;
    providerLastErrorDetails = providerTurn.providerLastErrorDetails;
    finalModel = providerTurn.model;
    finalProviderResponseId = providerTurn.providerResponseId || finalProviderResponseId;
    finalUsage = providerTurn.usage;
    const completionText = providerTurn.completionText;

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
    const artifactAnswer = extractAgentArtifactAnswer(workingInputs);
    const turnDecision = resolveAgentTurnDecision({
      directive,
      hasToolBudget,
      artifactAnswer,
      completionText,
    });

    if (turnDecision.kind === 'tool_call') {
      toolCallsExecuted += 1;
      const toolCallResult = await runAgentToolCall({
        index: toolCallsExecuted,
        requestedToolName: turnDecision.requestedToolName,
        inputPatch: turnDecision.inputPatch,
        source: turnDecision.source,
        runtime,
        context,
        toolResolution,
        workingInputs,
        workingInputJson,
        attemptedToolKeys,
      });
      workingInputJson = toolCallResult.nextInputJson;
      toolCallTrace.push(toolCallResult.traceEntry);
      messages.push(toolCallResult.followupMessage);
      continue;
    }

    if (turnDecision.kind === 'final') {
      finalText = turnDecision.text;
      finalTextSource = turnDecision.finalTextSource;
      finalTextOrigin = turnDecision.finalTextOrigin;
      break;
    }

    if (turnDecision.kind === 'none') {
      break;
    }
  }

  if (!finalText) {
    const resolvedFinalText = resolveEmptyAgentFinalText(extractAgentArtifactAnswer(workingInputs));
    finalText = resolvedFinalText.text;
    finalTextSource = resolvedFinalText.source;
    finalTextOrigin = resolvedFinalText.origin;
  }

  return {
    output: buildAgentCallOutput({
      provider: 'openrouter',
      model: finalModel,
      providerResponseId: finalProviderResponseId,
      text: finalText,
      finalTextSource,
      finalTextOrigin,
      rawCompletionText,
      lastDirectiveSummary,
      usage: finalUsage,
      providerCallsAttempted,
      providerSoftFailures,
      providerLastErrorCode,
      providerLastErrorStatus,
      providerLastErrorMessage,
      providerLastErrorDetails,
      attemptsUsed,
      llmTurns,
      maxAttempts,
      maxToolCalls,
      toolCallsExecuted,
      toolCallTrace,
      plannerFallbackUsed: false,
      availableTools,
      unresolvedTools: toolResolution.unresolvedTools,
      providerSuccessfulResponses,
    }),
    costUnits: Math.max(1, attemptsUsed + toolCallsExecuted),
  };
};
