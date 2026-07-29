const { test, expect } = require('@playwright/test');
const { mockTranslate, mockGemini, mockGeminiError, mockSpeechRecognition, setGeminiKey } = require('./helpers');

test.describe('相手の番 (conversation mode)', () => {
  test('listens in the chosen language, translates to Japanese, and shows it in the present view', async ({ page }) => {
    await mockSpeechRecognition(page, 'Hello');
    await mockTranslate(page, { ja: 'こんにちは' }); // reverse direction: sl=en&tl=ja
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');

    await page.waitForSelector('#presentOverlay.open');
    await expect(page.locator('#presentJa')).toHaveText('Hello');
    await expect(page.locator('#presentPhrase')).toHaveText('こんにちは');
  });

  test('saving from the result fills the add-phrase form in both directions', async ({ page }) => {
    await mockSpeechRecognition(page, 'Hello');
    await mockTranslate(page, { ja: 'こんにちは' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');
    await page.waitForSelector('#presentOverlay.open');

    await page.click('#presentSave');
    await page.waitForSelector('#addOverlay.open');
    await expect(page.locator('#addJa')).toHaveValue('こんにちは');
    await expect(page.locator('#add_en')).toHaveValue('Hello');
  });

  test('falls back to Gemini when Google Translate fails', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this fetch() route; the real network call goes through instead of the mocked failure');
    await mockSpeechRecognition(page, 'Hello');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'TEST_KEY');
    await mockGemini(page, { translation: 'こんにちは（Gemini）' });
    await page.route('**/translate.googleapis.com/**', route => route.fulfill({ status: 500, body: 'error' }));

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');

    await page.waitForSelector('#presentOverlay.open');
    await expect(page.locator('#presentPhrase')).toHaveText('こんにちは（Gemini）');
  });

  test('without a Gemini key, a translate failure shows a clear alert (no crash)', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this fetch() route; the real network call goes through instead of the mocked failure');
    await mockSpeechRecognition(page, 'Hello');
    await page.route('**/translate.googleapis.com/**', route => route.fulfill({ status: 500, body: 'error' }));
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');

    await expect.poll(() => alerts.join()).toContain('翻訳に失敗しました');
    expect(await page.evaluate(() => document.getElementById('deck') !== null)).toBe(true);
  });

  test('an unsupported browser shows a clear message instead of crashing', async ({ page }) => {
    await page.addInitScript(() => {
      delete window.SpeechRecognition;
      delete window.webkitSpeechRecognition;
    });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.click('#speakListenBtn');

    await expect.poll(() => alerts.join()).toContain('対応していません');
  });

  test('closing the result returns to 話す instead of the deck, ready for another turn', async ({ page }) => {
    await mockSpeechRecognition(page, 'Hello');
    await mockTranslate(page, { ja: 'こんにちは' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');
    await page.waitForSelector('#presentOverlay.open');

    await page.click('#presentClose');
    await expect(page.locator('#speakOverlay')).toHaveClass(/open/);
  });
});

test.describe('話す (forward translation) — return-to and input reset', () => {
  test('closing the result returns to 話す with the Japanese input cleared for the next turn', async ({ page }) => {
    await mockTranslate(page, { en: 'Hello there' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.fill('#speakText', 'こんにちは');
    await page.click('#doSpeakTranslate');
    await page.waitForSelector('#presentOverlay.open');

    await page.click('#presentClose');
    await expect(page.locator('#speakOverlay')).toHaveClass(/open/);
    await expect(page.locator('#speakText')).toHaveValue('');
  });

  test('saving the result opens the add-phrase form directly, without 話す reappearing underneath', async ({ page }) => {
    await mockTranslate(page, { en: 'Hello there' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.fill('#speakText', 'こんにちは');
    await page.click('#doSpeakTranslate');
    await page.waitForSelector('#presentOverlay.open');

    await page.click('#presentSave');
    await page.waitForSelector('#addOverlay.open');
    expect(await page.locator('#speakOverlay.open').count()).toBe(0);
    expect(await page.locator('#presentOverlay.open').count()).toBe(0);
  });
});
