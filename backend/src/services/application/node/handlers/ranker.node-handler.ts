import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { runRankerNode } from './node-handler.shared.js';

export const rankerNodeHandler: NodeHandler = async (runtime, inputs, context) => runRankerNode(runtime, inputs, context);
