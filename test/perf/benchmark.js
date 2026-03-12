const { _electron } = require('@playwright/test');
const path = require('path');

// Thresholds account for Electron's multi-process architecture on Windows:
// main process + app renderer + video renderer + GPU process + PTY processes
const THRESHOLDS = {
  startupMs: 5_000,
  memoryMb: 1_000,
  leakMb: 200,
};

async function launchAndGetPage() {
  const executablePath = process.env.ELECTRON_PATH || require('electron');
  const electronApp = await _electron.launch({
    executablePath,
    args: ['.'],
    timeout: 20_000,
  });

  // Find app.html page
  let appPage = await electronApp.firstWindow();
  if (!appPage.url().includes('app.html')) {
    for (const page of electronApp.windows()) {
      if (page.url().includes('app.html')) {
        appPage = page;
        break;
      }
    }
  }

  await appPage.locator('#terminal-area').waitFor({ state: 'visible', timeout: 15_000 });
  return { electronApp, appPage };
}

async function closeApp(electronApp) {
  try {
    // Clean up PTYs before closing
    await electronApp.evaluate(async () => {
      const p = require('path');
      const ptyManager = require(p.join(process.cwd(), 'src', 'main', 'pty-manager'));
      await ptyManager.destroyAll();
    }).catch(() => {});

    await electronApp.close();
  } catch {
    // Best effort
  }
}

async function benchmarkStartup() {
  const executablePath = process.env.ELECTRON_PATH || require('electron');
  const start = Date.now();
  const electronApp = await _electron.launch({
    executablePath,
    args: ['.'],
    timeout: 20_000,
  });
  await electronApp.firstWindow();
  const elapsed = Date.now() - start;

  await closeApp(electronApp);
  return elapsed;
}

async function benchmarkMemory(electronApp, appPage) {
  // Switch to 2x2 layout (4 terminals)
  await appPage.locator('#layout-select').selectOption('2x2');
  await appPage.locator('.terminal-panel').first().waitFor({ state: 'visible', timeout: 10_000 });

  // Wait for terminals to initialize
  await appPage.waitForTimeout(3_000);

  // Get total working set across all processes
  const memInfo = await electronApp.evaluate(async ({ app }) => {
    const metrics = await app.getAppMetrics();
    let totalKb = 0;
    for (const metric of metrics) {
      totalKb += metric.memory.workingSetSize;
    }
    return totalKb;
  });

  return memInfo / 1024; // KB to MB
}

async function benchmarkLeak(electronApp, appPage) {
  // Stabilize: ensure we're at 1x1 and wait for cleanup
  await appPage.locator('#layout-select').selectOption('1x1');
  await appPage.waitForTimeout(3_000);

  // Clean up any lingering PTYs from memory benchmark
  await electronApp.evaluate(async () => {
    const p = require('path');
    const ptyMgr = require(p.join(process.cwd(), 'src', 'main', 'pty-manager'));
    await ptyMgr.destroyAll();
  }).catch(() => {});
  await appPage.waitForTimeout(2_000);

  // Measure baseline
  const wssBefore = await electronApp.evaluate(async ({ app }) => {
    const metrics = await app.getAppMetrics();
    let totalKb = 0;
    for (const metric of metrics) {
      totalKb += metric.memory.workingSetSize;
    }
    return totalKb;
  });

  // 5 layout cycles with PTY cleanup between each to avoid native assertion dialog
  const layoutSelect = appPage.locator('#layout-select');
  for (let i = 0; i < 5; i++) {
    await layoutSelect.selectOption('2x2');
    await appPage.waitForTimeout(1_500);

    // Destroy PTYs before switching layout to prevent conpty race condition
    await electronApp.evaluate(async () => {
      const p = require('path');
      const ptyMgr = require(p.join(process.cwd(), 'src', 'main', 'pty-manager'));
      await ptyMgr.destroyAll();
    }).catch(() => {});
    await appPage.waitForTimeout(500);

    await layoutSelect.selectOption('1x1');
    await appPage.waitForTimeout(1_500);
  }

  // Wait for process cleanup and GC
  await appPage.waitForTimeout(5_000);

  const wssAfter = await electronApp.evaluate(async ({ app }) => {
    const metrics = await app.getAppMetrics();
    let totalKb = 0;
    for (const metric of metrics) {
      totalKb += metric.memory.workingSetSize;
    }
    return totalKb;
  });

  return (wssAfter - wssBefore) / 1024; // MB growth
}

function formatRow(name, value, unit, threshold, pass) {
  const status = pass ? 'PASS' : 'FAIL';
  return `  ${status}  ${name.padEnd(20)} ${String(value).padStart(8)} ${unit.padEnd(4)}  (threshold: ${threshold} ${unit})`;
}

async function main() {
  const results = [];
  let hasFailure = false;

  console.log('\n  TermWatch Performance Benchmarks');
  console.log('  ================================\n');

  // 1. Startup time
  try {
    const startupMs = await benchmarkStartup();
    const pass = startupMs < THRESHOLDS.startupMs;
    if (!pass) hasFailure = true;
    results.push(formatRow('Startup time', startupMs, 'ms', THRESHOLDS.startupMs, pass));
  } catch (err) {
    hasFailure = true;
    results.push(`  FAIL  Startup time           ERROR: ${err.message}`);
  }

  // 2 & 3. Memory + leak detection (same app instance)
  let electronApp, appPage;
  try {
    ({ electronApp, appPage } = await launchAndGetPage());

    // Memory with 4 terminals
    const memoryMb = await benchmarkMemory(electronApp, appPage);
    const memPass = memoryMb < THRESHOLDS.memoryMb;
    if (!memPass) hasFailure = true;
    results.push(formatRow('Memory (4 terminals)', Math.round(memoryMb), 'MB', THRESHOLDS.memoryMb, memPass));

    // Leak detection
    const leakMb = await benchmarkLeak(electronApp, appPage);
    const leakPass = leakMb < THRESHOLDS.leakMb;
    if (!leakPass) hasFailure = true;
    results.push(formatRow('Leak (5 cycles)', Math.round(leakMb), 'MB', THRESHOLDS.leakMb, leakPass));
  } catch (err) {
    hasFailure = true;
    results.push(`  FAIL  Memory/Leak            ERROR: ${err.message}`);
  } finally {
    if (electronApp) {
      await closeApp(electronApp);
    }
  }

  console.log(results.join('\n'));
  console.log('\n');

  process.exit(hasFailure ? 1 : 0);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
