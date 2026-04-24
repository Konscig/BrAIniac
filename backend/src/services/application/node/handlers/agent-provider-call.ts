import type { OpenRouterAdapter } from '../../../core/openrouter/openrouter.adapter.js';
import { getHttpErrorCode, getHttpErrorDetails, getHttpErrorMessage, getHttpErrorStatus, isSoftOpenRouterError } from './agent-directive-parser.js';

export type AgentMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type AgentProviderTurnResult = {
  attemptsUsed: number;
  providerCallsAttempted: number;
  providerSoftFailures: number;
  providerSuccessfulResponses: number;
  providerLastErrorCode: string;
  providerLastErrorStatus: number | null;
  providerLastErrorMessage: string;
  providerLastErrorDetails: Record<string, any> | undefined;
  completionText: string;
  model: string;
  providerResponseId: string;
  usage: Record<string, any> | undefined;
};

type RequestAgentCompletionOptions = {
  adapter: OpenRouterAdapter;
  model?: string;
  messages: AgentMessage[];
  temperatureRaw: number;
  maxTokensRaw: number;
  maxAttempts: number;
  softRetryDelayMs: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function requestAgentCompletion(options: RequestAgentCompletionOptions): Promise<AgentProviderTurnResult> {
  const { adapter, model, messages, temperatureRaw, maxTokensRaw, maxAttempts, softRetryDelayMs } = options;

  let attemptsUsed = 0;
  let providerCallsAttempted = 0;
  let providerSoftFailures = 0;
  let providerSuccessfulResponses = 0;
  let providerLastErrorCode = '';
  let providerLastErrorStatus: number | null = null;
  let providerLastErrorMessage = '';
  let providerLastErrorDetails: Record<string, any> | undefined;
  let completionText = '';
  let finalModel = model ?? '';
  let finalProviderResponseId = '';
  let finalUsage: Record<string, any> | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    attemptsUsed += 1;
    providerCallsAttempted += 1;

    try {
      const completion = await adapter.chatCompletion({
        ...(model ? { model } : {}),
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
      providerLastErrorMessage = '';
      providerLastErrorDetails = undefined;
      completionText = completion.text.trim();
      if (completionText.length > 0) break;
    } catch (error) {
      providerLastErrorCode = getHttpErrorCode(error) ?? '';
      providerLastErrorStatus = getHttpErrorStatus(error);
      providerLastErrorMessage = getHttpErrorMessage(error);
      providerLastErrorDetails = getHttpErrorDetails(error);
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

  return {
    attemptsUsed,
    providerCallsAttempted,
    providerSoftFailures,
    providerSuccessfulResponses,
    providerLastErrorCode,
    providerLastErrorStatus,
    providerLastErrorMessage,
    providerLastErrorDetails,
    completionText,
    model: finalModel,
    providerResponseId: finalProviderResponseId,
    usage: finalUsage,
  };
}
