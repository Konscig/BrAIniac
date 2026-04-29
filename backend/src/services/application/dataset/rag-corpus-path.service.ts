/**
 * Резолвер URI хранилища RAG-корпуса.
 *
 * Разделяет namespace с golden datasets:
 *   golden:  workspace://backend/.artifacts/datasets/...
 *   corpus:  workspace://backend/.artifacts/rag-corpus/...
 *
 * Защищает от path traversal: резолвед-путь обязан лежать строго
 * под `<repo_root>/backend/.artifacts/rag-corpus/`.
 */

import path from 'node:path';
import { HttpError } from '../../../common/http-error.js';
import {
  RAG_CORPUS_STORAGE_RELATIVE_PATH,
  RAG_CORPUS_URI_PREFIX,
  RAG_DATASET_ERROR_CODES,
  RAG_DATASET_ERROR_MESSAGES,
} from '../tool/contracts/rag-dataset.constants.js';

function getRepoRoot(): string {
  const cwd = process.cwd();
  return path.basename(cwd).toLowerCase() === 'backend' ? path.resolve(cwd, '..') : cwd;
}

/** Абсолютный путь корня хранилища rag-corpus. */
export function getRagCorpusRoot(): string {
  return path.join(getRepoRoot(), RAG_CORPUS_STORAGE_RELATIVE_PATH);
}

/** Возвращает true, если URI принадлежит управляемому хранилищу rag-corpus. */
export function isRagCorpusUri(uri: unknown): boolean {
  return typeof uri === 'string' && uri.trim().startsWith(RAG_CORPUS_URI_PREFIX);
}

/**
 * Резолвит rag-corpus URI в абсолютный путь файла, гарантируя, что путь
 * не покидает `getRagCorpusRoot()` (защита от path traversal).
 *
 * Бросает `HttpError(400, RAG_DATASET_URI_INVALID)`, если URI невалиден или
 * выходит за пределы корня.
 */
export function resolveRagCorpusAbsolutePath(uri: string): string {
  const trimmed = (uri ?? '').toString().trim();
  if (!isRagCorpusUri(trimmed)) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.URI_INVALID,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.URI_INVALID],
      details: { uri: trimmed, expected_prefix: RAG_CORPUS_URI_PREFIX },
    });
  }

  const root = getRagCorpusRoot();
  const relativePath = decodeURIComponent(trimmed.slice('workspace://'.length));
  const absolute = path.resolve(getRepoRoot(), relativePath);

  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(400, {
      code: RAG_DATASET_ERROR_CODES.URI_INVALID,
      error: RAG_DATASET_ERROR_MESSAGES[RAG_DATASET_ERROR_CODES.URI_INVALID],
      details: { uri: trimmed, reason: 'path traversal outside rag-corpus root' },
    });
  }

  return absolute;
}

/** Преобразует абсолютный путь файла под rag-corpus root в стабильный URI. */
export function ragCorpusAbsolutePathToUri(absolutePath: string): string {
  const repoRoot = getRepoRoot();
  const relativePath = path.relative(repoRoot, absolutePath).replace(/\\/g, '/');
  return `workspace://${relativePath}`;
}
