import { randomUUID } from 'node:crypto';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  createdAt: string;
}

const tasks = new Map<string, Task>();

// Seed with a couple of entries so the demo isn't empty on first load.
function seed(): void {
  const initial: Array<Omit<Task, 'id' | 'createdAt'>> = [
    { title: 'Write the PRD', completed: true },
    { title: 'Build the UI', completed: false },
    { title: 'Ship the MVP', completed: false },
  ];
  for (const t of initial) {
    const task: Task = {
      id: randomUUID(),
      title: t.title,
      completed: t.completed,
      createdAt: new Date().toISOString(),
    };
    tasks.set(task.id, task);
  }
}
seed();

export function listTasks(): Task[] {
  return [...tasks.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function getTask(id: string): Task | undefined {
  return tasks.get(id);
}

export function createTask(title: string): Task {
  const task: Task = {
    id: randomUUID(),
    title,
    completed: false,
    createdAt: new Date().toISOString(),
  };
  tasks.set(task.id, task);
  return task;
}

export function toggleTask(id: string): Task | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;
  task.completed = !task.completed;
  return task;
}

export function deleteTask(id: string): boolean {
  return tasks.delete(id);
}
