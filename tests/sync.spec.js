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

    const popupPromise = page.waitForEvent('popup', { timeout: 10000 });
    await page.click('#syncSignInBtn');
    const popup = await popupPromise;
    expect(popup.url()).toContain('english-app-74dbd.firebaseapp.com/__/auth/handler');
    await popup.close().catch(() => {});

    const stillResponsive = await page.evaluate(() => document.getElementById('deck') !== null);
    expect(stillResponsive).toBe(true);
    expect(errors).toEqual([]);
  });

  test('on a mobile user agent, sign-in uses a redirect instead of a popup', async ({ browser, browserName }) => {
    // Popups are unreliable on real mobile Chrome (blocked, or can't hand the result back to the
    // opener tab) - index.html detects a mobile UA and uses signInWithRedirect there instead.
    // Tested against a real Chromium engine with an Android UA override; WebKit's own Auth-popup
    // detection limitation is already covered by the test above, independent of this UA check.
    test.skip(browserName !== 'chromium', 'this checks the mobile-UA branch specifically against Chromium; not about WebKit popup-detection limitations');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    // Firebase authorizes "localhost" by default but not "127.0.0.1" (the config's baseURL) even
    // though they're the same loopback address - go there directly so the redirect isn't rejected
    // client-side with auth/unauthorized-domain before it can navigate anywhere.
    await page.goto('http://localhost:8934/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSync');
    await page.waitForSelector('#syncOverlay.open');

    let popupFired = false;
    page.once('popup', () => { popupFired = true; });
    const originalUrl = page.url();
    await page.click('#syncSignInBtn');
    // signInWithRedirect navigates the current tab (via the Firebase authDomain handler, then on to
    // Google's real sign-in page) rather than opening a new window. Poll page.url() - a plain
    // Playwright-tracked getter, safe to read mid-navigation - instead of evaluating in-page JS,
    // which can throw when the navigation destroys the execution context mid-poll.
    // Generous timeout: this is a real navigation to live Firebase/Google infra, which can be
    // slower under parallel test load than in isolation.
    await expect.poll(() => page.url(), { timeout: 15000 }).not.toBe(originalUrl);

    expect(popupFired).toBe(false);
    await context.close();
  });
});

// A real Google sign-in can't be driven in CI, but the state that would actually get pushed to /
// pulled from Firestore is just plain data through getSyncableState()/applyCloudState() — both are
// ordinary functions on window regardless of whether a cloud round-trip ever happens, so this
// exercises the "cloud state applied on this device" path directly.
test.describe('syncable state (catOrder / langOrder included)', () => {
  test('getSyncableState includes catOrder and langOrder', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    const state = await page.evaluate(() => window.getSyncableState());
    expect(Array.isArray(state.catOrder)).toBe(true);
    expect(state.catOrder[0]).toBe('すべて');
    expect(Array.isArray(state.langOrder)).toBe(true);
    expect(state.langOrder.length).toBe(9);
  });

  test('applyCloudState reorders category tabs and the language list', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.evaluate(() => window.applyCloudState({
      catOrder: ['すべて', 'リアクション', 'あいさつ'],
      langOrder: ['ko', 'en'],
    }));

    const cats = await page.locator('.cat').evaluateAll(els => els.map(e => e.dataset.cat));
    expect(cats.slice(0, 3)).toEqual(['すべて', 'リアクション', 'あいさつ']);

    await page.click('#langPickerBtn');
    await page.waitForSelector('#langPickerOverlay.open');
    const langLabels = await page.locator('.lang-row .lp-label').allTextContents();
    expect(langLabels[0]).toBe('韓国語');
    expect(langLabels[1]).toBe('英語');
  });
});
