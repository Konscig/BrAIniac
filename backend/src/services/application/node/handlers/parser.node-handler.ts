import type { NodeHandler } from '../../pipeline/pipeline.executor.types.js';
import { toText, tryParseJsonFromText } from '../../pipeline/pipeline.executor.utils.js';

export const parserNodeHandler: NodeHandler = async (_runtime, inputs, context) => {
  const source = inputs.length > 0 ? inputs[0] : context.input_json;
  const text = toText(source);
  const parsed = tryParseJsonFromText(text);
  return {
    output: {
      kind: 'parser',
      raw_text: text,
      parsed_json: parsed,
      parse_ok: parsed !== null,
    },
    costUnits: 0,
  };
};
