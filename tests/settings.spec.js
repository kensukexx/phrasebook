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
});
