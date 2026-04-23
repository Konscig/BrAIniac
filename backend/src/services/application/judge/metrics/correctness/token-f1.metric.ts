import { MetricBase, MetricContext, MetricResult, mean, tokens } from '../metric.base.js';

export class TokenF1Metric extends MetricBase {
  readonly code = 'f_F1';
  readonly axis = 'A' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      if (typeof it.gold?.answer !== 'string' || typeof it.agent_output.text !== 'string') continue;
      used += 1;
      const pred = new Set(tokens(it.agent_output.text));
      const gold = new Set(tokens(it.gold.answer));
      if (pred.size === 0 && gold.size === 0) {
        perItem.push(1);
        continue;
      }
      const inter = [...pred].filter((t) => gold.has(t)).length;
      if (inter === 0) {
        perItem.push(0);
        continue;
      }
      const p = inter / pred.size;
      const r = inter / gold.size;
      perItem.push((2 * p * r) / (p + r));
    }
    return { value: mean(perItem), sample_size: used };
  }
}
