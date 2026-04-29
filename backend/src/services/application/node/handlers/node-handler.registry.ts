import type { NodeExecutionContext, NodeHandler, NodeHandlerResult, RuntimeNode } from '../../pipeline/pipeline.executor.types.js';
import { agentCallNodeHandler } from './agent-call.node-handler.js';
import { datasetInputNodeHandler } from './dataset-input.node-handler.js';
import { filterNodeHandler } from './filter.node-handler.js';
import { llmCallNodeHandler } from './llm-call.node-handler.js';
import { manualInputNodeHandler } from './manual-input.node-handler.js';
import { parserNodeHandler } from './parser.node-handler.js';
import { promptBuilderNodeHandler } from './prompt-builder.node-handler.js';
import { ragDatasetNodeHandler } from './rag-dataset.node-handler.js';
import { rankerNodeHandler } from './ranker.node-handler.js';
import { saveResultNodeHandler } from './save-result.node-handler.js';
import { toolNodeHandler } from './tool-node.node-handler.js';
import { triggerNodeHandler } from './trigger.node-handler.js';

const NODE_HANDLER_REGISTRY = new Map<string, NodeHandler>([
  ['Trigger', triggerNodeHandler],
  ['ManualInput', manualInputNodeHandler],
  ['DatasetInput', datasetInputNodeHandler],
  ['RAGDataset', ragDatasetNodeHandler],
  ['PromptBuilder', promptBuilderNodeHandler],
  ['Filter', filterNodeHandler],
  ['Ranker', rankerNodeHandler],
  ['LLMCall', llmCallNodeHandler],
  ['AgentCall', agentCallNodeHandler],
  ['ToolNode', toolNodeHandler],
  ['Parser', parserNodeHandler],
  ['SaveResult', saveResultNodeHandler],
]);

export async function executeNode(
  runtime: RuntimeNode,
  inputs: any[],
  context: NodeExecutionContext,
): Promise<NodeHandlerResult> {
  const rawNodeTypeName = typeof runtime.nodeType.name === 'string' ? runtime.nodeType.name : '';
  const nodeTypeName = rawNodeTypeName.trim();

  const handler = NODE_HANDLER_REGISTRY.get(nodeTypeName);
  if (handler) {
    return handler(runtime, inputs, context);
  }

  return {
    output: {
      kind: 'not_implemented',
      node_type: nodeTypeName || rawNodeTypeName,
      message: 'handler is not implemented in current executor mvp',
      received_inputs: inputs.length,
    },
    costUnits: 0,
  };
}
