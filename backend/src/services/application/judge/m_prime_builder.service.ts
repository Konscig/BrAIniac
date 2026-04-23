import { getNodeTypeById } from '../../data/node_type.service.js';
import { listNodesByPipeline } from '../../data/node.service.js';
import { listAll as listAllMetrics } from '../../data/metric_definition.service.js';

/**
 * Node-type → recommended metric codes map, derived from the «Узел → Стартовое
 * Подмножество M'» table in docs/sdd/12-evaluation-metrics-catalog.md.
 * Names are matched case-insensitively against NodeType.name.
 */
const NODE_METRIC_TABLE: Record<string, string[]> = {
  trigger: [],
  manualinput: [],
  datasetinput: [],
  promptbuilder: ['f_schema', 'f_TED'],
  llmcall: ['f_EM', 'f_F1', 'f_sim', 'f_judge_ref'],
  llmanswer: ['f_faith', 'f_corr', 'f_sim', 'f_cite', 'f_fact'],
  agentcall: [
    'f_toolsel', 'f_argF1', 'f_trajIoU', 'f_planEff', 'f_node_cov',
    'f_judge_ref', 'f_consist', 'f_loop_budget',
  ],
  toolnode: ['f_tool_ok', 'f_argF1', 'f_schema'],
  documentloader: [],
  chunker: ['f_recall@k'],
  embedder: ['f_ndcg@k'],
  vectorupsert: [],
  querybuilder: ['f_sim', 'f_recall@k'],
  hybridretriever: ['f_recall@k', 'f_ndcg@k', 'f_ctx_prec', 'f_ctx_rec'],
  reranker: ['f_ndcg@k', 'f_ctx_prec'],
  contextassembler: ['f_ctx_prec'],
  citationformatter: ['f_cite'],
  parser: ['f_schema', 'f_field', 'f_TED'],
  filter: ['f_recall@k'],
  ranker: ['f_ndcg@k'],
  groundingchecker: ['f_faith', 'f_contra'],
  outputvalidator: ['f_schema'],
  branch: [],
  merge: [],
  retrygate: ['f_retry'],
  loopgate: ['f_loop_term', 'f_loop_budget', 'f_loop_conv'],
  saveresult: [],
  notify: [],
  export: [],
};

export const MANDATORY_AXES_BASE: string[] = ['A', 'H'];

export interface MPrimeEntry {
  metric_code: string;
  node_id: number;
  axis: string;
  origin_reason: string;
  executor: 'native' | 'sidecar';
  requires_reference: boolean;
}

export interface MPrimeResult {
  entries: MPrimeEntry[];
  metric_codes: string[];
  axis_presence: Record<string, number>;
  mandatory_axes: string[];
  missing_mandatory_axes: string[];
}

function normalizeName(name: string | null | undefined): string {
  return String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function buildMPrime(pipelineId: number): Promise<MPrimeResult> {
  const [nodes, definitions] = await Promise.all([
    listNodesByPipeline(pipelineId),
    listAllMetrics(),
  ]);
  const defByCode = new Map(definitions.map((d: any) => [d.code, d]));

  const typeNames = new Map<number, string>();
  for (const node of nodes) {
    const typeId = (node as any).fk_type_id as number;
    if (!typeNames.has(typeId)) {
      const nt = await getNodeTypeById(typeId);
      typeNames.set(typeId, normalizeName((nt as any)?.name));
    }
  }

  const hasType = (key: string) => Array.from(typeNames.values()).some((n) => n.includes(key));

  const mandatory = new Set<string>(MANDATORY_AXES_BASE);
  if (hasType('agentcall')) mandatory.add('D');
  if (hasType('hybridretriever') || hasType('contextassembler') || hasType('llmanswer')) mandatory.add('B');
  if (hasType('parser') || hasType('outputvalidator')) mandatory.add('E');

  const axisPresence: Record<string, number> = {};
  const entries: MPrimeEntry[] = [];
  const seen = new Set<string>(); // dedup "(metric_code, node_id)"

  for (const node of nodes) {
    const typeId = (node as any).fk_type_id as number;
    const normalized = typeNames.get(typeId) ?? '';
    for (const [key, codes] of Object.entries(NODE_METRIC_TABLE)) {
      if (!normalized.includes(key)) continue;
      for (const metricCode of codes) {
        const def = defByCode.get(metricCode);
        if (!def) continue;
        const key2 = `${metricCode}::${(node as any).node_id}`;
        if (seen.has(key2)) continue;
        seen.add(key2);
        entries.push({
          metric_code: metricCode,
          node_id: (node as any).node_id,
          axis: def.axis,
          origin_reason: `${(nt_or_key(normalized, key))} → ${axisName(def.axis)} axis`,
          executor: def.executor,
          requires_reference: def.requires_reference,
        });
        axisPresence[def.axis] = (axisPresence[def.axis] ?? 0) + 1;
      }
    }
  }

  const missingMandatory = Array.from(mandatory).filter((axis) => (axisPresence[axis] ?? 0) === 0);

  return {
    entries,
    metric_codes: Array.from(new Set(entries.map((e) => e.metric_code))),
    axis_presence: axisPresence,
    mandatory_axes: Array.from(mandatory),
    missing_mandatory_axes: missingMandatory,
  };
}

function nt_or_key(normalizedName: string, matchedKey: string): string {
  return normalizedName || matchedKey;
}

function axisName(axis: string): string {
  const names: Record<string, string> = {
    A: 'Correctness',
    B: 'Grounding',
    C: 'Retrieval',
    D: 'Tool-Use',
    E: 'Structure',
    F: 'Control-Flow',
    G: 'LLM-Judge',
    H: 'Safety',
  };
  return names[axis] ?? axis;
}
