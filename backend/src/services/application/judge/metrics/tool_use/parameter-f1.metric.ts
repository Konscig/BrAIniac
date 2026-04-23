import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';
import { collapseCycles } from './trace-utils.js';

function flatKeys(obj: Record<string, any> | undefined | null, prefix = ''): string[] {
  if (!obj) return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out.push(...flatKeys(v as Record<string, any>, key));
    } else {
      out.push(`${key}=${JSON.stringify(v)}`);
    }
  }
  return out.sort();
}

export class ParameterF1Metric extends MetricBase {
  readonly code = 'f_argF1';
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
      const pairs = Math.min(trace.length, gold.length);
      if (pairs === 0) {
        perItem.push(0);
        continue;
      }
      let precisionSum = 0;
      let recallSum = 0;
      for (let i = 0; i < pairs; i += 1) {
        const expected = new Set(flatKeys(gold[i]!.args ?? {}));
        const actual = new Set(flatKeys((trace[i] as any)?.arguments ?? (trace[i] as any)?.input ?? {}));
        if (expected.size === 0 && actual.size === 0) {
          precisionSum += 1;
          recallSum += 1;
          continue;
        }
        const inter = [...actual].filter((k) => expected.has(k)).length;
        precisionSum += actual.size ? inter / actual.size : 0;
        recallSum += expected.size ? inter / expected.size : 0;
      }
      const p = precisionSum / pairs;
      const r = recallSum / pairs;
      perItem.push(p + r === 0 ? 0 : (2 * p * r) / (p + r));
    }
    return { value: mean(perItem), sample_size: used };
  }
}
