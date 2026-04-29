/**
 * Idempotent seed: регистрирует Tool `rag-dataset` и NodeType `RAGDataset`
 * в каталоге BrAIniac.
 *
 * См. specs/002-rag-dataset-tool/data-model.md → Сущности 1, 2.
 *
 * Запуск:
 *   cd backend
 *   node prisma/seeds/seed-rag-dataset-tool.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOOL_NAME = 'rag-dataset';
const NODE_TYPE_NAME = 'RAGDataset';

const RAG_DATASET_MAX_FILE_BYTES = 1_048_576;
const RAG_DATASET_MAX_FILES_PER_NODE = 64;
const RAG_DATASET_ALLOWED_EXTENSIONS = ['.txt', '.sql', '.csv'];
const RAG_CORPUS_URI_PREFIX = 'workspace://backend/.artifacts/rag-corpus/';

const TOOL_CONFIG = {
  family: 'builtin-contract',
  catalog: 'rag-corpus-source',
  version: 1,
  description_ru:
    'Подключает корпус документов (txt/sql/csv) к RAG-агенту через управляемое хранилище. Source-узел: входов нет, на выходе массив документов, совместимый с DocumentLoader → Chunker → Embedder.',
  display_name: 'RAG Dataset',
  category: 'rag',
  is_source: true,
  supported_formats: ['txt', 'sql', 'csv'],
  max_file_size_bytes: RAG_DATASET_MAX_FILE_BYTES,
  max_files_per_node: RAG_DATASET_MAX_FILES_PER_NODE,
  uri_prefix: RAG_CORPUS_URI_PREFIX,
  output_schema_version: 1,
  drop_in_compatible_with: ['DocumentLoader'],
  contract: { name: 'RAGDataset' },
  aliases: ['ragdataset', 'rag-dataset', 'rag_dataset'],
  allowed_executors: ['http-json'],
};

const NODE_TYPE_DESC = 'Источник корпуса RAG: список URI на загруженные txt/sql/csv-файлы (≤1 МБ каждый).';

const NODE_TYPE_CONFIG = {
  role: 'retrieval-source',
  icon: 'BookOpen',
  input_schema: {},
  output_schema: {
    type: 'object',
    required: ['documents', 'document_count'],
    properties: {
      dataset_id: { type: ['integer', 'null'], default: null },
      document_count: { type: 'integer', minimum: 0 },
      documents: {
        type: 'array',
        items: {
          type: 'object',
          required: ['document_id', 'uri', 'source'],
          properties: {
            document_id: { type: 'string' },
            uri: { type: 'string', format: 'uri' },
            dataset_id: { type: ['integer', 'null'] },
            text: { type: 'string' },
            title: { type: 'string' },
            source: { const: 'rag-corpus' },
          },
        },
      },
      documents_manifest: { type: 'object' },
    },
  },
  node_config_schema: {
    type: 'object',
    required: ['uris'],
    properties: {
      uris: {
        type: 'array',
        minItems: 1,
        maxItems: RAG_DATASET_MAX_FILES_PER_NODE,
        items: {
          type: 'string',
          pattern: `^workspace://backend/\\.artifacts/rag-corpus/.+\\.(txt|sql|csv)$`,
        },
      },
      description: { type: 'string', maxLength: 512 },
    },
  },
  // Подсказки валидатору графа: source-узел без входов, любое число выходов.
  ranges: {
    input: { min: 0, max: 0 },
    output: { min: 0, max: 64 },
  },
};

async function upsertTool() {
  const existing = await prisma.tool.findUnique({ where: { name: TOOL_NAME } });
  if (existing) {
    const updated = await prisma.tool.update({
      where: { name: TOOL_NAME },
      data: {
        config_json: {
          ...(existing.config_json ?? {}),
          ...TOOL_CONFIG,
        },
      },
    });
    return { tool: updated, action: 'updated' };
  }

  const created = await prisma.tool.create({
    data: {
      name: TOOL_NAME,
      config_json: TOOL_CONFIG,
    },
  });
  return { tool: created, action: 'created' };
}

async function upsertNodeType(toolId) {
  const existing = await prisma.nodeType.findFirst({
    where: { fk_tool_id: toolId, name: NODE_TYPE_NAME },
    orderBy: { type_id: 'asc' },
  });

  if (existing) {
    await prisma.nodeType.update({
      where: { type_id: existing.type_id },
      data: {
        desc: NODE_TYPE_DESC,
        config_json: NODE_TYPE_CONFIG,
      },
    });
    return 'updated';
  }

  await prisma.nodeType.create({
    data: {
      fk_tool_id: toolId,
      name: NODE_TYPE_NAME,
      desc: NODE_TYPE_DESC,
      config_json: NODE_TYPE_CONFIG,
    },
  });
  return 'created';
}

async function main() {
  console.log('[seed-rag-dataset-tool] starting…');

  const { tool, action: toolAction } = await upsertTool();
  console.log(`  tool: ${TOOL_NAME} (tool_id=${tool.tool_id}, ${toolAction})`);

  const nodeTypeAction = await upsertNodeType(tool.tool_id);
  console.log(`  node_type: ${NODE_TYPE_NAME} (${nodeTypeAction})`);

  console.log('[seed-rag-dataset-tool] done');
}

main()
  .catch((err) => {
    console.error('[seed-rag-dataset-tool] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
