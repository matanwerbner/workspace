import { ipcMain, safeStorage } from 'electron';
import Anthropic from '@anthropic-ai/sdk';
import Store from 'electron-store';

interface KeySchema {
  anthropicKey: string;
}

const keyStore = new Store<KeySchema>({
  name: 'workspaceai-keys',
  defaults: { anthropicKey: '' },
});

export interface AiChatPayload {
  streamId: string;
  messages: Anthropic.MessageParam[];
  systemPrompt?: string;
  tools?: Anthropic.Tool[];
  model?: string;
  maxTokens?: number;
}

const activeStreams = new Map<string, AbortController>();

// Persist the API key encrypted via Electron safeStorage when available.
function persistKey(trimmedKey: string): void {
  if (!trimmedKey) {
    keyStore.set('anthropicKey', '');
    return;
  }
  if (safeStorage.isEncryptionAvailable()) {
    keyStore.set('anthropicKey', safeStorage.encryptString(trimmedKey).toString('base64'));
  } else {
    // Fallback: persist plaintext when OS-level encryption is unavailable.
    keyStore.set('anthropicKey', trimmedKey);
  }
}

// Resolve the stored value to a usable plaintext key. Supports both encrypted
// values and legacy raw keys, lazily migrating legacy values to encrypted form.
function resolveKey(): string {
  const stored = keyStore.get('anthropicKey', '');
  if (!stored) return '';
  // A legacy raw key is stored verbatim.
  if (stored.startsWith('sk-')) {
    persistKey(stored);
    return stored;
  }
  if (safeStorage.isEncryptionAvailable()) {
    try {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    } catch {
      // Decryption failed — treat as legacy plaintext and re-save encrypted.
      persistKey(stored);
      return stored;
    }
  }
  // Encryption unavailable: the value was persisted as plaintext.
  return stored;
}

function makeClient(): Anthropic | null {
  const key = resolveKey();
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export function disposeStreams(): void {
  for (const ac of activeStreams.values()) {
    ac.abort();
  }
  activeStreams.clear();
}

export function registerAiHandlers(): void {
  ipcMain.handle('ai:hasKey', () => {
    return Boolean(keyStore.get('anthropicKey', ''));
  });

  ipcMain.handle('ai:setKey', (_e, key: string) => {
    persistKey((key ?? '').trim());
  });

  ipcMain.handle('ai:clearKey', () => {
    keyStore.set('anthropicKey', '');
  });

  ipcMain.handle('ai:cancelChat', (_e, streamId: string) => {
    activeStreams.get(streamId)?.abort();
    activeStreams.delete(streamId);
  });

  ipcMain.handle('ai:chat', async (event, payload: AiChatPayload) => {
    const client = makeClient();
    if (!client) {
      throw new Error('No API key configured. Open Settings (⚙) to add your Anthropic API key.');
    }

    const { streamId, messages, systemPrompt, tools, model, maxTokens } = payload;
    const ac = new AbortController();
    activeStreams.set(streamId, ac);

    try {
      const stream = client.messages.stream(
        {
          model: model || 'claude-sonnet-4-6',
          max_tokens: maxTokens || 4096,
          ...(systemPrompt ? { system: systemPrompt } : {}),
          messages,
          ...(tools && tools.length > 0 ? { tools } : {}),
        },
        { signal: ac.signal },
      );

      stream.on('text', (text) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send('ai:chunk', { streamId, text });
      });

      const final = await stream.finalMessage();
      return { content: final.content, stopReason: final.stop_reason };
    } catch (e) {
      if (ac.signal.aborted) return { content: [], stopReason: null };
      throw new Error(e instanceof Error ? e.message : String(e));
    } finally {
      activeStreams.delete(streamId);
    }
  });
}
