import type { Task } from './types';

const BASE = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export const fetchTasks = (): Promise<Task[]> => request<Task[]>('/tasks');

export const createTask = (title: string): Promise<Task> =>
  request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title }) });

export const toggleTask = (id: string): Promise<Task> =>
  request<Task>(`/tasks/${id}/toggle`, { method: 'POST' });

export const deleteTask = (id: string): Promise<void> =>
  request<void>(`/tasks/${id}`, { method: 'DELETE' });
