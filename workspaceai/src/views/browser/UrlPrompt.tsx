import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';

interface Props {
  defaultValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

function UrlPrompt({ defaultValue, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(value);
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="modal-header">
          <h2>Open URL</h2>
          <button type="button" className="btn-icon" onClick={onCancel} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onCancel();
            }}
            spellCheck={false}
            placeholder="https://example.com or search query"
            style={{
              width: '100%',
              background: 'var(--bg-2)',
              color: 'var(--fg-1)',
              border: '1px solid var(--border-1)',
              borderRadius: 4,
              padding: '8px 10px',
              fontFamily: 'var(--font-mono)',
              fontSize: 13,
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
            <button type="button" className="btn-ghost" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="btn-ghost">
              Open
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export function promptForUrl(defaultValue: string): Promise<string | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);

    const cleanup = () => {
      root.unmount();
      host.remove();
    };

    root.render(
      <UrlPrompt
        defaultValue={defaultValue}
        onSubmit={(value) => {
          cleanup();
          resolve(value);
        }}
        onCancel={() => {
          cleanup();
          resolve(null);
        }}
      />,
    );
  });
}
