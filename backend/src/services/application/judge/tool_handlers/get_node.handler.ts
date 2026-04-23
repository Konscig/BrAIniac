import { getNodeById } from '../../../data/node.service.js';
import { ensurePipelineOwnedByUser } from '../../../core/ownership.service.js';

export async function handleGetNode(args: Record<string, any>, userId: number) {
  const nodeId = Number(args?.id ?? args?.node_id);
  if (!Number.isInteger(nodeId) || nodeId <= 0) return { error: 'invalid node id' };
  const node = await getNodeById(nodeId);
  if (!node) return { error: 'node not found' };
  try {
    await ensurePipelineOwnedByUser((node as any).fk_pipeline_id, userId);
  } catch {
    return { error: 'not found' };
  }
  return {
    node_id: (node as any).node_id,
    pipeline_id: (node as any).fk_pipeline_id,
    node_type_id: (node as any).fk_type_id,
    top_k: (node as any).top_k,
    ui_json: (node as any).ui_json,
  };
}
