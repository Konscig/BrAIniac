/**
 * Smoke-test для `persistRagCorpusUpload` (US2 / T015).
 *
 * Тестирует сервис напрямую, минуя Express-роут. Полный route-тест
 * требует поднятого backend и БД — он покрывается интеграционным smoke
 * (T022) и quickstart.md.
 *
 * Что проверяется:
 *   • happy path: загрузка валидного txt → URI + размер
 *   • валидация size > 1 МБ → RAG_DATASET_SIZE_EXCEEDED (HTTP 413)
 *   • валидация неверного расширения → RAG_DATASET_FORMAT_INVALID
 *   • валидация невалидной кодировки → RAG_DATASET_ENCODING_INVALID
 *   • multi-execution reuse (FR-009): прочитать загруженный URI два раза
 *
 * Запуск:
 *   cd backend
 *   node scripts/rag-corpus-upload-test.mjs
 */

import assert from 'node:assert/strict';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const backendRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(backendRoot, '..');

process.chdir(backendRoot);

const corpusOwnerToken = 'upload_test';
const ownerDir = path.join(repoRoot, 'backend', '.artifacts', 'rag-corpus', corpusOwnerToken);
await rm(ownerDir, { recursive: true, force: true }).catch(() => {});
await mkdir(ownerDir, { recursive: true });

const uploadModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/dataset/dataset.upload.service.ts')).href
);
const ragModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/rag-dataset.tool.ts')).href
);

const { persistRagCorpusUpload } = uploadModule;
const { buildRagDatasetContractOutput } = ragModule;

function b64(text) {
  return Buffer.from(text, 'utf8').toString('base64');
}

async function expectError(fn, expectedCode) {
  try {
    await fn();
  } catch (err) {
    const code = err?.body?.code ?? err?.code;
    assert.equal(code, expectedCode, `expected ${expectedCode}, got ${code} (${err?.message ?? err})`);
    return;
  }
  throw new Error(`expected to throw ${expectedCode}, but did not throw`);
}

async function runHappyPath() {
  const result = await persistRagCorpusUpload({
    filename: 'manual.txt',
    contentBase64: b64('Глава 1. Установка.\n'),
    ownerToken: corpusOwnerToken,
  });

  assert.equal(result.kind, 'rag-corpus');
  assert.equal(result.filename, 'manual.txt');
  assert.ok(result.size_bytes > 0);
  assert.match(result.uri, /^workspace:\/\/backend\/\.artifacts\/rag-corpus\/upload_test\/manual\.txt$/);
  console.log('  ✓ happy path: txt uploaded, URI returned');
  return result;
}

async function runReusePersistedUri(uploadedUri) {
  const out1 = await buildRagDatasetContractOutput({ uris: [uploadedUri] });
  const out2 = await buildRagDatasetContractOutput({ uris: [uploadedUri] });
  assert.equal(out1.documents[0].text, out2.documents[0].text);
  assert.equal(out1.documents[0].uri, uploadedUri);
  console.log('  ✓ FR-009: загруженный URI читается двумя независимыми прогонами одинаково');
}

async function runRejectionCases() {
  // SIZE_EXCEEDED
  const huge = Buffer.alloc(1_048_577, 0x61).toString('base64');
  await expectError(
    () => persistRagCorpusUpload({ filename: 'huge.txt', contentBase64: huge, ownerToken: corpusOwnerToken }),
    'RAG_DATASET_SIZE_EXCEEDED',
  );

  // FORMAT_INVALID
  await expectError(
    () =>
      persistRagCorpusUpload({
        filename: 'evil.pdf',
        contentBase64: b64('text'),
        ownerToken: corpusOwnerToken,
      }),
    'RAG_DATASET_FORMAT_INVALID',
  );

  // FILENAME_INVALID (path traversal)
  await expectError(
    () =>
      persistRagCorpusUpload({
        filename: '../escape.txt',
        contentBase64: b64('text'),
        ownerToken: corpusOwnerToken,
      }),
    'RAG_CORPUS_FILENAME_INVALID',
  );

  // ENCODING_INVALID
  const binary = Buffer.from([0xff, 0xfe, 0xfd, 0xfc]).toString('base64');
  await expectError(
    () =>
      persistRagCorpusUpload({
        filename: 'binary.txt',
        contentBase64: binary,
        ownerToken: corpusOwnerToken,
      }),
    'RAG_DATASET_ENCODING_INVALID',
  );

  // CONTENT_INVALID (empty)
  await expectError(
    () =>
      persistRagCorpusUpload({
        filename: 'empty.txt',
        contentBase64: '',
        ownerToken: corpusOwnerToken,
      }),
    'RAG_CORPUS_CONTENT_INVALID',
  );

  console.log('  ✓ rejection cases: 5 codes raised correctly');
}

async function main() {
  console.log('[rag-corpus-upload-test] starting…');
  try {
    const happy = await runHappyPath();
    await runReusePersistedUri(happy.uri);
    await runRejectionCases();
    console.log('[rag-corpus-upload-test] all checks passed');
  } finally {
    await rm(ownerDir, { recursive: true, force: true }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('[rag-corpus-upload-test] FAILED', err);
  process.exitCode = 1;
});
