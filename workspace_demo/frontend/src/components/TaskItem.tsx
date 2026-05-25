import type { Task } from '../lib/types';

interface Props {
  task: Task;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}

export function TaskItem({ task, onToggle, onDelete }: Props) {
  return (
    <li className={`task-item ${task.completed ? 'done' : ''}`}>
      <label>
        <input
          type="checkbox"
          checked={task.completed}
          onChange={() => onToggle(task.id)}
        />
        <span>{task.title}</span>
      </label>
      <button className="btn-icon" aria-label="Delete" onClick={() => onDelete(task.id)}>
        ×
      </button>
    </li>
  );
}
