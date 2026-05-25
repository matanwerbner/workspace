import { useCallback, useEffect, useState } from 'react';
import { TaskList } from './components/TaskList';
import { NewTaskForm } from './components/NewTaskForm';
import { FilterBar } from './components/FilterBar';
import { fetchTasks, createTask, toggleTask, deleteTask } from './lib/api';
import type { Filter, Task } from './lib/types';

export function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTasks(await fetchTasks());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tasks');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const onAdd = async (title: string) => {
    const created = await createTask(title);
    setTasks((prev) => [...prev, created]);
  };

  const onToggle = async (id: string) => {
    const updated = await toggleTask(id);
    setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  };

  const onDelete = async (id: string) => {
    await deleteTask(id);
    setTasks((prev) => prev.filter((t) => t.id !== id));
  };

  const visible = tasks.filter((t) => {
    if (filter === 'active') return !t.completed;
    if (filter === 'done') return t.completed;
    return true;
  });

  return (
    <main className="app">
      <header className="app-header">
        <h1>Tasklet</h1>
        <p className="muted">A tiny task list, for demo purposes.</p>
      </header>

      <NewTaskForm onAdd={onAdd} />
      <FilterBar filter={filter} onChange={setFilter} />

      {error && <div className="error">{error}</div>}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <TaskList tasks={visible} onToggle={onToggle} onDelete={onDelete} />
      )}
    </main>
  );
}
