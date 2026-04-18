import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { runFilterNode } from './node-handler.shared.js';

export const filterNodeHandler: NodeHandler = async (runtime, inputs, context) => runFilterNode(runtime, inputs, context);
