const { test, expect } = require('@playwright/test');

// Firebase isn't configured in this repo's index.html (placeholder firebaseConfig),
// so these tests only cover the graceful "not configured" state. Once a real
// firebaseConfig is filled in, this suite should be extended with mocked
// Firebase Auth/Firestore coverage for sign-in, push, and pull.
test.describe('cross-device sync (unconfigured state)', () => {
  test('sync menu shows "not logged in" and does not crash the app', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await expect(page.locator('#syncMenuLabel')).toHaveText('同期（未ログイン）');
    expect(errors).toEqual([]);
  });

  test('opening sync with no Firebase config explains it is not set up yet', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSync');
    await page.waitForSelector('#syncOverlay.open');
    await expect(page.locator('#syncSignedOut .hint')).toContainText('まだ設定されていません');
    await expect(page.locator('#syncSignInBtn')).toBeHidden();
  });
});
