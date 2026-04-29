import { getOpenRouterAdapter } from '../../../core/openrouter/openrouter.adapter.js';
import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { buildPrompt } from '../../pipeline/pipeline.executor.utils.js';
import { resolveNodeSectionConfig } from './node-handler.common.js';

export const llmCallNodeHandler: NodeHandler = async (runtime, inputs, context) => {
  const adapter = getOpenRouterAdapter();
  const llmConfig = resolveNodeSectionConfig(runtime, 'llm');

  const model = typeof llmConfig?.modelId === 'string' ? llmConfig.modelId : undefined;
  const temperatureRaw = Number(llmConfig?.temperature);
  const maxTokensRaw = Number(llmConfig?.maxTokens);

  const prompt = buildPrompt(inputs, context.input_json);
  const completion = await adapter.chatCompletion({
    ...(model ? { model } : {}),
    messages: [
      {
        role: 'user',
        content: prompt || 'Respond with a short status update.',
      },
    ],
    ...(Number.isFinite(temperatureRaw) ? { temperature: temperatureRaw } : {}),
    ...(Number.isInteger(maxTokensRaw) && maxTokensRaw > 0 ? { maxTokens: maxTokensRaw } : {}),
  });

  return {
    output: {
      kind: 'llm_response',
      provider: 'openrouter',
      model: completion.model,
      text: completion.text,
      usage: completion.usage ?? null,
    },
    costUnits: 1,
  };
};
