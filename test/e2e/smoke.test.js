const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron-app');

let appPage;

test.beforeAll(async () => {
  ({ appPage } = await launchApp());
});

test.afterAll(async () => {
  await closeApp();
});

test('app launches successfully', async () => {
  expect(appPage).toBeTruthy();
  expect(appPage.url()).toContain('app.html');
});

test('terminal area is visible with non-zero dimensions', async () => {
  const terminalArea = appPage.locator('#terminal-area');
  await expect(terminalArea).toBeVisible();

  const box = await terminalArea.boundingBox();
  expect(box.width).toBeGreaterThan(0);
  expect(box.height).toBeGreaterThan(0);
});

test('controls bar is visible with key elements', async () => {
  await expect(appPage.locator('#controls-bar')).toBeVisible();
  await expect(appPage.locator('#url-input')).toBeVisible();
  await expect(appPage.locator('#layout-select')).toBeVisible();
});

test('app closes cleanly', async () => {
  // closeApp() is idempotent so afterAll is safe even after this runs
  await expect(closeApp()).resolves.not.toThrow();
});
