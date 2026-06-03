import { useEffect, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useAppStore } from '../../state/store';
import { api } from '../../ipc/client';
import type { ViewInstance } from '../types';
import type { PdfViewConfig } from './types';

// Render PDFs with pdf.js. Chromium's built-in viewer doesn't engage for our
// custom doc:// scheme and is unreliable with blob: in a sandboxed renderer, so
// we read the allow-listed bytes over IPC and rasterize each page to a canvas.
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

export function PdfView({ instance }: { instance: ViewInstance<PdfViewConfig> }) {
  const setViewContext = useAppStore((s) => s.setViewContext);
  const filePath = instance.config.filePath;
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    let pdfDoc: pdfjsLib.PDFDocumentProxy | null = null;
    setError(null);
    setLoading(true);
    const container = containerRef.current;
    if (container) container.replaceChildren();

    void (async () => {
      try {
        await api.docAllow(filePath);
        const bytes = await api.docRead(filePath);
        if (cancelled) return;
        pdfDoc = await pdfjsLib.getDocument({
          data: new Uint8Array(bytes),
          isEvalSupported: false,
        }).promise;
        if (cancelled) {
          void pdfDoc.destroy();
          return;
        }

        const dpr = window.devicePixelRatio || 1;
        const availWidth = (container?.clientWidth ?? 800) - 32;
        for (let i = 1; i <= pdfDoc.numPages; i++) {
          if (cancelled) break;
          const page = await pdfDoc.getPage(i);
          const unscaled = page.getViewport({ scale: 1 });
          const scale = Math.min(2, Math.max(0.5, availWidth / unscaled.width));
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          canvas.className = 'pdf-page';
          canvas.width = Math.floor(viewport.width * dpr);
          canvas.height = Math.floor(viewport.height * dpr);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;
          const ctx = canvas.getContext('2d');
          if (!ctx) continue;
          ctx.scale(dpr, dpr);
          containerRef.current?.appendChild(canvas);
          await page.render({ canvasContext: ctx, viewport }).promise;
          if (i === 1 && !cancelled) setLoading(false);
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      void pdfDoc?.destroy();
      void api.docRevoke(filePath);
    };
  }, [filePath]);

  useEffect(() => {
    const filename = filePath.split('/').pop() ?? filePath;
    setViewContext(instance.id, `Viewing PDF: ${filename} (${filePath})`);
  }, [instance.id, filePath, setViewContext]);

  return (
    <div className="pdf-view">
      <div className="pdf-view-toolbar">
        <span className="muted">document</span>
        <span className="path-label" title={filePath}>
          {filePath.split('/').pop()}
        </span>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {loading && !error && <div className="pdf-view-loading muted">Loading document…</div>}
      <div className="pdf-view-content" ref={containerRef} />
    </div>
  );
}
