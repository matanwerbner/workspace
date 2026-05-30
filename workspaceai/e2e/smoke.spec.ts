// Playwright + Electron smoke test (SCAFFOLD — NOT wired into `npm test`).
//
// TODO: This requires a DISPLAY / headful run and a real Electron launch, so it
// is intentionally excluded from the vitest unit-test run (which is node-only
// and headless). To run it you would need to:
//   1. npm install -D @playwright/test playwright   (full Playwright, not just
//      the playwright-core that ships today)
//   2. Build the app:  npm run build
//   3. Run with a display available (locally, or via xvfb-run on CI):
//        npx playwright test e2e/smoke.spec.ts
//
// The import below is left as a type-only reference; the real runner provides
// `test`/`expect`/`_electron` at runtime. Do not add this file to tsconfig
// includes until @playwright/test is a dependency.

// @ts-nocheck
import { test, expect, _electron as electron } from '@playwright/test';
import { join } from 'node:path';

test('app boots and shows the shell', async () => {
  const app = await electron.launch({
    args: [join(__dirname, '..', 'out', 'main', 'index.js')],
  });

  const window = await app.firstWindow();
  await expect(window.locator('body')).toBeVisible();

  // TODO: assert the sidebar / "Add view" entry point renders once selectors
  // are stabilized (e.g. data-testid hooks in the shell components).

  await app.close();
});
