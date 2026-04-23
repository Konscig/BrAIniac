import { MetricBase, MetricContext, MetricResult, clamp01, mean } from '../metric.base.js';

// Zhang-Shasha-like tree edit distance on JSON trees. Minimal in-house
// implementation — no heavy deps, adequate for MVP sizes. Complexity O(n*m)
// on normalized label sequences; suitable for structured outputs up to the
// MAX_TREE_SIZE threshold from NormalizationProfile (default 128).

interface TreeNode {
  label: string;
  children: TreeNode[];
}

function toTree(value: any, key = '$'): TreeNode {
  if (value === null || value === undefined) return { label: `${key}:null`, children: [] };
  if (Array.isArray(value)) {
    return { label: `${key}:array`, children: value.map((v, idx) => toTree(v, `[${idx}]`)) };
  }
  if (typeof value === 'object') {
    return {
      label: `${key}:object`,
      children: Object.keys(value)
        .sort()
        .map((k) => toTree((value as any)[k], k)),
    };
  }
  return { label: `${key}:${typeof value}:${JSON.stringify(value)}`, children: [] };
}

function size(node: TreeNode): number {
  return 1 + node.children.reduce((s, c) => s + size(c), 0);
}

function editDistance(a: TreeNode, b: TreeNode): number {
  const cache = new Map<string, number>();
  function rec(x: TreeNode, y: TreeNode): number {
    const key = `${labelHash(x)}|${labelHash(y)}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;
    let cost = x.label === y.label ? 0 : 1;
    const childCost = matchChildren(x.children, y.children);
    const total = cost + childCost;
    cache.set(key, total);
    return total;
  }
  return rec(a, b);
}

function labelHash(node: TreeNode): string {
  return `${node.label}(${node.children.map(labelHash).join(',')})`;
}

function matchChildren(a: TreeNode[], b: TreeNode[]): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i += 1) dp[i]![0] = i ? dp[i - 1]![0]! + size(a[i - 1]!) : 0;
  for (let j = 0; j <= n; j += 1) dp[0]![j] = j ? dp[0]![j - 1]! + size(b[j - 1]!) : 0;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const del = dp[i - 1]![j]! + size(a[i - 1]!);
      const ins = dp[i]![j - 1]! + size(b[j - 1]!);
      const sub = dp[i - 1]![j - 1]! + editDistance(a[i - 1]!, b[j - 1]!);
      dp[i]![j] = Math.min(del, ins, sub);
    }
  }
  return dp[m]![n]!;
}

export class TreeEditDistanceMetric extends MetricBase {
  readonly code = 'f_TED';
  readonly axis = 'E' as const;
  readonly requiresReference = true;
  readonly executor = 'native' as const;

  async compute(ctx: MetricContext): Promise<MetricResult> {
    const perItem: number[] = [];
    let used = 0;
    const maxSize = Number(ctx.normalization_params?.f_TED?.max_tree_size ?? 128);
    for (const it of ctx.items) {
      const goldRaw = it.gold?.structured ?? it.gold?.answer ?? null;
      if (!goldRaw) continue;
      const predRaw = it.agent_output.structured_output;
      if (!predRaw) continue;
      used += 1;
      const goldTree = toTree(goldRaw);
      const predTree = toTree(predRaw);
      const total = Math.max(size(goldTree), size(predTree), 1);
      if (total > maxSize) {
        perItem.push(0);
        continue;
      }
      const distance = editDistance(predTree, goldTree);
      perItem.push(clamp01(1 - distance / total));
    }
    return { value: mean(perItem), sample_size: used };
  }
}
