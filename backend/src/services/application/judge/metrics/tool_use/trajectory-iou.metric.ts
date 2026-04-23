import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { collapseCycles } from './trace-utils.js';

function multisetIntersection(a: string[], b: string[]): number {
  const bag = new Map<string, number>();
  for (const x of b) bag.set(x, (bag.get(x) ?? 0) + 1);
  let inter = 0;
  for (const x of a) {
    const n = bag.get(x) ?? 0;
    if (n > 0) {
      inter += 1;
      bag.set(x, n - 1);
    }
  }
  return inter;
}

export class TrajectoryIoUMetric extends MetricBase {
  readonly code = 'f_trajIoU';
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
      const pred = collapseCycles(it.agent_output.tool_call_trace ?? []).map((t) => t.resolved_tool ?? t.requested_tool ?? 'unknown');
      const goldNames = gold.map((g) => g.tool_name);
      if (!pred.length && !goldNames.length) {
        perItem.push(1);
        continue;
      }
      const inter = multisetIntersection(pred, goldNames);
      const union = pred.length + goldNames.length - inter;
      perItem.push(union === 0 ? 1 : inter / union);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
