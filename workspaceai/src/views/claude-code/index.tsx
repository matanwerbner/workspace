import { registerView } from '../registry';
import { ClaudeCodeView } from './ClaudeCodeView';
import type { ClaudeCodeViewConfig } from './types';
import { api } from '../../ipc/client';

registerView<ClaudeCodeViewConfig>({
  typeId: 'claude-code',
  label: 'Claude Code',
  description: 'Terminal that auto-launches the claude-code CLI.',
  icon: <span className="view-type-icon">✦</span>,
  createConfig: async () => {
    const cwd = await api.pickFolder();
    return {
      name: cwd ? await api.basename(cwd) : 'Claude Code',
      config: { cwd: cwd ?? undefined },
    };
  },
  Component: ClaudeCodeView,
  getContext: (instance) => `Working directory: ${instance.config.cwd ?? '(home)'}`,
});
