import { computeMetric } from '../../../../core/eval_worker/eval_worker.client.js';
import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class AnswerCorrectnessMetric extends MetricBase {
  readonly code = 'f_corr';
  readonly axis = 'A' as const;
  readonly requiresReference = true;
  readonly executor = 'sidecar' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      if (typeof it.gold?.answer !== 'string' || typeof it.agent_output.text !== 'string') continue;
      used += 1;
      const res = await computeMetric(this.code, {
        agent_output: { text: it.agent_output.text },
        reference: { answer: it.gold.answer },
      });
      perItem.push(res.value);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
