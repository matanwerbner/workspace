import { registerView } from '../registry';
import { NotepadView, extractText } from './NotepadView';
import type { NotepadViewConfig } from './types';
import type { AiTool } from '../types';

const tools: AiTool[] = [
  {
    name: 'read_note',
    description: 'Return the full text content of the notepad.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'write_note',
    description: 'Replace the entire notepad content with the given text (accepts markdown).',
    input_schema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'New content for the notepad (markdown supported).' },
      },
      required: ['content'],
    },
  },
  {
    name: 'append_to_note',
    description: 'Append text to the end of the notepad (accepts markdown).',
    input_schema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to append (markdown supported).' },
      },
      required: ['text'],
    },
  },
];

registerView<NotepadViewConfig>({
  typeId: 'notepad',
  label: 'Notepad',
  description: 'A plain-text notepad with AI assistance.',
  icon: <span className="view-type-icon">✎</span>,
  createConfig: async () => {
    return { name: 'New Note', config: { content: '' } };
  },
  Component: NotepadView,
  tools,
  executeTool: async (name, input, instance) => {
    const { useAppStore } = await import('../../state/store');
    const updateViewConfig = useAppStore.getState().updateViewConfig;
    if (name === 'read_note') {
      return extractText(instance.config.content);
    }
    if (name === 'write_note') {
      updateViewConfig(instance.id, { content: String(input.content ?? '') });
      return 'Note updated.';
    }
    if (name === 'append_to_note') {
      const current = extractText(instance.config.content);
      const appended = String(input.text ?? '');
      updateViewConfig(instance.id, {
        content: current ? `${current}\n${appended}` : appended,
      });
      return 'Text appended.';
    }
    throw new Error(`Unknown tool: ${name}`);
  },
  getContext: (instance) => {
    const text = extractText(instance.config.content);
    const preview = text.slice(0, 500);
    return `Notepad "${instance.name}":\n${preview}${text.length > 500 ? '\n…(truncated)' : ''}`;
  },
});
