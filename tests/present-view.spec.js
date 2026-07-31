const { test, expect } = require('@playwright/test');

test.describe('present view return-to behavior', () => {
  test('closing the present view from a normal card tap goes back to the deck (no overlay reopens)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('.ticket >> nth=0 >> [data-role="expand"]');
    await page.waitForSelector('#presentOverlay.open');
    await page.click('#presentClose');
    await page.waitForTimeout(200);
    expect(await page.locator('.overlay.open').count()).toBe(0);
  });

  test('closing the present view from 書いて見せる returns to that overlay, not the deck', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuWrite');
    await page.waitForSelector('#writeOverlay.open');
    await page.fill('#writeText', 'テストメモ');
    await page.click('#showWriteFullscreen');
    await page.waitForSelector('#presentOverlay.open');

    await page.click('#presentClose');
    await expect(page.locator('#writeOverlay')).toHaveClass(/open/);
  });

  test('Escape key honors the same return-to behavior as the ✕ button', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuWrite');
    await page.waitForSelector('#writeOverlay.open');
    await page.fill('#writeText', 'テストメモ');
    await page.click('#showWriteFullscreen');
    await page.waitForSelector('#presentOverlay.open');

    await page.keyboard.press('Escape');
    await expect(page.locator('#writeOverlay')).toHaveClass(/open/);
  });
});

test.describe('書いて見せる language detection', () => {
  // Regression test: kanji (CJK Unified Ideographs, 一-鿿) is shared between Japanese and
  // Chinese, so pure-kanji Chinese text (no kana) was being misdetected as Japanese and read aloud
  // with the ja-JP voice. Fixed by only trusting kana as an unambiguous "this is Japanese" signal,
  // and falling back to the currently-selected list language when text is kanji-only.
  async function speechLangFor(page, text, listLangLabel) {
    await page.evaluate(() => {
      if (window.__origSpeakRaw) return; // only wrap once
      window.__origSpeakRaw = window.speakRaw;
      window.speakRaw = function (text, speechLang, ...rest) {
        window.__lastSpeechLang = speechLang;
        return window.__origSpeakRaw.apply(this, [text, speechLang, ...rest]);
      };
    });
    if (listLangLabel) {
      await page.click('#langPickerBtn');
      await page.waitForSelector('#langPickerOverlay.open');
      await page.click(`.lang-row:has-text("${listLangLabel}")`);
    }
    await page.click('#toolsBtn');
    await page.click('#menuWrite');
    await page.waitForSelector('#writeOverlay.open');
    await page.fill('#writeText', text);
    await page.click('#showWriteFullscreen');
    await page.waitForSelector('#presentOverlay.open');
    await page.click('#presentSpeak');
    await expect.poll(() => page.evaluate(() => window.__lastSpeechLang)).not.toBeNull();
    const lang = await page.evaluate(() => window.__lastSpeechLang);
    await page.evaluate(() => { window.__lastSpeechLang = null; });
    await page.click('#presentClose');
    await page.click('#closeWrite');
    return lang;
  }

  test('pure-kanji Chinese text is read as Chinese when 中国語 is the selected language', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    expect(await speechLangFor(page, '你好', '中国語')).toBe('zh-CN');
  });

  test('text containing kana is always read as Japanese, even with another language selected', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    expect(await speechLangFor(page, 'こんにちは', '中国語')).toBe('ja-JP');
  });

  test('non-CJK text uses the selected language as before', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    expect(await speechLangFor(page, 'Hello', '英語')).toBe('en-US');
  });
});
