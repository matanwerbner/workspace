import { ipcMain } from 'electron';
import Store from 'electron-store';

interface Schema {
  appState: unknown;
}

const ALLOWED_KEYS = new Set<keyof Schema>(['appState']);

const store = new Store<Schema>({
  name: 'workspaceai-state',
  defaults: { appState: null },
});

function assertKey(key: string): asserts key is keyof Schema {
  if (!ALLOWED_KEYS.has(key as keyof Schema)) {
    throw new Error(`Invalid store key: ${key}`);
  }
}

export function registerStoreHandlers(): void {
  ipcMain.handle('store:get', async (_e, key: string) => {
    assertKey(key);
    return store.get(key);
  });
  ipcMain.handle('store:set', async (_e, key: string, value: unknown) => {
    assertKey(key);
    store.set(key, value);
  });
}
