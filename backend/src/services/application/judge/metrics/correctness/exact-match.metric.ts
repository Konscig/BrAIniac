import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

function normalize(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N}\s]/gu, '');
}

export class ExactMatchMetric extends MetricBase {
  readonly code = 'f_EM';
  readonly axis = 'A' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      if (typeof it.gold?.answer !== 'string' || typeof it.agent_output.text !== 'string') continue;
      used += 1;
      perItem.push(normalize(it.agent_output.text) === normalize(it.gold.answer) ? 1 : 0);
    }
    return { value: mean(perItem), sample_size: used };
  }
}
