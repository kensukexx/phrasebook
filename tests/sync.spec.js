const { test, expect } = require('@playwright/test');

// This repo's index.html now ships with a real firebaseConfig (Firebase project
// "english-app-74dbd"), so these tests exercise the "configured" state: the SDK
// actually loads from the CDN, Firebase initializes, and the sign-in button works
// up to the point of opening Google's OAuth popup - full sign-in requires a real
// Google account and isn't something CI can complete, so it isn't covered here.
test.describe('cross-device sync (configured)', () => {
  test('Firebase initializes without errors and shows the signed-out state', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text()); });

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.waitForTimeout(1000); // let the module script's dynamic Firebase imports resolve

    await expect(page.locator('#syncMenuLabel')).toHaveText('同期（未ログイン）');
    expect(errors).toEqual([]);
  });

  test('sign-in button opens the sign-in overlay with a working button (not the "not configured" message)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.waitForTimeout(1000);

    await page.click('#toolsBtn');
    await page.click('#menuSync');
    await page.waitForSelector('#syncOverlay.open');
    await expect(page.locator('#syncSignInBtn')).toBeVisible();
    await expect(page.locator('#syncSignInBtn')).toHaveText('Googleでログイン');
  });

  test('clicking sign-in opens a Google OAuth popup for this Firebase project (does not crash)', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not surface the Firebase Auth popup as a `popup` event the same way chromium does');
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.waitForTimeout(1000);
    await page.click('#toolsBtn');
    await page.click('#menuSync');
    await page.waitForSelector('#syncOverlay.open');

    const popupPromise = page.waitForEvent('popup', { timeout: 5000 });
    await page.click('#syncSignInBtn');
    const popup = await popupPromise;
    expect(popup.url()).toContain('english-app-74dbd.firebaseapp.com/__/auth/handler');
    await popup.close().catch(() => {});

    const stillResponsive = await page.evaluate(() => document.getElementById('deck') !== null);
    expect(stillResponsive).toBe(true);
    expect(errors).toEqual([]);
  });
});
