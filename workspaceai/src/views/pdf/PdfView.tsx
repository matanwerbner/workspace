import { useEffect } from 'react';
import { useAppStore } from '../../state/store';
import { api } from '../../ipc/client';
import type { ViewInstance } from '../types';
import type { PdfViewConfig } from './types';

function toDocUrl(path: string): string {
  const encoded = path
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
  // doc://_/<abs-path>. The leading "/" comes from the absolute path itself.
  return `doc://_${encoded.startsWith('/') ? '' : '/'}${encoded}`;
}

export function PdfView({ instance }: { instance: ViewInstance<PdfViewConfig> }) {
  const setViewContext = useAppStore((s) => s.setViewContext);
  const url = toDocUrl(instance.config.filePath);
  const filePath = instance.config.filePath;

  // Allow the doc:// protocol to serve this file only while the view is mounted.
  useEffect(() => {
    void api.docAllow(filePath);
    return () => {
      void api.docRevoke(filePath);
    };
  }, [filePath]);

  useEffect(() => {
    const filename = instance.config.filePath.split('/').pop() ?? instance.config.filePath;
    setViewContext(instance.id, `Viewing PDF: ${filename} (${instance.config.filePath})`);
  }, [instance.id, instance.config.filePath, setViewContext]);

  return (
    <div className="pdf-view">
      <div className="pdf-view-toolbar">
        <span className="muted">document</span>
        <span className="path-label" title={instance.config.filePath}>
          {instance.config.filePath.split('/').pop()}
        </span>
      </div>
      <div className="pdf-view-content">
        <iframe
          className="pdf-view-frame"
          src={url}
          title={instance.name}
        />
      </div>
    </div>
  );
}
