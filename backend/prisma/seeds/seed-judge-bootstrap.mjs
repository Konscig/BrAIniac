/**
 * seed-judge-bootstrap.mjs
 *
 * Создаёт два тестовых пайплайна для демонстрации работы ИИ-судьи:
 *   - "Judge Demo — Bad QA Agent"  (ожидаемый verdict: fail)
 *   - "Judge Demo — Good QA Agent" (ожидаемый verdict: improvement/pass)
 *
 * Использование: npm run seed:judge-bootstrap
 * Предварительно: npm run seed:basic-types (нужны NodeType записи)
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function findOrCreateUser() {
  let user = await prisma.user.findFirst({ where: { email: 'judge-bootstrap@brainiac.local' } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: 'judge-bootstrap@brainiac.local',
        username: 'judge-bootstrap',
        password_hash: '$2b$10$placeholder_not_for_login',
      },
    });
    console.log(`  created user  id=${user.user_id}`);
  }
  return user;
}

async function findOrCreateProject(userId) {
  let project = await prisma.project.findFirst({
    where: { fk_user_id: userId, name: 'Judge Bootstrap Demo' },
  });
  if (!project) {
    project = await prisma.project.create({
      data: { name: 'Judge Bootstrap Demo', fk_user_id: userId },
    });
    console.log(`  created project id=${project.project_id}`);
  }
  return project;
}

async function getLLMCallNodeTypeId() {
  const nt = await prisma.nodeType.findFirst({ where: { name: { contains: 'LLMCall' } } });
  if (!nt) throw new Error('NodeType "LLMCall" not found — run seed:basic-types first');
  return nt.node_type_id;
}

async function createPipeline(projectId, name, nodeTypeId, description) {
  const existing = await prisma.pipeline.findFirst({
    where: { fk_project_id: projectId, name },
  });
  if (existing) {
    console.log(`  pipeline "${name}" already exists (id=${existing.pipeline_id}), skipping`);
    return existing;
  }

  const pipeline = await prisma.pipeline.create({
    data: { name, fk_project_id: projectId, description },
  });

  await prisma.node.create({
    data: {
      fk_pipeline_id: pipeline.pipeline_id,
      fk_node_type_id: nodeTypeId,
      name: 'QA LLMCall',
      position_x: 100,
      position_y: 100,
      input_json: { question: '{{input.question}}' },
    },
  });

  console.log(`  created pipeline "${name}" id=${pipeline.pipeline_id}`);
  return pipeline;
}

async function main() {
  console.log('judge-bootstrap seed starting…');

  const user = await findOrCreateUser();
  const project = await findOrCreateProject(user.user_id);
  const nodeTypeId = await getLLMCallNodeTypeId();

  await createPipeline(
    project.project_id,
    'Judge Demo — Bad QA Agent',
    nodeTypeId,
    'Тестовый пайплайн с намеренно плохими ответами агента. Используется для демонстрации работы ИИ-судьи (ожидаемый результат: fail).',
  );

  await createPipeline(
    project.project_id,
    'Judge Demo — Good QA Agent',
    nodeTypeId,
    'Тестовый пайплайн с качественными ответами агента. Используется для демонстрации работы ИИ-судьи (ожидаемый результат: improvement/pass).',
  );

  console.log('judge-bootstrap seed done.');
  console.log('');
  console.log('Для запуска оценки используйте POST /judge/assessments:');
  console.log('  { "pipeline_id": <id>, "weight_profile": "default", "items": [...] }');
}

main()
  .catch(err => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
