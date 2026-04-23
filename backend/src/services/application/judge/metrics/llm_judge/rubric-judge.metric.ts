import { computeMetric } from '../../../../core/eval_worker/eval_worker.client.js';
import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class RubricJudgeMetric extends MetricBase {
  readonly code = 'f_judge_ref';
  readonly axis = 'G' as const;
  readonly requiresReference = true;
  readonly executor = 'sidecar' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    const rubric = String(ctx.normalization_params?.f_judge_ref?.rubric ?? 'geval_default');
    const scale = Number(ctx.normalization_params?.f_judge_ref?.scale ?? 5);
    for (const it of ctx.items) {
      if (typeof it.gold?.answer !== 'string' || typeof it.agent_output.text !== 'string') continue;
      used += 1;
      const res = await computeMetric(this.code, {
        agent_output: { text: it.agent_output.text },
        reference: { answer: it.gold.answer },
        config: { rubric, scale },
      });
      perItem.push(res.value);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
