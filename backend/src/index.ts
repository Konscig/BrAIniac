import express from 'express';
import userRouter from './routes/user.routes.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/users', userRouter);

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});