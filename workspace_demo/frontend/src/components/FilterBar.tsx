import type { Filter } from '../lib/types';

interface Props {
  filter: Filter;
  onChange: (f: Filter) => void;
}

const OPTIONS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'done', label: 'Done' },
];

export function FilterBar({ filter, onChange }: Props) {
  return (
    <div className="filter-bar" role="tablist">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={filter === o.value}
          className={filter === o.value ? 'active' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
