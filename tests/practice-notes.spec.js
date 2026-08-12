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
      groups: [{ title: '基本の例文', examples: [{ text: 'I go to school.', kana: 'アイ ゴー トゥー スクール', ja: '学校に行きます。', gloss: 'I(私は) go(行きます) to school(学校に)' }] }],
    });

    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', '学校');
    await page.click('#practiceGenBtn');
    await page.waitForSelector('#practiceDetailView', { state: 'visible', timeout: 8000 });
    await expect(page.locator('#pdWord')).toHaveText('school');
    await expect(page.locator('.practice-ex')).toHaveCount(1);
    await expect(page.locator('.pe-gloss')).toHaveText('🔤 I(私は) go(行きます) to school(学校に)');

    const stored = await page.evaluate(() => localStorage.getItem('phrasebook-practice-custom'));
    expect(JSON.parse(stored)).toHaveLength(1);
  });

  test('the most recently generated note is listed first, but its stored position (data-idx) is unchanged', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');

    await mockGemini(page, {
      word: 'school', wordKana: 'スクール', meaning: '学校',
      groups: [{ title: '基本の例文', examples: [{ text: 'I go to school.', kana: 'アイ ゴー トゥー スクール', ja: '学校に行きます。', gloss: 'I(私は) go(行きます) to school(学校に)' }] }],
    });
    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', 'school');
    await page.click('#practiceGenBtn');
    await page.waitForSelector('#practiceDetailView', { state: 'visible', timeout: 8000 });
    await page.click('#backToPracticeList');

    await mockGemini(page, {
      word: 'hospital', wordKana: 'ホスピタル', meaning: '病院',
      groups: [{ title: '基本の例文', examples: [{ text: 'I need a hospital.', kana: 'アイ ニード ア ホスピタル', ja: '病院が必要です。', gloss: 'I need(必要です) a hospital(病院が)' }] }],
    });
    await page.fill('#practiceGenWord', 'hospital');
    await page.click('#practiceGenBtn');
    await page.waitForSelector('#practiceDetailView', { state: 'visible', timeout: 8000 });
    await page.click('#backToPracticeList');

    // newest (hospital) first in the visible list...
    const words = await page.locator('.pc-word').allTextContents();
    expect(words).toEqual(['hospital', 'school']);
    // ...but the underlying storage order is still creation order (oldest first),
    // and each card's data-idx still points at its real position in that array
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-practice-custom')));
    expect(stored.map(p => p.word)).toEqual(['school', 'hospital']);
    const idxs = await page.locator('.practice-card').evaluateAll(els => els.map(e => e.dataset.idx));
    expect(idxs).toEqual(['1', '0']);

    // clicking the first (newest) card opens the right one
    await page.click('.practice-card >> nth=0');
    await expect(page.locator('#pdWord')).toHaveText('hospital');
  });

  test('if Gemini mistakenly bakes gloss-style annotations into text itself, the headline, speak button and ★ save all use the clean sentence - only the 🔤 line keeps the annotations', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    // Real bug: Gemini sometimes returns text with the gloss annotations baked in
    // (e.g. "I(私は) just(ただ) got here.(着いたばかりで)") instead of a plain sentence,
    // making the card unreadable and, worse, feeding the annotated text straight into
    // TTS and into the saved custom phrase. cleanExampleText() strips it defensively.
    const annotatedText = "I(私は) just(ただ) got here.(着いたばかりで) so(だから) I(私は) need(必要とする) to sit down(座る) for a minute.(少しの間)";
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, {
      word: 'just got here', wordKana: 'ジャスト ガット ヒア', meaning: '着いたばかり',
      groups: [{ title: '応用表現', examples: [{
        text: annotatedText,
        kana: 'アイ ジャスト ガット ヒア, ソウ アイ ニード トゥ シット ダウン フォー ア ミニット.',
        ja: '今来たばかりなので、ちょっと座らせてください。',
        gloss: annotatedText,
      }] }],
    });

    await page.click('#toolsBtn');
    await page.click('#menuPractice');
    await page.fill('#practiceGenWord', 'just got here');
    await page.click('#practiceGenBtn');
    await page.waitForSelector('#practiceDetailView', { state: 'visible', timeout: 8000 });

    const cleanSentence = "I just got here. so I need to sit down for a minute.";
    await expect(page.locator('.pe-text')).toHaveText(cleanSentence);
    // the gloss line is the only place the annotated form should still appear
    await expect(page.locator('.pe-gloss')).toHaveText('🔤 ' + annotatedText);
    // display order the user asked for: sentence, kana, meaning, then the detailed
    // word-by-word breakdown last (not sandwiched in the middle)
    const order = await page.locator('.pe-text-wrap > div').evaluateAll(els => els.map(e => e.className));
    expect(order).toEqual(['pe-text', 'pe-kana', 'pe-ja', 'pe-gloss']);

    await page.click('.pe-save');
    await expect(page.locator('#addJa')).toHaveValue('今来たばかりなので、ちょっと座らせてください。');
    await expect(page.locator('#add_en')).toHaveValue(cleanSentence);
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

  test('the ★ button on an example saves it as a new custom phrase, letting the user pick the category', async ({ page, browserName }) => {
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

    await page.click('.pe-save');
    await expect(page.locator('#addOverlay')).toHaveClass(/open/);
    await expect(page.locator('#practiceOverlay')).not.toHaveClass(/open/);
    await expect(page.locator('#addJa')).toHaveValue('学校に行きます。');
    await expect(page.locator('#add_en')).toHaveValue('I go to school.');
    await expect(page.locator('#add_en_kana')).toHaveValue('アイ ゴー トゥー スクール');

    // the category is left for the user to pick, not forced - the select stays interactive
    await page.selectOption('#addCat', 'その他');
    await page.click('#submitAdd');

    const stored = await page.evaluate(() => localStorage.getItem('phrasebook-custom'));
    const saved = JSON.parse(stored);
    expect(saved).toHaveLength(1);
    expect(saved[0].ja).toBe('学校に行きます。');
    expect(saved[0].cat).toBe('その他');
    expect(saved[0].en).toEqual(['I go to school.', 'アイ ゴー トゥー スクール']);
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
