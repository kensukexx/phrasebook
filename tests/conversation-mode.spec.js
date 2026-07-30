const { test, expect } = require('@playwright/test');
const { mockTranslate, mockGemini, mockGeminiError, mockSpeechRecognition, setGeminiKey } = require('./helpers');

// 話す・相手の番はGoogle翻訳アプリのように画面遷移せず、#speakResult内に結果を表示する
// （前は翻訳のたびに#presentOverlayへ切り替わっていたが、使いにくいという指摘を受けて変更）。
test.describe('相手の番 (conversation mode)', () => {
  test('listens in the chosen language and shows the Japanese translation inline (no screen switch)', async ({ page }) => {
    await mockSpeechRecognition(page, 'Hello');
    await mockTranslate(page, { ja: 'こんにちは' }); // reverse direction: sl=en&tl=ja
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');

    await expect(page.locator('#speakResult')).toBeVisible();
    await expect(page.locator('#srSource')).toHaveText('Hello');
    await expect(page.locator('#srPhrase')).toHaveText('こんにちは');
    // stays on the same screen - no fullscreen present view, speakOverlay never closed
    expect(await page.locator('#presentOverlay.open').count()).toBe(0);
    await expect(page.locator('#speakOverlay')).toHaveClass(/open/);
  });

  test('saving from the inline result fills the add-phrase form in both directions, closing 話す cleanly', async ({ page }) => {
    await mockSpeechRecognition(page, 'Hello');
    await mockTranslate(page, { ja: 'こんにちは' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');
    await expect(page.locator('#speakResult')).toBeVisible();

    await page.click('#srSave');
    await page.waitForSelector('#addOverlay.open');
    await expect(page.locator('#addJa')).toHaveValue('こんにちは');
    await expect(page.locator('#add_en')).toHaveValue('Hello');
    expect(await page.locator('#speakOverlay.open').count()).toBe(0);
    expect(await page.locator('.overlay.open').count()).toBe(1); // only addOverlay
  });

  test('"⤢ 大きく見せる" opens the fullscreen present view, and closing it returns to 話す with the result still there', async ({ page }) => {
    await mockSpeechRecognition(page, 'Hello');
    await mockTranslate(page, { ja: 'こんにちは' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'en');
    await page.click('#speakListenBtn');
    await expect(page.locator('#speakResult')).toBeVisible();

    await page.click('#srExpand');
    await page.waitForSelector('#presentOverlay.open');
    await expect(page.locator('#presentJa')).toHaveText('Hello');
    await expect(page.locator('#presentPhrase')).toHaveText('こんにちは');

    await page.click('#presentClose');
    await expect(page.locator('#speakOverlay')).toHaveClass(/open/);
    await expect(page.locator('#speakResult')).toBeVisible();
    expect(await page.locator('#presentOverlay.open').count()).toBe(0);
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

    await expect(page.locator('#srPhrase')).toHaveText('こんにちは（Gemini）');
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

  test('a recognizer that hangs forever (no result/error/end) times out instead of getting stuck', async ({ page }) => {
    // Some devices silently fail to support a given recognition language: no error, no result,
    // no "end" event ever fires - just permanent silence (reported for Chinese on a real phone).
    // Also simulate abort() itself being a no-op, since that's the worst case for the escape hatch.
    await page.addInitScript(() => {
      class HangingRecognition {
        constructor(){ this.lang = ''; }
        start(){ setTimeout(() => { this.onstart && this.onstart(); }, 10); }
        abort(){}
        stop(){}
      }
      window.SpeechRecognition = HangingRecognition;
      window.webkitSpeechRecognition = HangingRecognition;
    });
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.selectOption('#speakLangSel', 'zh');
    await page.click('#speakListenBtn');
    await expect(page.locator('#speakListenBtn')).toHaveClass(/listening/);

    await expect(page.locator('#speakListenBtn')).not.toHaveClass(/listening/, { timeout: 15000 });
    await expect.poll(() => alerts.join()).toContain('タイムアウト');

    // and the button must be usable again afterward, not permanently jammed
    await page.click('#speakListenBtn');
    await expect(page.locator('#speakListenBtn')).toHaveClass(/listening/);
  });
});

test.describe('話す (forward translation) — inline result', () => {
  test('translating shows the result inline without leaving 話す, and keeps the typed text (like Google Translate)', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this fetch() route; the real network call goes through instead of the mock, so the exact translated text can differ');
    await mockTranslate(page, { en: 'Hello there' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.fill('#speakText', 'こんにちは');
    await page.click('#doSpeakTranslate');

    await expect(page.locator('#speakResult')).toBeVisible();
    await expect(page.locator('#srSource')).toHaveText('こんにちは');
    await expect(page.locator('#srPhrase')).toHaveText('Hello there');
    await expect(page.locator('#speakOverlay')).toHaveClass(/open/);
    expect(await page.locator('#presentOverlay.open').count()).toBe(0);
    await expect(page.locator('#speakText')).toHaveValue('こんにちは'); // not cleared
  });

  test('the result panel resets when 話す is reopened fresh from the tools menu', async ({ page }) => {
    await mockTranslate(page, { en: 'Hello there' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.fill('#speakText', 'こんにちは');
    await page.click('#doSpeakTranslate');
    await expect(page.locator('#speakResult')).toBeVisible();
    await page.click('#closeSpeak');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await expect(page.locator('#speakResult')).toBeHidden();
  });

  test('saving the result opens the add-phrase form directly, closing 話す (no overlay stacking)', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this fetch() route; the real network call goes through instead of the mock, so the exact translated text can differ');
    await mockTranslate(page, { en: 'Hello there' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.fill('#speakText', 'こんにちは');
    await page.click('#doSpeakTranslate');
    await expect(page.locator('#speakResult')).toBeVisible();

    await page.click('#srSave');
    await page.waitForSelector('#addOverlay.open');
    await expect(page.locator('#addJa')).toHaveValue('こんにちは');
    await expect(page.locator('#add_en')).toHaveValue('Hello there');
    expect(await page.locator('#speakOverlay.open').count()).toBe(0);
    expect(await page.locator('.overlay.open').count()).toBe(1); // only addOverlay - no stacking
  });

  test('saving from the expanded fullscreen view also closes 話す cleanly (no overlay stacking)', async ({ page }) => {
    await mockTranslate(page, { en: 'Hello there' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await page.fill('#speakText', 'こんにちは');
    await page.click('#doSpeakTranslate');
    await page.click('#srExpand');
    await page.waitForSelector('#presentOverlay.open');

    await page.click('#presentSave');
    await page.waitForSelector('#addOverlay.open');
    expect(await page.locator('#speakOverlay.open').count()).toBe(0);
    expect(await page.locator('#presentOverlay.open').count()).toBe(0);
    expect(await page.locator('.overlay.open').count()).toBe(1); // only addOverlay
  });
});
