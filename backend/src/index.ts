import express from 'express';
import userRouter from './routes/user.routes.js';
import projectRouter from './routes/project.routes.js';
import refreshTokenRouter from './routes/refresh_token.routes.js';
import agentRouter from './routes/agent.routes.js';
import datasetRouter from './routes/dataset.routes.js';
import documentRouter from './routes/document.routes.js';
import nodeRouter from './routes/node.routes.js';
import edgeRouter from './routes/edge.routes.js';
import exportRouter from './routes/export.routes.js';
import metricRouter from './routes/metric.routes.js';
import toolRouter from './routes/tool.routes.js';
import pipelineRouter from './routes/pipeline.routes.js';
import pipelineVersionRouter from './routes/pipeline_version.routes.js';
import runRouter from './routes/run.routes.js';
import runTaskRouter from './routes/run_task.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/users', userRouter);
app.use('/projects', projectRouter);
app.use('/refresh-tokens', refreshTokenRouter);
app.use('/agents', agentRouter);
app.use('/datasets', datasetRouter);
app.use('/documents', documentRouter);
app.use('/nodes', nodeRouter);
app.use('/edges', edgeRouter);
app.use('/exports', exportRouter);
app.use('/metrics', metricRouter);
app.use('/tools', toolRouter);
app.use('/pipelines', pipelineRouter);
app.use('/pipeline-versions', pipelineVersionRouter);
app.use('/runs', runRouter);
app.use('/run-tasks', runTaskRouter);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});