export function retrievedIdsFromOutput(output: any, topK: number): (string | number)[] {
  if (!output) return [];
  const candidates = output.retrieved_doc_ids ?? output.retrieval?.doc_ids ?? output.context_doc_ids;
  if (!Array.isArray(candidates)) return [];
  return candidates.slice(0, topK);
}

export function topKFromContext(output: any): number {
  const n = Number(output?.retrieval?.top_k ?? output?.top_k ?? 0);
  return Number.isFinite(n) && n > 0 ? n : 5;
}
