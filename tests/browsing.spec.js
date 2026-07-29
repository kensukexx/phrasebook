const { test, expect } = require('@playwright/test');
const { mockGoogleTTS } = require('./helpers');

test.describe('core browsing', () => {
  test('loads the deck and shows phrase cards', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#deck .ticket').first()).toBeVisible();
    const count = await page.locator('#deck .ticket').count();
    expect(count).toBeGreaterThan(5);
  });

  test('switching category filters the deck', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    const catButtons = page.locator('.cats button, .cats .cat-btn');
    const target = catButtons.filter({ hasText: '緊急' });
    await target.click();
    await page.waitForTimeout(200);
    const cats = await page.locator('#deck .ticket .cat-tag').allTextContents();
    expect(cats.length).toBeGreaterThan(0);
    for (const c of cats) expect(c).toBe('緊急');
  });

  test('search filters by Japanese text', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.fill('#search', 'ありがとう');
    await page.waitForTimeout(200);
    const jaTexts = await page.locator('#deck .ticket .ja').allTextContents();
    expect(jaTexts.some(t => t.includes('ありがとう'))).toBe(true);
  });

  test('tapping a card speak button plays via Google TTS', async ({ page }) => {
    await mockGoogleTTS(page);
    const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 5000 });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.locator('.ticket .speak').first().click();
    await expect(ttsRequest).resolves.toBeTruthy();
  });

  test('no console errors on initial load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text()); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
