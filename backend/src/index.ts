import express from 'express';
import cors from 'cors';
import cluster from 'node:cluster';
import os from 'node:os';
import { config as loadEnv } from 'dotenv';
import userRouter from './routes/resources/user/user.routes.js';
import projectRouter from './routes/resources/project/project.routes.js';
import authRouter from './routes/resources/auth/auth.routes.js';
import datasetRouter from './routes/resources/dataset/dataset.routes.js';
import nodeRouter from './routes/resources/node/node.routes.js';
import edgeRouter from './routes/resources/edge/edge.routes.js';
import toolRouter from './routes/resources/tool/tool.routes.js';
import pipelineRouter from './routes/resources/pipeline/pipeline.routes.js';
import nodeTypeRouter from './routes/resources/node_type/node_type.routes.js';
import judgeRouter from './routes/resources/judge/judge.routes.js';
import runtimeHealthRouter from './routes/runtime/runtime-health.routes.js';
import { isHttpError } from './common/http-error.js';
import { getOpenRouterConfig } from './services/core/openrouter/openrouter.config.js';
import { resolveToolContractDefinition } from './services/application/tool/contracts/index.js';
import { mountBrainiacMcpTransport } from './mcp/mcp.transport.js';
import { requireAuth } from './middleware/auth.middleware.js';
import { acquireHeavyToolQueueSlot } from './runtime/queue/heavy-tool.queue.js';

loadEnv({ path: process.env.ENV_FILE ?? '.env' });
if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY) {
  loadEnv({ path: '../.env' });
}

const PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_WORKERS = Math.max(1, os.cpus().length);
const CONFIGURED_WORKERS = Number(process.env.HTTP_WORKERS ?? DEFAULT_WORKERS);
const ENABLE_CLUSTER = (process.env.HTTP_ENABLE_CLUSTER ?? 'true').toLowerCase() !== 'false';
const SHOULD_FORK = ENABLE_CLUSTER && CONFIGURED_WORKERS > 1;
// Default 64mb (раньше было 12mb): VectorUpsert при 512 чанках × 2048-dim
// embedding получает payload ~12-15MB; на дефолте 12mb body-parser рубил
// запрос с PayloadTooLargeError. Override через HTTP_JSON_LIMIT env.
const JSON_BODY_LIMIT = (process.env.HTTP_JSON_LIMIT ?? '64mb').trim();

let httpServerRef: ReturnType<express.Express['listen']> | null = null;

function createApp() {
  const app = express();
  const openRouterConfig = getOpenRouterConfig();

  if (!openRouterConfig.enabled) {
    console.warn('[config] OPENROUTER_API_KEY is not set: LLMCall nodes will fail until configured');
  }

  app.use(express.json({ limit: JSON_BODY_LIMIT }));

  // CORS configuration
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    // Docker-compose: FRONTEND_PORT defaults to 3270 (frontend container)
    'http://localhost:3270',
    'http://127.0.0.1:3270'
  ];
  const parsedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  const allowedOrigins = parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  const corsOptions = {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow non-browser tools
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS: origin not allowed'));
    },
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization','x-idempotency-key'],
  } satisfies cors.CorsOptions;

  app.use(cors(corsOptions));
  // Express 5 no longer accepts '*' in path-to-regexp; use a regex to match all paths
  app.options(/.*/, cors(corsOptions));

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/runtime', runtimeHealthRouter);
  mountBrainiacMcpTransport(app);

  // FIFO semaphore с bounded queue: ограничивает одновременную обработку
  // heavy contract-ов (VectorUpsert/Embedder/Chunker) и отбивает DoS-флуд
  // (queue cap + waiter timeout). NB: семафор per-worker, при cluster=true
  // эффективный cap = HEAVY_CONCURRENCY × workers.
  const HEAVY_CONCURRENCY = Math.max(1, Number(process.env.JUDGE_TOOL_EXECUTOR_HEAVY_LIMIT ?? '2'));
  const HEAVY_QUEUE_LIMIT = Math.max(1, Number(process.env.JUDGE_TOOL_EXECUTOR_HEAVY_QUEUE_LIMIT ?? '32'));
  const HEAVY_WAIT_TIMEOUT_MS = Math.max(1000, Number(process.env.JUDGE_TOOL_EXECUTOR_HEAVY_WAIT_MS ?? '60000'));
  const HEAVY_CONTRACTS = new Set(['VectorUpsert', 'Embedder', 'Chunker']);
  type HeavyWaiter = { resolve: () => void; reject: (err: Error) => void; timer: NodeJS.Timeout };
  let heavyInFlight = 0;
  const heavyQueue: HeavyWaiter[] = [];
  const heavyAcquire = (): Promise<void> => new Promise<void>((resolve, reject) => {
    if (heavyInFlight < HEAVY_CONCURRENCY) {
      heavyInFlight += 1;
      resolve();
      return;
    }
    if (heavyQueue.length >= HEAVY_QUEUE_LIMIT) {
      const err = new Error('heavy contract queue overflow');
      (err as any).code = 'EXECUTOR_TOOLNODE_BUSY';
      (err as any).status = 503;
      reject(err);
      return;
    }
    const timer = setTimeout(() => {
      const idx = heavyQueue.findIndex((w) => w.timer === timer);
      if (idx >= 0) heavyQueue.splice(idx, 1);
      const err = new Error('heavy contract acquire timed out');
      (err as any).code = 'EXECUTOR_TOOLNODE_BUSY';
      (err as any).status = 503;
      reject(err);
    }, HEAVY_WAIT_TIMEOUT_MS);
    heavyQueue.push({ resolve, reject, timer });
  });
  const heavyRelease = (): void => {
    const next = heavyQueue.shift();
    if (next) {
      clearTimeout(next.timer);
      // counter не уменьшаем — слот сразу занят следующим
      next.resolve();
    } else {
      heavyInFlight = Math.max(0, heavyInFlight - 1);
    }
  };

  app.post('/tool-executor/contracts', requireAuth, async (req, res) => {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};
    const tool = payload.tool && typeof payload.tool === 'object' ? payload.tool : {};
    const contract = payload.contract && typeof payload.contract === 'object' ? payload.contract : {};
    const input = payload.input && typeof payload.input === 'object' ? payload.input : {};
    const contractInput =
      input.contract_input && typeof input.contract_input === 'object' ? input.contract_input : input.input_json ?? null;

    const requestedToolName = typeof tool.name === 'string' ? tool.name.trim() : '';
    const requestedContractName = typeof contract.name === 'string' ? contract.name.trim() : '';
    const resolvedContractName = requestedContractName || requestedToolName;
    const resolvedContractDefinition = resolvedContractName ? resolveToolContractDefinition(resolvedContractName) : undefined;

    const isHeavy = resolvedContractDefinition?.name
      ? HEAVY_CONTRACTS.has(resolvedContractDefinition.name)
      : HEAVY_CONTRACTS.has(resolvedContractName);
    let heavyLease: { release: () => Promise<void> } | null = null;
    if (isHeavy) {
      try {
        heavyLease = await acquireHeavyToolQueueSlot((req as any).user?.user_id);
      } catch (err: any) {
        return res.status(err?.status ?? 503).json({
          ok: false,
          code: err?.code ?? 'EXECUTOR_TOOLNODE_BUSY',
          error: err?.message ?? 'tool executor busy',
        });
      }
    }

    // try/finally гарантирует heavyRelease на всех путях — даже если
    // res.json кинет на закрытом сокете или builder бросит синхронно.
    try {
      let contractOutput: Record<string, any> | null = null;
      if (
        resolvedContractDefinition?.buildHttpSuccessOutput &&
        contractInput &&
        typeof contractInput === 'object' &&
        !Array.isArray(contractInput)
      ) {
        try {
          contractOutput = await resolvedContractDefinition.buildHttpSuccessOutput({
            input: contractInput as Record<string, any>,
            status: 200,
            response: null,
          });
        } catch (error) {
          if (isHttpError(error)) {
            return res.status(error.status).json({
              ok: false,
              executor: 'backend-contract-http-json',
              tool_name: requestedToolName || null,
              contract_name: (resolvedContractDefinition?.name ?? resolvedContractName) || null,
              ...error.body,
            });
          }
          return res.status(500).json({
            ok: false,
            executor: 'backend-contract-http-json',
            tool_name: requestedToolName || null,
            contract_name: (resolvedContractDefinition?.name ?? resolvedContractName) || null,
            error: error instanceof Error ? error.message : 'contract output builder failed',
          });
        }
      }

      res.json({
        ok: true,
        executor: 'backend-contract-http-json',
        tool_name: requestedToolName || null,
        contract_name: (resolvedContractDefinition?.name ?? resolvedContractName) || null,
        received_at: new Date().toISOString(),
        contract_output_source: contractOutput ? 'backend-tool-executor' : null,
        ...(contractOutput ? { contract_output: contractOutput } : {}),
        input_preview:
          contractInput && typeof contractInput === 'object'
            ? Object.keys(contractInput).slice(0, 24)
            : typeof contractInput === 'string'
            ? contractInput.slice(0, 256)
            : contractInput,
      });
    } finally {
      if (isHeavy) await heavyLease?.release();
    }
  });

  app.use('/users', userRouter);
  app.use('/auth', authRouter);
  app.use('/projects', projectRouter);
  app.use('/datasets', datasetRouter);
  app.use('/nodes', nodeRouter);
  app.use('/edges', edgeRouter);
  app.use('/tools', toolRouter);
  app.use('/node-types', nodeTypeRouter);
  app.use('/pipelines', pipelineRouter);
  app.use('/judge', judgeRouter);

  return app;
}

if (SHOULD_FORK && cluster.isPrimary) {
  console.log(`[master ${process.pid}] starting ${CONFIGURED_WORKERS} workers for port ${PORT}`);
  for (let i = 0; i < CONFIGURED_WORKERS; i += 1) {
    cluster.fork();
  }

  cluster.on('exit', (worker, code, signal) => {
    console.warn(`[master ${process.pid}] worker ${worker.process.pid} exited (code=${code}, signal=${signal}). Restarting...`);
    cluster.fork();
  });
} else {
  const app = createApp();
  httpServerRef = app.listen(PORT, "0.0.0.0", () => {
    console.log(`[worker ${process.pid}] server started on port ${PORT}`);
  });
}
