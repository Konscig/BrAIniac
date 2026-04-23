import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class LoopTerminationMetric extends MetricBase {
  readonly code = 'f_loop_term';
  readonly axis = 'F' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    if (!ctx.loop_policy) {
      return { value: 1, sample_size: ctx.items.length, details: { reason: 'acyclic', redux: 'constant' } };
    }
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const iterations = Number(it.agent_output.iteration_traces?.length ?? 0);
      const terminatedByCondition = iterations > 0 && iterations < (ctx.loop_policy.maxIterations ?? 1);
      perItem.push(terminatedByCondition ? 1 : 0);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}
