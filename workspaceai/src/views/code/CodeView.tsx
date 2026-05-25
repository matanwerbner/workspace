import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../../ipc/client';
import type { ViewInstance } from '../types';
import type { CodeViewConfig } from './types';
import { FileTree } from './FileTree';
import { MonacoHost, detectLanguage } from './MonacoHost';

interface OpenFile {
  path: string;
  name: string;
  content: string;
  dirty: boolean;
}

export function CodeView({ instance }: { instance: ViewInstance<CodeViewConfig> }) {
  const rootPath = instance.config.rootPath;
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [openFile, setOpenFile] = useState<OpenFile | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const requestedPathRef = useRef<string | null>(null);
  const openFileRef = useRef<OpenFile | null>(null);
  openFileRef.current = openFile;

  const onSelect = useCallback(
    async (path: string) => {
      const current = openFileRef.current;
      if (current && current.dirty && current.path !== path) {
        const ok = await api.confirm(
          `"${current.name}" has unsaved changes. Discard and open another file?`,
        );
        if (!ok) return;
      }
      requestedPathRef.current = path;
      setSelectedPath(path);
      setLoadError(null);
      try {
        const [content, name] = await Promise.all([
          api.readFile(path, rootPath),
          api.basename(path),
        ]);
        if (requestedPathRef.current !== path) return;
        setOpenFile({ path, name, content, dirty: false });
      } catch (e) {
        if (requestedPathRef.current !== path) return;
        setOpenFile(null);
        setLoadError(e instanceof Error ? e.message : String(e));
      }
    },
    [rootPath],
  );

  const onChange = useCallback((next: string) => {
    setOpenFile((f) => (f ? { ...f, content: next, dirty: true } : f));
  }, []);

  const save = useCallback(async () => {
    const file = openFileRef.current;
    if (!file || !file.dirty) return;
    setSaving(true);
    try {
      await api.writeFile(file.path, file.content, rootPath);
      setOpenFile((f) => (f && f.path === file.path ? { ...f, dirty: false } : f));
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [rootPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  return (
    <div className="code-view">
      <div className="code-view-sidebar">
        <div className="code-view-sidebar-header">
          <span className="muted">workspace</span>
          <span className="path-label" title={rootPath}>
            {rootPath.split('/').pop()}
          </span>
        </div>
        <FileTree
          rootPath={rootPath}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      </div>
      <div className="code-view-editor">
        <div className="code-view-tab-bar">
          {openFile ? (
            <span className="tab">
              {openFile.name}
              {openFile.dirty && <span className="dirty-dot"> ●</span>}
            </span>
          ) : (
            <span className="muted">No file open</span>
          )}
          {openFile && (
            <button className="btn-ghost" onClick={save} disabled={!openFile.dirty || saving}>
              {saving ? 'Saving…' : 'Save (⌘S)'}
            </button>
          )}
        </div>
        {loadError && <div className="error-banner">{loadError}</div>}
        {openFile ? (
          <MonacoHost
            value={openFile.content}
            language={detectLanguage(openFile.name)}
            onChange={onChange}
          />
        ) : (
          <div className="empty-editor muted">
            Select a file from the tree to start editing.
          </div>
        )}
      </div>
    </div>
  );
}
