import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { useAppStore } from '../state/store';
import { getViewType } from '../views/registry';
import { ChatPanel } from './ChatPanel';
import type { ViewInstance } from '../views/types';

function renderActiveView(active: ViewInstance | null) {
  if (!active) {
    return (
      <div className="placeholder">
        <div className="placeholder-title">No view selected</div>
        <div className="placeholder-sub muted">
          Add a view from the sidebar to get started.
        </div>
      </div>
    );
  }
  const def = getViewType(active.typeId);
  if (!def) {
    return (
      <div className="placeholder">
        <div>Unknown view type: <code>{active.typeId}</code></div>
      </div>
    );
  }
  return def.render(active);
}

export function MainPane() {
  const views = useAppStore((s) => s.views);
  const activeViewId = useAppStore((s) => s.activeViewId);
  const chatState = useAppStore((s) =>
    activeViewId ? s.chatStateByViewId[activeViewId] : undefined,
  );
  const setChatCollapsed = useAppStore((s) => s.setChatCollapsed);
  const setChatSizePct = useAppStore((s) => s.setChatSizePct);

  const active = views.find((v) => v.id === activeViewId) ?? null;
  const collapsed = chatState?.collapsed ?? false;
  const sizePct = chatState?.sizePct ?? 30;

  const viewArea = renderActiveView(active);

  return (
    <main className="main-pane">
      {collapsed || !active ? (
        <>
          <div className="main-view-area">{viewArea}</div>
          {active && (
            <button
              className="chat-toggle-collapsed"
              onClick={() => setChatCollapsed(active.id, false)}
              title="Expand AI Console"
            >
              ▲ AI Console
            </button>
          )}
        </>
      ) : (
        <PanelGroup
          key={active.id}
          direction="vertical"
          onLayout={(sizes) => {
            const chat = sizes[1];
            if (typeof chat === 'number') setChatSizePct(active.id, chat);
          }}
        >
          <Panel defaultSize={100 - sizePct} minSize={50}>
            <div className="main-view-area">{viewArea}</div>
          </Panel>
          <PanelResizeHandle className="resize-handle-horizontal" />
          <Panel defaultSize={sizePct} minSize={15} maxSize={50}>
            <ChatPanel
              viewId={active.id}
              onToggleCollapse={() => setChatCollapsed(active.id, true)}
            />
          </Panel>
        </PanelGroup>
      )}
    </main>
  );
}
