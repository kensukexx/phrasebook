const { test, expect } = require('@playwright/test');
const { mockCurrencyRates } = require('./helpers');

test.describe('usage manual', () => {
  test('opens from the tools menu and shows the feature sections', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuHelp');
    await page.waitForSelector('#helpOverlay.open');
    expect(await page.locator('.manual-section').count()).toBeGreaterThan(5);
    await page.click('#closeHelp');
    await expect(page.locator('#helpOverlay')).not.toHaveClass(/open/);
  });
});

test.describe('category tab reordering', () => {
  test('long-press drag reorders tabs and the order persists after reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    const before = await page.locator('.cat').evaluateAll(els => els.map(e => e.dataset.cat));
    expect(before[0]).toBe('すべて');

    const cats = page.locator('.cat');
    const srcBox = await cats.nth(1).boundingBox();
    const targetBox = await cats.nth(3).boundingBox();

    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450); // exceed the long-press threshold
    await page.mouse.move(targetBox.x + targetBox.width + 5, targetBox.y + targetBox.height / 2, { steps: 5 });
    await page.mouse.up();

    const after = await page.locator('.cat').evaluateAll(els => els.map(e => e.dataset.cat));
    expect(after).not.toEqual(before);
    expect(after[0]).toBe('すべて'); // 「すべて」は常に先頭固定

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    const afterReload = await page.locator('.cat').evaluateAll(els => els.map(e => e.dataset.cat));
    expect(afterReload).toEqual(after);
  });

  test('a plain tap still selects the category (no accidental drag)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('.cat[data-cat="あいさつ"]');
    await expect(page.locator('.cat[data-cat="あいさつ"]')).toHaveClass(/active/);
  });
});

test.describe('phrase card reordering', () => {
  test('long-press drag reorders cards within the current view and the order persists after reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('.cat[data-cat="基本ワード"]');
    await page.waitForTimeout(200);

    const before = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));

    const cards = page.locator('.ticket');
    const srcBox = await cards.nth(0).boundingBox();
    const targetBox = await cards.nth(3).boundingBox();

    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450); // exceed the long-press threshold
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200); // onUp triggers a renderDeck()

    const after = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));
    expect(after).not.toEqual(before);
    expect(new Set(after)).toEqual(new Set(before)); // same items, new order
    await expect(page.locator('.ticket-num').first()).toHaveText('01'); // renumbered after the drag

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await page.click('.cat[data-cat="基本ワード"]');
    await page.waitForTimeout(200);
    const afterReload = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));
    expect(afterReload).toEqual(after);
  });

  test('a plain tap still plays the phrase, and the pin/learn/expand buttons still work (no accidental drag)', async ({ page }) => {
    await page.route('**/translate_tts**', route => route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([0xff, 0xfb, 0x90, 0x00]) }));
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 5000 });
    await page.locator('.ticket').first().click();
    await expect(ttsRequest).resolves.toBeTruthy();

    await page.locator('.ticket').first().locator('[data-role="pin"]').click();
    await expect(page.locator('.ticket').first().locator('.pin-badge')).toBeVisible();

    await page.locator('.ticket').first().locator('[data-role="expand"]').click();
    await expect(page.locator('#presentOverlay')).toHaveClass(/open/);
  });

  test('reordering a category-filtered view leaves other categories\' relative order untouched', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('.cat[data-cat="あいさつ"]');
    await page.waitForTimeout(200);
    const greetingKeysBefore = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));

    // drag-reorder within 基本ワード only
    await page.click('.cat[data-cat="基本ワード"]');
    await page.waitForTimeout(200);
    const cards = page.locator('.ticket');
    const srcBox = await cards.nth(0).boundingBox();
    const targetBox = await cards.nth(2).boundingBox();
    await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height + 5, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    await page.click('.cat[data-cat="あいさつ"]');
    await page.waitForTimeout(200);
    const greetingKeysAfter = await page.locator('.ticket').evaluateAll(els => els.map(e => e.dataset.key));
    expect(greetingKeysAfter).toEqual(greetingKeysBefore);
  });
});

test.describe('speak overlay language selector', () => {
  test('defaults to the current list language and can be changed independently', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSpeak');
    await page.waitForSelector('#speakOverlay.open');
    await expect(page.locator('#speakLangSel')).toHaveValue('en');
    await expect(page.locator('#speakTargetLabel')).toHaveText('英語');

    await page.selectOption('#speakLangSel', 'de');
    await expect(page.locator('#speakTargetLabel')).toHaveText('ドイツ語');

    // changing the speak-overlay language must not affect the main list's language
    await page.click('#closeSpeak');
    await expect(page.locator('#langPickerBtn')).toContainText('英語');
  });
});

test.describe('currency converter', () => {
  test('shows a converted amount once rates load', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this fetch() route; the real network call goes through instead of the mock');
    await mockCurrencyRates(page, { USD: 0.0067 });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuCurrency');
    await page.waitForSelector('#currencyOverlay.open');

    await expect(page.locator('#currResult')).toHaveText('6.7 USD');
    await expect(page.locator('#currStatus')).toContainText('為替レート取得日');
  });

  test('falls back to a clear error message when the rate fetch fails', async ({ page, browserName }) => {
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this fetch() route; the real network call goes through instead of the mock');
    await page.route('**/open.er-api.com/**', route => route.fulfill({ status: 500, body: 'error' }));
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuCurrency');
    await page.waitForSelector('#currencyOverlay.open');

    await expect(page.locator('#currStatus')).toContainText('レートを取得できませんでした');
  });
});
