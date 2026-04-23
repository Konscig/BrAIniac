import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { collapseCycles } from './trace-utils.js';

export class ToolSelectionAccuracyMetric extends MetricBase {
  readonly code = 'f_toolsel';
  readonly axis = 'D' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const gold = Array.isArray(it.gold?.tool_trajectory) ? it.gold!.tool_trajectory : [];
      if (!gold.length) continue;
      used += 1;
      const trace = collapseCycles(it.agent_output.tool_call_trace ?? []);
      const minLen = Math.min(trace.length, gold.length);
      if (minLen === 0) {
        perItem.push(0);
        continue;
      }
      let matches = 0;
      for (let i = 0; i < minLen; i += 1) {
        const expected = gold[i]!.tool_name;
        const actual = trace[i]?.resolved_tool ?? trace[i]?.requested_tool;
        if (expected && actual && expected === actual) matches += 1;
      }
      perItem.push(matches / gold.length);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
