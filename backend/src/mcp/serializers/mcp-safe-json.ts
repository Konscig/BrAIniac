export const DEFAULT_MCP_TEXT_LIMIT_BYTES = 64 * 1024;

export type McpDiagnostic = {
  severity: 'info' | 'warning' | 'error';
  code: string;
  message: string;
  details?: unknown;
};

export type McpResourceLink = {
  uri: string;
  name: string;
  description?: string;
};

export type McpRedaction = {
  path: string;
  reason: string;
};

export type McpJsonEnvelope<TData> = {
  kind: string;
  resource_uri: string;
  data: TData;
  links: McpResourceLink[];
  diagnostics: McpDiagnostic[];
  redactions: McpRedaction[];
};

export type McpTextContent = {
  uri?: string;
  mimeType: 'application/json';
  text: string;
};

export type McpSafeJsonOptions = {
  maxBytes?: number;
};

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function truncateToByteLimit(value: string, maxBytes: number): string {
  if (byteLength(value) <= maxBytes) {
    return value;
  }

  const suffix = '\n{"truncated":true}';
  const suffixBytes = byteLength(suffix);
  const targetBytes = Math.max(0, maxBytes - suffixBytes);
  let result = '';
  let usedBytes = 0;

  for (const char of value) {
    const charBytes = byteLength(char);
    if (usedBytes + charBytes > targetBytes) {
      break;
    }
    result += char;
    usedBytes += charBytes;
  }

  return `${result}${suffix}`;
}

export function createMcpJsonEnvelope<TData>(input: {
  kind: string;
  resourceUri: string;
  data: TData;
  links?: McpResourceLink[];
  diagnostics?: McpDiagnostic[];
  redactions?: McpRedaction[];
}): McpJsonEnvelope<TData> {
  return {
    kind: input.kind,
    resource_uri: input.resourceUri,
    data: input.data,
    links: input.links ?? [],
    diagnostics: input.diagnostics ?? [],
    redactions: input.redactions ?? [],
  };
}

export function safeJsonStringify(value: unknown, options: McpSafeJsonOptions = {}): string {
  const maxBytes = options.maxBytes ?? DEFAULT_MCP_TEXT_LIMIT_BYTES;
  const text = JSON.stringify(value, null, 2);
  return truncateToByteLimit(text, maxBytes);
}

export function toMcpJsonContent<TData>(
  envelope: McpJsonEnvelope<TData>,
  options: McpSafeJsonOptions = {},
): McpTextContent {
  return {
    uri: envelope.resource_uri,
    mimeType: 'application/json',
    text: safeJsonStringify(envelope, options),
  };
}

export function toMcpToolJsonText(value: unknown, options: McpSafeJsonOptions = {}): string {
  return safeJsonStringify(value, options);
}
