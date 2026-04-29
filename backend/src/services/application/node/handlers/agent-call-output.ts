import { tryParseJsonFromText } from '../../pipeline/pipeline.executor.utils.js';
import type { AgentDirective } from './agent-directive-parser.js';

export function hasPositiveUsageTokens(usage: Record<string, any> | undefined): boolean {
  if (!usage || typeof usage !== 'object') return false;

  const tokenKeys = ['total_tokens', 'prompt_tokens', 'completion_tokens', 'input_tokens', 'output_tokens'];
  for (const key of tokenKeys) {
    const value = Number((usage as Record<string, any>)[key]);
    if (Number.isFinite(value) && value > 0) return true;
  }

  return false;
}

export function summarizeDirective(directive: AgentDirective): Record<string, any> {
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

export type AgentResolvedFinalText = {
  text: string;
  source: string;
  origin: string;
};

export function resolveEmptyAgentFinalText(artifactAnswer: string | null): AgentResolvedFinalText {
  if (artifactAnswer) {
    return {
      text: artifactAnswer,
      source: 'artifact.answer',
      origin: 'tool-artifact',
    };
  }

  return {
    text: 'AgentCall completed without a final answer.',
    source: 'agent.empty',
    origin: 'runtime',
  };
}

type BuildAgentCallOutputOptions = {
  provider: string;
  model: string;
  providerResponseId: string;
  text: string;
  finalTextSource: string;
  finalTextOrigin: string;
  rawCompletionText: string;
  lastDirectiveSummary: Record<string, any> | null;
  usage: Record<string, any> | undefined;
  providerCallsAttempted: number;
  providerSoftFailures: number;
  providerLastErrorCode: string;
  providerLastErrorStatus: number | null;
  providerLastErrorMessage: string;
  providerLastErrorDetails: Record<string, any> | undefined;
  attemptsUsed: number;
  llmTurns: number;
  maxAttempts: number;
  maxToolCalls: number;
  toolCallsExecuted: number;
  toolCallTrace: Array<Record<string, any>>;
  plannerFallbackUsed: boolean;
  availableTools: Array<Record<string, any>>;
  unresolvedTools: string[];
  providerSuccessfulResponses: number;
};

export function buildAgentCallOutput(options: BuildAgentCallOutputOptions): Record<string, any> {
  const structuredOutput = tryParseJsonFromText(options.text);
  const providerSoftFailure = options.providerSoftFailures > 0 && options.providerSuccessfulResponses === 0;

  return {
    kind: 'agent_call',
    provider: options.provider,
    model: options.model,
    provider_response_id: options.providerResponseId || null,
    text: options.text,
    final_text_source: options.finalTextSource || null,
    final_text_origin: options.finalTextOrigin || null,
    raw_completion_text: options.rawCompletionText || null,
    last_directive: options.lastDirectiveSummary,
    last_directive_kind: typeof options.lastDirectiveSummary?.kind === 'string' ? options.lastDirectiveSummary.kind : null,
    last_directive_tool_name:
      typeof options.lastDirectiveSummary?.tool_name === 'string' ? options.lastDirectiveSummary.tool_name : null,
    usage: options.usage ?? null,
    provider_usage_complete: hasPositiveUsageTokens(options.usage),
    provider_calls_attempted: options.providerCallsAttempted,
    provider_soft_failures: options.providerSoftFailures,
    provider_last_error:
      options.providerLastErrorCode || options.providerLastErrorStatus || options.providerLastErrorMessage
        ? {
            ...(options.providerLastErrorCode ? { code: options.providerLastErrorCode } : {}),
            ...(options.providerLastErrorStatus ? { status: options.providerLastErrorStatus } : {}),
            ...(options.providerLastErrorMessage ? { message: options.providerLastErrorMessage } : {}),
            ...(options.providerLastErrorDetails ? { details: options.providerLastErrorDetails } : {}),
          }
        : null,
    attempts_used: options.attemptsUsed,
    llm_turns: options.llmTurns,
    max_attempts: options.maxAttempts,
    max_tool_calls: options.maxToolCalls,
    tool_calls_executed: options.toolCallsExecuted,
    tool_call_trace: options.toolCallTrace,
    provider_soft_failure: providerSoftFailure,
    planner_fallback_used: options.plannerFallbackUsed,
    ...(options.availableTools.length > 0 ? { available_tools: options.availableTools } : {}),
    ...(options.unresolvedTools.length > 0 ? { unresolved_tools: options.unresolvedTools } : {}),
    ...(structuredOutput !== null ? { structured_output: structuredOutput } : {}),
  };
}
