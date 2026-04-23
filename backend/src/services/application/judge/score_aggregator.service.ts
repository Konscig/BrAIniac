export type Verdict = 'improvement' | 'satisfactory' | 'pass';

export interface AggregateInput {
  scoresByCode: Record<string, number>;
  weights: Record<string, number>;
  alphaThresholds: { improvement: number; pass: number };
  operational?: {
    fail_rate?: number | null;
    p95_latency_ms?: number | null;
    total_cost_usd?: number | null;
    f_safe?: number | null;
  };
  hardGateLimits?: {
    r_fail_max?: number;
    t_max_ms?: number;
    c_max_usd?: number;
    f_safe_min?: number;
  };
}

export interface AggregateResult {
  final_score: number;
  verdict: Verdict;
  hard_gate_status: 'pass' | 'fail' | 'unknown';
  weights_used: Record<string, number>;
}

export function aggregateScore(input: AggregateInput): AggregateResult {
  let weightedSum = 0;
  let weightsTotal = 0;
  const weightsUsed: Record<string, number> = {};
  for (const [code, w] of Object.entries(input.weights)) {
    const value = input.scoresByCode[code];
    if (value === undefined) continue;
    weightedSum += w * value;
    weightsTotal += w;
    weightsUsed[code] = w;
  }
  const finalScore = weightsTotal > 0 ? weightedSum / weightsTotal : 0;

  let verdict: Verdict = 'improvement';
  if (finalScore > input.alphaThresholds.pass) verdict = 'pass';
  else if (finalScore >= input.alphaThresholds.improvement) verdict = 'satisfactory';

  const gateLimits = input.hardGateLimits ?? {};
  let hardGate: 'pass' | 'fail' | 'unknown' = 'unknown';
  if (input.operational) {
    const failures: string[] = [];
    if (gateLimits.r_fail_max !== undefined && (input.operational.fail_rate ?? 0) > gateLimits.r_fail_max) failures.push('fail_rate');
    if (gateLimits.t_max_ms !== undefined && (input.operational.p95_latency_ms ?? 0) > gateLimits.t_max_ms) failures.push('latency');
    if (gateLimits.c_max_usd !== undefined && (input.operational.total_cost_usd ?? 0) > gateLimits.c_max_usd) failures.push('cost');
    if (gateLimits.f_safe_min !== undefined && (input.operational.f_safe ?? 1) < gateLimits.f_safe_min) failures.push('safety');
    if (finalScore < input.alphaThresholds.pass) failures.push('score_below_pass_threshold');
    hardGate = failures.length === 0 ? 'pass' : 'fail';
  }

  return {
    final_score: Math.max(0, Math.min(1, finalScore)),
    verdict,
    hard_gate_status: hardGate,
    weights_used: weightsUsed,
  };
}
