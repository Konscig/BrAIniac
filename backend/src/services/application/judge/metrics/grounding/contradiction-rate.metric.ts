import { computeMetric } from '../../../../core/eval_worker/eval_worker.client.js';
import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class ContradictionRateMetric extends MetricBase {
  readonly code = 'f_contra';
  readonly axis = 'B' as const;
  readonly requiresReference = false;
  readonly executor = 'sidecar' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      if (typeof it.agent_output.text !== 'string' || !Array.isArray(it.agent_output.context) || !it.agent_output.context.length) continue;
      const res = await computeMetric(this.code, {
        agent_output: { text: it.agent_output.text, context: it.agent_output.context },
      });
      perItem.push(res.value);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}
