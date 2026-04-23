import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { retrievedIdsFromOutput, topKFromContext } from './retrieval-utils.js';

export class ContextPrecisionMetric extends MetricBase {
  readonly code = 'f_ctx_prec';
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
      const retrieved = retrievedIdsFromOutput(it.agent_output, k).map(String);
      if (!retrieved.length) continue;
      used += 1;
      const hits = retrieved.filter((id) => relevant.includes(id)).length;
      perItem.push(hits / retrieved.length);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
