import { registerView } from '../registry';
import { api } from '../../ipc/client';
import { PdfView } from './PdfView';
import type { PdfViewConfig } from './types';

registerView<PdfViewConfig>({
  typeId: 'pdf',
  label: 'Document View',
  description: 'Open a PDF document.',
  icon: <span className="view-type-icon">📄</span>,
  createConfig: async () => {
    const filePath = await api.pickFile([{ name: 'PDF', extensions: ['pdf'] }]);
    if (!filePath) return null;
    const name = (await api.basename(filePath)) || filePath;
    return { name, config: { filePath } };
  },
  Component: PdfView,
});
