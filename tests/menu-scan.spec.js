const { test, expect } = require('@playwright/test');
const { mockGemini, mockGeminiError, setGeminiKey } = require('./helpers');

// A minimal but genuinely valid 1x1 PNG, so createImageBitmap() can actually decode it in the
// browser (a fake byte buffer would fail resizeImageForGemini before ever reaching the API call).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pngBuffer = () => Buffer.from(PNG_B64, 'base64');

test.describe('メニュー翻訳（写真から）', () => {
  test('opens from the tools menu with a picker button', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await expect(page.locator('#menuScanPickBtn')).toBeVisible();
    await expect(page.locator('#menuScanResults')).toBeEmpty();
  });

  test('selecting a photo without a Gemini key shows a clear prompt, no crash', async ({ page }) => {
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');

    await page.locator('#menuScanFile').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: pngBuffer() });
    await page.waitForTimeout(300);
    expect(alerts.join()).toContain('Gemini APIキー');
    await expect(page.locator('#menuScanResults')).toBeEmpty();
  });

  test('a successful scan shows the detected language and a reading/meaning list, each playable', async ({ page, browserName }) => {
    // see tests/practice-notes.spec.js: Playwright WebKit doesn't intercept this
    // POST-with-JSON-body request pattern, so the mock never applies there.
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, {
      languageLabel: 'フランス語',
      speechLang: 'fr-FR',
      items: [
        { text: 'Coq au vin', kana: 'コック オー ヴァン', ja: '鶏肉の赤ワイン煮込み' },
        { text: 'Crème brûlée', kana: 'クレーム ブリュレ', ja: '表面を焦がしたカスタードデザート' },
      ],
    });

    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.locator('#menuScanFile').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: pngBuffer() });

    await page.waitForSelector('#menuScanResults .practice-ex', { timeout: 10000 });
    await expect(page.locator('#menuScanLangLabel')).toHaveText('検出した言語：フランス語');
    await expect(page.locator('#menuScanResults .practice-ex')).toHaveCount(2);
    await expect(page.locator('#menuScanResults .pe-text').first()).toHaveText('Coq au vin');
    await expect(page.locator('#menuScanResults .pe-kana').first()).toHaveText('コック オー ヴァン');
    await expect(page.locator('#menuScanResults .pe-ja').first()).toHaveText('鶏肉の赤ワイン煮込み');
    await expect(page.locator('#menuScanPreviewWrap')).toBeVisible();

    // the speak button should attempt Google TTS with the detected (non-curated-list) language
    const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 5000 });
    await page.locator('#menuScanResults .pe-speak').first().click();
    const req = await ttsRequest;
    expect(req.url()).toContain('tl=fr');
  });

  test('no readable text in the photo shows a helpful retry message instead of an empty list', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, { items: [] });

    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.locator('#menuScanFile').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: pngBuffer() });

    await expect(page.locator('#menuScanResults')).toContainText('読み取れませんでした', { timeout: 10000 });
  });

  test('a blocked response shows a specific message, not a generic failure', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await page.route('**/generativelanguage.googleapis.com/**', route => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ promptFeedback: { blockReason: 'SAFETY' } }),
    }));

    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.locator('#menuScanFile').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: pngBuffer() });
    await page.waitForTimeout(500);
    expect(alerts.join()).toContain('安全フィルター');
  });

  test('an API error surfaces the raw message', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGeminiError(page, 400, 'API key not valid. Please pass a valid API key.');

    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.locator('#menuScanFile').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: pngBuffer() });
    await page.waitForTimeout(500);
    expect(alerts.join()).toContain('API key not valid');
  });

  test('special characters in AI-returned text are escaped, not injected as HTML', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, {
      languageLabel: 'テスト語', speechLang: 'en-US',
      items: [{ text: '<img src=x onerror=alert(1)>', kana: '<b>bold</b>', ja: '"quoted" & escaped' }],
    });

    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.locator('#menuScanFile').setInputFiles({ name: 'menu.png', mimeType: 'image/png', buffer: pngBuffer() });

    await page.waitForSelector('#menuScanResults .practice-ex', { timeout: 10000 });
    // rendered as literal text, not parsed as markup - no extra <img>/<b> elements created from it
    await expect(page.locator('#menuScanResults img')).toHaveCount(0);
    await expect(page.locator('#menuScanResults b')).toHaveCount(0);
    await expect(page.locator('#menuScanResults .pe-text').first()).toHaveText('<img src=x onerror=alert(1)>');
  });

  test('closing the overlay from the tools menu does not crash, and the tool item is listed', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await expect(page.locator('#menuScan')).toContainText('メニュー翻訳');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.click('#closeMenuScan');
    await expect(page.locator('#menuScanOverlay')).not.toHaveClass(/open/);
  });
});
