import { useCallback, useEffect, useRef, useState } from 'react';
import { Editor } from 'react-draft-wysiwyg';
import {
  EditorState,
  ContentState,
  convertToRaw,
  convertFromRaw,
  RawDraftContentState,
} from 'draft-js';
import 'react-draft-wysiwyg/dist/react-draft-wysiwyg.css';
import { useAppStore } from '../../state/store';
import type { ViewInstance } from '../types';
import type { NotepadViewConfig } from './types';

// Extract plain text from stored content (Draft.js JSON or legacy plain text).
export function extractText(content: string): string {
  if (!content) return '';
  try {
    const obj = JSON.parse(content);
    if (obj && Array.isArray(obj.blocks)) {
      return (obj.blocks as Array<{ text: string }>).map((b) => b.text).join('\n');
    }
  } catch {
    // not JSON — fall through
  }
  return content;
}

function isRawDraftJSON(s: string): boolean {
  try {
    const obj = JSON.parse(s);
    return obj && Array.isArray(obj.blocks) && typeof obj.entityMap === 'object';
  } catch {
    return false;
  }
}

function loadEditorState(content: string): EditorState {
  if (!content) return EditorState.createEmpty();
  if (isRawDraftJSON(content)) {
    return EditorState.createWithContent(convertFromRaw(JSON.parse(content) as RawDraftContentState));
  }
  // Legacy plain text / markdown — load as plain text
  return EditorState.createWithContent(ContentState.createFromText(content));
}

function editorStateToPlainText(state: EditorState): string {
  return state.getCurrentContent().getPlainText('\n');
}

export function NotepadView({ instance }: { instance: ViewInstance<NotepadViewConfig> }) {
  const setViewContext = useAppStore((s) => s.setViewContext);
  const updateViewConfig = useAppStore((s) => s.updateViewConfig);

  const [editorState, setEditorState] = useState<EditorState>(() =>
    loadEditorState(instance.config.content),
  );

  // Track whether an external write (AI tool) is pending so we don't clobber it
  const externalContentRef = useRef(instance.config.content);

  // Sync external writes (e.g. AI tool) when the stored content changes from outside
  useEffect(() => {
    if (instance.config.content !== externalContentRef.current) {
      externalContentRef.current = instance.config.content;
      setEditorState(loadEditorState(instance.config.content));
    }
  }, [instance.config.content]);

  // Keep AI context up to date
  useEffect(() => {
    const text = editorStateToPlainText(editorState);
    const preview = text.slice(0, 500);
    setViewContext(
      instance.id,
      `Notepad "${instance.name}":\n${preview}${text.length > 500 ? '\n…(truncated)' : ''}`,
    );
  }, [instance.id, instance.name, editorState, setViewContext]);

  const handleEditorStateChange = useCallback(
    (state: EditorState) => {
      setEditorState(state);
      const raw = JSON.stringify(convertToRaw(state.getCurrentContent()));
      externalContentRef.current = raw;
      updateViewConfig(instance.id, { content: raw });
    },
    [instance.id, updateViewConfig],
  );

  const text = editorStateToPlainText(editorState);
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const lineCount = text ? text.split('\n').length : 1;

  return (
    <div className="notepad-view">
      <div className="notepad-toolbar">
        <span className="muted">notepad</span>
        <span className="notepad-name">{instance.name}</span>
        <span className="notepad-stats muted">
          {wordCount} {wordCount === 1 ? 'word' : 'words'} · {lineCount}{' '}
          {lineCount === 1 ? 'line' : 'lines'}
        </span>
      </div>
      <div className="notepad-editor-wrapper">
        <Editor
          editorState={editorState}
          onEditorStateChange={handleEditorStateChange}
          wrapperClassName="notepad-draft-wrapper"
          toolbarClassName="notepad-draft-toolbar"
          editorClassName="notepad-draft-editor"
          toolbar={{
            options: ['inline', 'blockType', 'list', 'link', 'history'],
            inline: { options: ['bold', 'italic', 'underline', 'strikethrough', 'monospace'] },
            blockType: { options: ['Normal', 'H1', 'H2', 'H3', 'Blockquote', 'Code'] },
            list: { options: ['unordered', 'ordered'] },
          }}
        />
      </div>
    </div>
  );
}
