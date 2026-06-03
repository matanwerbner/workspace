import { useEffect, useRef, useState } from 'react';
import { api } from '../ipc/client';
import { useAppStore } from '../state/store';

interface Props {
  onClose: () => void;
}

const MODEL_OPTIONS: { label: string; value: string }[] = [
  { label: 'Claude Opus 4.8', value: 'claude-opus-4-8' },
  { label: 'Claude Sonnet 4.6', value: 'claude-sonnet-4-6' },
  { label: 'Claude Haiku 4.5', value: 'claude-haiku-4-5-20251001' },
];

export function SettingsModal({ onClose }: Props) {
  const setApiKeySet = useAppStore((s) => s.setApiKeySet);
  const apiKeySet = useAppStore((s) => s.apiKeySet);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const [keyInput, setKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [codeServerInfo, setCodeServerInfo] = useState<{ kind: string | null; bin: string | null } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Probe which code-server / openvscode-server binary resolves for the Cursor
  // view, re-probing when the configured override path changes.
  useEffect(() => {
    let cancelled = false;
    void api
      .codeServerStatus({ binPath: settings.codeServerPath })
      .then((info) => {
        if (!cancelled) setCodeServerInfo(info);
      })
      .catch(() => {
        if (!cancelled) setCodeServerInfo({ kind: null, bin: null });
      });
    return () => {
      cancelled = true;
    };
  }, [settings.codeServerPath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const save = async () => {
    const trimmed = keyInput.trim();
    if (!trimmed) return;
    setStatus('saving');
    try {
      await api.aiSetKey(trimmed);
      setApiKeySet(true);
      setKeyInput('');
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setStatus('error');
    }
  };

  const clear = async () => {
    await api.aiClearKey();
    setApiKeySet(false);
    setStatus('idle');
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void save();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="btn-icon" onClick={onClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          <div className="settings-section">
            <div className="settings-label">Anthropic API Key</div>
            <div className="settings-hint">
              {apiKeySet ? (
                <span className="settings-key-set">API key is configured ✓</span>
              ) : (
                <span className="muted">No key set. Required to use the AI console.</span>
              )}
            </div>
            <form className="settings-key-row" onSubmit={onSubmit}>
              <input
                ref={inputRef}
                className="settings-input"
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                placeholder={apiKeySet ? 'Enter new key to replace…' : 'sk-ant-…'}
                spellCheck={false}
                autoComplete="off"
              />
              <button
                type="button"
                className="btn-ghost btn-sm"
                onClick={() => setShowKey((v) => !v)}
                tabIndex={-1}
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </form>
            <div className="settings-actions">
              <button
                className="btn-primary"
                onClick={() => void save()}
                disabled={!keyInput.trim() || status === 'saving'}
              >
                {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved ✓' : 'Save Key'}
              </button>
              {apiKeySet && (
                <button className="btn-ghost" onClick={() => void clear()}>
                  Remove Key
                </button>
              )}
            </div>
            {status === 'error' && <div className="error-banner">{errorMsg}</div>}
          </div>
          <div className="settings-section">
            <div className="settings-label">Model</div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="settings-model">
                Model
              </label>
              <select
                id="settings-model"
                className="settings-input settings-select"
                value={settings.model}
                onChange={(e) => setSettings({ model: e.target.value })}
              >
                {MODEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="settings-max-tokens">
                Max tokens
              </label>
              <input
                id="settings-max-tokens"
                className="settings-input"
                type="number"
                min={1}
                value={settings.maxTokens}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (Number.isFinite(n) && n > 0) setSettings({ maxTokens: Math.floor(n) });
                }}
              />
            </div>
            <div className="settings-field">
              <label className="settings-checkbox">
                <input
                  type="checkbox"
                  checked={settings.htmlResponses ?? false}
                  onChange={(e) => setSettings({ htmlResponses: e.target.checked })}
                />
                <span>Render responses as beautiful, expressive HTML</span>
              </label>
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="settings-system-prompt">
                System prompt override (optional)
              </label>
              <textarea
                id="settings-system-prompt"
                className="settings-input settings-textarea"
                rows={4}
                value={settings.systemPromptOverride ?? ''}
                onChange={(e) =>
                  setSettings({ systemPromptOverride: e.target.value || undefined })
                }
                placeholder="Append extra instructions to the assistant's system prompt…"
                spellCheck={false}
              />
            </div>
          </div>
          <div className="settings-section">
            <div className="settings-label">Code View (Embedded VS Code)</div>
            <div className="settings-hint">
              {codeServerInfo === null ? (
                <span className="muted">Checking…</span>
              ) : codeServerInfo.bin ? (
                <span className="settings-key-set">
                  Found {codeServerInfo.kind}: {codeServerInfo.bin}
                </span>
              ) : (
                <span className="muted">
                  No code-server found. Install with <code>brew install code-server</code> or{' '}
                  <code>npm i -g code-server</code>, or set an explicit path below.
                </span>
              )}
            </div>
            <div className="settings-field">
              <label className="settings-field-label" htmlFor="settings-code-server">
                code-server binary path (optional)
              </label>
              <input
                id="settings-code-server"
                className="settings-input"
                type="text"
                value={settings.codeServerPath ?? ''}
                onChange={(e) =>
                  setSettings({ codeServerPath: e.target.value || undefined })
                }
                placeholder="/opt/homebrew/bin/code-server"
                spellCheck={false}
                autoComplete="off"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
