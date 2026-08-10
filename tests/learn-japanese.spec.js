const { test, expect } = require('@playwright/test');
const { mockGoogleTTS } = require('./helpers');

test.describe('日本語を学ぶ（外国人向け、v1）', () => {
  test('opens from the tools menu, defaulting to the current display language', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuLearnJa');
    await page.waitForSelector('#learnJaOverlay.open');

    await expect(page.locator('#learnJaLangSel')).toHaveValue('en');
    await expect(page.locator('.lj-card').first()).toBeVisible();
    // no Japanese/romaji leaks before the card is tapped
    await expect(page.locator('.lj-card').first()).not.toHaveClass(/revealed/);
    await expect(page.locator('.lj-card .lj-back').first()).toBeHidden();
  });

  test('tapping a card reveals the Japanese text and romaji, tapping again hides it', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuLearnJa');
    await page.waitForSelector('#learnJaOverlay.open');

    const card = page.locator('.lj-card').first();
    await expect(card.locator('.lj-text')).toHaveText('Hello');
    await card.click();
    await expect(card).toHaveClass(/revealed/);
    await expect(card.locator('.lj-ja')).toHaveText('こんにちは');
    await expect(card.locator('.lj-romaji')).toHaveText("Kon'nichiwa");

    await card.click();
    await expect(card).not.toHaveClass(/revealed/);
  });

  test('switching the known-language selector reloads the list in that language', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuLearnJa');
    await page.waitForSelector('#learnJaOverlay.open');

    await expect(page.locator('.lj-card .lj-text').first()).toHaveText('Hello');
    await page.selectOption('#learnJaLangSel', 'hi');
    await expect(page.locator('.lj-card .lj-text').first()).toHaveText('नमस्ते');
  });

  test('search filters by both the known language and the Japanese text', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuLearnJa');
    await page.waitForSelector('#learnJaOverlay.open');

    await page.fill('#learnJaSearch', 'thank');
    await expect(page.locator('.lj-card')).not.toHaveCount(0);
    const texts = await page.locator('.lj-text').allTextContents();
    expect(texts.every(t => t.toLowerCase().includes('thank'))).toBe(true);
  });

  test('both speak buttons work without crashing - the target-language one and the Japanese one', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await mockGoogleTTS(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuLearnJa');
    await page.waitForSelector('#learnJaOverlay.open');

    const card = page.locator('.lj-card').first();
    await card.locator('[data-role="fg"]').click();
    await page.waitForTimeout(300);
    // reveal the back, then use its own speak button - this is the one that must not pass
    // an invalid langKeyForVoice ("ja" is not a LANGS entry, unlike every other language)
    // down to pickVoice(), which would throw once it fell through to device TTS.
    await card.click();
    await card.locator('[data-role="ja"]').click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
