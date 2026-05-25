import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type DirEntry } from '../../ipc/client';

interface Props {
  rootPath: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

interface TreeNodeProps {
  entry: DirEntry;
  depth: number;
  rootPath: string;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function TreeNode({ entry, depth, rootPath, selectedPath, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[] | null>(null);
  const [loading, setLoading] = useState(false);
  const reqRef = useRef(0);

  const toggle = useCallback(async () => {
    if (!entry.isDirectory) {
      onSelect(entry.path);
      return;
    }
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) {
      const reqId = ++reqRef.current;
      setLoading(true);
      try {
        const list = await api.listDir(entry.path, rootPath);
        if (reqRef.current !== reqId) return;
        setChildren(list);
      } catch (e) {
        if (reqRef.current !== reqId) return;
        console.error('listDir failed', e);
        setChildren([]);
      } finally {
        if (reqRef.current === reqId) setLoading(false);
      }
    }
  }, [entry, expanded, children, rootPath, onSelect]);

  const isSelected = selectedPath === entry.path;
  const icon = entry.isDirectory ? (expanded ? '▾' : '▸') : '·';

  return (
    <div>
      <div
        className={`tree-node${isSelected ? ' selected' : ''}`}
        style={{ paddingLeft: depth * 12 + 8 }}
        onClick={toggle}
      >
        <span className="tree-icon">{icon}</span>
        <span className="tree-label">{entry.name}</span>
      </div>
      {entry.isDirectory && expanded && (
        <div>
          {loading && (
            <div className="tree-loading" style={{ paddingLeft: (depth + 1) * 12 + 8 }}>…</div>
          )}
          {children?.map((c) => (
            <TreeNode
              key={c.path}
              entry={c}
              depth={depth + 1}
              rootPath={rootPath}
              selectedPath={selectedPath}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTree({ rootPath, selectedPath, onSelect }: Props) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setEntries(null);
    setError(null);
    api
      .listDir(rootPath, rootPath)
      .then((list) => {
        if (!cancelled) setEntries(list);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [rootPath]);

  if (error) return <div className="tree-error">Error: {error}</div>;
  if (entries === null) return <div className="tree-loading">Loading…</div>;

  return (
    <div className="file-tree">
      {entries.map((e) => (
        <TreeNode
          key={e.path}
          entry={e}
          depth={0}
          rootPath={rootPath}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
