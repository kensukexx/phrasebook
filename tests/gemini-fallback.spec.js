const { test, expect } = require('@playwright/test');
const { setGeminiKey } = require('./helpers');

// Google Translate / Google TTS are unofficial endpoints that could break without
// notice. When a Gemini key is configured, both fall back to Gemini instead of
// failing outright.
test.describe('Gemini fallback when Google endpoints fail', () => {
  // The service worker now intercepts translate_tts itself to cache successful responses (see
  // sw.js), and its own internal fetch() calls aren't visible to page.route() - only the page's
  // own requests are. These tests need translate_tts to reliably fail as mocked, so the service
  // worker is disabled here to keep page.route() in full control, same as the rest of the suite.
  test.use({ serviceWorkers: 'block' });

  test('translation falls back to Gemini when Google Translate is unreachable', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern (see other spec files)');
    await page.route('**/translate.googleapis.com/**', route => route.abort('failed'));
    await page.route('**/generativelanguage.googleapis.com/**', route => route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ translation: 'Hello (via Gemini)' }) }] } }] }),
    }));

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.fill('#addJa', 'こんにちは');
    await page.click('#autoTranslate');
    await page.waitForFunction(() => document.getElementById('autoTranslate').textContent.includes('自動翻訳'), { timeout: 10000 });
    await expect(page.locator('#add_en')).toHaveValue('Hello (via Gemini)');
  });

  test('without a Gemini key, a Google Translate outage just fails that language (no crash)', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route('**/translate.googleapis.com/**', route => route.abort('failed'));

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.fill('#addJa', 'こんにちは');
    page.once('dialog', d => d.accept());
    await page.click('#autoTranslate');
    await page.waitForFunction(() => document.getElementById('autoTranslate').textContent.includes('自動翻訳'), { timeout: 10000 });
    expect(errors).toEqual([]);
  });

  test('TTS falls back to Gemini when Google TTS is unreachable', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern (see other spec files)');
    const silentPcm = Buffer.alloc(24000 * 2).toString('base64'); // 1s of silence, 16-bit/24kHz mono
    await page.route('**/translate_tts**', route => route.abort('failed'));
    let geminiTtsCalled = false;
    await page.route('**/generativelanguage.googleapis.com/**', route => {
      geminiTtsCalled = true;
      route.fulfill({
        status: 200, contentType: 'application/json',
        body: JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ inlineData: { mimeType: 'audio/L16;rate=24000', data: silentPcm } }] } }] }),
      });
    });

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await page.locator('.ticket .speak').first().click();
    await page.waitForTimeout(1500);
    expect(geminiTtsCalled).toBe(true);
  });

  test('when both Google and Gemini TTS fail, device TTS still plays', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern (see other spec files)');
    await page.route('**/translate_tts**', route => route.abort('failed'));
    await page.route('**/generativelanguage.googleapis.com/**', route => route.fulfill({ status: 500, body: 'fail' }));

    await page.goto('/index.html');
    await page.evaluate(() => {
      const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
      window.speechSynthesis.speak = function (u) { window.__synthCalled = true; return orig(u); };
    });
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await page.locator('.ticket .speak').first().click();
    await page.waitForTimeout(1500);
    const synthCalled = await page.evaluate(() => !!window.__synthCalled);
    expect(synthCalled).toBe(true);
  });
});
