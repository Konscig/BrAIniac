import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { retrievedIdsFromOutput, topKFromContext } from './retrieval-utils.js';

function dcg(rel: number[]): number {
  return rel.reduce((s, r, i) => s + r / Math.log2(i + 2), 0);
}

export class NDCGAtKMetric extends MetricBase {
  readonly code = 'f_ndcg@k';
  readonly axis = 'C' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const relevant = Array.isArray(it.gold?.relevant_docs) ? it.gold!.relevant_docs.map(String) : [];
      if (!relevant.length) continue;
      used += 1;
      const k = topKFromContext(it.agent_output);
      const retrieved = retrievedIdsFromOutput(it.agent_output, k).map(String);
      const gains = retrieved.map((id) => (relevant.includes(id) ? 1 : 0));
      const ideal = Array(Math.min(relevant.length, k)).fill(1);
      const idealDcg = dcg(ideal);
      perItem.push(idealDcg === 0 ? 0 : dcg(gains) / idealDcg);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
