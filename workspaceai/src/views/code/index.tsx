import { registerView } from '../registry';
import { api } from '../../ipc/client';
import { CodeView } from './CodeView';
import type { CodeViewConfig } from './types';

registerView<CodeViewConfig>({
  typeId: 'code',
  label: 'Code View',
  description: 'Open a folder and edit files with Monaco.',
  icon: <span className="view-type-icon">⟨/⟩</span>,
  createConfig: async () => {
    const folder = await api.pickFolder();
    if (!folder) return null;
    const name = (await api.basename(folder)) || folder;
    return { name, config: { rootPath: folder } };
  },
  Component: CodeView,
});
