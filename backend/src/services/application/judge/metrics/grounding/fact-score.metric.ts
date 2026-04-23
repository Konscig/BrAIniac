import { computeMetric } from '../../../../core/eval_worker/eval_worker.client.js';
import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class FactScoreMetric extends MetricBase {
  readonly code = 'f_fact';
  readonly axis = 'B' as const;
  readonly requiresReference = true;
  readonly executor = 'sidecar' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const docs = Array.isArray((it.gold as any)?.relevant_doc_texts) ? ((it.gold as any).relevant_doc_texts as string[]) : [];
      if (typeof it.agent_output.text !== 'string' || !docs.length) continue;
      used += 1;
      const res = await computeMetric(this.code, {
        agent_output: { text: it.agent_output.text },
        reference: { relevant_doc_texts: docs },
      });
      perItem.push(res.value);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
