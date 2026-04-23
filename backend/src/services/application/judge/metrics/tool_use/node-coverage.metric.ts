import { MetricBase, MetricContext, MetricResult, mean } from '../metric.base.js';

export class NodeCoverageMetric extends MetricBase {
  readonly code = 'f_node_cov';
  readonly axis = 'D' as const;
  readonly requiresReference = false;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    for (const it of ctx.items) {
      const visited = new Set<string>();
      for (const entry of it.agent_output.tool_call_trace ?? []) {
        const name = entry.resolved_tool ?? entry.requested_tool;
        if (name) visited.add(String(name));
      }
      const total = Number(it.input_json?.expected_node_count ?? it.input_json?.pipeline_node_count ?? visited.size);
      if (!total) continue;
      perItem.push(Math.min(1, visited.size / total));
    }
    return { value: mean(perItem), sample_size: perItem.length };
  }
}
