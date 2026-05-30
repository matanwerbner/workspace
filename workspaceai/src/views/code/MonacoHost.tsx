import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { detectLanguage } from '../../lib/lang';

interface Props {
  value: string;
  language: string;
  onChange: (next: string) => void;
}

export { detectLanguage };

export function MonacoHost({ value, language, onChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const onChangeRef = useRef(onChange);
  const programmaticRef = useRef(false);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current) return;
    if (editorRef.current) return;

    const editor = monaco.editor.create(containerRef.current, {
      value,
      language,
      theme: 'vs-dark',
      automaticLayout: true,
      fontSize: 13,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
    });
    editorRef.current = editor;

    const sub = editor.onDidChangeModelContent(() => {
      if (programmaticRef.current) return;
      onChangeRef.current(editor.getValue());
    });

    return () => {
      sub.dispose();
      editor.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    if (editor.getValue() === value) return;
    programmaticRef.current = true;
    editor.setValue(value);
    programmaticRef.current = false;
  }, [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, language);
  }, [language]);

  return <div ref={containerRef} className="monaco-host" />;
}
