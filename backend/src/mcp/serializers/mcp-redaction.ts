import type { McpRedaction } from './mcp-safe-json.js';

const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|password|credential|authorization|bearer|private[_-]?key|access[_-]?key)/i;

const RAW_DATASET_KEY_PATTERN = /(raw[_-]?content|content[_-]?raw|document[_-]?text|dataset[_-]?content|file[_-]?content)/i;

const TOKEN_VALUE_PATTERN =
  /(sk-[a-z0-9_-]{12,}|sk-or-v1-[a-z0-9]+|eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+|Bearer\s+[a-zA-Z0-9._-]+)/;

export type RedactionResult<T> = {
  value: T;
  redactions: McpRedaction[];
};

function joinPath(parent: string, key: string): string {
  if (parent === '$') {
    return `$.${key}`;
  }
  return `${parent}.${key}`;
}

function shouldRedactKey(key: string): string | undefined {
  if (SECRET_KEY_PATTERN.test(key)) {
    return 'secret-like field';
  }
  if (RAW_DATASET_KEY_PATTERN.test(key)) {
    return 'raw dataset content';
  }
  return undefined;
}

function shouldRedactString(value: string): string | undefined {
  if (TOKEN_VALUE_PATTERN.test(value)) {
    return 'token-like value';
  }
  return undefined;
}

function redactValue(value: unknown, path: string, redactions: McpRedaction[]): unknown {
  if (Array.isArray(value)) {
    return value.map((item, index) => redactValue(item, `${path}[${index}]`, redactions));
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, nestedValue] of Object.entries(value)) {
      const nestedPath = joinPath(path, key);
      const keyReason = shouldRedactKey(key);

      if (keyReason !== undefined) {
        output[key] = '[REDACTED]';
        redactions.push({ path: nestedPath, reason: keyReason });
        continue;
      }

      output[key] = redactValue(nestedValue, nestedPath, redactions);
    }

    return output;
  }

  if (typeof value === 'string') {
    const valueReason = shouldRedactString(value);
    if (valueReason !== undefined) {
      redactions.push({ path, reason: valueReason });
      return '[REDACTED]';
    }
  }

  return value;
}

export function redactMcpSecrets<T>(value: T): RedactionResult<T> {
  const redactions: McpRedaction[] = [];
  const redacted = redactValue(value, '$', redactions) as T;
  return { value: redacted, redactions };
}

export function mergeRedactions(...groups: McpRedaction[][]): McpRedaction[] {
  return groups.flat();
}
