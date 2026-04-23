import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { collapseCycles } from './trace-utils.js';

export class PlanEfficiencyMetric extends MetricBase {
  readonly code = 'f_planEff';
  readonly axis = 'D' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    const maxIter = ctx.loop_policy?.maxIterations ?? 1;
    for (const it of ctx.items) {
      const actual = (it.agent_output.tool_call_trace ?? []).length;
      if (!actual) continue;
      const optimal = Math.max(1, collapseCycles(it.agent_output.tool_call_trace ?? []).length * maxIter);
      perItem.push(Math.min(1, optimal / actual));
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}
