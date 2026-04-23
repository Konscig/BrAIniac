import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { retrievedIdsFromOutput, topKFromContext } from './retrieval-utils.js';

export class ContextRecallMetric extends MetricBase {
  readonly code = 'f_ctx_rec';
  readonly axis = 'C' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const relevant = Array.isArray(it.gold?.relevant_docs) ? it.gold!.relevant_docs.map(String) : [];
      if (!relevant.length) continue;
      const k = topKFromContext(it.agent_output);
      const retrieved = new Set(retrievedIdsFromOutput(it.agent_output, k).map(String));
      used += 1;
      const hits = relevant.filter((id) => retrieved.has(id)).length;
      perItem.push(hits / relevant.length);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
