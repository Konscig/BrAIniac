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

function tokens(text: string): string[] {
  return text.toLowerCase().replace(/[^\wа-яёa-z0-9]/gi, ' ').split(/\s+/).filter(Boolean);
}

function exactMatch(item: AssessItem): number {
  const pred = item.agent_output.text.trim().toLowerCase();
  const ref  = item.reference?.answer?.trim().toLowerCase() ?? '';
  return pred === ref ? 1 : 0;
}

function tokenF1(item: AssessItem): number {
  const pred = new Set(tokens(item.agent_output.text));
  const ref  = new Set(tokens(item.reference?.answer ?? ''));
  if (!pred.size || !ref.size) return 0;
  let tp = 0;
  for (const t of pred) if (ref.has(t)) tp++;
  const p = tp / pred.size;
  const r = tp / ref.size;
  return p + r === 0 ? 0 : 2 * p * r / (p + r);
}

function citationF1(item: AssessItem): number {
  const text  = item.agent_output.text;
  const refs  = item.reference?.relevant_docs ?? [];
  if (!refs.length) return 1;
  const cited = refs.filter(id => text.includes(String(id)));
  return cited.length / refs.length;
}

function recallAtK(item: AssessItem): number {
  const out   = item.agent_output as any;
  const retrieved: string[] = out.retrieved_ids ?? [];
  const relevant  = item.reference?.relevant_docs ?? [];
  if (!relevant.length) return 1;
  const hits = retrieved.filter(id => relevant.includes(id));
  return hits.length / relevant.length;
}

function ndcgAtK(item: AssessItem): number {
  const out   = item.agent_output as any;
  const retrieved: string[] = out.retrieved_ids ?? [];
  const relevant  = item.reference?.relevant_docs ?? [];
  if (!relevant.length) return 1;
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
  const trace  = item.agent_output.tool_call_trace ?? [];
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) return 1;
  const refTools = new Set(refTraj.map((s: any) => s.tool));
  const usedTools = new Set(trace.map((s: any) => s.tool));
  let hits = 0;
  for (const t of refTools) if (usedTools.has(t)) hits++;
  return hits / refTools.size;
}

function parameterF1(item: AssessItem): number {
  const trace = item.agent_output.tool_call_trace ?? [];
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) return trace.length === 0 ? 1 : 0;
  let scores = 0;
  const n = Math.min(trace.length, refTraj.length);
  for (let i = 0; i < n; i++) {
    const pKeys = Object.keys(trace[i]?.params ?? {});
    const rKeys = Object.keys(refTraj[i]?.params ?? {});
    if (!pKeys.length && !rKeys.length) { scores++; continue; }
    const pSet = new Set(pKeys), rSet = new Set(rKeys);
    let tp = 0;
    for (const k of pSet) if (rSet.has(k)) tp++;
    const p = tp / pSet.size, r = tp / rSet.size;
    scores += p + r === 0 ? 0 : 2 * p * r / (p + r);
  }
  return n === 0 ? 0 : scores / n;
}

function toolCallSuccess(item: AssessItem): number {
  const trace = item.agent_output.tool_call_trace ?? [];
  if (!trace.length) return 1;
  const ok = trace.filter((s: any) => s.success !== false).length;
  return ok / trace.length;
}

function trajectoryIoU(item: AssessItem): number {
  const trace  = item.agent_output.tool_call_trace ?? [];
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) return 1;
  const predSet = new Set(trace.map((s: any) => s.tool));
  const refSet  = new Set(refTraj.map((s: any) => s.tool));
  let inter = 0;
  for (const t of predSet) if (refSet.has(t)) inter++;
  const union = new Set([...predSet, ...refSet]).size;
  return union === 0 ? 1 : inter / union;
}

function planEfficiency(item: AssessItem): number {
  const trace  = item.agent_output.tool_call_trace ?? [];
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) return 1;
  return refTraj.length === 0 ? 1 : Math.min(1, refTraj.length / Math.max(1, trace.length));
}

function nodeCoverage(item: AssessItem): number {
  const trace  = item.agent_output.tool_call_trace ?? [];
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  if (!refTraj.length) return 1;
  const visited = new Set(trace.map((s: any) => s.tool));
  const required = new Set(refTraj.map((s: any) => s.tool));
  let covered = 0;
  for (const t of required) if (visited.has(t)) covered++;
  return covered / required.size;
}

function schemaValidity(item: AssessItem): number {
  const schema = item.input.expected_schema ?? item.input.output_schema;
  const output = item.agent_output.structured_output;
  if (!schema || !output) return 0;
  // Упрощённая проверка: required поля присутствуют
  const required: string[] = schema.required ?? [];
  const ok = required.every((k: string) => k in output);
  return ok ? 1 : 0;
}

function fieldF1(item: AssessItem): number {
  const pred = item.agent_output.structured_output ?? {};
  const ref  = item.reference?.answer ? JSON.parse(item.reference.answer) : {};
  const pKeys = new Set(Object.keys(pred));
  const rKeys = new Set(Object.keys(ref));
  if (!pKeys.size && !rKeys.size) return 1;
  let tp = 0;
  for (const k of pKeys) if (rKeys.has(k)) tp++;
  const p = tp / pKeys.size, r = tp / rKeys.size;
  return p + r === 0 ? 0 : 2 * p * r / (p + r);
}

function treeDist(item: AssessItem): number {
  // Упрощённая версия: нормализованное расстояние по числу ключей
  const pred = item.agent_output.structured_output ?? {};
  const ref  = item.reference?.answer ? (() => { try { return JSON.parse(item.reference!.answer!); } catch { return {}; } })() : {};
  const pSize = Object.keys(pred).length;
  const rSize = Object.keys(ref).length;
  if (pSize === 0 && rSize === 0) return 0;
  const diff = Math.abs(pSize - rSize);
  return 1 - diff / Math.max(pSize, rSize, 1);
}

function loopTerm(item: AssessItem): number {
  const out = item.agent_output as any;
  // 1 если агент завершился, 0 если превысил лимит итераций
  return out.loop_terminated === false ? 0 : 1;
}

function loopBudget(item: AssessItem): number {
  const out  = item.agent_output as any;
  const used = out.loop_iterations ?? 0;
  const max  = item.input.max_iterations ?? out.loop_budget ?? used;
  return max === 0 ? 1 : Math.min(1, 1 - (used - 1) / Math.max(max, 1));
}

function loopConv(item: AssessItem): number {
  const out = item.agent_output as any;
  return out.loop_converged === true ? 1 : 0;
}

function retryEfficacy(item: AssessItem): number {
  const trace = item.agent_output.tool_call_trace ?? [];
  const retries = trace.filter((s: any) => s.retry === true).length;
  const succAfterRetry = trace.filter((s: any) => s.retry === true && s.success !== false).length;
  return retries === 0 ? 1 : succAfterRetry / retries;
}

function checkEval(item: AssessItem): number {
  return tokenF1(item);
}

function selfConsistency(item: AssessItem): number {
  const out = item.agent_output as any;
  const samples: string[] = out.consistency_samples ?? [];
  if (samples.length < 2) return 1;
  const first = tokens(samples[0]!);
  let total = 0;
  for (let i = 1; i < samples.length; i++) {
    const other = new Set(tokens(samples[i]!));
    let hits = 0;
    for (const t of first) if (other.has(t)) hits++;
    total += first.length === 0 ? 0 : hits / first.length;
  }
  return total / (samples.length - 1);
}
