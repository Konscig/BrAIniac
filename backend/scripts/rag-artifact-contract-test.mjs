import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const backendRoot = path.resolve(scriptDir, '..');
const tmpRootBase = path.join(backendRoot, '.tmp');
await mkdir(tmpRootBase, { recursive: true });
const tempRoot = await mkdtemp(path.join(tmpRootBase, 'rag-artifact-contract-'));

process.env.EXECUTOR_DOCUMENT_LOADER_ROOT = tempRoot;
process.env.EXECUTOR_ARTIFACT_STORE_DIR = path.join(tempRoot, '.artifacts');
process.env.EXECUTOR_ARTIFACT_INLINE_MAX_ITEMS = '1';
process.env.EXECUTOR_ARTIFACT_INLINE_MAX_BYTES = '256';
process.env.EXECUTOR_ARTIFACT_PREVIEW_ITEMS = '2';

const documentLoaderModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/document-loader.tool.ts')).href
);
const embedderModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/embedder.tool.ts')).href
);
const vectorUpsertModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/vector-upsert.tool.ts')).href
);
const hybridRetrieverModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/hybrid-retriever.tool.ts')).href
);
const manifestModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/tool/contracts/tool-artifact.manifest.ts')).href
);
const artifactStoreModule = await import(
  pathToFileURL(path.join(backendRoot, 'src/services/application/pipeline/pipeline.executor.artifact-store.ts')).href
);

const { resolveDocumentLoaderContractInput, documentLoaderToolContractDefinition } = documentLoaderModule;
const { resolveEmbedderContractInput, embedderToolContractDefinition } = embedderModule;
const { resolveVectorUpsertContractInput, vectorUpsertToolContractDefinition } = vectorUpsertModule;
const { resolveHybridRetrieverContractInput, hybridRetrieverToolContractDefinition } = hybridRetrieverModule;
const { buildInlineArtifactManifest, listArtifactManifestItems } = manifestModule;
const { externalizeNodeStateArtifacts } = artifactStoreModule;

function log(message) {
  console.log(`[rag-artifacts] ${message}`);
}

async function writeFixture(relativePath, contents) {
  const absolutePath = path.join(tempRoot, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, contents, 'utf8');
  return absolutePath;
}

async function testDocumentLoaderLocalText() {
  await writeFixture('docs/notes.txt', 'RAG agent must choose tools by edges only.\nArtifacts may live outside DB JSON.');

  const input = resolveDocumentLoaderContractInput([], {
    dataset: null,
    input_json: {
      uris: ['workspace://docs/notes.txt'],
    },
  });

  const output = await documentLoaderToolContractDefinition.buildHttpSuccessOutput({
    input,
    status: 200,
    response: { ok: true },
  });

  assert.equal(output.document_count, 1);
  assert.equal(output.documents[0].source, 'local-file');
  assert.match(output.documents[0].text, /choose tools by edges only/i);

  const manifestItems = listArtifactManifestItems(output.documents_manifest, ['documents']);
  assert.equal(manifestItems.length, 1);
  assert.equal(manifestItems[0].document_id, output.documents[0].document_id);

  log('DocumentLoader reads workspace:// text files into documents_manifest');
}

async function testDocumentLoaderJsonBundle() {
  await writeFixture(
    'docs/bundle.json',
    JSON.stringify(
      {
        documents: [
          { document_id: 'alpha', title: 'Alpha', text: 'Alpha chunk source text.' },
          { document_id: 'beta', title: 'Beta', content: 'Beta content body.' },
        ],
      },
      null,
      2,
    ),
  );

  const input = resolveDocumentLoaderContractInput([], {
    dataset: null,
    input_json: {
      uris: ['workspace://docs/bundle.json'],
    },
  });

  const output = await documentLoaderToolContractDefinition.buildHttpSuccessOutput({
    input,
    status: 200,
    response: { ok: true },
  });

  assert.equal(output.document_count, 2);
  assert.deepEqual(
    output.documents.map((entry) => entry.document_id),
    ['alpha', 'beta'],
  );
  assert.equal(listArtifactManifestItems(output.documents_manifest, ['documents']).length, 2);

  log('DocumentLoader reads JSON document bundles into documents_manifest');
}

async function testExternalBlobRoundTrip() {
  const chunks = [
    { chunk_id: 'c1', text: 'First chunk', document_id: 'alpha' },
    { chunk_id: 'c2', text: 'Second chunk', document_id: 'alpha' },
    { chunk_id: 'c3', text: 'Third chunk', document_id: 'beta' },
  ];

  const nodeState = {
    output_json: {
      chunks_manifest: buildInlineArtifactManifest('chunks', chunks, {
        source: 'rag-artifact-contract-test',
      }),
    },
  };

  const externalized = await externalizeNodeStateArtifacts(nodeState, {
    executionId: `artifact-test-${Date.now()}-${process.pid}`,
    nodeId: 42,
    section: 'node-output',
  });

  const manifest = externalized.output_json.chunks_manifest;
  assert.equal(manifest.storage_mode, 'external-blob');
  assert.equal(manifest.pointer.kind, 'local-file');
  assert.equal(manifest.preview_items.length, 2);

  const pointerAbsolutePath = path.resolve(process.cwd(), manifest.pointer.path);
  const pointerPayload = JSON.parse(await readFile(pointerAbsolutePath, 'utf8'));
  assert.equal(pointerPayload.kind, 'artifact_blob');
  assert.equal(pointerPayload.item_count, chunks.length);

  const restoredChunks = listArtifactManifestItems(manifest, ['chunks']);
  assert.deepEqual(restoredChunks, chunks);

  log('external-blob manifests round-trip through local-file pointers');
}

async function testArtifactBackedRetrieverPath() {
  const chunksManifest = buildInlineArtifactManifest('chunks', [
    {
      chunk_id: 'chunk_policy',
      document_id: 'doc_policy',
      text: 'The RAG agent gets tools only from graph edges and should not read hidden node catalogs.',
    },
    {
      chunk_id: 'chunk_misc',
      document_id: 'doc_misc',
      text: 'Billing statements and payment windows are managed by another subsystem.',
    },
  ]);

  const embedderInput = resolveEmbedderContractInput(
    [{ contract_output: { chunks_manifest: chunksManifest } }],
    { dataset: null, input_json: { vector_size: 6 } },
  );
  const embedderOutput = await embedderToolContractDefinition.buildHttpSuccessOutput({
    input: embedderInput,
    status: 200,
    response: { ok: true },
  });

  const vectorUpsertInput = resolveVectorUpsertContractInput(
    [{ contract_output: embedderOutput }],
    { dataset: null, input_json: { index_name: 'knowledge_idx', namespace: 'tenant_rag' } },
  );
  const vectorUpsertOutput = await vectorUpsertToolContractDefinition.buildHttpSuccessOutput({
    input: vectorUpsertInput,
    status: 200,
    response: { ok: true },
  });

  const persistedNodeState = await externalizeNodeStateArtifacts(
    { output_json: { contract_output: vectorUpsertOutput } },
    {
      executionId: `artifact-test-${Date.now()}-${process.pid}-retrieval`,
      nodeId: 77,
      section: 'node-output',
    },
  );

  const persistedManifest = persistedNodeState.output_json.contract_output.vectors_manifest;
  assert.equal(persistedManifest.storage_mode, 'external-blob');

  const retrieverInput = resolveHybridRetrieverContractInput(
    [persistedNodeState.output_json],
    {
      dataset: null,
      input_json: {
        retrieval_query: 'How does the agent get tools for RAG retrieval?',
        top_k: 2,
        mode: 'hybrid',
        alpha: 0.4,
      },
    },
  );
  const retrieverOutput = await hybridRetrieverToolContractDefinition.buildHttpSuccessOutput({
    input: retrieverInput,
    status: 200,
    response: { ok: true },
  });

  assert.equal(retrieverOutput.retrieval_source, 'artifact-vectors');
  assert.equal(retrieverOutput.candidates[0].chunk_id, 'chunk_policy');
  assert.match(retrieverOutput.candidates[0].snippet, /tools only from graph edges/i);
  assert.equal(listArtifactManifestItems(retrieverOutput.candidates_manifest, ['retrieval_candidates']).length, 2);

  log('HybridRetriever ranks persisted vector artifacts through external-blob pointers');
}

try {
  log(`temp root: ${path.relative(process.cwd(), tempRoot).replace(/\\/g, '/') || '.'}`);
  await testDocumentLoaderLocalText();
  await testDocumentLoaderJsonBundle();
  await testExternalBlobRoundTrip();
  await testArtifactBackedRetrieverPath();
  log('SUCCESS');
} catch (error) {
  console.error('[rag-artifacts] FAIL:', error instanceof Error ? error.stack ?? error.message : error);
  process.exitCode = 1;
} finally {
  if (tempRoot.startsWith(path.resolve(tmpRootBase) + path.sep)) {
    await rm(tempRoot, { recursive: true, force: true });
  }
}
