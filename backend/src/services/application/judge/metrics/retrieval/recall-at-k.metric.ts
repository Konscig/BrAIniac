import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { retrievedIdsFromOutput, topKFromContext } from './retrieval-utils.js';

export class RecallAtKMetric extends MetricBase {
  readonly code = 'f_recall@k';
  readonly axis = 'C' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const relevant = Array.isArray(it.gold?.relevant_docs) ? it.gold!.relevant_docs : [];
      if (!relevant.length) continue;
      used += 1;
      const k = topKFromContext(it.agent_output);
      const retrieved = retrievedIdsFromOutput(it.agent_output, k);
      if (!retrieved.length) {
        perItem.push(0);
        continue;
      }
      const set = new Set(retrieved.map(String));
      const hits = relevant.filter((id) => set.has(String(id))).length;
      perItem.push(hits / relevant.length);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
