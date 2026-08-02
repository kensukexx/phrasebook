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

  test('on a mobile user agent, sign-in still uses a popup (redirect cannot complete cross-origin)', async ({ browser, browserName }) => {
    // The app is hosted on kensukexx.github.io while authDomain is
    // english-app-74dbd.firebaseapp.com (a different site). Safari and Chrome 115+
    // partition third-party storage, so signInWithRedirect silently returns no result
    // after the round-trip in that setup (see Firebase's redirect best practices).
    // index.html therefore uses signInWithPopup on every platform, mobile included -
    // this test pins that behavior so a mobile-UA redirect branch doesn't sneak back in.
    test.skip(browserName !== 'chromium', 'checks the mobile-UA behavior against Chromium, where popup events are reliably observable');
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    });
    const page = await context.newPage();
    // Firebase authorizes "localhost" by default but not "127.0.0.1" (the config's baseURL) -
    // go there directly so sign-in isn't rejected client-side with auth/unauthorized-domain.
    await page.goto('http://localhost:8934/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.waitForTimeout(1000); // let the module script's dynamic Firebase imports resolve
    await page.click('#toolsBtn');
    await page.click('#menuSync');
    await page.waitForSelector('#syncOverlay.open');

    const originalUrl = page.url();
    const popupPromise = page.waitForEvent('popup', { timeout: 15000 });
    await page.click('#syncSignInBtn');
    const popup = await popupPromise;
    expect(popup.url()).toContain('english-app-74dbd.firebaseapp.com/__/auth/handler');
    await popup.close().catch(() => {});

    // The main tab must stay put: a navigation here would mean the redirect branch ran.
    expect(page.url()).toBe(originalUrl);
    await context.close();
  });
});

// A real Google sign-in can't be driven in CI, but the state that would actually get pushed to /
// pulled from Firestore is just plain data through getSyncableState()/applyCloudState() — both are
// ordinary functions on window regardless of whether a cloud round-trip ever happens, so this
// exercises the "cloud state applied on this device" path directly.
test.describe('syncable state (catOrder / langOrder / phraseOrder included)', () => {
  test('getSyncableState includes catOrder, langOrder and phraseOrder', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    const state = await page.evaluate(() => window.getSyncableState());
    expect(Array.isArray(state.catOrder)).toBe(true);
    expect(state.catOrder[0]).toBe('すべて');
    expect(Array.isArray(state.langOrder)).toBe(true);
    expect(state.langOrder.length).toBe(9);
    expect(Array.isArray(state.phraseOrder)).toBe(true);
    expect(state.phraseOrder.length).toBe(284); // built-in phrase count
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

  test('applyCloudState reorders phrase cards', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('.cat[data-cat="あいさつ"]');
    await page.waitForTimeout(200);

    const keys = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));
    const reversedGreetings = keys.slice().reverse();

    await page.evaluate((newOrder) => window.applyCloudState({ phraseOrder: newOrder }), reversedGreetings);
    await page.waitForTimeout(200);

    const after = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));
    expect(after).toEqual(reversedGreetings);
  });

  test('a duplicate entry in a persisted catOrder/langOrder does not render as two tabs/rows', async ({ page }) => {
    // Regression test: orderedCats()/orderedLangs() used to map catOrder/langOrder directly to
    // rendered tabs, so if that array ever ended up with a duplicate key (old app version, a
    // sync race, hand-edited localStorage), the same category or language would render twice
    // and never self-heal.
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.evaluate(() => window.applyCloudState({
      catOrder: ['すべて', 'あいさつ', 'あいさつ', 'リアクション'],
      langOrder: ['en', 'ko', 'en'],
    }));

    const cats = await page.locator('.cat').evaluateAll(els => els.map(e => e.dataset.cat));
    expect(cats.filter(c => c === 'あいさつ').length).toBe(1);

    await page.click('#langPickerBtn');
    await page.waitForSelector('#langPickerOverlay.open');
    const langKeys = await page.locator('.lang-row').evaluateAll(els => els.map(e => e.dataset.key));
    expect(langKeys.filter(k => k === 'en').length).toBe(1);
  });
});
