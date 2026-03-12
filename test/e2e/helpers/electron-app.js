const { _electron, chromium } = require('@playwright/test');
const { spawn } = require('child_process');

let electronApp = null;
let appPage = null;
let cdpBrowser = null;
let electronProcess = null;

/**
 * Launch the Electron app and return the app-view page.
 * Tries Playwright's native Electron support first, falls back to CDP.
 */
async function launchApp() {
  const executablePath = process.env.ELECTRON_PATH || require('electron');

  try {
    electronApp = await _electron.launch({
      executablePath,
      args: ['.'],
      timeout: 20_000,
    });

    // Find the app.html page (the app uses BaseWindow + WebContentsView)
    appPage = await findAppPage();
    if (!appPage) {
      throw new Error('Could not find app.html page');
    }
  } catch (err) {
    // Fallback: launch with remote debugging and connect via CDP
    console.warn('Electron launch failed, falling back to CDP:', err.message);
    await launchViaCDP(executablePath);
  }

  // Wait for the terminal area to be ready
  await appPage.locator('#terminal-area').waitFor({ state: 'visible', timeout: 15_000 });

  return { electronApp, appPage };
}

/**
 * Find the app.html page among Electron windows.
 */
async function findAppPage() {
  // firstWindow() waits for the first BrowserWindow to open
  const firstPage = await electronApp.firstWindow();

  // Check if this is already app.html
  if (firstPage.url().includes('app.html')) {
    return firstPage;
  }

  // Otherwise search all windows
  const pages = electronApp.windows();
  for (const page of pages) {
    if (page.url().includes('app.html')) {
      return page;
    }
  }

  // Wait a bit for additional windows to appear
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(null), 10_000);

    electronApp.on('window', (page) => {
      if (page.url().includes('app.html')) {
        clearTimeout(timeout);
        resolve(page);
      }
    });

    // Re-check existing windows in case they loaded since we last checked
    for (const page of electronApp.windows()) {
      if (page.url().includes('app.html')) {
        clearTimeout(timeout);
        resolve(page);
        return;
      }
    }
  });
}

/**
 * Fallback: spawn Electron with --remote-debugging-port and connect via CDP.
 */
async function launchViaCDP(executablePath) {
  const debugPort = 9222;

  electronProcess = spawn(executablePath, ['.', `--remote-debugging-port=${debugPort}`], {
    stdio: 'pipe',
    detached: false,
  });

  // Wait for the debug server to be ready
  await waitForDebugPort(debugPort, 15_000);

  cdpBrowser = await chromium.connectOverCDP(`http://localhost:${debugPort}`);
  const contexts = cdpBrowser.contexts();
  if (contexts.length === 0) {
    throw new Error('No browser contexts found via CDP');
  }

  // Find the app.html page
  for (const context of contexts) {
    for (const page of context.pages()) {
      if (page.url().includes('app.html')) {
        appPage = page;
        return;
      }
    }
  }

  // Wait for it to appear
  const context = contexts[0];
  appPage = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('app.html page not found via CDP')), 10_000);
    context.on('page', (page) => {
      if (page.url().includes('app.html')) {
        clearTimeout(timeout);
        resolve(page);
      }
    });
  });
}

/**
 * Poll for the debug port to be available.
 */
async function waitForDebugPort(port, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(`http://localhost:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Debug port ${port} not available after ${timeoutMs}ms`);
}

/**
 * Close the app cleanly. Destroys PTYs first to avoid node-pty assertion
 * dialog on Windows (conpty.node remove_pty_baton race condition).
 */
async function closeApp() {
  try {
    if (electronApp) {
      // Destroy PTYs before closing to prevent native assertion dialog
      try {
        await electronApp.evaluate(async () => {
          const path = require('path');
          const ptyManager = require(path.join(process.cwd(), 'src', 'main', 'pty-manager'));
          await ptyManager.destroyAll();
        });
      } catch {
        // Best-effort — app may already be closing
      }

      await Promise.race([
        electronApp.close(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('close timeout')), 10_000)),
      ]);
      electronApp = null;
    }

    if (cdpBrowser) {
      await cdpBrowser.close();
      cdpBrowser = null;
    }

    if (electronProcess) {
      electronProcess.kill();
      electronProcess = null;
    }
  } catch {
    // Force kill as last resort
    if (electronProcess && !electronProcess.killed) {
      electronProcess.kill();
      electronProcess = null;
    }
  } finally {
    // Always reset state even if cleanup partially failed
    electronApp = null;
    cdpBrowser = null;
    electronProcess = null;
    appPage = null;
  }
}

module.exports = { launchApp, closeApp };
