import { useState } from 'react';
import { useAppStore } from '../state/store';
import { getViewType } from '../views/registry';
import { AddViewModal } from './AddViewModal';

export function Sidebar() {
  const views = useAppStore((s) => s.views);
  const activeViewId = useAppStore((s) => s.activeViewId);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const removeView = useAppStore((s) => s.removeView);
  const [showAdd, setShowAdd] = useState(false);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <span className="app-title">WorkspaceAI</span>
        <button
          className="btn-icon"
          onClick={() => setShowAdd(true)}
          title="Add view"
          aria-label="Add view"
        >
          +
        </button>
      </div>
      <nav className="sidebar-nav">
        {views.length === 0 && (
          <div className="sidebar-empty muted">
            No views yet.
            <br />
            Click <strong>+</strong> to add one.
          </div>
        )}
        {views.map((v) => {
          const def = getViewType(v.typeId);
          const isActive = v.id === activeViewId;
          return (
            <div
              key={v.id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => setActiveView(v.id)}
            >
              <span className="nav-icon">{def?.icon ?? '·'}</span>
              <span className="nav-label">{v.name}</span>
              <button
                className="btn-close"
                onClick={(e) => {
                  e.stopPropagation();
                  removeView(v.id);
                }}
                title="Remove view"
                aria-label="Remove view"
              >
                ×
              </button>
            </div>
          );
        })}
      </nav>
      {showAdd && <AddViewModal onClose={() => setShowAdd(false)} />}
    </aside>
  );
}
