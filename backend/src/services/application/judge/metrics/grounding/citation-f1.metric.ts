import { computeMetric } from '../../../../core/eval_worker/eval_worker.client.js';
import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class CitationF1Metric extends MetricBase {
  readonly code = 'f_cite';
  readonly axis = 'B' as const;
  readonly requiresReference = true;
  readonly executor = 'sidecar' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const relevant = Array.isArray(it.gold?.relevant_docs) ? it.gold!.relevant_docs.map(String) : [];
      if (!relevant.length || typeof it.agent_output.text !== 'string') continue;
      used += 1;
      const res = await computeMetric(this.code, {
        agent_output: { text_with_citations: it.agent_output.text },
        reference: { relevant_doc_ids: relevant },
      });
      perItem.push(res.value);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
