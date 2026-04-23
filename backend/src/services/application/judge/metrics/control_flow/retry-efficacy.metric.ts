import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class RetryEfficacyMetric extends MetricBase {
  readonly code = 'f_retry';
  readonly axis = 'F' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const failures = Number((it.agent_output as any).provider_soft_failures ?? 0);
      const attempts = Number((it.agent_output as any).attempts_used ?? 1);
      if (failures === 0) continue;
      // items где были soft-failures, но финальный результат есть — retry recovered
      perItem.push(attempts > 1 && it.agent_output.text ? 1 : 0);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}
