import { registerView } from '../registry';
import { api } from '../../ipc/client';
import { CodeView } from './CodeView';
import type { CodeViewConfig } from './types';

registerView<CodeViewConfig>({
  typeId: 'code',
  label: 'Code View',
<<<<<<< Updated upstream
  description: 'Open a folder and edit files with Monaco.',
  icon: <span className="view-type-icon">⟨/⟩</span>,
=======
  description: 'Open a folder in a full embedded VS Code editor (code-server).',
  icon: <span className="view-type-icon">{'</>'}</span>,
>>>>>>> Stashed changes
  createConfig: async () => {
    const folder = await api.pickFolder();
    if (!folder) return null;
    const name = (await api.basename(folder)) || folder;
    return { name, config: { rootPath: folder } };
  },
  Component: CodeView,
});
