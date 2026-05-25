import { useMemo, useState } from 'react';
import { getViewType, listViewTypes } from '../views/registry';
import { useAppStore } from '../state/store';
import { makeId } from '../lib/uid';

interface Props {
  onClose: () => void;
}

export function AddViewModal({ onClose }: Props) {
  const addView = useAppStore((s) => s.addView);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewTypes = useMemo(() => listViewTypes(), []);

  const onPick = async (typeId: string) => {
    setError(null);
    setBusy(typeId);
    try {
      const def = getViewType(typeId);
      if (!def) return;
      const created = await def.createConfig();
      if (!created) {
        setBusy(null);
        return;
      }
      addView({ id: makeId('v'), typeId, name: created.name, config: created.config });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Add a view</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {viewTypes.map((d) => (
            <button
              key={d.typeId}
              className="view-type-card"
              onClick={() => onPick(d.typeId)}
              disabled={busy !== null}
            >
              <div className="view-type-card-icon">{d.icon}</div>
              <div className="view-type-card-text">
                <div className="view-type-card-title">{d.label}</div>
                <div className="view-type-card-desc">{d.description}</div>
              </div>
              {busy === d.typeId && <span className="muted">…</span>}
            </button>
          ))}
          {error && <div className="error-banner">{error}</div>}
        </div>
      </div>
    </div>
  );
}
