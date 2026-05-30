import { useEffect, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import type { ImperativePanelHandle } from 'react-resizable-panels';
import {
  selectActiveViewId,
  selectChatViewState,
  selectViews,
  useAppStore,
} from '../state/store';
import { getViewType } from '../views/registry';
import { ChatPanel } from './ChatPanel';

export function MainPane() {
  const views = useAppStore(selectViews);
  const activeViewId = useAppStore(selectActiveViewId);
  const chatState = useAppStore((s) =>
    activeViewId ? selectChatViewState(s, activeViewId) : undefined,
  );
  const setChatCollapsed = useAppStore((s) => s.setChatCollapsed);
  const setChatSizePct = useAppStore((s) => s.setChatSizePct);
  const setSettingsOpen = useAppStore((s) => s.setSettingsOpen);

  const active = views.find((v) => v.id === activeViewId) ?? null;
  const collapsed = chatState?.collapsed ?? true;
  const sizePct = chatState?.sizePct ?? 30;

  // Lazily mount views the first time they become active, then keep them
  // mounted so terminal sessions, editor state, etc. survive tab switches.
  const [everMounted, setEverMounted] = useState<Set<string>>(
    () => new Set(activeViewId ? [activeViewId] : []),
  );
  useEffect(() => {
    if (activeViewId) {
      setEverMounted((prev) =>
        prev.has(activeViewId) ? prev : new Set([...prev, activeViewId]),
      );
    }
  }, [activeViewId]);

  const chatPanelRef = useRef<ImperativePanelHandle>(null);

  // Sync chat panel collapse state imperatively so the view panel is never
  // unmounted/remounted when the user hides or shows the AI console.
  useEffect(() => {
    const panel = chatPanelRef.current;
    if (!panel) return;
    if (!active || collapsed) {
      panel.collapse();
    } else if (panel.isCollapsed()) {
      panel.expand();
    }
  }, [active, activeViewId, collapsed]);

  // Sync window title with active view
  useEffect(() => {
    document.title = active ? `${active.name} — WorkspaceAI` : 'WorkspaceAI';
  }, [active]);

  return (
    <main className="main-pane">
      <PanelGroup
        direction="vertical"
        onLayout={(sizes) => {
          if (!activeViewId) return;
          const chatSize = sizes[1];
          if (typeof chatSize === 'number' && chatSize > 0) {
            setChatSizePct(activeViewId, chatSize);
          }
        }}
      >
        <Panel minSize={30}>
          <div className="main-view-area">
            {!active && (
              <div className="placeholder">
                <div className="placeholder-title">No view selected</div>
                <div className="placeholder-sub muted">
                  Add a view from the sidebar to get started.
                </div>
              </div>
            )}
            {views.map((v) => {
              if (!everMounted.has(v.id)) return null;
              const def = getViewType(v.typeId);
              if (!def) return null;
              return (
                <div
                  key={v.id}
                  className="view-layer"
                  hidden={v.id !== activeViewId}
                >
                  {def.render(v)}
                </div>
              );
            })}
          </div>
        </Panel>
        <PanelResizeHandle className="resize-handle-horizontal" />
        <Panel
          ref={chatPanelRef}
          collapsible
          collapsedSize={0}
          defaultSize={active && !collapsed ? sizePct : 0}
          minSize={15}
          maxSize={50}
          onCollapse={() => {
            if (activeViewId) setChatCollapsed(activeViewId, true);
          }}
          onExpand={() => {
            if (activeViewId) setChatCollapsed(activeViewId, false);
          }}
        >
          {active && (
            <ChatPanel
              viewId={active.id}
              onToggleCollapse={() => setChatCollapsed(active.id, true)}
              onOpenSettings={() => setSettingsOpen(true)}
            />
          )}
        </Panel>
      </PanelGroup>
      {active && collapsed && (
        <button
          className="chat-toggle-collapsed"
          onClick={() => setChatCollapsed(active.id, false)}
          title="Expand AI Console"
        >
          ▲ AI Console
        </button>
      )}
    </main>
  );
}
