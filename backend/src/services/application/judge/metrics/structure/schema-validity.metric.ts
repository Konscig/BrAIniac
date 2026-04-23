import Ajv from 'ajv';
import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

const ajv = new Ajv({ strict: false, allErrors: true });
const compiledCache = new Map<string, ReturnType<typeof ajv.compile>>();

function compileSchema(schema: Record<string, any>) {
  const key = JSON.stringify(schema);
  let cached = compiledCache.get(key);
  if (!cached) {
    cached = ajv.compile(schema);
    compiledCache.set(key, cached);
  }
  return cached;
}

export class SchemaValidityMetric extends MetricBase {
  readonly code = 'f_schema';
  readonly axis = 'E' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const schema = it.input_json?.expected_schema ?? it.input_json?.output_schema;
      const output = it.agent_output.structured_output ?? safeJson(it.agent_output.text);
      if (!schema) continue;
      const validate = compileSchema(schema);
      perItem.push(validate(output) ? 1 : 0);
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}

function safeJson(text: string | undefined): any {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
