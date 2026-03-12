const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron-app');

let appPage;

test.beforeAll(async () => {
  ({ appPage } = await launchApp());
  // Reset to 1x1 in case a previous run left a different layout saved
  await appPage.locator('#layout-select').selectOption('1x1');
  await expect(appPage.locator('.terminal-panel')).toHaveCount(1, { timeout: 5_000 });
});

test.afterAll(async () => {
  await closeApp();
});

test('1x1 layout has one terminal panel', async () => {
  const layoutSelect = appPage.locator('#layout-select');
  await expect(layoutSelect).toHaveValue('1x1');

  const panels = appPage.locator('.terminal-panel');
  await expect(panels).toHaveCount(1);
});

test('switching to 2x2 creates 4 terminal panels', async () => {
  const layoutSelect = appPage.locator('#layout-select');
  await layoutSelect.selectOption('2x2');

  // Wait for panels to be created
  await expect(appPage.locator('.terminal-panel')).toHaveCount(4, { timeout: 5_000 });
});

test('layout select has all 5 options', async () => {
  const options = appPage.locator('#layout-select option');
  await expect(options).toHaveCount(5);

  const values = await options.evaluateAll((els) => els.map((el) => el.value));
  expect(values).toEqual(['1x1', '1x2', '2x1', '2x2', '1x3']);
});
