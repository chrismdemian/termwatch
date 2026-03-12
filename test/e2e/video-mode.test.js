const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron-app');

let appPage;

test.beforeAll(async () => {
  ({ appPage } = await launchApp());
});

test.afterAll(async () => {
  await closeApp();
});

test('video mode indicator is initially hidden', async () => {
  const indicator = appPage.locator('#video-mode-indicator');
  await expect(indicator).toHaveClass(/hidden/);
});

test('video mode button exists and is clickable', async () => {
  const btn = appPage.locator('#btn-video-mode');
  await expect(btn).toBeVisible();

  // Verify it's clickable (don't actually toggle — that hides the app view)
  await expect(btn).toBeEnabled();
});
