const { test, expect } = require('@playwright/test');
const { mockGemini, mockGeminiError, setGeminiKey } = require('./helpers');

// A minimal but genuinely valid 1x1 PNG, so createImageBitmap() can actually decode it in the
// browser (a fake byte buffer would fail resizeImageForGemini before ever reaching the API call).
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const pngBuffer = () => Buffer.from(PNG_B64, 'base64');

test.describe('調べる（写真・テキスト）', () => {
  test('opens from the tools menu with a picker button', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    // the paste-text tab is the default now; the camera lives behind the second tab
    await page.click('#lookupModePhotoBtn');
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

    await page.click('#lookupModePhotoBtn');
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
    await page.click('#lookupModePhotoBtn');
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
    await page.click('#lookupModePhotoBtn');
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
    await page.click('#lookupModePhotoBtn');
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
    await page.click('#lookupModePhotoBtn');
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
    await page.click('#lookupModePhotoBtn');
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
    await expect(page.locator('#menuScan')).toContainText('調べる');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await page.click('#closeMenuScan');
    await expect(page.locator('#menuScanOverlay')).not.toHaveClass(/open/);
  });
  test('the preview shows the whole photo, because the whole photo is what gets analysed', async ({ page }) => {
    // Reported as "the position it recognises does not seem right". The image sent was always
    // the complete photo - but the preview used object-fit:cover and showed only the middle
    // ~47% of a portrait shot, so it looked like the top and bottom were being ignored.
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.click('#lookupModePhotoBtn');

    expect(await page.evaluate(() =>
      getComputedStyle(document.getElementById('menuScanPreview')).objectFit)).toBe('contain');
  });

  test('the image sent to the AI keeps the full frame and its aspect ratio', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    const sent = await page.evaluate(async () => {
      // a tall 3:4 frame, the shape a phone photo of a menu actually has
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 1200, 1600);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
      const file = new File([blob], 'menu.jpg', { type: 'image/jpeg' });

      const out = await resizeImageForGemini(file);
      const url = URL.createObjectURL(out.blob);
      const dim = await new Promise((r) => {
        const img = new Image();
        img.onload = () => r({ w: img.naturalWidth, h: img.naturalHeight });
        img.src = url;
      });
      return dim;
    });

    // same 3:4 shape as the original - nothing cropped off any edge
    expect(sent.w / sent.h).toBeCloseTo(1200 / 1600, 2);
    // and big enough that small menu text survives; 1280 used to squeeze it harder
    expect(Math.max(sent.w, sent.h)).toBeGreaterThanOrEqual(1600);
  });

});
  test('pasted text is broken down into reading and meaning, without needing a Gemini key', async ({ page }) => {
    // The key point of putting this here rather than in the AI-only 学習ラウンジ: the app can
    // already translate and can generate English katakana on its own, so the tool still does
    // something useful with no key - only the 🔤 word-by-word part needs the AI.
    await page.route('**/translate_a/single**', route => {
      const url = new URL(route.request().url());
      const out = url.searchParams.get('tl') === 'ja' ? '駅はどこですか？' : 'Where is the station?';
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([[[out, '', null]]]) });
    });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.waitForSelector('#menuScanOverlay.open');
    await expect(page.locator('#lookupTextPane')).toBeVisible(); // paste is the default input

    await page.fill('#lookupText', 'Where is the station?');
    await page.click('#lookupTextBtn');
    await page.waitForSelector('#menuScanResults .practice-ex');

    await expect(page.locator('.pe-text').first()).toHaveText('Where is the station?');
    await expect(page.locator('.pe-kana').first()).toHaveText('ウェア イズ ザ ステーション?');
    await expect(page.locator('.pe-ja').first()).toHaveText('駅はどこですか？');
    await expect(page.locator('.pe-gloss')).toHaveCount(0); // that part does need the AI
  });

  test('pasting Japanese goes the other way and gives the English with its reading', async ({ page }) => {
    await page.route('**/translate_a/single**', route => {
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([[['Where is the station?', '', null]]]) });
    });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.fill('#lookupText', '駅はどこですか？');
    await page.click('#lookupTextBtn');
    await page.waitForSelector('#menuScanResults .practice-ex');

    await expect(page.locator('.pe-text').first()).toHaveText('Where is the station?');
    await expect(page.locator('.pe-kana').first()).not.toBeEmpty();
    await expect(page.locator('.pe-ja').first()).toHaveText('駅はどこですか？');
  });

  test('with a key the breakdown gains 🔤 word meanings, and ★ carries everything into the add panel', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not intercept this request pattern');
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'FAKE_KEY');
    await mockGemini(page, {
      languageLabel: '英語', speechLang: 'en-US',
      items: [{ text: 'Where is the station?', kana: 'ウェア イズ ザ ステーション',
                ja: '駅はどこですか？', gloss: 'Where(どこに) is(ある) the station(その駅は)?' }],
    });
    await page.click('#toolsBtn');
    await page.click('#menuScan');
    await page.fill('#lookupText', 'Where is the station?');
    await page.click('#lookupTextBtn');
    await page.waitForSelector('.pe-gloss');

    await expect(page.locator('.pe-gloss')).toHaveText('🔤 Where(どこに) is(ある) the station(その駅は)?');
    await expect(page.locator('#menuScanLangLabel')).toContainText('英語');

    await page.locator('#menuScanResults .pe-save').first().click();
    await expect(page.locator('#addOverlay')).toHaveClass(/open/);
    await expect(page.locator('#addJa')).toHaveValue('駅はどこですか？');
    await expect(page.locator('#add_en')).toHaveValue('Where is the station?');
    await expect(page.locator('#add_en_kana')).toHaveValue('ウェア イズ ザ ステーション');
    await expect(page.locator('#addNote')).toHaveValue('🔤 Where(どこに) is(ある) the station(その駅は)?');
  });

