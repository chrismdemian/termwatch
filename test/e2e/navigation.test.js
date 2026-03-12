const { test, expect } = require('@playwright/test');
const { launchApp, closeApp } = require('./helpers/electron-app');

let appPage;

test.beforeAll(async () => {
  ({ appPage } = await launchApp());
});

test.afterAll(async () => {
  await closeApp();
});

test('URL input accepts text', async () => {
  const urlInput = appPage.locator('#url-input');
  await urlInput.fill('https://example.com');
  await expect(urlInput).toHaveValue('https://example.com');
});

test('back and forward buttons exist and are clickable', async () => {
  const btnBack = appPage.locator('#btn-back');
  const btnForward = appPage.locator('#btn-forward');

  await expect(btnBack).toBeVisible();
  await expect(btnForward).toBeVisible();

  // Click should not throw
  await btnBack.click();
  await btnForward.click();
});

test('bookmarks bar shows and add-bookmark button works', async () => {
  // Toggle bookmarks bar visible
  await appPage.locator('#btn-bookmarks').click();

  const bookmarksBar = appPage.locator('#bookmarks-bar');
  await expect(bookmarksBar).toBeVisible();

  const addBtn = appPage.locator('#btn-add-bookmark');
  await expect(addBtn).toBeVisible();
  await addBtn.click();

  // A bookmark item should appear
  await expect(appPage.locator('.bookmark-item').first()).toBeVisible({ timeout: 5_000 });
});
