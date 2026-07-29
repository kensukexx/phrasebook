const { test, expect } = require('@playwright/test');
const { mockGemini, mockGeminiError, setGeminiKey } = require('./helpers');

test.describe('practice notes (練習ノート)', () => {
  test('list starts empty with a helpful message', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.waitForSelector('#practiceOverlay.open');
    await expect(page.locator('#practiceList')).toContainText('まだ練習ノートがありません');
  });

  test('word input field is visible and usable on a narrow (mobile) viewport', async ({ page }) => {
    // regression test: the language <select> and word <input> were once in a flex
    // row where the select's width:100% forced it to claim the whole row, hiding
    // the input entirely on narrow screens.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.waitForSelector('#practiceOverlay.open');
    await expect(page.locator('#practiceGenWord')).toBeVisible();
    const box = await page.locator('#practiceGenWord').boundingBox();
    expect(box.width).toBeGreaterThan(200);
    await page.fill('#practiceGenWord', 'because');
    await expect(page.locator('#practiceGenWord')).toHaveValue('because');
  });

  test('generating without a key shows a clear prompt', async ({ page }) => {
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', 'school');
    await page.click('#practiceGenBtn');
    await page.waitForTimeout(200);
    expect(alerts.join()).toContain('Gemini APIキー');
  });

  test('successful generation renders the detail view and persists', async ({ page, browserName }) => {
    // see the comment in tests/add-phrase.spec.js: Playwright WebKit doesn't intercept
    // this POST-with-JSON-body request pattern, so the mock never applies there.
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, {
      word: 'school', wordKana: 'スクール', meaning: '学校',
      groups: [{ title: '基本の例文', examples: [{ text: 'I go to school.', kana: 'アイ ゴー トゥー スクール', ja: '学校に行きます。' }] }],
    });

    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', '学校');
    await page.click('#practiceGenBtn');
    await page.waitForSelector('#practiceDetailView', { state: 'visible', timeout: 8000 });
    await expect(page.locator('#pdWord')).toHaveText('school');
    await expect(page.locator('.practice-ex')).toHaveCount(1);

    const stored = await page.evaluate(() => localStorage.getItem('phrasebook-practice-custom'));
    expect(JSON.parse(stored)).toHaveLength(1);
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
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', 'test');
    await page.click('#practiceGenBtn');
    await page.waitForTimeout(300);
    expect(alerts.join()).toContain('安全フィルター');
  });

  test('an invalid-key error surfaces the raw API message', async ({ page, browserName }) => {
    // On WebKit this happens to pass even without the mock applying, because a fake
    // key against the real API returns the same "API key not valid" message - but
    // that means it isn't actually testing our mock/error-handling path there. Skip
    // for the same reason as the other Gemini-mocked tests above.
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    const alerts = [];
    page.on('dialog', async d => { alerts.push(d.message()); await d.accept(); });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGeminiError(page, 400, 'API key not valid. Please pass a valid API key.');

    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', 'test');
    await page.click('#practiceGenBtn');
    await page.waitForTimeout(300);
    expect(alerts.join()).toContain('API key not valid');
  });
});
