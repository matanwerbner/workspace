import { realpathSync, statSync } from 'node:fs';
import { realpath } from 'node:fs/promises';
import { resolve, sep, dirname, basename, join } from 'node:path';

// Workspace roots the main process trusts. Anchored server-side: populated
// when the user picks a folder via the dialog and seeded from persisted state
// on startup. fs IPC paths are validated against this set rather than against
// any renderer-supplied "rootPath" argument, which cannot be trusted.
const roots = new Set<string>();

// Register a directory as an allowed workspace root. The real (symlink-resolved)
// path is stored so later checks compare against the canonical location.
export function registerRoot(p: string): void {
  if (!p) return;
  let real: string;
  try {
    real = realpathSync(p);
    if (!statSync(real).isDirectory()) return;
  } catch {
    return;
  }
  roots.add(real);
}

function isInsideAnyRoot(real: string): boolean {
  for (const root of roots) {
    if (real === root || real.startsWith(root + sep)) return true;
  }
  return false;
}

// Resolve the real path of a target that must already exist, then assert it
// lives inside a registered root. Rejects symlinks that escape the root because
// realpath follows links before the containment check.
export async function assertInsideRoots(targetPath: string): Promise<string> {
  let real: string;
  try {
    real = await realpath(targetPath);
  } catch {
    throw new Error('Access denied: path is outside the workspace root');
  }
  if (!isInsideAnyRoot(real)) {
    throw new Error('Access denied: path is outside the workspace root');
  }
  return real;
}

// Variant for paths that may not exist yet (writeFile/createFile). The final
// component need not exist, but its parent directory must resolve (via realpath)
// to a location inside a registered root, so a symlinked parent cannot escape.
// Returns the canonical target path (real parent joined with the basename).
export async function assertParentInsideRoots(targetPath: string): Promise<string> {
  const resolved = resolve(targetPath);
  let realParent: string;
  try {
    realParent = await realpath(dirname(resolved));
  } catch {
    throw new Error('Access denied: path is outside the workspace root');
  }
  if (!isInsideAnyRoot(realParent)) {
    throw new Error('Access denied: path is outside the workspace root');
  }
  return join(realParent, basename(resolved));
}

// Pure helper: collect every rootPath, cwd, and homeFolder string from seeded
// state without performing any side effects (no registerRoot, no fs access).
// This separation makes the collection logic unit-testable under Vitest.
export function collectRootPaths(state: unknown): string[] {
  const paths: string[] = [];
  if (typeof state !== 'object' || state === null) return paths;
  const workspaces = (state as { workspaces?: unknown }).workspaces;
  if (!Array.isArray(workspaces)) return paths;
  for (const ws of workspaces) {
    // Register workspace homeFolder (the gap being closed in plan 01-02)
    const homeFolder = (ws as { homeFolder?: unknown })?.homeFolder;
    if (typeof homeFolder === 'string') paths.push(homeFolder);

    const views = (ws as { views?: unknown })?.views;
    if (!Array.isArray(views)) continue;
    for (const view of views) {
      const config = (view as { config?: unknown })?.config;
      if (typeof config !== 'object' || config === null) continue;
      const root = (config as { rootPath?: unknown }).rootPath;
      const cwd = (config as { cwd?: unknown }).cwd;
      if (typeof root === 'string') paths.push(root);
      if (typeof cwd === 'string') paths.push(cwd);
    }
  }
  return paths;
}

// Seed roots from persisted app state on startup (server-side, no renderer
// trust). Reads homeFolder, rootPath, and cwd path fields from each saved
// workspace and its view configs.
export function seedRootsFromState(state: unknown): void {
  for (const p of collectRootPaths(state)) registerRoot(p);
}
