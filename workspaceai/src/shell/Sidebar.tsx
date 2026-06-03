import { useEffect, useRef, useState } from 'react';
import {
  selectActiveViewId,
  selectActiveWorkspace,
  selectViews,
  useAppStore,
} from '../state/store';
import { getViewType } from '../views/registry';
import { AddViewModal } from './AddViewModal';
import { api } from '../ipc/client';
import { OrbitLogo } from '../components/OrbitLogo';

export function Sidebar() {
  const views = useAppStore(selectViews);
  const activeViewId = useAppStore(selectActiveViewId);
  const setActiveView = useAppStore((s) => s.setActiveView);
  const removeView = useAppStore((s) => s.removeView);
  const renameView = useAppStore((s) => s.renameView);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);
  const workspaces = useAppStore((s) => s.workspaces);
  const activeWorkspace = useAppStore(selectActiveWorkspace);
  const switchWorkspace = useAppStore((s) => s.switchWorkspace);
  const createWorkspace = useAppStore((s) => s.createWorkspace);
  const renameWorkspace = useAppStore((s) => s.renameWorkspace);
  const duplicateWorkspace = useAppStore((s) => s.duplicateWorkspace);
  const deleteWorkspace = useAppStore((s) => s.deleteWorkspace);
  const exportActiveWorkspace = useAppStore((s) => s.exportActiveWorkspace);
  const importWorkspace = useAppStore((s) => s.importWorkspace);
  const importMissingPaths = useAppStore((s) => s.lastImportMissingPaths);
  const clearImportMissingPaths = useAppStore((s) => s.clearImportMissingPaths);
  const [showAdd, setShowAdd] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [renamingWorkspace, setRenamingWorkspace] = useState(false);
  const [workspaceRenameValue, setWorkspaceRenameValue] = useState('');
  const workspaceRenameInputRef = useRef<HTMLInputElement>(null);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false);
  const workspaceMenuRef = useRef<HTMLDivElement>(null);

  // Close workspace menu on outside click
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (!workspaceMenuRef.current?.contains(e.target as Node)) {
        setWorkspaceMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [workspaceMenuOpen]);

  // ⌘N shortcut to open Add View modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        setShowAdd(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (renamingId !== null) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (renamingWorkspace) {
      workspaceRenameInputRef.current?.focus();
      workspaceRenameInputRef.current?.select();
    }
  }, [renamingWorkspace]);

  const startWorkspaceRename = () => {
    if (!activeWorkspace) return;
    setWorkspaceRenameValue(activeWorkspace.name);
    setRenamingWorkspace(true);
  };

  const commitWorkspaceRename = () => {
    if (activeWorkspace && workspaceRenameValue.trim()) {
      renameWorkspace(activeWorkspace.id, workspaceRenameValue.trim());
    }
    setRenamingWorkspace(false);
  };

  const cancelWorkspaceRename = () => setRenamingWorkspace(false);

  const onCreateWorkspace = () => {
    setWorkspaceMenuOpen(false);
    const name = `Workspace ${workspaces.length + 1}`;
    api.workspaceInitHomeFolder(name).then((homeFolder) => {
      createWorkspace(name, homeFolder ?? undefined);
    }).catch((err: unknown) => {
      console.error('Failed to create workspace:', err);
    });
  };

  const onDeleteWorkspace = async () => {
    if (!activeWorkspace) return;
    const ok = await api.confirm(`Delete workspace "${activeWorkspace.name}"? This cannot be undone.`);
    if (ok) deleteWorkspace(activeWorkspace.id);
  };

  const startRename = (id: string, currentName: string) => {
    setRenamingId(id);
    setRenameValue(currentName);
  };

  const commitRename = () => {
    if (renamingId && renameValue.trim()) {
      renameView(renamingId, renameValue.trim());
    }
    setRenamingId(null);
  };

  const cancelRename = () => setRenamingId(null);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="app-brand">
          <OrbitLogo className="app-logo" />
          <span className="app-title">Orbit</span>
        </div>
        <div className="sidebar-header-actions">
          <button
            className="btn-icon"
            onClick={() => setShowAdd(true)}
            title="Add view (⌘N)"
            aria-label="Add view"
          >
            +
          </button>
          <button
            className="btn-icon"
            onClick={() => setSettingsOpen(true)}
            title="Settings (⌘,)"
            aria-label="Settings"
          >
            ⚙
          </button>
        </div>
      </div>
      <div className="workspace-switcher">
        {renamingWorkspace ? (
          <input
            ref={workspaceRenameInputRef}
            className="workspace-rename-input"
            value={workspaceRenameValue}
            onChange={(e) => setWorkspaceRenameValue(e.target.value)}
            onBlur={commitWorkspaceRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitWorkspaceRename();
              if (e.key === 'Escape') cancelWorkspaceRename();
            }}
          />
        ) : (
          <select
            className="workspace-select"
            value={activeWorkspace?.id ?? ''}
            onChange={(e) => switchWorkspace(e.target.value)}
            disabled={workspaces.length === 0}
            aria-label="Active workspace"
          >
            {workspaces.length === 0 && <option value="">No workspaces</option>}
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
        <div className="workspace-menu-wrap" ref={workspaceMenuRef}>
          <button
            className="btn-icon btn-sm"
            onClick={() => setWorkspaceMenuOpen((v) => !v)}
            title="Workspace actions"
            aria-label="Workspace actions"
          >
            ···
          </button>
          {workspaceMenuOpen && (
            <div className="workspace-menu">
              <button
                className="workspace-menu-item"
                onClick={onCreateWorkspace}
              >
                <span className="workspace-menu-item-icon">+</span>
                New workspace
              </button>
              <button
                className="workspace-menu-item"
                onClick={() => { startWorkspaceRename(); setWorkspaceMenuOpen(false); }}
                disabled={!activeWorkspace}
              >
                <span className="workspace-menu-item-icon">✎</span>
                Rename
              </button>
              <button
                className="workspace-menu-item"
                onClick={() => { activeWorkspace && duplicateWorkspace(activeWorkspace.id); setWorkspaceMenuOpen(false); }}
                disabled={!activeWorkspace}
              >
                <span className="workspace-menu-item-icon">⧉</span>
                Duplicate
              </button>
              <div className="workspace-menu-separator" />
              <button
                className="workspace-menu-item"
                onClick={() => { void exportActiveWorkspace(); setWorkspaceMenuOpen(false); }}
                disabled={!activeWorkspace}
              >
                <span className="workspace-menu-item-icon">↓</span>
                Export
              </button>
              <button
                className="workspace-menu-item"
                onClick={() => { void importWorkspace(); setWorkspaceMenuOpen(false); }}
              >
                <span className="workspace-menu-item-icon">↑</span>
                Import
              </button>
              <div className="workspace-menu-separator" />
              <button
                className="workspace-menu-item danger"
                onClick={() => { void onDeleteWorkspace(); setWorkspaceMenuOpen(false); }}
                disabled={!activeWorkspace}
              >
                <span className="workspace-menu-item-icon">🗑</span>
                Delete workspace
              </button>
            </div>
          )}
        </div>
      </div>
      {importMissingPaths.length > 0 && (
        <div className="import-warning">
          <div className="import-warning-text">
            Imported workspace references {importMissingPaths.length} path
            {importMissingPaths.length === 1 ? '' : 's'} that don't exist on this machine:
            <ul className="import-warning-list">
              {importMissingPaths.slice(0, 5).map((p) => (
                <li key={p} title={p}>
                  {p}
                </li>
              ))}
              {importMissingPaths.length > 5 && <li>…and {importMissingPaths.length - 5} more</li>}
            </ul>
          </div>
          <button
            className="btn-ghost btn-sm"
            onClick={clearImportMissingPaths}
            aria-label="Dismiss"
          >
            Dismiss
          </button>
        </div>
      )}
      <nav className="sidebar-nav">
        {views.length === 0 && (
          <div className="sidebar-empty muted">
            No views yet.
            <br />
            Click <strong>+</strong> or press <strong>⌘N</strong>.
          </div>
        )}
        {views.map((v) => {
          const def = getViewType(v.typeId);
          const isActive = v.id === activeViewId;
          const isRenaming = renamingId === v.id;

          return (
            <div
              key={v.id}
              className={`nav-item${isActive ? ' active' : ''}`}
              onClick={() => !isRenaming && setActiveView(v.id)}
              onDoubleClick={() => !isRenaming && startRename(v.id, v.name)}
            >
              <span className="nav-icon">{def?.icon ?? '·'}</span>
              {isRenaming ? (
                <input
                  ref={renameInputRef}
                  className="nav-rename-input"
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={commitRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                    e.stopPropagation();
                  }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span className="nav-label" title={v.name}>
                  {v.name}
                </span>
              )}
              {!isRenaming && (
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
              )}
            </div>
          );
        })}
        <button
          className="nav-add-hint"
          onClick={() => setShowAdd(true)}
          title="Add view (⌘N)"
          aria-label="Add view"
        >
          <span className="nav-add-hint-icon">+</span>
          <span className="nav-add-hint-label">Add view</span>
          <span className="nav-add-hint-kb">⌘N</span>
        </button>
      </nav>
      {showAdd && <AddViewModal onClose={() => setShowAdd(false)} />}
    </aside>
  );
}
