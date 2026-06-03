import { registerView } from '../registry';
import { TerminalView } from './TerminalView';
import type { TerminalViewConfig } from './types';
import type { AiTool, ViewInstance } from '../types';
import { api } from '../../ipc/client';

const tools: AiTool[] = [
  {
    name: 'run_command',
    description:
      'Run a shell command in the terminal working directory and return its stdout, stderr, and exit code.',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'The shell command to execute.' },
      },
      required: ['command'],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  instance: ViewInstance<TerminalViewConfig>,
): Promise<unknown> {
  if (name === 'run_command') {
    return api.terminalExec({ cwd: instance.config.cwd, command: String(input.command) });
  }
  throw new Error(`Unknown tool: ${name}`);
}

registerView<TerminalViewConfig>({
  typeId: 'terminal',
  label: 'Terminal',
  description: 'Open a shell in an embedded terminal.',
  icon: <span className="view-type-icon">&gt;_</span>,
  createConfig: async () => {
    const cwd = await api.pickFolder();
    return {
      name: cwd ? await api.basename(cwd) : 'Terminal',
      config: { cwd: cwd ?? undefined },
    };
  },
  Component: TerminalView,
  tools,
  executeTool,
  getContext: (instance) => `Shell cwd: ${instance.config.cwd ?? '(home)'}`,
});
