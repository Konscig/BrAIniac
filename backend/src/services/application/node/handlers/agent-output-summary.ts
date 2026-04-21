import { toObjectRecord } from './node-handler.common.js';

export function summarizeAgentToolOutput(output: any): Record<string, any> {
  const record = toObjectRecord(output) ?? {};
  const out: Record<string, any> = {
    ...(typeof record.kind === 'string' ? { kind: record.kind } : {}),
    ...(typeof record.tool_name === 'string' ? { tool_name: record.tool_name } : {}),
    ...(typeof record.contract_name === 'string' ? { contract_name: record.contract_name } : {}),
    ...(typeof record.executor === 'string' ? { executor: record.executor } : {}),
    ...(typeof record.status === 'number' ? { status: record.status } : {}),
  };

  const contractOutput = toObjectRecord(record.contract_output);
  if (!contractOutput) return out;

  out.contract_output_keys = Object.keys(contractOutput).slice(0, 20);

  const scalarTextKeys = ['retrieval_source', 'storage_backend', 'provider', 'model', 'strategy'];
  for (const key of scalarTextKeys) {
    if (typeof contractOutput[key] === 'string' && contractOutput[key].trim().length > 0) {
      out[key] = contractOutput[key].trim();
    }
  }

  const scalarCountKeys = [
    'document_count',
    'chunk_count',
    'vector_count',
    'upserted_count',
    'candidate_count',
    'selected_count',
    'citation_count',
    'token_estimate',
  ];
  for (const key of scalarCountKeys) {
    const value = Number(contractOutput[key]);
    if (!Number.isFinite(value)) continue;
    out[key] = value;
  }

  const listCountKeys = ['documents', 'chunks', 'vectors', 'candidates', 'sources', 'citations', 'upsert_ids'];
  for (const key of listCountKeys) {
    const value = contractOutput[key];
    if (!Array.isArray(value)) continue;
    out[`${key}_count`] = value.length;
  }

  const manifestKeys = [
    'documents_manifest',
    'chunks_manifest',
    'vectors_manifest',
    'candidates_manifest',
    'context_bundle_manifest',
  ];
  for (const key of manifestKeys) {
    const manifest = toObjectRecord(contractOutput[key]);
    if (!manifest) continue;

    if (typeof manifest.artifact_kind === 'string' && manifest.artifact_kind.trim().length > 0) {
      out[`${key}_artifact_kind`] = manifest.artifact_kind.trim();
    }
    if (typeof manifest.storage_mode === 'string' && manifest.storage_mode.trim().length > 0) {
      out[`${key}_storage_mode`] = manifest.storage_mode.trim();
    }

    const manifestMeta = toObjectRecord(manifest.meta);
    if (typeof manifestMeta?.source === 'string' && manifestMeta.source.trim().length > 0) {
      out[`${key}_source`] = manifestMeta.source.trim();
    }
  }

  const preview =
    typeof contractOutput.cited_answer === 'string'
      ? contractOutput.cited_answer
      : typeof contractOutput.answer === 'string'
      ? contractOutput.answer
      : typeof contractOutput.text === 'string'
      ? contractOutput.text
      : typeof contractOutput.context_bundle === 'object' && contractOutput.context_bundle
      ? toObjectRecord(contractOutput.context_bundle)?.text
      : undefined;

  if (typeof preview === 'string' && preview.trim().length > 0) {
    out.preview = preview.trim().slice(0, 280);
  }

  return out;
}

export function extractAgentArtifactAnswer(inputs: any[]): string | null {
  for (const source of inputs.slice().reverse()) {
    const record = toObjectRecord(source);
    const contractOutput = toObjectRecord(record?.contract_output);
    if (!contractOutput) continue;

    const contextBundle = toObjectRecord(contractOutput.context_bundle);
    const answerCandidates = [
      contractOutput.cited_answer,
      contractOutput.answer,
      contractOutput.text,
      contextBundle?.text,
    ];

    for (const candidate of answerCandidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
  }

  return null;
}
