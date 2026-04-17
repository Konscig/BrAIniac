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
import { getOpenRouterConfig } from './services/core/openrouter/openrouter.config.js';

loadEnv({ path: process.env.ENV_FILE ?? '.env' });
if (!process.env.DATABASE_URL || !process.env.OPENROUTER_API_KEY) {
  loadEnv({ path: '../.env' });
}

const PORT = Number(process.env.PORT ?? 3000);
const DEFAULT_WORKERS = Math.max(1, os.cpus().length);
const CONFIGURED_WORKERS = Number(process.env.HTTP_WORKERS ?? DEFAULT_WORKERS);
const ENABLE_CLUSTER = (process.env.HTTP_ENABLE_CLUSTER ?? 'true').toLowerCase() !== 'false';
const SHOULD_FORK = ENABLE_CLUSTER && CONFIGURED_WORKERS > 1;

function createApp() {
  const app = express();
  const openRouterConfig = getOpenRouterConfig();

  if (!openRouterConfig.enabled) {
    console.warn('[config] OPENROUTER_API_KEY is not set: LLMCall nodes will fail until configured');
  }

  app.use(express.json());

  // CORS configuration
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  const parsedOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);
  const allowedOrigins = parsedOrigins.length > 0 ? parsedOrigins : defaultOrigins;

  app.use(cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true); // allow non-browser tools
      if (allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error('CORS: origin not allowed'));
    },
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  }));
  // Express 5 no longer accepts '*' in path-to-regexp; use a regex to match all paths
  app.options(/.*/, cors());

  app.get('/health', (req, res) => res.json({ status: 'ok' }));
  app.use('/users', userRouter);
  app.use('/auth', authRouter);
  app.use('/projects', projectRouter);
  app.use('/datasets', datasetRouter);
  app.use('/nodes', nodeRouter);
  app.use('/edges', edgeRouter);
  app.use('/tools', toolRouter);
  app.use('/node-types', nodeTypeRouter);
  app.use('/pipelines', pipelineRouter);

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
  app.listen(PORT, () => {
    console.log(`[worker ${process.pid}] server started on port ${PORT}`);
  });
}