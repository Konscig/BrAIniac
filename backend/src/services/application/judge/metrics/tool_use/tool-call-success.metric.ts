import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class ToolCallSuccessMetric extends MetricBase {
  readonly code = 'f_tool_ok';
  readonly axis = 'D' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const trace = it.agent_output.tool_call_trace ?? [];
      if (!trace.length) continue;
      const success = trace.filter((t) => t.status === 'completed').length;
      perItem.push(success / trace.length);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}
