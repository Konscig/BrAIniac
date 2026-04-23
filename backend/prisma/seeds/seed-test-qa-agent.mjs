#!/usr/bin/env node
/**
 * Засевает тестовый Q&A пайплайн для smoke-тестов судьи.
 * Pipeline: DatasetInput → PromptBuilder → LLMCall → SaveResult
 * Dataset: 3 вопроса с эталонными ответами (GoldAnnotation).
 */
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const USER_EMAIL = 'judge-smoke@brainiac.test';

const QA_ITEMS = [
  {
    key: 'q001',
    input: { question: 'Какая столица Франции?' },
    agentAnswer: 'Столица Франции — Париж.',
    reference: 'Париж',
  },
  {
    key: 'q002',
    input: { question: 'Кто написал "Войну и мир"?' },
    agentAnswer: 'Лев Толстой написал "Войну и мир".',
    reference: 'Лев Толстой',
  },
  {
    key: 'q003',
    input: { question: 'Чему равно число Пи?' },
    agentAnswer: 'Число Пи приблизительно равно 3.14159.',
    reference: '3.14159',
  },
];

async function main() {
  // 1. Найти пользователя
  const user = await prisma.user.findUniqueOrThrow({ where: { email: USER_EMAIL } });
  console.log(`[seed] user: ${user.email} (id=${user.user_id})`);

  // 2. Создать проект (или взять существующий)
  let project = await prisma.project.findFirst({ where: { fk_user_id: user.user_id } });
  if (!project) {
    project = await prisma.project.create({
      data: { fk_user_id: user.user_id, name: 'Judge Smoke Project', description: 'Авто-созданный для тестов судьи' },
    });
  }
  console.log(`[seed] project: ${project.name} (id=${project.project_id})`);

  // 3. Создать пайплайн
  let pipeline = await prisma.pipeline.findFirst({ where: { fk_project_id: project.project_id, name: 'QA Agent v1' } });
  if (!pipeline) {
    pipeline = await prisma.pipeline.create({
      data: {
        fk_project_id: project.project_id,
        name: 'QA Agent v1',
        max_time: 30000,
        max_cost: 100,
        max_reject: 0.5,
      },
    });
  }
  console.log(`[seed] pipeline: ${pipeline.name} (id=${pipeline.pipeline_id})`);

  // 4. Получить нужные node_type_id
  const nt = Object.fromEntries(
    (await prisma.nodeType.findMany({ where: { name: { in: ['DatasetInput', 'PromptBuilder', 'LLMCall', 'SaveResult'] } } }))
      .map(t => [t.name.trim(), t.type_id]),
  );
  console.log('[seed] node types:', nt);

  // 5. Создать узлы (идемпотентно — удалить старые если есть)
  const existingNodes = await prisma.node.findMany({ where: { fk_pipeline_id: pipeline.pipeline_id } });
  if (existingNodes.length > 0) {
    await prisma.edge.deleteMany({ where: { from_node: { fk_pipeline_id: pipeline.pipeline_id } } });
    await prisma.node.deleteMany({ where: { fk_pipeline_id: pipeline.pipeline_id } });
  }

  const uiBase = { x: 0, y: 0, width: 200, height: 60 };
  const nodeData = [
    { fk_type_id: nt['DatasetInput'], top_k: 1, ui_json: { ...uiBase, x: 100, label: 'DatasetInput' }, output_json: { role: 'source' } },
    { fk_type_id: nt['PromptBuilder'], top_k: 1, ui_json: { ...uiBase, x: 400, label: 'PromptBuilder' }, output_json: { role: 'transform', prompt_template: 'Answer: {{question}}' } },
    { fk_type_id: nt['LLMCall'],       top_k: 1, ui_json: { ...uiBase, x: 700, label: 'LLMCall' },       output_json: { role: 'transform', model: 'ministral-3b-2410' } },
    { fk_type_id: nt['SaveResult'],    top_k: 1, ui_json: { ...uiBase, x: 1000, label: 'SaveResult' },   output_json: { role: 'sink' } },
  ];

  const nodes = [];
  for (const nd of nodeData) {
    const n = await prisma.node.create({ data: { fk_pipeline_id: pipeline.pipeline_id, ...nd } });
    nodes.push(n);
  }
  console.log(`[seed] nodes created: ${nodes.map(n => n.node_id).join(' → ')}`);

  // 6. Создать рёбра
  for (let i = 0; i < nodes.length - 1; i++) {
    await prisma.edge.create({ data: { fk_from_node: nodes[i].node_id, fk_to_node: nodes[i + 1].node_id } });
  }
  console.log('[seed] edges: OK');

  // 7. Создать датасет (1 пайплайн → 1 датасет, unique constraint)
  let dataset = await prisma.dataset.findUnique({ where: { fk_pipeline_id: pipeline.pipeline_id } });
  if (!dataset) {
    dataset = await prisma.dataset.create({
      data: {
        fk_pipeline_id: pipeline.pipeline_id,
        desc: 'Тестовые Q&A вопросы для судьи',
        uri: `local://judge-smoke/qa-v1/${pipeline.pipeline_id}`,
      },
    });
  }
  console.log(`[seed] dataset id=${dataset.dataset_id}`);

  // 8. Создать документы + GoldAnnotation (эталонные ответы)
  for (const item of QA_ITEMS) {
    let doc = await prisma.document.findFirst({
      where: { fk_dataset_id: dataset.dataset_id, item_key: item.key },
    });
    if (!doc) {
      doc = await prisma.document.create({
        data: {
          fk_dataset_id: dataset.dataset_id,
          item_key: item.key,
          input_json: {
            ...item.input,
            agent_output: {
              text: item.agentAnswer,
              structured_output: null,
              tool_call_trace: [],
            },
          },
          metadata_json: { source: 'smoke-seed' },
        },
      });
    }

    // Проверяем есть ли уже gold annotation
    const existing = await prisma.goldAnnotation.findFirst({
      where: { fk_document_id: doc.document_id, annotation_type: 'answer', current: true },
    });
    if (!existing) {
      await prisma.goldAnnotation.create({
        data: {
          fk_document_id: doc.document_id,
          annotation_type: 'answer',
          payload_json: { text: item.reference },
          version: 1,
          current: true,
          fk_author_user_id: user.user_id,
        },
      });
    }
  }
  console.log(`[seed] documents + gold annotations: ${QA_ITEMS.length} items`);

  console.log('\n[seed] DONE. Используй в тестах:');
  console.log(`  JUDGE_TEST_PIPELINE_ID=${pipeline.pipeline_id}`);
  console.log(`  JUDGE_TEST_DATASET_ID=${dataset.dataset_id}`);
}

main()
  .catch(err => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
