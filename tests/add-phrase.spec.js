const { test, expect } = require('@playwright/test');
const { mockTranslate, mockGemini, setGeminiKey } = require('./helpers');

test.describe('add custom phrase', () => {
  test('auto-translate fills every language field', async ({ page }) => {
    await mockTranslate(page, {
      en: 'Hello', ko: '안녕하세요', de: 'Hallo', ro: 'Bună', es: 'Hola',
      fr: 'Bonjour', vi: 'Xin chào', 'zh-CN': '你好', pt: 'Olá',
    });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.fill('#addJa', 'こんにちは');
    await page.click('#autoTranslate');
    await page.waitForFunction(() => document.getElementById('autoTranslate').textContent.includes('自動翻訳'), { timeout: 8000 });
    await expect(page.locator('#add_en')).toHaveValue('Hello');
    await expect(page.locator('#add_ko')).toHaveValue('안녕하세요');
    await expect(page.locator('#add_pt')).toHaveValue('Olá');
  });

  test('auto-translate also fills kana via Gemini when a key is set', async ({ page, browserName }) => {
    // Playwright's WebKit engine doesn't reliably intercept this POST-with-JSON-body
    // request to generativelanguage.googleapis.com (confirmed: the route handler never
    // fires and the real network request goes out instead). The app itself is fine -
    // this is exercised on chromium, and the app's error handling for a real failed
    // request is covered below and in practice-notes.spec.js.
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern; see comment above');
    await mockTranslate(page, { en: 'Hello' });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, {
      en: 'ハロー', ko: 'アンニョンハセヨ', de: 'ハロー', ro: 'ブナ', es: 'オラ',
      fr: 'ボンジュール', vi: 'シンチャオ', zh: 'ニーハオ', pt: 'オラー',
    });

    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.fill('#addJa', 'こんにちは');
    await page.click('#autoTranslate');
    await page.waitForFunction(() => document.getElementById('autoTranslate').textContent.includes('自動翻訳'), { timeout: 8000 });
    await expect(page.locator('#add_en_kana')).toHaveValue('ハロー');
    await expect(page.locator('#add_ko_kana')).toHaveValue('アンニョンハセヨ');
  });

  test('without a Gemini key, kana fields stay empty (no crash)', async ({ page }) => {
    await mockTranslate(page, { en: 'Hello' });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.fill('#addJa', 'こんにちは');
    await page.click('#autoTranslate');
    await page.waitForFunction(() => document.getElementById('autoTranslate').textContent.includes('自動翻訳'), { timeout: 8000 });
    await expect(page.locator('#add_en')).toHaveValue('Hello');
    await expect(page.locator('#add_en_kana')).toHaveValue('');
    expect(errors).toEqual([]);
  });

  test('saved custom phrase appears in the deck', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.fill('#addJa', 'テストフレーズ');
    await page.fill('#add_en', 'Test phrase');
    await page.fill('#add_en_kana', 'テスト フレーズ');
    await page.click('#submitAdd');
    await page.waitForTimeout(300);
    await page.fill('#search', 'テストフレーズ');
    await page.waitForTimeout(200);
    await expect(page.locator('#deck .ticket .ja').first()).toHaveText('テストフレーズ');
  });
});

test.describe('custom categories', () => {
  test('the ＋ button creates a new category, selects it, and it appears as a tab', async ({ page }) => {
    let promptMessage = '';
    page.on('dialog', async d => { promptMessage = d.message(); await d.accept('推し活グッズ'); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    await page.waitForSelector('#addOverlay.open');
    await page.click('#addCatNew');
    expect(promptMessage).toContain('新しいカテゴリ');
    await expect(page.locator('#addCat')).toHaveValue('推し活グッズ');
    await expect(page.locator('#addCatDeleteRow')).toBeVisible();

    await page.fill('#addJa', 'ペンライトを持ってきましたか？');
    await page.click('#submitAdd');
    await page.waitForTimeout(300);
    await expect(page.locator('.cat[data-cat="推し活グッズ"]')).toBeVisible();

    // persists across reload
    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await expect(page.locator('.cat[data-cat="推し活グッズ"]')).toBeVisible();
    const stored = await page.evaluate(() => localStorage.getItem('phrasebook-custom-cats'));
    expect(JSON.parse(stored)).toEqual(['推し活グッズ']);
  });

  test('a duplicate category name is rejected', async ({ page }) => {
    const alerts = [];
    page.on('dialog', async d => {
      if (d.type() === 'prompt') { await d.accept('あいさつ'); return; }
      alerts.push(d.message());
      await d.accept();
    });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    await page.click('#addCatNew');
    await page.waitForTimeout(200);
    expect(alerts.join()).toContain('すでに使われています');
  });

  test('the delete link only shows for custom categories, and deleting one moves its phrases to その他', async ({ page }) => {
    page.on('dialog', async d => { await d.accept(d.type() === 'prompt' ? '推し活グッズ' : undefined); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#openAdd');
    // a built-in category should never show the delete option
    await expect(page.locator('#addCatDeleteRow')).toBeHidden();

    await page.click('#addCatNew');
    await page.fill('#addJa', 'ペンライトを持ってきましたか？');
    await page.click('#submitAdd');
    await page.waitForTimeout(300);

    const card = page.locator('.ticket:has-text("ペンライトを持ってきましたか")');
    await card.locator('[data-role=edit]').click();
    await page.waitForSelector('#addOverlay.open');
    await expect(page.locator('#addCatDeleteRow')).toBeVisible();
    await page.click('#addCatDelete');
    await page.waitForTimeout(300);

    await expect(page.locator('.cat[data-cat="推し活グッズ"]')).toHaveCount(0);
    await expect(card.locator('.cat-tag')).toHaveText('その他');
  });
});
