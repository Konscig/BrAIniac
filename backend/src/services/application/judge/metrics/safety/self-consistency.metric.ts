import { MetricBase, MetricContext, MetricResult, mean, tokens } from '../metric.base.js';

export class SelfConsistencyMetric extends MetricBase {
  readonly code = 'f_consist';
  readonly axis = 'H' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const samples = Array.isArray((it.agent_output as any).resamples)
        ? ((it.agent_output as any).resamples as string[])
        : [];
      if (samples.length < 3) continue;
      const canonical = canonicalize(it.agent_output.text ?? samples[0] ?? '');
      const agree = samples.filter((s) => canonicalize(s) === canonical).length;
      perItem.push(agree / samples.length);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}

function canonicalize(text: string): string {
  return tokens(text).sort().join(' ');
}
