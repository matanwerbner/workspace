import { Router } from 'express';
import {
  createTask,
  deleteTask,
  getTask,
  listTasks,
  toggleTask,
} from '../models/task';

export const tasksRouter = Router();

tasksRouter.get('/', (_req, res) => {
  res.json(listTasks());
});

tasksRouter.post('/', (req, res) => {
  const title = typeof req.body?.title === 'string' ? req.body.title.trim() : '';
  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }
  res.status(201).json(createTask(title));
});

tasksRouter.post('/:id/toggle', (req, res) => {
  const task = toggleTask(req.params.id);
  if (!task) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  res.json(task);
});

tasksRouter.delete('/:id', (req, res) => {
  const existing = getTask(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'not found' });
    return;
  }
  deleteTask(req.params.id);
  res.status(204).end();
});
