const { test, expect } = require('@playwright/test');

test.describe('present view return-to behavior', () => {
  test('closing the present view from a normal card tap goes back to the deck (no overlay reopens)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('.ticket >> nth=0 >> [data-role="expand"]');
    await page.waitForSelector('#presentOverlay.open');
    await page.click('#presentClose');
    await page.waitForTimeout(200);
    expect(await page.locator('.overlay.open').count()).toBe(0);
  });
});
