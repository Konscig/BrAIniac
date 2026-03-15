import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function scalar(sql) {
  const rows = await prisma.$queryRawUnsafe(sql);
  return Number(rows?.[0]?.count ?? 0);
}

async function expectZero(label, sql) {
  const count = await scalar(sql);
  console.log(`${label}: ${count}`);
  if (count !== 0) {
    throw new Error(`${label} expected 0 but got ${count}`);
  }
}

async function run() {
  console.log('DB invariant checks started');

  await expectZero(
    'orphan projects',
    'SELECT COUNT(*)::int AS count FROM "Project" p LEFT JOIN "User" u ON p."fk_user_id" = u."user_id" WHERE u."user_id" IS NULL'
  );

  await expectZero(
    'orphan pipelines',
    'SELECT COUNT(*)::int AS count FROM "Pipeline" p LEFT JOIN "Project" pr ON p."fk_project_id" = pr."project_id" WHERE pr."project_id" IS NULL'
  );

  await expectZero(
    'orphan datasets',
    'SELECT COUNT(*)::int AS count FROM "Dataset" d LEFT JOIN "Pipeline" p ON d."fk_pipeline_id" = p."pipeline_id" WHERE p."pipeline_id" IS NULL'
  );

  await expectZero(
    'orphan nodes by pipeline',
    'SELECT COUNT(*)::int AS count FROM "Node" n LEFT JOIN "Pipeline" p ON n."fk_pipeline_id" = p."pipeline_id" WHERE p."pipeline_id" IS NULL'
  );

  await expectZero(
    'orphan nodes by nodeType',
    'SELECT COUNT(*)::int AS count FROM "Node" n LEFT JOIN "NodeType" nt ON n."fk_type_id" = nt."type_id" WHERE nt."type_id" IS NULL'
  );

  await expectZero(
    'self-loop edges',
    'SELECT COUNT(*)::int AS count FROM "Edge" e WHERE e."fk_from_node" = e."fk_to_node"'
  );

  await expectZero(
    'cross-pipeline edges',
    'SELECT COUNT(*)::int AS count FROM "Edge" e JOIN "Node" nf ON e."fk_from_node" = nf."node_id" JOIN "Node" nt ON e."fk_to_node" = nt."node_id" WHERE nf."fk_pipeline_id" <> nt."fk_pipeline_id"'
  );

  await expectZero(
    'duplicate edges',
    'SELECT COUNT(*)::int AS count FROM (SELECT "fk_from_node", "fk_to_node", COUNT(*) AS c FROM "Edge" GROUP BY 1,2 HAVING COUNT(*) > 1) t'
  );

  console.log('DB invariant checks passed');
}

run()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
