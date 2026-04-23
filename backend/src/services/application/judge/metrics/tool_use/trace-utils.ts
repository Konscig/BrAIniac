import type { ToolCallTraceEntry } from '../metric.base.js';

export function collapseCycles(entries: ToolCallTraceEntry[]): ToolCallTraceEntry[] {
  if (!Array.isArray(entries)) return [];
  const out: ToolCallTraceEntry[] = [];
  for (const entry of entries) {
    const prev = out[out.length - 1];
    if (prev && toolSignature(prev) === toolSignature(entry)) continue;
    out.push(entry);
  }
  return out;
}

export function toolSignature(entry: ToolCallTraceEntry): string {
  return `${entry.resolved_tool ?? entry.requested_tool ?? 'unknown'}::${entry.status ?? 'unknown'}`;
}
