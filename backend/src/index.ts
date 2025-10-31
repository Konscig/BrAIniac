import express from 'express';
import userRouter from './routes/user.routes.js';
import projectRouter from './routes/project.routes.js';
import refreshTokenRouter from './routes/refresh_token.routes.js';
import agentRouter from './routes/agent.routes.js';
import datasetRouter from './routes/dataset.routes.js';
import documentRouter from './routes/document.routes.js';
import nodeRouter from './routes/node.routes.js';

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

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});