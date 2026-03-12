const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron-app');

let appPage;

test.beforeAll(async () => {
  ({ appPage } = await launchApp());
});

test.afterAll(async () => {
  await closeApp();
});

test('clicking settings button opens settings overlay', async () => {
  await appPage.locator('#btn-settings').click({ force: true });

  // Overlay uses opacity + .visible class, not display:none
  const overlay = appPage.locator('#settings-overlay');
  await expect(overlay).toHaveClass(/\bvisible\b/);
});

test('settings modal contains Terminal, Behavior, and Data sections', async () => {
  const sectionTitles = appPage.locator('.settings-section-title');
  const titles = await sectionTitles.allTextContents();

  expect(titles).toContain('Terminal');
  expect(titles).toContain('Behavior');
  expect(titles).toContain('Data');
});

test('clicking close button closes the settings modal', async () => {
  // Force click to bypass xterm canvas interception
  await appPage.locator('#settings-close-btn').click({ force: true });

  // Verify the .visible class was removed
  const overlay = appPage.locator('#settings-overlay');
  await expect(overlay).not.toHaveClass(/\bvisible\b/);
});
