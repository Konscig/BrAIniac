import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { executeResolvedToolBinding, resolveToolNodeBinding } from './agent-tool-execution.js';

function readToolDescription(config: unknown): string | undefined {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return undefined;
  const record = config as Record<string, unknown>;
  const description = record.description_ru ?? record.description ?? record.desc;
  return typeof description === 'string' && description.trim().length > 0 ? description.trim() : undefined;
}

export const toolNodeHandler: NodeHandler = async (runtime, inputs, context) => {
  const nodeUi = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};
  const toolBinding = await resolveToolNodeBinding(runtime);
  const toolOverrides = nodeUi.toolConfig && typeof nodeUi.toolConfig === 'object' ? nodeUi.toolConfig : {};

  if (inputs.length === 0) {
    const desc = readToolDescription(toolBinding.config_json);
    const catalogConfig =
      toolBinding.config_json && typeof toolBinding.config_json === 'object' ? toolBinding.config_json : {};
    const mergedConfig = { ...catalogConfig, ...toolOverrides };
    return {
      output: {
        kind: 'tool_node',
        tool_name: toolBinding.name,
        ...(desc ? { desc } : {}),
        ...(toolBinding.tool_id ? { tool_id: toolBinding.tool_id } : {}),
        tool_source: toolBinding.source,
        ...(Object.keys(mergedConfig).length > 0 ? { config_json: mergedConfig } : {}),
      },
      costUnits: 0,
    };
  }

  return executeResolvedToolBinding(runtime, toolBinding, inputs, context, {
    toolConfigOverride: toolOverrides,
    nodeId: runtime.node.node_id,
    topK: runtime.node.top_k,
  });
};
