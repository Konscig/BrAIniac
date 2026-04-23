import { findByCode as findWeightByCode, findById as findWeightById } from '../../data/weight_profile.service.js';
import { classifyPipeline } from './architectural_class.service.js';

export interface ResolvedWeights {
  weight_profile_id: number;
  code: string;
  architectural_class: string;
  weights: Record<string, number>;
}

export async function resolveWeightsForPipeline(pipelineId: number, requestedCode?: string): Promise<ResolvedWeights> {
  const code = requestedCode ?? `${await classifyPipeline(pipelineId)}_default_v1`;
  const profile = await findWeightByCode(code);
  if (!profile) throw new Error(`weight profile ${code} not found`);
  return {
    weight_profile_id: profile.weight_profile_id,
    code: profile.code,
    architectural_class: profile.architectural_class,
    weights: profile.weights_json as Record<string, number>,
  };
}

export function restrictAndRenormalize(weights: Record<string, number>, presentCodes: string[]): Record<string, number> {
  const present = presentCodes.filter((c) => c in weights);
  const subset: Record<string, number> = {};
  let total = 0;
  for (const c of present) {
    subset[c] = weights[c]!;
    total += weights[c]!;
  }
  if (total === 0) return subset;
  const out: Record<string, number> = {};
  for (const [c, w] of Object.entries(subset)) out[c] = +(w / total).toFixed(6);
  return out;
}

export async function fetchProfileById(id: number) {
  return findWeightById(id);
}
