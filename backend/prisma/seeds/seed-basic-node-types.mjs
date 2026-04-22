import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TOOL_NAME = 'mvp-core-nodes';
const TOOL_CONFIG = {
  family: 'builtin',
  catalog: 'mvp-node-catalog',
  version: 2,
  profilePreset: 'production-v1',
};

const ROLE_COMPATIBILITY = {
  source: {
    allowedPredecessorRoles: ['any'],
    allowedSuccessorRoles: ['transform', 'control', 'sink'],
  },
  transform: {
    allowedPredecessorRoles: ['source', 'transform', 'control'],
    allowedSuccessorRoles: ['transform', 'control', 'sink'],
  },
  control: {
    allowedPredecessorRoles: ['source', 'transform', 'control'],
    allowedSuccessorRoles: ['transform', 'control', 'sink'],
  },
  sink: {
    allowedPredecessorRoles: ['source', 'transform', 'control'],
    allowedSuccessorRoles: ['sink'],
  },
};

function baseProfile(role, inputMin, inputMax, outputMin, outputMax, extra = {}) {
  return {
    role,
    input: { min: inputMin, max: inputMax },
    output: { min: outputMin, max: outputMax },
    ...ROLE_COMPATIBILITY[role],
    enforcementMode: 'strict',
    profilePreset: 'production-v1',
    ...extra,
  };
}

const CATALOG = [
  {
    name: 'Trigger',
    desc: 'Pipeline start by event, schedule, or manual run.',
    config_json: baseProfile('source', 0, 0, 1, 3),
  },
  {
    name: 'DatasetInput',
    desc: 'Read input dataset or document collection.',
    config_json: baseProfile('source', 0, 0, 1, 3),
  },
  {
    name: 'ManualInput',
    desc: 'Collect user-provided parameters or prompt text.',
    config_json: baseProfile('source', 0, 0, 1, 2),
  },
  {
    name: 'PromptBuilder',
    desc: 'Build prompt payload from templates and fields.',
    config_json: baseProfile('transform', 1, 5, 1, 2),
  },
  {
    name: 'LLMCall',
    desc: 'Call LLM/model endpoint for inference.',
    config_json: baseProfile('transform', 1, 3, 1, 2),
  },
  {
    name: 'AgentCall',
    desc: 'Run bounded internal agent runtime with tool calls.',
    config_json: baseProfile('transform', 1, 20, 0, 2, {
      agent: {
        enabled: true,
        maxAttempts: 3,
        maxToolCalls: 8,
        maxCandidates: 16,
        maxTimeMs: 20000,
        maxCostUsd: 0.5,
        maxTokens: 12000,
      },
    }),
  },
  {
    name: 'Parser',
    desc: 'Parse and normalize model/tool output.',
    config_json: baseProfile('transform', 1, 4, 1, 3),
  },
  {
    name: 'Filter',
    desc: 'Apply filtering rules to records or candidates.',
    config_json: baseProfile('transform', 1, 3, 1, 2),
  },
  {
    name: 'Ranker',
    desc: 'Rank answer or document candidates.',
    config_json: baseProfile('transform', 1, 5, 1, 2),
  },
  {
    name: 'ToolNode',
    desc: 'Use a tool as an explicit graph node.',
    config_json: baseProfile('transform', 0, 8, 0, 8, {
      tool: {
        bindingRequired: true,
      },
    }),
  },
  {
    name: 'Branch',
    desc: 'Split flow based on condition evaluation.',
    config_json: baseProfile('control', 1, 1, 2, 5),
  },
  {
    name: 'Merge',
    desc: 'Merge multiple branches into a single stream.',
    config_json: baseProfile('control', 2, 8, 1, 2),
  },
  {
    name: 'RetryGate',
    desc: 'Control retry and failure behavior for loop-backs.',
    config_json: baseProfile('control', 1, 2, 1, 2, {
      loop: {
        enabled: true,
        maxIterations: 3,
        onLimit: 'break',
      },
    }),
  },
  {
    name: 'LoopGate',
    desc: 'Explicit while/until loop controller.',
    config_json: baseProfile('control', 1, 2, 1, 2, {
      loop: {
        enabled: true,
        maxIterations: 10,
        onLimit: 'break',
      },
    }),
  },
  {
    name: 'SaveResult',
    desc: 'Persist result into database or storage.',
    config_json: baseProfile('sink', 1, 10, 0, 0),
  },
  {
    name: 'Notify',
    desc: 'Send webhook or notification about result.',
    config_json: baseProfile('sink', 1, 10, 0, 0),
  },
  {
    name: 'Export',
    desc: 'Export result to external format/system.',
    config_json: baseProfile('sink', 1, 10, 0, 0),
  },
];

async function ensureTool() {
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
    return { tool: updated, created: false };
  }

  const created = await prisma.tool.create({
    data: {
      name: TOOL_NAME,
      config_json: TOOL_CONFIG,
    },
  });

  return { tool: created, created: true };
}

async function upsertNodeType(toolId, entry) {
  const sameName = await prisma.nodeType.findMany({
    where: {
      fk_tool_id: toolId,
      name: entry.name,
    },
    orderBy: {
      type_id: 'asc',
    },
  });

  if (sameName.length > 1) {
    console.warn(
      `[warn] duplicate node types for ${entry.name} (tool_id=${toolId}), ids=${sameName
        .map((row) => row.type_id)
        .join(', ')}`,
    );
  }

  if (sameName.length > 0) {
    const target = sameName[0];
    await prisma.nodeType.update({
      where: { type_id: target.type_id },
      data: {
        desc: entry.desc,
        config_json: entry.config_json,
      },
    });
    return 'updated';
  }

  await prisma.nodeType.create({
    data: {
      fk_tool_id: toolId,
      name: entry.name,
      desc: entry.desc,
      config_json: entry.config_json,
    },
  });

  return 'created';
}

async function main() {
  const { tool, created } = await ensureTool();

  let createdCount = 0;
  let updatedCount = 0;

  for (const entry of CATALOG) {
    const action = await upsertNodeType(tool.tool_id, entry);
    if (action === 'created') createdCount += 1;
    if (action === 'updated') updatedCount += 1;
  }

  console.log('[seed-basic-node-types] done');
  console.log(`tool: ${TOOL_NAME} (tool_id=${tool.tool_id}, ${created ? 'created' : 'updated'})`);
  console.log(`node_types: created=${createdCount}, updated=${updatedCount}, total_catalog=${CATALOG.length}`);
}

main()
  .catch((err) => {
    console.error('[seed-basic-node-types] failed', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
