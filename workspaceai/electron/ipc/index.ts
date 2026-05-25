import { registerFsHandlers } from './fs';
import { registerDialogHandlers } from './dialog';
import { registerStoreHandlers } from './store';

export function registerIpcHandlers(): void {
  registerFsHandlers();
  registerDialogHandlers();
  registerStoreHandlers();
}
