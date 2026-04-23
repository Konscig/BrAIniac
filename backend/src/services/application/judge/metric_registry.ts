import type { MetricBase } from './metrics/metric.base.js';

const registry = new Map<string, MetricBase>();

export function registerMetric(metric: MetricBase): void {
  if (registry.has(metric.code)) {
    throw new Error(`metric ${metric.code} already registered`);
  }
  registry.set(metric.code, metric);
}

export function getMetric(code: string): MetricBase | undefined {
  return registry.get(code);
}

export function listRegistered(): MetricBase[] {
  return Array.from(registry.values());
}

export function listCodes(): string[] {
  return Array.from(registry.keys()).sort();
}

export function resetRegistry(): void {
  registry.clear();
}

// Static registration of all MVP metrics. Adding a new metric = one import +
// one registerMetric(...) call below. No core changes required (FR-012, SC-005).
// eslint-disable-next-line @typescript-eslint/no-var-requires
export async function initMetrics(): Promise<void> {
  if (registry.size > 0) return;
  await import('./metrics/bootstrap.js');
}
