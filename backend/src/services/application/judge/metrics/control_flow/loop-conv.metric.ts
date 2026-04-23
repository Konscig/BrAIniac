import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class LoopConvergenceMetric extends MetricBase {
  readonly code = 'f_loop_conv';
  readonly axis = 'F' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    if (!ctx.loop_policy) {
      return { value: 1, sample_size: ctx.items.length, aggregation_method: 'last_iteration', details: { reason: 'acyclic' } };
    }
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const iterScores = Array.isArray((it.agent_output as any).iteration_quality_scores)
        ? ((it.agent_output as any).iteration_quality_scores as number[])
        : [];
      if (iterScores.length < 2) continue;
      let improving = 0;
      for (let i = 1; i < iterScores.length; i += 1) {
        if (iterScores[i]! >= iterScores[i - 1]!) improving += 1;
      }
      perItem.push(improving / (iterScores.length - 1));
    }
    return { value: mean(perItem), sample_size: perItem.length, aggregation_method: 'mean_over_iterations' };
  }
}
