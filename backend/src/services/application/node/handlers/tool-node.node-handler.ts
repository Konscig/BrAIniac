import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { executeResolvedToolBinding, resolveToolNodeBinding } from './node-handler.shared.js';

export const toolNodeHandler: NodeHandler = async (runtime, inputs, context) => {
  const nodeUi = runtime.node.ui_json && typeof runtime.node.ui_json === 'object' ? runtime.node.ui_json : {};
  const toolBinding = await resolveToolNodeBinding(runtime);
  const toolOverrides = nodeUi.toolConfig && typeof nodeUi.toolConfig === 'object' ? nodeUi.toolConfig : {};

  return executeResolvedToolBinding(runtime, toolBinding, inputs, context, {
    toolConfigOverride: toolOverrides,
    nodeId: runtime.node.node_id,
    topK: runtime.node.top_k,
  });
};
