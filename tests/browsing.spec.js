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

  test('the ~ placeholder in 会話パターン cards is stripped before being sent to TTS', async ({ page }) => {
    // Regression test: 会話パターン entries use "~" as a fill-in-the-blank marker (e.g. "I want to
    // ~"), but some TTS engines audibly read the symbol aloud (reported as a stray "テーダ"-like
    // sound at the end of playback). speakRaw() now strips it before synthesis.
    await mockGoogleTTS(page);
    const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 5000 });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#patternModeToggle');
    await page.waitForTimeout(200);
    await page.click('.cat[data-cat="会話パターン"]');
    await page.waitForTimeout(200);
    await page.locator('.ticket .speak').first().click();
    const req = await ttsRequest;
    const q = new URL(req.url()).searchParams.get('q');
    expect(q).not.toContain('~');
    expect(q.trim()).toBe(q); // no leftover leading/trailing whitespace from stripping
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

  test('the category tabs and the play/speed/pin/unlearned filter row stay pinned to the top while scrolling', async ({ page }) => {
    // Regression test: category tabs (.cats) were already sticky, but the row below them
    // (.filterbar: ▶ 聞き流し / speed / 📌 / ✓ / progress) scrolled away with the deck. Both
    // are now wrapped in a single .sticky-controls container so they move as one unit.
    await page.setViewportSize({ width: 390, height: 700 });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    // scroll far enough that the header banner (not sticky) has scrolled fully out of view,
    // so .cats has reached its stuck position at the very top
    await page.evaluate(() => window.scrollBy(0, 600)); // mouse.wheel() isn't supported in mobile WebKit
    await page.waitForTimeout(200);
    const catsStuck = await page.locator('#cats').boundingBox();
    const filterbarStuck = await page.locator('.filterbar').boundingBox();
    expect(catsStuck.y).toBe(0);
    // filterbar sits directly below cats with no gap or overlap
    expect(filterbarStuck.y).toBe(catsStuck.y + catsStuck.height);

    // scrolling further must not move them again - they're pinned, not just coincidentally placed
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(200);
    const catsAfterMore = await page.locator('#cats').boundingBox();
    const filterbarAfterMore = await page.locator('.filterbar').boundingBox();
    expect(catsAfterMore.y).toBe(catsStuck.y);
    expect(filterbarAfterMore.y).toBe(filterbarStuck.y);
  });

  test('no horizontal overflow on a narrow viewport', async ({ page }) => {
    // Reported: on a real phone (WebKit-based Chrome/Safari on iOS), the whole page rendered
    // visibly shrunk with a gray gap down the right edge. Root cause: .searchwrap input had
    // flex:1 but no min-width:0, so its browser-default min-width:auto stopped it from ever
    // shrinking below its intrinsic content width, overflowing the row a few pixels wider than
    // the viewport. Chromium tolerates a few px of overflow silently, but mobile WebKit reacts by
    // auto-zooming the entire page out to avoid a horizontal scrollbar - which is why this was
    // never caught by Chromium-only visual testing and needed a real phone screenshot to spot.
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('覚えた✓ is per-language', () => {
  // Regression test: 覚えた used to be a single flag shared across every language for a given
  // phrase, so marking "Hello" learned while viewing English also showed the same phrase as
  // learned while browsing French/German/etc. Fixed by keying `learned` on both the phrase and
  // the currently displayed language (learnedKey() = keyOf(d) + "::" + currentLang).
  test('marking a phrase learned in one language does not mark it learned in another', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.locator('.ticket', { hasText: 'こんにちは' }).locator('[data-role="learn"]').click();
    await expect(page.locator('.ticket', { hasText: 'こんにちは' }).locator('[data-role="learn"]')).toHaveClass(/done/);

    await page.click('#langPickerBtn');
    await page.waitForSelector('#langPickerOverlay.open');
    await page.click('#langPickList >> text=ドイツ語');
    await page.waitForTimeout(200);

    await expect(page.locator('.ticket', { hasText: 'こんにちは' }).locator('[data-role="learn"]')).not.toHaveClass(/done/);

    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-learned')));
    expect(stored).toEqual({ 'こんにちは::en': true });
  });

  test('a legacy (pre-per-language) learned entry migrates to English on load, not to every language', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.evaluate(() => {
      localStorage.setItem('phrasebook-learned', JSON.stringify({ 'こんにちは': true }));
    });
    await page.reload();
    await page.waitForSelector('#deck .ticket');

    await expect(page.locator('.ticket', { hasText: 'こんにちは' }).locator('[data-role="learn"]')).toHaveClass(/done/);
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-learned')));
    expect(stored).toEqual({ 'こんにちは::en': true });

    await page.click('#langPickerBtn');
    await page.waitForSelector('#langPickerOverlay.open');
    await page.click('#langPickList >> text=韓国語');
    await page.waitForTimeout(200);
    await expect(page.locator('.ticket', { hasText: 'こんにちは' }).locator('[data-role="learn"]')).not.toHaveClass(/done/);
  });
});
