import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

interface ChecklistItem {
  description: string;
  satisfied: boolean | null;
}

export class CheckEvalMetric extends MetricBase {
  readonly code = 'f_check';
  readonly axis = 'G' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const checklist = Array.isArray((it.input_json as any).checkeval_checklist)
        ? ((it.input_json as any).checkeval_checklist as ChecklistItem[])
        : [];
      if (!checklist.length) continue;
      if (!ctx.judge_provider) {
        perItem.push(0);
        continue;
      }
      const prompt = `Evaluate the following boolean checklist criteria on the given answer. Reply with a JSON array of 0/1 values, one per criterion, in order.\n\nAnswer:\n${it.agent_output.text ?? ''}\n\nCriteria:\n${checklist.map((c, i) => `${i + 1}. ${c.description}`).join('\n')}`;
      const result = await ctx.judge_provider.chat([
        { role: 'system', content: 'You are a strict boolean checklist evaluator. Output only the JSON array of 0/1.' },
        { role: 'user', content: prompt },
      ]);
      const parsed = safeParseBooleanArray(result.text);
      if (!parsed || parsed.length !== checklist.length) {
        perItem.push(0);
        continue;
      }
      const score = parsed.filter(Boolean).length / parsed.length;
      perItem.push(score);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}

function safeParseBooleanArray(text: string): number[] | null {
  const match = text.match(/\[[^\]]*\]/);
  if (!match) return null;
  try {
    const arr = JSON.parse(match[0]);
    if (!Array.isArray(arr)) return null;
    return arr.map((v) => (Number(v) > 0 ? 1 : 0));
  } catch {
    return null;
  }
}
