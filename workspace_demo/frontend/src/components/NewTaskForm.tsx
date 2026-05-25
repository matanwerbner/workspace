import { useState } from 'react';

interface Props {
  onAdd: (title: string) => Promise<void> | void;
}

export function NewTaskForm({ onAdd }: Props) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = value.trim();
    if (!title) return;
    setBusy(true);
    try {
      await onAdd(title);
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="new-task" onSubmit={submit}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What needs doing?"
        disabled={busy}
      />
      <button type="submit" disabled={busy || !value.trim()}>
        Add
      </button>
    </form>
  );
}
