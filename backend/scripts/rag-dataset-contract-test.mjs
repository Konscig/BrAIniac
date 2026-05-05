/**
 * Smoke-test для контракта `rag-dataset` (US1 / T007).
 *
 * Проверяет:
 *   • happy path: 3 файла txt/sql/csv → корректный shape выхода
 *   • валидация на mutation-ошибки: пустой список, дубли, неверный префикс,
 *     неверное расширение, лимит количества, путь traversal
 *   • валидация на runtime-ошибки: file_not_found, size_exceeded,
 *     encoding_invalid
 *   • multi-execution reuse (FR-009): один URI читается дважды без побочных
 *     эффектов
 *
 * Запуск:
 *   cd backend
 *   node scripts/rag-dataset-contract-test.mjs
 */

import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile, chmod } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const backendRoot = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(backendRoot, '..');

// rag-corpus path resolver работает относительно cwd/repo root. Тест должен
// запускаться из backend/, чтобы getRepoRoot() вернул repoRoot.
process.chdir(backendRoot);

const corpusRoot = path.join(repoRoot, 'backend', '.artifacts', 'rag-corpus', '__test__');
await mkdir(corpusRoot, { recursive: true });

const ragDatasetModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/rag-dataset.tool.ts')).href
);

const {
  buildRagDatasetContractOutput,
  readRagDatasetUrisFromConfig,
  resolveRagDatasetContractInput,
} = ragDatasetModule;

function uri(filename) {
  return `workspace://backend/.artifacts/rag-corpus/__test__/${filename}`;
}

async function writeFixture(filename, contents, options = {}) {
  const target = path.join(corpusRoot, filename);
  await writeFile(target, contents);
  if (options.mode) await chmod(target, options.mode);
  return target;
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
  await writeFixture('manual.txt', 'Глава 1. Установка.\nГлава 2. Конфигурация.\n');
  await writeFixture('schema.sql', 'CREATE TABLE users (id INT PRIMARY KEY);\n');
  await writeFixture('users.csv', 'id,email\n1,a@b.c\n');

  const uris = [uri('manual.txt'), uri('schema.sql'), uri('users.csv')];
  const out = await buildRagDatasetContractOutput({ uris });

  assert.equal(out.dataset_id, null);
  assert.equal(out.document_count, 3);
  assert.equal(out.documents.length, 3);
  for (let i = 0; i < uris.length; i += 1) {
    assert.equal(out.documents[i].uri, uris[i], `order preserved at index ${i}`);
    assert.equal(out.documents[i].source, 'rag-corpus');
    assert.ok(typeof out.documents[i].text === 'string' && out.documents[i].text.length > 0);
  }
  assert.ok(out.documents_manifest);
  assert.equal(out.documents_manifest.kind, 'artifact_manifest');
  assert.equal(out.documents_manifest.artifact_kind, 'documents');
  console.log('  ✓ happy path: 3 files (txt/sql/csv) → correct shape');
}

async function runMultiExecutionReuse() {
  await writeFixture('reuse.txt', 'reusable corpus content');
  const uris = [uri('reuse.txt')];

  const first = await buildRagDatasetContractOutput({ uris });
  const second = await buildRagDatasetContractOutput({ uris });

  assert.equal(first.documents[0].text, second.documents[0].text);
  assert.equal(first.documents[0].uri, second.documents[0].uri);
  console.log('  ✓ FR-009: same URI читается дважды одинаково (no side effects)');
}

function expectThrowsWithCode(fn, expectedCode) {
  try {
    fn();
  } catch (err) {
    const code = err?.body?.code ?? err?.code;
    assert.equal(code, expectedCode, `expected ${expectedCode}, got ${code} (${err?.message ?? err})`);
    return;
  }
  throw new Error(`expected to throw ${expectedCode}, but did not throw`);
}

function runMutationValidation() {
  expectThrowsWithCode(() => readRagDatasetUrisFromConfig(null), 'RAG_DATASET_FILE_LIST_EMPTY');
  expectThrowsWithCode(() => readRagDatasetUrisFromConfig({ uris: [] }), 'RAG_DATASET_FILE_LIST_EMPTY');

  const tooMany = Array.from({ length: 65 }, (_, i) => uri(`f${i}.txt`));
  expectThrowsWithCode(() => readRagDatasetUrisFromConfig({ uris: tooMany }), 'RAG_DATASET_FILE_LIST_TOO_LONG');

  // URI_INVALID (wrong prefix)
  expectThrowsWithCode(
    () => readRagDatasetUrisFromConfig({ uris: ['workspace://backend/.artifacts/datasets/x.txt'] }),
    'RAG_DATASET_URI_INVALID',
  );

  // FORMAT_INVALID (wrong extension)
  expectThrowsWithCode(
    () => readRagDatasetUrisFromConfig({ uris: [uri('x.pdf')] }),
    'RAG_DATASET_FORMAT_INVALID',
  );

  // FILE_DUPLICATE
  expectThrowsWithCode(
    () => readRagDatasetUrisFromConfig({ uris: [uri('a.txt'), uri('a.txt')] }),
    'RAG_DATASET_FILE_DUPLICATE',
  );

  console.log('  ✓ mutation validation: 5 codes raised correctly');
}

async function runRuntimeValidation() {
  // FILE_NOT_FOUND
  await expectError(
    () => buildRagDatasetContractOutput({ uris: [uri('missing-file.txt')] }),
    'RAG_DATASET_FILE_NOT_FOUND',
  );

  // SIZE_EXCEEDED — создаём 1 МБ + 1 байт
  const oversize = Buffer.alloc(1_048_577, 0x41);
  await writeFixture('huge.txt', oversize);
  await expectError(
    () => buildRagDatasetContractOutput({ uris: [uri('huge.txt')] }),
    'RAG_DATASET_SIZE_EXCEEDED',
  );

  // ENCODING_INVALID — двоичный мусор в .txt
  const binary = Buffer.from([0xff, 0xfe, 0xfd, 0xfc, 0xfb, 0xfa]);
  await writeFixture('binary.txt', binary);
  await expectError(
    () => buildRagDatasetContractOutput({ uris: [uri('binary.txt')] }),
    'RAG_DATASET_ENCODING_INVALID',
  );

  console.log('  ✓ runtime validation: 3 codes raised correctly');
}

function runResolveInputBridge() {
  // resolveRagDatasetContractInput читает из context.input_json (executor pipes ui_json sem).
  const result = resolveRagDatasetContractInput([], { dataset: null, input_json: { uris: [uri('manual.txt')] } });
  assert.deepEqual(result, { uris: [uri('manual.txt')] });
  console.log('  ✓ resolveInput: читает uris из context.input_json');
}

async function main() {
  console.log('[rag-dataset-contract-test] starting…');
  try {
    await runHappyPath();
    await runMultiExecutionReuse();
    runMutationValidation();
    await runRuntimeValidation();
    runResolveInputBridge();
    console.log('[rag-dataset-contract-test] all checks passed');
  } finally {
    await rm(corpusRoot, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error('[rag-dataset-contract-test] FAILED', err);
  process.exitCode = 1;
});
