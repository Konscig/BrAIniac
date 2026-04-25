import { stat } from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from '../../../common/http-error.js';
import type { DatasetContext } from '../pipeline/pipeline.executor.types.js';
import {
  documentLoaderToolContractDefinition,
  resolveDocumentLoaderContractInput,
} from '../tool/contracts/document-loader.tool.js';
import {
  chunkerToolContractDefinition,
  resolveChunkerContractInput,
} from '../tool/contracts/chunker.tool.js';
import {
  embedderToolContractDefinition,
  resolveEmbedderContractInput,
} from '../tool/contracts/embedder.tool.js';
import {
  resolveVectorUpsertContractInput,
  vectorUpsertToolContractDefinition,
} from '../tool/contracts/vector-upsert.tool.js';

const DEFAULT_DATASET_INDEX_DIR = '.artifacts/dataset-indexes';

function getWorkspaceRoot(): string {
  const configuredDocumentRoot =
    typeof process.env.EXECUTOR_DOCUMENT_LOADER_ROOT === 'string' ? process.env.EXECUTOR_DOCUMENT_LOADER_ROOT.trim() : '';
  if (configuredDocumentRoot) {
    return path.resolve(process.cwd(), configuredDocumentRoot);
  }

  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
}

function getDatasetIndexRoot(): string {
  const configured = typeof process.env.EXECUTOR_DATASET_INDEX_DIR === 'string' ? process.env.EXECUTOR_DATASET_INDEX_DIR.trim() : '';
  const relative = configured.length > 0 ? configured : DEFAULT_DATASET_INDEX_DIR;
  return path.resolve(process.cwd(), relative);
}

function resolveWorkspaceUriPath(uri: string): string | null {
  const raw = uri.trim();
  if (!raw.startsWith('workspace://')) return null;
  const relativePath = decodeURIComponent(raw.slice('workspace://'.length));
  if (!relativePath) return null;
  return path.resolve(getWorkspaceRoot(), relativePath);
}

async function getSourceSignature(dataset: DatasetContext): Promise<Record<string, any>> {
  const workspacePath = resolveWorkspaceUriPath(dataset.uri);
  if (!workspacePath) {
    return {
      kind: 'uri',
      uri: dataset.uri,
    };
  }

  try {
    const sourceStat = await stat(workspacePath);
    return {
      kind: 'workspace-file',
      uri: dataset.uri,
      size: sourceStat.size,
      mtime_ms: Math.floor(sourceStat.mtimeMs),
    };
  } catch (error) {
    throw new HttpError(400, {
      code: 'DATASET_INDEX_SOURCE_UNAVAILABLE',
      error: 'dataset source file is not available for indexing',
      details: {
        dataset_id: dataset.dataset_id,
        uri: dataset.uri,
        reason: error instanceof Error ? error.message : 'stat failed',
      },
    });
  }
}

async function readJsonFile<T>(absolutePath: string): Promise<T | null> {
  try {
    const { readFile } = await import('node:fs/promises');
    const text = await readFile(absolutePath, 'utf8');
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(absolutePath: string, value: Record<string, any>): Promise<void> {
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, JSON.stringify(value, null, 2), 'utf8');
}

function signaturesEqual(left: unknown, right: unknown): boolean {
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

function getDatasetIndexPath(pipelineId: number, datasetId: number): string {
  return path.join(getDatasetIndexRoot(), `pipeline-${pipelineId}`, `dataset-${datasetId}`, 'index.json');
}

async function buildDatasetArtifactIndex(pipelineId: number, dataset: DatasetContext, sourceSignature: Record<string, any>) {
  const baseContext = {
    dataset,
    input_json: {
      dataset_id: dataset.dataset_id,
      uri: dataset.uri,
      uris: [dataset.uri],
    },
  };

  const documentInput = resolveDocumentLoaderContractInput([], baseContext);
  const documentOutput = await documentLoaderToolContractDefinition.buildHttpSuccessOutput!({
    input: documentInput,
    status: 200,
    response: null,
  });

  const chunkInput = resolveChunkerContractInput([{ contract_output: documentOutput }], baseContext);
  const chunkOutput = await chunkerToolContractDefinition.buildHttpSuccessOutput!({
    input: chunkInput,
    status: 200,
    response: null,
  });

  const embedderInput = resolveEmbedderContractInput([{ contract_output: chunkOutput }], baseContext);
  const embedderOutput = await embedderToolContractDefinition.buildHttpSuccessOutput!({
    input: embedderInput,
    status: 200,
    response: null,
  });

  const vectorInput = resolveVectorUpsertContractInput([{ contract_output: embedderOutput }], baseContext);
  const vectorOutput = await vectorUpsertToolContractDefinition.buildHttpSuccessOutput!({
    input: vectorInput,
    status: 200,
    response: null,
  });

  return {
    kind: 'dataset_artifact_index',
    pipeline_id: pipelineId,
    dataset_id: dataset.dataset_id,
    dataset_uri: dataset.uri,
    built_at: new Date().toISOString(),
    source_signature: sourceSignature,
    documents_manifest: documentOutput.documents_manifest,
    chunks_manifest: chunkOutput.chunks_manifest,
    vectors_manifest: vectorOutput.vectors_manifest,
    stats: {
      document_count: documentOutput.document_count ?? 0,
      chunk_count: chunkOutput.chunk_count ?? 0,
      vector_count: embedderOutput.vector_count ?? 0,
      upserted_count: vectorOutput.upserted_count ?? 0,
    },
  };
}

export async function ensureDatasetArtifactIndex(pipelineId: number, dataset: DatasetContext | null): Promise<Record<string, any> | null> {
  if (!dataset) return null;

  const sourceSignature = await getSourceSignature(dataset);
  const indexPath = getDatasetIndexPath(pipelineId, dataset.dataset_id);
  const existing = await readJsonFile<Record<string, any>>(indexPath);
  if (existing && signaturesEqual(existing.source_signature, sourceSignature)) {
    return {
      ...existing,
      index_status: 'ready',
      index_reused: true,
    };
  }

  const next = await buildDatasetArtifactIndex(pipelineId, dataset, sourceSignature);
  await writeJsonFile(indexPath, next);

  return {
    ...next,
    index_status: 'ready',
    index_reused: false,
  };
}
