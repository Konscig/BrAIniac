import { listTools } from '../../../data/tool.service.js';
import type { RuntimeNode } from '../../pipeline/pipeline.executor.types.js';
import { normalizeToolLookupKey, toObjectRecord } from './node-handler.common.js';
import type { ResolvedToolBinding } from './agent-tool-execution.js';

export type AgentToolBinding = {
  name: string;
  desc?: string;
  schema?: Record<string, any>;
  tool_id?: number;
  config_json?: Record<string, any>;
};

export type AgentResolvedToolBinding = {
  key: string;
  binding: ResolvedToolBinding;
  advertised: Record<string, any>;
};

export type AgentToolResolution = {
  advertised: Array<Record<string, any>>;
  orderedBindings: AgentResolvedToolBinding[];
  byKey: Map<string, ResolvedToolBinding>;
  unresolvedTools: string[];
};

function coerceOptionalPositiveInt(raw: unknown): number | undefined {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return undefined;
  return value;
}

function buildAgentBindingFromToolNode(record: Record<string, any>): AgentToolBinding | null {
  const name = typeof record.tool_name === 'string' ? record.tool_name.trim() : '';
  if (!name) return null;

  const toolId = coerceOptionalPositiveInt(record.tool_id);

  return {
    name,
    ...(typeof record.desc === 'string' && record.desc.trim().length > 0 ? { desc: record.desc.trim() } : {}),
    ...(record.schema && typeof record.schema === 'object' ? { schema: record.schema } : {}),
    ...(toolId ? { tool_id: toolId } : {}),
    ...(record.config_json && typeof record.config_json === 'object' ? { config_json: record.config_json } : {}),
  };
}

function collectAdvertisedToolBindings(value: unknown, out: AgentToolBinding[], seen: Set<string>, depth = 0): void {
  if (depth > 4 || value === undefined || value === null) return;

  if (Array.isArray(value)) {
    for (const entry of value.slice(0, 80)) {
      collectAdvertisedToolBindings(entry, out, seen, depth + 1);
    }
    return;
  }

  const record = toObjectRecord(value);
  if (!record) return;

  const kind = typeof record.kind === 'string' ? record.kind.trim().toLowerCase() : '';
  const type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';

  if (kind === 'tool_node' || type === 'tool_node') {
    const binding = buildAgentBindingFromToolNode(record);
    if (binding) {
      const key = normalizeToolLookupKey(binding.name);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(binding);
      }
    }
    return;
  }

  const wrapperKeys = ['value', 'data', 'payload', 'output', 'contract_output'];
  for (const key of wrapperKeys) {
    if (!(key in record)) continue;
    collectAdvertisedToolBindings(record[key], out, seen, depth + 1);
  }
}

function listAdvertisedAgentTools(bindings: AgentToolBinding[]): Array<Record<string, any>> {
  return bindings.map((entry) => ({
    name: entry.name,
    ...(entry.desc ? { desc: entry.desc } : {}),
    ...(entry.schema ? { schema: entry.schema } : {}),
  }));
}

function buildAgentFallbackSequence(orderedBindings: AgentResolvedToolBinding[]): AgentResolvedToolBinding[] {
  const preferredOrder = [
    'documentloader',
    'chunker',
    'embedder',
    'vectorupsert',
    'querybuilder',
    'hybridretriever',
    'contextassembler',
    'llmanswer',
    'citationformatter',
  ];

  const byKey = new Map<string, AgentResolvedToolBinding>();
  for (const entry of orderedBindings) {
    if (!byKey.has(entry.key)) {
      byKey.set(entry.key, entry);
    }
  }

  const out: AgentResolvedToolBinding[] = [];
  const seen = new Set<string>();

  for (const key of preferredOrder) {
    const row = byKey.get(key);
    if (!row) continue;
    out.push(row);
    seen.add(row.key);
  }

  for (const row of orderedBindings) {
    if (seen.has(row.key)) continue;
    out.push(row);
    seen.add(row.key);
  }

  return out;
}

export function isToolAdvertisingInput(value: unknown, depth = 0): boolean {
  if (depth > 6 || value === undefined || value === null) return false;

  if (Array.isArray(value)) {
    return value.some((entry) => isToolAdvertisingInput(entry, depth + 1));
  }

  const record = toObjectRecord(value);
  if (!record) return false;

  const kind = typeof record.kind === 'string' ? record.kind.trim().toLowerCase() : '';
  const type = typeof record.type === 'string' ? record.type.trim().toLowerCase() : '';
  if (kind === 'tool_node' || type === 'tool_node') {
    return true;
  }

  const nestedKeys = ['value', 'data', 'payload', 'output', 'contract_output'];
  return nestedKeys.some((key) => key in record && isToolAdvertisingInput(record[key], depth + 1));
}

export async function resolveAgentToolBindings(_runtime: RuntimeNode, inputs: any[] = []): Promise<AgentToolResolution> {
  const requestedBindings: AgentToolBinding[] = [];
  const seen = new Set<string>();
  for (const source of inputs.slice(0, 80)) {
    collectAdvertisedToolBindings(source, requestedBindings, seen);
  }

  const advertised = listAdvertisedAgentTools(requestedBindings);
  if (requestedBindings.length === 0) {
    return {
      advertised,
      orderedBindings: [],
      byKey: new Map<string, ResolvedToolBinding>(),
      unresolvedTools: [],
    };
  }

  const tools = await listTools();
  const byId = new Map<number, any>();
  const byNameKey = new Map<string, any>();

  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const toolRecord = tool as Record<string, any>;
    const toolId = coerceOptionalPositiveInt(toolRecord.tool_id);
    const toolName = typeof toolRecord.name === 'string' ? toolRecord.name.trim() : '';
    if (!toolId || !toolName) continue;
    byId.set(toolId, tool);
    byNameKey.set(normalizeToolLookupKey(toolName), tool);
  }

  const orderedBindings: AgentResolvedToolBinding[] = [];
  const byKey = new Map<string, ResolvedToolBinding>();
  const unresolvedTools: string[] = [];

  for (const requestedBinding of requestedBindings) {
    const bindingKey = normalizeToolLookupKey(requestedBinding.name);
    if (!bindingKey) continue;

    const fromId = requestedBinding.tool_id ? byId.get(requestedBinding.tool_id) : undefined;
    const linked = fromId ?? byNameKey.get(bindingKey);

    if (!linked) {
      unresolvedTools.push(requestedBinding.name);
      continue;
    }

    const linkedRecord = linked as Record<string, any>;
    const linkedName = typeof linkedRecord.name === 'string' ? linkedRecord.name.trim() : requestedBinding.name;
    const linkedId = coerceOptionalPositiveInt(linkedRecord.tool_id) ?? null;
    const linkedConfig = toObjectRecord(linkedRecord.config_json) ?? {};
    const requestedConfig = requestedBinding.config_json ?? {};

    const resolvedBinding: ResolvedToolBinding = {
      tool_id: linkedId,
      name: linkedName,
      config_json: {
        ...linkedConfig,
        ...requestedConfig,
      },
      source: linkedId ? 'node.tool_id' : 'node.tool',
    };

    const resolved: AgentResolvedToolBinding = {
      key: bindingKey,
      binding: resolvedBinding,
      advertised: {
        name: requestedBinding.name,
        ...(requestedBinding.desc ? { desc: requestedBinding.desc } : {}),
        ...(requestedBinding.schema ? { schema: requestedBinding.schema } : {}),
      },
    };

    orderedBindings.push(resolved);
    if (!byKey.has(bindingKey)) {
      byKey.set(bindingKey, resolvedBinding);
    }

    const linkedKey = normalizeToolLookupKey(linkedName);
    if (linkedKey && !byKey.has(linkedKey)) {
      byKey.set(linkedKey, resolvedBinding);
    }
  }

  return {
    advertised,
    orderedBindings: buildAgentFallbackSequence(orderedBindings),
    byKey,
    unresolvedTools,
  };
}
