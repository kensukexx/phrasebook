const { test, expect } = require('@playwright/test');

// The rest of the suite pre-seeds phrasebook-whatsnew-seen (see playwright.config.js) so this
// popup doesn't intercept clicks in unrelated tests. These tests need the real "nothing seen
// yet" state, so they opt back out of that default.
test.use({ storageState: { cookies: [], origins: [] } });

test.describe('🎉 新機能のお知らせ popup', () => {
  test('shows automatically on a fresh load, with at least one changelog entry', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await expect(page.locator('#whatsNewOverlay')).toHaveClass(/open/);
    await expect(page.locator('.whatsnew-item')).not.toHaveCount(0);
  });

  test('dismissing it (OK button) closes it and it does not reappear on reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await expect(page.locator('#whatsNewOverlay')).toHaveClass(/open/);

    await page.click('#whatsNewOkBtn');
    await expect(page.locator('#whatsNewOverlay')).not.toHaveClass(/open/);

    const stored = await page.evaluate(() => localStorage.getItem('phrasebook-whatsnew-seen'));
    expect(stored).not.toBeNull();

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await expect(page.locator('#whatsNewOverlay')).not.toHaveClass(/open/);
  });

  test('the ✕ close button also dismisses it and persists as seen, same as OK', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#closeWhatsNew');
    await expect(page.locator('#whatsNewOverlay')).not.toHaveClass(/open/);

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await expect(page.locator('#whatsNewOverlay')).not.toHaveClass(/open/);
  });

  test('after dismissing it, the rest of the app is usable again (e.g. the tools menu opens)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#whatsNewOkBtn');
    await page.click('#toolsBtn');
    await expect(page.locator('#toolsOverlay')).toHaveClass(/open/);
  });
});
