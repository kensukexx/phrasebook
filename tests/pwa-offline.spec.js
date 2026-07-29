const { test, expect } = require('@playwright/test');

test.describe('offline / PWA', () => {
  test('service worker caches the shell and the app opens fully offline', async ({ page, context, browserName }) => {
    // Playwright's WebKit offline emulation combined with a service worker throws a
    // low-level "internal error" on navigation (confirmed independent of this app -
    // reproduces with plain context.setOffline(true) + goto). Covered on chromium.
    test.skip(browserName === 'webkit', 'Playwright WebKit + offline emulation + service worker is unreliable');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });

    await context.setOffline(true);
    const page2 = await context.newPage();
    await page2.goto('/index.html', { waitUntil: 'domcontentloaded' });
    await expect(page2.locator('#deck .ticket').first()).toBeVisible({ timeout: 5000 });
    await context.setOffline(false);
  });

  test('manifest and icons are reachable', async ({ page }) => {
    const manifestRes = await page.request.get('/manifest.json');
    expect(manifestRes.ok()).toBe(true);
    const manifest = await manifestRes.json();
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      const res = await page.request.get('/' + icon.src.replace('./', ''));
      expect(res.ok()).toBe(true);
    }
  });
});
