import express from 'express';
import cors from 'cors';
import { tasksRouter } from './routes/tasks';
import { healthRouter } from './routes/health';
import { requestLogger } from './middleware/logger';
import { errorHandler } from './middleware/error';

const PORT = Number(process.env.PORT) || 4000;

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());
app.use(requestLogger);

app.use('/api/health', healthRouter);
app.use('/api/tasks', tasksRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`tasklet-backend listening on http://localhost:${PORT}`);
});
