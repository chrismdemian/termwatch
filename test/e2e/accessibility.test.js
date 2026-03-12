const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron-app');

let appPage;

test.beforeAll(async () => {
  ({ appPage } = await launchApp());
});

test.afterAll(async () => {
  await closeApp();
});

test('axe-core scan finds no critical violations', async () => {
  // AxeBuilder can't be used with Electron (requires creating new pages).
  // Inject axe-core directly via page.evaluate instead.
  const axeSource = require('axe-core').source;
  await appPage.evaluate(axeSource);

  const results = await appPage.evaluate(() => {
    return window.axe.run(document, {
      exclude: [['#terminal-area'], ['.xterm']],
    });
  });

  const critical = results.violations.filter((v) => v.impact === 'critical');
  if (critical.length > 0) {
    const summary = critical.map((v) => `${v.id}: ${v.description}`).join('\n');
    expect(critical, `Critical a11y violations:\n${summary}`).toHaveLength(0);
  }
});

test('all control buttons have title attributes', async () => {
  const buttonIds = [
    '#btn-back',
    '#btn-forward',
    '#btn-settings',
    '#btn-video-mode',
    '#btn-fullscreen',
    '#btn-bookmarks',
    '#btn-play-pause',
    '#btn-volume',
  ];

  for (const id of buttonIds) {
    const btn = appPage.locator(id);
    const title = await btn.getAttribute('title');
    expect(title, `${id} should have a non-empty title`).toBeTruthy();
  }
});

test('Tab key cycles through controls bar elements', async () => {
  // Focus the URL input first
  await appPage.locator('#url-input').focus();

  // Press Tab several times and verify focus moves
  const focusedIds = [];
  for (let i = 0; i < 5; i++) {
    await appPage.keyboard.press('Tab');
    const focusedId = await appPage.evaluate(() => document.activeElement?.id || '');
    if (focusedId) focusedIds.push(focusedId);
  }

  // At least 2 distinct controls should have received focus
  const uniqueIds = new Set(focusedIds);
  expect(uniqueIds.size).toBeGreaterThanOrEqual(2);
});

test('settings modal traps focus', async () => {
  // Open settings (force: true to bypass xterm canvas interception)
  await appPage.locator('#btn-settings').click({ force: true });
  await expect(appPage.locator('#settings-overlay')).toHaveClass(/\bvisible\b/);

  // Tab through the modal many times — focus should stay inside
  for (let i = 0; i < 20; i++) {
    await appPage.keyboard.press('Tab');
  }

  const focusedElement = await appPage.evaluate(() => {
    const el = document.activeElement;
    return el?.closest('#settings-modal') !== null;
  });
  expect(focusedElement).toBe(true);

  // Close settings
  await appPage.locator('#settings-close-btn').click({ force: true });
});
