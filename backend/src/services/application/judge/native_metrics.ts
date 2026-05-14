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

// Snowball-стеммер русского из natural (стандарт NLP-JS): обрезает флексивные
// окончания, что для overlap-метрик (f_F1, f_EM, f_cite) эквивалентно
// лемматизации pymorphy3 в sidecar — устраняет систематическое занижение
// на флексивном языке («оформляется» vs «оформляются» → один и тот же stem).
// English-токены не трогаем (стеммер сам определяет, что не русское).
let _stemRu: ((w: string) => string) | null = null;
try {
  // dynamic require чтобы пакет был опциональным
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const natural = require('natural');
  if (natural?.PorterStemmerRu?.stem) {
    _stemRu = (w: string) => natural.PorterStemmerRu.stem(w);
  }
} catch {
  _stemRu = null;
}

const RU_TOKEN_RE = /[а-яё]/i;

function stemToken(t: string): string {
  if (_stemRu && RU_TOKEN_RE.test(t)) {
    try { return _stemRu(t); } catch { return t; }
  }
  return t;
}

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\wа-яёa-z0-9]/gi, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map(stemToken);
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
  // Цитирование считается по URL'ам и/или по id'шникам документов. Метрика —
  // recall: доля релевантных источников, упомянутых в ответе. URL может
  // присутствовать в ответе как полная строка либо как часть pageId — поэтому
  // matching через includes (substring).
  const urls = item.reference?.relevant_urls ?? [];
  const docs = item.reference?.relevant_docs ?? [];
  if (urls.length === 0 && docs.length === 0) {
    throw new MetricNotApplicable('f_cite requires reference.relevant_urls or reference.relevant_docs');
  }
  const text = item.agent_output.text;
  if (!text) return 0;
  const lowerText = text.toLowerCase();
  const candidates = [...urls, ...docs.map(String)];
  const cited = candidates.filter((c) => {
    const lc = c.toLowerCase();
    if (lowerText.includes(lc)) return true;
    // pageId из URL — попробуем извлечь и проверить
    const m = c.match(/pageId=(\d+)/);
    return Boolean(m?.[1] && lowerText.includes(m[1]));
  }).length;
  return cited / candidates.length;
}

/** Считаем chunk «релевантным», если в его id присутствует ЛЮБОЙ из эталонных
 *  идентификаторов как подстрока. Это нужно потому что RAG-tool именует чанки
 *  составным ключом вида `<pageId>_<doc_idx>_chunk_<n>`, а в эталоне обычно
 *  лежит просто pageId или исходный chunk_id из корпуса. Точное совпадение
 *  по id'ам в реальной разметке встречается редко. */
function chunkMatchesAnyRelevant(retrievedId: string, relevant: string[]): boolean {
  const lower = retrievedId.toLowerCase();
  return relevant.some((rel) => {
    if (!rel) return false;
    const r = rel.toLowerCase();
    return lower === r || lower.includes(r) || r.includes(lower);
  });
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
  // Для каждого relevant'a проверяем, нашёлся ли хоть один retrieved-id, который
  // его содержит. Это именно recall (доля найденных эталонов), а не precision.
  let hits = 0;
  for (const rel of relevant) {
    if (retrieved.some((rid) => chunkMatchesAnyRelevant(rid, [rel]))) hits += 1;
  }
  return hits / relevant.length;
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
    const rel = chunkMatchesAnyRelevant(retrieved[i]!, relevant) ? 1 : 0;
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

/** Алиасы universal-capabilities в реальные имена tools.
 *  reference.tool_trajectory приходит из augmented датасета в universal-форме (rag_search, web_search, ...)
 *  чтобы один датасет работал с разными графами. Здесь раскрываем в множество синонимов и
 *  сравниваем против trace по нормализованному ключу. */
const TOOL_ALIASES: Record<string, string[]> = {
  rag_search: ['rag', 'rag_search', 'ragdataset', 'hybridretriever', 'retriever', 'search', 'vectorsearch', 'voproshalych_rag'],
  web_search: ['web_search', 'websearch', 'duckduckgo', 'serpapi'],
  calculator: ['calculator', 'calc', 'math'],
  // 'answer' — финальная генерация LLM, не tool call. В trace его нет, поэтому
  // эти шаги при сравнении исключаем (см. canonicalRefTools/Steps).
};

const TOOL_NAMES_TO_SKIP_IN_REF = new Set(['answer', 'final_answer', 'respond']);

function normalizeToolName(name: string | undefined | null): string {
  return String(name ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function toolMatches(refName: string, predName: string): boolean {
  const refNorm = normalizeToolName(refName);
  const predNorm = normalizeToolName(predName);
  if (refNorm === predNorm) return true;
  // Если ref — universal capability, проверяем по списку алиасов
  const aliases = TOOL_ALIASES[refNorm];
  if (aliases) {
    return aliases.some((a) => normalizeToolName(a) === predNorm);
  }
  // Иначе наоборот — может быть pred это universal, а ref — конкретное имя
  for (const [, list] of Object.entries(TOOL_ALIASES)) {
    if (list.some((a) => normalizeToolName(a) === predNorm) && list.some((a) => normalizeToolName(a) === refNorm)) {
      return true;
    }
  }
  return false;
}

/** Достаём имя tool из шага trace: AgentCall пишет resolved_tool/requested_tool,
 *  LoopGate — tool, разные contracts — tool_name. Берём первое непустое. */
function stepTool(step: any): string {
  return step?.tool ?? step?.resolved_tool ?? step?.tool_name ?? step?.requested_tool ?? '';
}

/** Шаги ожидаемой trajectory без финальной генерации (она не делает tool call). */
function refTrajectorySteps(item: AssessItem): any[] {
  const refTraj: any[] = (item.reference as any)?.tool_trajectory ?? [];
  return refTraj.filter((s) => !TOOL_NAMES_TO_SKIP_IN_REF.has(normalizeToolName(s?.tool)));
}

function toolSelection(item: AssessItem): number {
  const refSteps = refTrajectorySteps(item);
  if (!refSteps.length) {
    throw new MetricNotApplicable('f_toolsel requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  const usedTools = trace.map(stepTool);
  let hits = 0;
  for (const r of refSteps) {
    if (usedTools.some((u) => toolMatches(r.tool, u))) hits += 1;
  }
  return hits / refSteps.length;
}

function parameterF1(item: AssessItem): number {
  const refSteps = refTrajectorySteps(item);
  if (!refSteps.length) {
    throw new MetricNotApplicable('f_argF1 requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  let scores = 0;
  const n = Math.min(trace.length, refSteps.length);
  if (n === 0) return 0;
  for (let i = 0; i < n; i++) {
    const pKeys = Object.keys(trace[i]?.params ?? trace[i]?.input ?? {});
    const rKeys = Object.keys(refSteps[i]?.params ?? {});
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
  const refSteps = refTrajectorySteps(item);
  if (!refSteps.length) {
    throw new MetricNotApplicable('f_trajIoU requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  const predTools = trace.map(stepTool);
  const refTools = refSteps.map((s) => s.tool);
  // Объединение групп-эквивалентности: алиасы (rag_search/HybridRetriever/...)
  // считаются одним ключом, иначе IoU зажата на 0.5 даже когда trajectory
  // полностью совпадает по семантике.
  const equivKey = (name: string): string => {
    const n = normalizeToolName(name);
    for (const [universal, aliases] of Object.entries(TOOL_ALIASES)) {
      if (aliases.some((a) => normalizeToolName(a) === n)) return universal;
    }
    return n;
  };
  const predSet = new Set(predTools.map(equivKey).filter(Boolean));
  const refSet = new Set(refTools.map(equivKey).filter(Boolean));
  let inter = 0;
  for (const r of refSet) if (predSet.has(r)) inter += 1;
  const unionSize = new Set([...predSet, ...refSet]).size;
  return unionSize === 0 ? 0 : inter / unionSize;
}

function planEfficiency(item: AssessItem): number {
  const refSteps = refTrajectorySteps(item);
  if (!refSteps.length) {
    throw new MetricNotApplicable('f_planEff requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  if (trace.length === 0) return 0;
  return Math.min(1, refSteps.length / trace.length);
}

function nodeCoverage(item: AssessItem): number {
  const refSteps = refTrajectorySteps(item);
  if (!refSteps.length) {
    throw new MetricNotApplicable('f_node_cov requires reference.tool_trajectory');
  }
  const trace = item.agent_output.tool_call_trace ?? [];
  const visited = trace.map(stepTool);
  const required = refSteps.map((s) => s.tool);
  let covered = 0;
  for (const t of required) if (visited.some((v) => toolMatches(t, v))) covered += 1;
  return required.length === 0 ? 1 : covered / required.length;
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
  // AgentCall пишет tool_calls_executed/max_tool_calls; LoopGate — loop_iterations/loop_budget.
  // Принимаем оба источника.
  const usedRaw = out.loop_iterations ?? out.tool_calls_executed;
  const maxRaw = (item.input as any)?.max_iterations ?? out.loop_budget ?? out.max_iterations ?? out.max_tool_calls;
  if (usedRaw === undefined) {
    throw new MetricNotApplicable('f_loop_budget requires agent_output.loop_iterations or tool_calls_executed');
  }
  const used = Number(usedRaw);
  const max  = Number(maxRaw ?? 0);
  if (!Number.isFinite(used) || used < 0) {
    throw new MetricNotApplicable('f_loop_budget got invalid loop_iterations');
  }
  if (!Number.isFinite(max) || max <= 0) {
    throw new MetricNotApplicable('f_loop_budget requires positive max budget');
  }
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
  // CheckEval (Lee et al. 2024): доля выполненных булевых критериев из чек-листа.
  // Простейшая native-имплементация: для каждого checklist-item проверяем
  // подстрочное вхождение ключевых слов критерия в тексте ответа. Грубо, но
  // воспроизводимо без дополнительного LLM. Реальный CheckEval делается через
  // LLM-судью — этот вариант оставим на P3 (см. ось G в каталоге).
  const checklist = item.reference?.checklist;
  if (!checklist || checklist.length === 0) {
    throw new MetricNotApplicable('f_check requires reference.checklist');
  }
  const text = item.agent_output.text?.toLowerCase() ?? '';
  if (!text) return 0;
  let satisfied = 0;
  for (const c of checklist) {
    const keyTokens = tokens(c.criterion).filter((t) => t.length >= 4);
    if (keyTokens.length === 0) continue;
    const hits = keyTokens.filter((t) => text.includes(t)).length;
    const present = hits / keyTokens.length >= 0.5;
    // expected=true → present должно быть true; expected=false → present false
    if (present === c.expected) satisfied += 1;
  }
  return satisfied / checklist.length;
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
