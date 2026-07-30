const { test, expect } = require('@playwright/test');
const { setGeminiKey } = require('./helpers');

test.describe('settings', () => {
  test('language speed and Japanese speed are independent', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');

    const rateBefore = await page.locator('#rateLabel').textContent();
    await page.fill('#jaRateSlider', '1.75');
    await page.dispatchEvent('#jaRateSlider', 'input');
    await page.dispatchEvent('#jaRateSlider', 'change');
    await page.waitForTimeout(100);

    await expect(page.locator('#jaRateLabel')).toHaveText('1.75x');
    await expect(page.locator('#rateLabel')).toHaveText(rateBefore);
  });

  test('Gemini API key persists across reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'TEST_KEY_12345');

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await expect(page.locator('#geminiKeyInput')).toHaveValue('TEST_KEY_12345');
  });

  test('phrase interval slider is independently adjustable', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await page.fill('#gapSlider', '1000');
    await page.dispatchEvent('#gapSlider', 'input');
    await expect(page.locator('#gapLabel')).toHaveText('1.00秒');
  });

  test('rate slider has a large enough touch target and responds to a real drag gesture', async ({ page }) => {
    // Regression guard for a reported "slider sometimes doesn't respond" issue on mobile - the
    // native thumb was tiny (browser default) and hard to grab precisely; index.html now styles a
    // 26px custom thumb. This drives an actual mouse drag (not .fill()) to catch a similarly-tiny
    // thumb regression, and checks the touch target is at least reasonably sized.
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');

    const slider = page.locator('#rateSlider');
    const box = await slider.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(24); // roomy touch target, not a hairline default track

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const value = parseFloat(await slider.inputValue());
    expect(value).toBeGreaterThan(1.5); // dragged well past the 1.0x default
    await expect(page.locator('#rateLabel')).toContainText('x');

    await page.click('#closeSettings');
    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    expect(parseFloat(await page.locator('#rateSlider').inputValue())).toBeCloseTo(value, 1);
  });
});
