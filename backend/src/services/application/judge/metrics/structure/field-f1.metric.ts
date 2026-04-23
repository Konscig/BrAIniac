import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

function flatKeys(obj: any, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...flatKeys(v, key));
    else out.push(`${key}=${JSON.stringify(v)}`);
  }
  return out;
}

export class FieldF1Metric extends MetricBase {
  readonly code = 'f_field';
  readonly axis = 'E' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    for (const it of ctx.items) {
      const gold = it.gold?.structured ?? it.gold?.answer ?? null;
      if (!gold || typeof gold !== 'object') continue;
      const pred = it.agent_output.structured_output ?? null;
      if (!pred) continue;
      used += 1;
      const predSet = new Set(flatKeys(pred));
      const goldSet = new Set(flatKeys(gold));
      if (predSet.size === 0 && goldSet.size === 0) {
        perItem.push(1);
        continue;
      }
      const inter = [...predSet].filter((k) => goldSet.has(k)).length;
      if (inter === 0) {
        perItem.push(0);
        continue;
      }
      const p = inter / predSet.size;
      const r = inter / goldSet.size;
      perItem.push((2 * p * r) / (p + r));
    }
    return { value: mean(perItem), sample_size: used };
  }
}
