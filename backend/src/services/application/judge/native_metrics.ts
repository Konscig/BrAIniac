import type { AssessItem } from './judge.service.js';

export function computeNativeMetric(code: string, item: AssessItem): number {
  switch (code) {
    case 'f_EM':       return exactMatch(item);
    case 'f_F1':       return tokenF1(item);
    case 'f_cite':     return citationF1(item);
    case 'f_recall@k': return recallAtK(item);
    case 'f_ndcg@k':   return ndcgAtK(item);
    case 'f_ctx_prec': return ctxPrecision(item);
    case 'f_ctx_rec':  return ctxRecall(item);
    case 'f_toolsel':  return toolSelection(item);
    case 'f_argF1':    return parameterF1(item);
    case 'f_tool_ok':  return toolCallSuccess(item);
    case 'f_trajIoU':  return trajectoryIoU(item);
    case 'f_planEff':  return planEfficiency(item);
    case 'f_node_cov': return nodeCoverage(item);
    case 'f_schema':   return schemaValidity(item);
    case 'f_field':    return fieldF1(item);
    case 'f_TED':      return treeDist(item);
    case 'f_loop_term':   return loopTerm(item);
    case 'f_loop_budget': return loopBudget(item);
    case 'f_loop_conv':   return loopConv(item);
    case 'f_retry':    return retryEfficacy(item);
    case 'f_check':    return checkEval(item);
    case 'f_consist':  return selfConsistency(item);
    default: return 0;
  }
}

// Бросаем эту ошибку когда метрика не может быть посчитана из-за отсутствия
// нужных полей в reference/agent_output. runAssessment ловит и кладёт код
// в skipped_metrics, поэтому метрика не загрязняет агрегат фейковой 1.0.
class MetricNotApplicable extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MetricNotApplicable';
  }
}

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^\wа-яёa-z0-9]/gi, ' ').split(/\s+/).filter(Boolean);
}

function counter(arr: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of arr) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
}

function exactMatch(item: AssessItem): number {
  const ref = item.reference?.answer;
  if (typeof ref !== 'string' || ref.trim().length === 0) {
    throw new MetricNotApplicable('f_EM requires reference.answer');
  }
  const pred = item.agent_output.text.trim().toLowerCase();
  return pred === ref.trim().toLowerCase() ? 1 : 0;
}

function tokenF1(item: AssessItem): number {
  const ref = item.reference?.answer;
  if (typeof ref !== 'string' || ref.trim().length === 0) {
    throw new MetricNotApplicable('f_F1 requires reference.answer');
  }
  // SQuAD-style multiset F1: учитываем кратность токенов.
  const predToks = tokens(item.agent_output.text);
  const refToks = tokens(ref);
  if (!predToks.length || !refToks.length) return 0;
  const predBag = counter(predToks);
  const refBag = counter(refToks);
  let tp = 0;
  for (const [tok, predCount] of predBag) {
    const refCount = refBag.get(tok) ?? 0;
    tp += Math.min(predCount, refCount);
  }
  const p = tp / predToks.length;
  const r = tp / refToks.length;
  return p + r === 0 ? 0 : 2 * p * r / (p + r);
}

function citationF1(item: AssessItem): number {
  const refs = item.reference?.relevant_docs ?? [];
  if (!refs.length) {
    throw new MetricNotApplicable('f_cite requires reference.relevant_docs');
  }
  const text = item.agent_output.text;
  const cited = refs.filter((id) => text.includes(String(id)));
  return cited.length / refs.length;
}

function recallAtK(item: AssessItem): number {
  const relevant = item.reference?.relevant_docs ?? [];
  if (!relevant.length) {
    throw new MetricNotApplicable('f_recall@k requires reference.relevant_docs');
  }
  const out = item.agent_output as any;
  const retrieved: string[] = out.retrieved_ids ?? [];
  if (!retrieved.length) {
    throw new MetricNotApplicable('f_recall@k requires agent_output.retrieved_ids');
  }
  const hits = retrieved.filter((id) => relevant.includes(id));
  return hits.length / relevant.length;
}

function ndcgAtK(item: AssessItem): number {
  const relevant = item.reference?.relevant_docs ?? [];
  if (!relevant.length) {
    throw new MetricNotApplicable('f_ndcg@k requires reference.relevant_docs');
  }
  const out = item.agent_output as any;
  const retrieved: string[] = out.retrieved_ids ?? [];
  if (!retrieved.length) {
    throw new MetricNotApplicable('f_ndcg@k requires agent_output.retrieved_ids');
  }
  let dcg = 0, idcg = 0;
  for (let i = 0; i < retrieved.length; i++) {
    const rel = relevant.includes(retrieved[i]!) ? 1 : 0;
    dcg  += rel  / Math.log2(i + 2);
    idcg += (i < relevant.length ? 1 : 0) / Math.log2(i + 2);
  }
  return idcg === 0 ? 0 : dcg / idcg;
}

function ctxPrecision(item: AssessItem): number {
  return recallAtK(item); // simplified
}

function ctxRecall(item: AssessItem): number {
  return recallAtK(item);
}

function toolSelection(item: AssessItem): number {
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) {
    throw new MetricNotApplicable('f_toolsel requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  const refTools = new Set(refTraj.map((s: any) => s.tool));
  const usedTools = new Set(trace.map((s: any) => s.tool));
  let hits = 0;
  for (const t of refTools) if (usedTools.has(t)) hits++;
  return hits / refTools.size;
}

function parameterF1(item: AssessItem): number {
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) {
    throw new MetricNotApplicable('f_argF1 requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  let scores = 0;
  const n = Math.min(trace.length, refTraj.length);
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const pKeys = Object.keys(trace[i]?.params ?? {});
    const rKeys = Object.keys(refTraj[i]?.params ?? {});
    if (!pKeys.length && !rKeys.length) { scores++; continue; }
    const pSet = new Set(pKeys), rSet = new Set(rKeys);
    let tp = 0;
    for (const k of pSet) if (rSet.has(k)) tp++;
    const p = pSet.size ? tp / pSet.size : 0;
    const r = rSet.size ? tp / rSet.size : 0;
    scores += p + r === 0 ? 0 : 2 * p * r / (p + r);
  }
  return scores / n;
}

function toolCallSuccess(item: AssessItem): number {
  const trace = item.agent_output.tool_call_trace ?? [];
  if (!trace.length) {
    throw new MetricNotApplicable('f_tool_ok requires agent_output.tool_call_trace');
  }
  const ok = trace.filter((s: any) => s.success !== false && s.status !== 'failed').length;
  return ok / trace.length;
}

function trajectoryIoU(item: AssessItem): number {
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) {
    throw new MetricNotApplicable('f_trajIoU requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  const predSet = new Set(trace.map((s: any) => s.tool));
  const refSet  = new Set(refTraj.map((s: any) => s.tool));
  let inter = 0;
  for (const t of predSet) if (refSet.has(t)) inter++;
  const union = new Set([...predSet, ...refSet]).size;
  return union === 0 ? 0 : inter / union;
}

function planEfficiency(item: AssessItem): number {
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) {
    throw new MetricNotApplicable('f_planEff requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  if (trace.length === 0) return 0;
  return Math.min(1, refTraj.length / trace.length);
}

function nodeCoverage(item: AssessItem): number {
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) {
    throw new MetricNotApplicable('f_node_cov requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  const visited = new Set(trace.map((s: any) => s.tool));
  const required = new Set(refTraj.map((s: any) => s.tool));
  let covered = 0;
  for (const t of required) if (visited.has(t)) covered++;
  return covered / required.size;
}

function schemaValidity(item: AssessItem): number {
  const schema = (item.input as any).expected_schema ?? (item.input as any).output_schema;
  const output = item.agent_output.structured_output;
  if (!schema) {
    throw new MetricNotApplicable('f_schema requires input.expected_schema');
  }
  if (!output) {
    throw new MetricNotApplicable('f_schema requires agent_output.structured_output');
  }
  const required: string[] = (schema as any).required ?? [];
  if (required.length === 0) return 1;
  const ok = required.every((k: string) => k in output);
  return ok ? 1 : 0;
}

function tryParseJson(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function fieldF1(item: AssessItem): number {
  const refRaw = item.reference?.answer;
  const refParsed = typeof refRaw === 'string' ? tryParseJson(refRaw) : null;
  const pred = item.agent_output.structured_output;
  if (!refParsed) {
    throw new MetricNotApplicable('f_field requires reference.answer to be JSON object');
  }
  if (!pred || typeof pred !== 'object') {
    throw new MetricNotApplicable('f_field requires agent_output.structured_output');
  }
  const pKeys = new Set(Object.keys(pred));
  const rKeys = new Set(Object.keys(refParsed));
  if (!pKeys.size && !rKeys.size) return 1;
  let tp = 0;
  for (const k of pKeys) if (rKeys.has(k)) tp++;
  const p = pKeys.size ? tp / pKeys.size : 0;
  const r = rKeys.size ? tp / rKeys.size : 0;
  return p + r === 0 ? 0 : 2 * p * r / (p + r);
}

function treeDist(item: AssessItem): number {
  const refRaw = item.reference?.answer;
  const refParsed = typeof refRaw === 'string' ? tryParseJson(refRaw) : null;
  const pred = item.agent_output.structured_output;
  if (!refParsed) {
    throw new MetricNotApplicable('f_TED requires reference.answer to be JSON object');
  }
  if (!pred || typeof pred !== 'object') {
    throw new MetricNotApplicable('f_TED requires agent_output.structured_output');
  }
  const pSize = Object.keys(pred).length;
  const rSize = Object.keys(refParsed).length;
  if (pSize === 0 && rSize === 0) return 1;
  const diff = Math.abs(pSize - rSize);
  return 1 - diff / Math.max(pSize, rSize);
}

function loopTerm(item: AssessItem): number {
  const out = item.agent_output as any;
  if (out.loop_terminated === undefined && out.loop_iterations === undefined) {
    throw new MetricNotApplicable('f_loop_term requires agent_output.loop_terminated');
  }
  return out.loop_terminated === false ? 0 : 1;
}

function loopBudget(item: AssessItem): number {
  const out = item.agent_output as any;
  if (out.loop_iterations === undefined) {
    throw new MetricNotApplicable('f_loop_budget requires agent_output.loop_iterations');
  }
  const used = Number(out.loop_iterations);
  const max  = Number((item.input as any).max_iterations ?? out.loop_budget ?? 0);
  if (!Number.isFinite(used) || used < 0) {
    throw new MetricNotApplicable('f_loop_budget got invalid loop_iterations');
  }
  if (!Number.isFinite(max) || max <= 0) {
    throw new MetricNotApplicable('f_loop_budget requires positive max budget');
  }
  // Чем меньше итераций потрачено относительно бюджета, тем выше скор.
  return Math.max(0, Math.min(1, 1 - used / max));
}

function loopConv(item: AssessItem): number {
  const out = item.agent_output as any;
  if (out.loop_converged === undefined) {
    throw new MetricNotApplicable('f_loop_conv requires agent_output.loop_converged');
  }
  return out.loop_converged === true ? 1 : 0;
}

function retryEfficacy(item: AssessItem): number {
  const trace = item.agent_output.tool_call_trace ?? [];
  if (!trace.length) {
    throw new MetricNotApplicable('f_retry requires agent_output.tool_call_trace');
  }
  const retries = trace.filter((s: any) => s.retry === true).length;
  if (retries === 0) {
    throw new MetricNotApplicable('f_retry requires at least one retry attempt');
  }
  const succAfterRetry = trace.filter((s: any) => s.retry === true && s.success !== false && s.status !== 'failed').length;
  return succAfterRetry / retries;
}

function checkEval(item: AssessItem): number {
  return tokenF1(item);
}

function selfConsistency(item: AssessItem): number {
  const out = item.agent_output as any;
  const samples: string[] = out.consistency_samples ?? [];
  if (samples.length < 2) {
    throw new MetricNotApplicable('f_consist requires >= 2 consistency_samples');
  }
  const firstBag = counter(tokens(samples[0]!));
  const firstSize = Array.from(firstBag.values()).reduce((s, n) => s + n, 0);
  if (firstSize === 0) return 0;
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const otherBag = counter(tokens(samples[i]!));
    let hits = 0;
    for (const [tok, count] of firstBag) {
      const otherCount = otherBag.get(tok) ?? 0;
      hits += Math.min(count, otherCount);
    }
    total += hits / firstSize;
  }
  return total / (samples.length - 1);
}
