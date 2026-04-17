import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const CATALOG_VERSION = 1;

function resolveDefaultHttpUrl() {
  const rawExplicit = typeof process.env.TOOL_CONTRACT_HTTP_URL === 'string' ? process.env.TOOL_CONTRACT_HTTP_URL.trim() : '';
  if (rawExplicit) return rawExplicit;

  const rawBase = typeof process.env.BASE_URL === 'string' ? process.env.BASE_URL.trim() : '';
  if (rawBase) {
    const normalized = rawBase.replace(/\/+$/, '');
    return normalized.endsWith('/health') ? normalized : `${normalized}/health`;
  }

  return 'http://localhost:8080/health';
}

const DEFAULT_HTTP_URL = resolveDefaultHttpUrl();

const CONTRACT_TOOLS = [
  {
    name: 'DocumentLoader',
    aliases: ['documentloader', 'document-loader', 'document_loader'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Нормализует входные URI и dataset_id, формирует список документов для последующих этапов.',
  },
  {
    name: 'QueryBuilder',
    aliases: ['querybuilder', 'query-builder', 'query_builder'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Приводит пользовательский запрос к нормализованному виду и извлекает ключевые термины.',
  },
  {
    name: 'Chunker',
    aliases: ['chunker', 'text-chunker', 'text_chunker'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Разбивает документы на чанки по словесному окну с учетом размера и overlap.',
  },
  {
    name: 'Embedder',
    aliases: ['embedder', 'text-embedder', 'text_embedder'],
    allowedExecutors: ['http-json', 'openrouter-embeddings'],
    defaultExecutorKind: 'http-json',
    recommendedExecutorKind: 'openrouter-embeddings',
    descriptionRu: 'Строит векторные представления чанков; поддерживает deterministic и провайдерный режим.',
  },
  {
    name: 'VectorUpsert',
    aliases: ['vectorupsert', 'vector-upsert', 'vector_upsert'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Подготавливает и подтверждает upsert векторов в индекс с дедупликацией по vector_id.',
  },
  {
    name: 'HybridRetriever',
    aliases: ['hybridretriever', 'hybrid-retriever', 'hybrid_retriever'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Готовит кандидатов ретривала в режимах dense/sparse/hybrid и возвращает ранжированный список.',
  },
  {
    name: 'ContextAssembler',
    aliases: ['contextassembler', 'context-assembler', 'context_assembler'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Собирает context_bundle из кандидатов в пределах токен-бюджета.',
  },
  {
    name: 'LLMAnswer',
    aliases: ['llmanswer', 'llm-answer', 'llm_answer'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Формирует grounded-ответ и служебные метрики на основе контекста и шаблона промпта.',
  },
  {
    name: 'CitationFormatter',
    aliases: ['citationformatter', 'citation-formatter', 'citation_formatter'],
    allowedExecutors: ['http-json'],
    defaultExecutorKind: 'http-json',
    descriptionRu: 'Добавляет к ответу структурированные ссылки на источники и формирует cited_answer.',
  },
];

function buildCatalogConfig(entry) {
  const executor =
    entry.defaultExecutorKind === 'http-json'
      ? {
          kind: 'http-json',
          method: 'GET',
          url: DEFAULT_HTTP_URL,
        }
      : {
          kind: entry.defaultExecutorKind,
        };

  return {
    family: 'builtin-contract',
    catalog: 'mvp-tool-contracts',
    version: CATALOG_VERSION,
    description_ru: entry.descriptionRu,
    aliases: entry.aliases,
    allowed_executors: entry.allowedExecutors,
    ...(entry.recommendedExecutorKind ? { recommended_executor: entry.recommendedExecutorKind } : {}),
    contract: {
      name: entry.name,
    },
    executor,
  };
}

async function upsertContractTool(entry) {
  const existing = await prisma.tool.findUnique({ where: { name: entry.name } });
  const catalogConfig = buildCatalogConfig(entry);

  if (existing) {
    await prisma.tool.update({
      where: { name: entry.name },
      data: {
        config_json: {
          ...(existing.config_json ?? {}),
          ...catalogConfig,
        },
      },
    });

    return 'updated';
  }

  await prisma.tool.create({
    data: {
      name: entry.name,
      config_json: catalogConfig,
    },
  });

  return 'created';
}

async function main() {
  let created = 0;
  let updated = 0;

  for (const entry of CONTRACT_TOOLS) {
    const action = await upsertContractTool(entry);
    if (action === 'created') created += 1;
    if (action === 'updated') updated += 1;
  }

  console.log('[seed-tool-contracts] done');
  console.log(`contracts: created=${created}, updated=${updated}, total_catalog=${CONTRACT_TOOLS.length}`);
  console.log(`default_http_url=${DEFAULT_HTTP_URL}`);
}

main()
  .catch((err) => {
    console.error('[seed-tool-contracts] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
