import { HttpError } from '../../../../common/http-error.js';
import { tryParseJsonFromText } from '../../pipeline/pipeline.executor.utils.js';
import { toObjectRecord } from './node-handler.common.js';

export type AgentDirective =
  | {
      kind: 'tool_call';
      toolName: string;
      input: Record<string, any>;
      raw: any;
    }
  | {
      kind: 'final';
      text: string;
      raw: any;
    }
  | {
      kind: 'none';
      raw: any;
    };

function tryParseLeadingJsonObject(text: string): Record<string, any> | null {
  if (!text.startsWith('{')) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(0, index + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

function tryRecoverToolDirectiveFromLooseText(text: string): Record<string, any> | null {
  if (!text) return null;

  const toolNameMatch =
    text.match(/"tool_name"\s*:\s*"([^"]+)"/i) ??
    text.match(/"tool_name"\s*:\s*([A-Za-z0-9._:-]+)/i) ??
    text.match(/"toolName"\s*:\s*"([^"]+)"/i) ??
    text.match(/"toolName"\s*:\s*([A-Za-z0-9._:-]+)/i) ??
    text.match(/"tool"\s*:\s*"([^"]+)"/i);
  const toolName = toolNameMatch?.[1]?.trim();
  if (!toolName) return null;

  const looksLikeToolCall =
    /tool_call/i.test(text) ||
    /<\s*tool_call\s*>/i.test(text) ||
    /<\s*\/\s*tool_call\s*>/i.test(text) ||
    /"type"\s*:\s*tool_call/i.test(text) ||
    /"type"\s*:\s*"tool_call"/i.test(text);
  if (!looksLikeToolCall) return null;

  const inputMatch = text.match(/"input"\s*:\s*(\{[\s\S]*?\})/i);
  let input: Record<string, any> = {};
  if (inputMatch?.[1]) {
    try {
      const parsedInput = JSON.parse(inputMatch[1]);
      input = toObjectRecord(parsedInput) ?? {};
    } catch {
      input = {};
    }
  }

  return {
    type: 'tool_call',
    tool_name: toolName,
    input,
  };
}

export function parseAgentDirective(rawText: string): AgentDirective {
  const text = rawText.trim();
  if (!text) {
    return {
      kind: 'none',
      raw: null,
    };
  }

  let parsed: unknown = tryParseJsonFromText(text);
  let record = toObjectRecord(parsed);

  if (!record) {
    const leadingObject = tryParseLeadingJsonObject(text);
    if (leadingObject) {
      parsed = leadingObject;
      record = leadingObject;
    }
  }

  if (!record) {
    const recoveredToolDirective = tryRecoverToolDirectiveFromLooseText(text);
    if (recoveredToolDirective) {
      parsed = recoveredToolDirective;
      record = recoveredToolDirective;
    }
  }

  if (!record) {
    return {
      kind: 'final',
      text,
      raw: parsed,
    };
  }

  const actionRaw =
    typeof record.type === 'string'
      ? record.type
      : typeof record.action === 'string'
      ? record.action
      : typeof record.kind === 'string'
      ? record.kind
      : '';
  const actionSource = actionRaw.trim();
  const action = actionSource.toLowerCase();

  const toolNameRaw =
    typeof record.tool_name === 'string'
      ? record.tool_name
      : typeof record.toolName === 'string'
      ? record.toolName
      : typeof record.tool === 'string'
      ? record.tool
      : typeof record.name === 'string'
      ? record.name
      : '';

  const toolName = toolNameRaw.trim();
  const actionLooksLikeToolName =
    actionSource.length > 0 &&
    !['final', 'done', 'answer', 'none', 'tool_call', 'tool', 'call'].includes(action) &&
    !action.includes('tool');

  const resolvedToolName = toolName || (actionLooksLikeToolName ? actionSource : '');
  if (resolvedToolName) {
    return {
      kind: 'tool_call',
      toolName: resolvedToolName,
      input: toObjectRecord(record.input ?? record.args ?? record.arguments ?? record.payload ?? record.parameters ?? record.params) ?? {},
      raw: parsed,
    };
  }

  const actionLooksLikeToolCall =
    action === 'tool_call' ||
    action === 'tool' ||
    action === 'call' ||
    /tool_call/i.test(text) ||
    /<\s*\/?\s*tool_call\s*>/i.test(text);

  if (actionLooksLikeToolCall) {
    const recoveredToolDirective = tryRecoverToolDirectiveFromLooseText(text);
    const recoveredRecord = toObjectRecord(recoveredToolDirective);
    const recoveredToolName =
      typeof recoveredRecord?.tool_name === 'string'
        ? recoveredRecord.tool_name.trim()
        : typeof recoveredRecord?.toolName === 'string'
        ? recoveredRecord.toolName.trim()
        : '';

    if (recoveredToolName) {
      return {
        kind: 'tool_call',
        toolName: recoveredToolName,
        input: toObjectRecord(recoveredRecord?.input) ?? {},
        raw: recoveredToolDirective,
      };
    }
  }

  const explicitFinal =
    typeof record.text === 'string'
      ? record.text
      : typeof record.answer === 'string'
      ? record.answer
      : typeof record.final === 'string'
      ? record.final
      : '';

  if (action === 'final' || action === 'done' || action === 'answer' || explicitFinal.trim().length > 0) {
    return {
      kind: 'final',
      text: explicitFinal.trim() || text,
      raw: parsed,
    };
  }

  return {
    kind: 'final',
    text,
    raw: parsed,
  };
}

export function getHttpErrorCode(error: unknown): string | null {
  if (!(error instanceof HttpError)) return null;
  const code = (error.body as Record<string, unknown> | undefined)?.code;
  return typeof code === 'string' && code.trim().length > 0 ? code : null;
}

export function getHttpErrorStatus(error: unknown): number | null {
  if (!(error instanceof HttpError)) return null;
  const details = toObjectRecord((error.body as Record<string, unknown> | undefined)?.details);
  const status = Number(details?.status ?? details?.http_status);
  if (Number.isInteger(status) && status > 0) return status;
  return null;
}

export function isSoftOpenRouterError(error: unknown): boolean {
  const code = getHttpErrorCode(error);
  if (code === 'OPENROUTER_UNAVAILABLE') return true;
  if (code === 'OPENROUTER_UPSTREAM_ERROR' && getHttpErrorStatus(error) === 429) {
    return true;
  }
  return false;
}
