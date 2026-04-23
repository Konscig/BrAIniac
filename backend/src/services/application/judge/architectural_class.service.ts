import { getNodeTypeById } from '../../data/node_type.service.js';
import { listNodesByPipeline } from '../../data/node.service.js';

export type ArchitecturalClass = 'rag' | 'tool_use' | 'extractor' | 'judge';

interface NodeTypeSnapshot {
  name: string;
}

async function loadNodeTypeNames(pipelineId: number): Promise<string[]> {
  const nodes = await listNodesByPipeline(pipelineId);
  const names: string[] = [];
  const cache = new Map<number, NodeTypeSnapshot | null>();
  for (const node of nodes) {
    const typeId = (node as any).fk_type_id as number;
    if (!cache.has(typeId)) {
      const nt = await getNodeTypeById(typeId);
      cache.set(typeId, nt ? { name: String(nt.name).trim() } : null);
    }
    const snap = cache.get(typeId);
    if (snap?.name) names.push(snap.name.toLowerCase());
  }
  return names;
}

export async function classifyPipeline(pipelineId: number): Promise<ArchitecturalClass> {
  const typeNames = await loadNodeTypeNames(pipelineId);
  const has = (needle: string) => typeNames.some((n) => n.includes(needle));

  if (has('judge')) return 'judge';
  if (has('agentcall') && (has('toolnode') || has('tool'))) return 'tool_use';
  if (has('hybridretriever') || has('contextassembler') || has('llmanswer')) return 'rag';
  if (has('parser') && !has('agentcall')) return 'extractor';
  if (has('agentcall')) return 'tool_use';
  return 'rag';
}
