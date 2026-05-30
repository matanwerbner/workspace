import { registerView } from '../registry';
import { api } from '../../ipc/client';
import { CodeView } from './CodeView';
import type { CodeViewConfig } from './types';
import type { AiTool, ViewInstance } from '../types';

// Resolve a tool-supplied path against the workspace root. Absolute paths are
// used as-is; relative paths are joined to the root. The main process still
// enforces (server-side, against its registered roots) that the final path
// stays inside an allowed workspace.
function resolvePath(root: string, p: string): string {
  if (p.startsWith('/')) return p;
  return `${root.replace(/\/$/, '')}/${p.replace(/^\.?\//, '')}`;
}

const tools: AiTool[] = [
  {
    name: 'list_dir',
    description: 'List the files and folders in a directory of the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Directory path (absolute or relative to the workspace root).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'read_file',
    description: 'Read the UTF-8 text contents of a file in the workspace.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (absolute or relative to the workspace root).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Overwrite a file in the workspace with the given contents.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (absolute or relative to the workspace root).',
        },
        content: { type: 'string', description: 'New file contents.' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'create_file',
    description: 'Create a new empty file in the workspace. Fails if it already exists.',
    input_schema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'File path (absolute or relative to the workspace root).',
        },
      },
      required: ['path'],
    },
  },
  {
    name: 'search',
    description:
      'Search the workspace for files whose name or contents contain a query string (case-insensitive).',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Substring to search for.' },
      },
      required: ['query'],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  instance: ViewInstance<CodeViewConfig>,
): Promise<unknown> {
  const root = instance.config.rootPath;
  switch (name) {
    case 'list_dir':
      return api.listDir(resolvePath(root, String(input.path)), root);
    case 'read_file':
      return api.readFile(resolvePath(root, String(input.path)), root);
    case 'write_file':
      await api.writeFile(resolvePath(root, String(input.path)), String(input.content), root);
      return { ok: true };
    case 'create_file':
      await api.createFile(resolvePath(root, String(input.path)), root);
      return { ok: true };
    case 'search':
      return api.search(String(input.query), root);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

registerView<CodeViewConfig>({
  typeId: 'code',
  label: 'Code View',
  description: 'Open a folder and edit files with Monaco.',
  icon: <span className="view-type-icon">{'</>'}</span>,
  createConfig: async () => {
    const folder = await api.pickFolder();
    if (!folder) return null;
    const name = (await api.basename(folder)) || folder;
    return { name, config: { rootPath: folder } };
  },
  Component: CodeView,
  tools,
  executeTool,
  getContext: (instance) => `Workspace root: ${instance.config.rootPath}`,
});
