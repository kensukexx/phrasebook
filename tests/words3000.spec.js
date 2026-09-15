const { test, expect } = require('@playwright/test');
const { mockGoogleTTS } = require('./helpers');

test.describe('英単語3000（頻出英単語を頻度順に学ぶ独立モード）', () => {
  test('opens from the tools menu, defaulting to the examples-collapsed state', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    const card = page.locator('.w3k-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.w3k-word')).toHaveText('the');
    // no meaning/example leaks before the card is tapped
    await expect(card).not.toHaveClass(/revealed/);
    await expect(card.locator('.w3k-back')).toBeHidden();
  });

  test('tapping a card reveals the meaning and example sentence, tapping again hides it', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    const card = page.locator('.w3k-card').first();
    await card.locator('.w3k-front').click();
    await expect(card).toHaveClass(/revealed/);
    await expect(card.locator('.w3k-ja')).toHaveText('その、あの（定冠詞）');
    await expect(card.locator('.w3k-ex-en')).toHaveText('I saw the movie.');

    await card.locator('.w3k-front').click();
    await expect(card).not.toHaveClass(/revealed/);
  });

  test('the tier selector is computed from the data (two 500-word tiers for the current 600-word total)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    const options = await page.locator('#words3000TierSel option').allTextContents();
    expect(options).toEqual(['1〜500語', '501〜1000語']);
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '501');
    await expect(page.locator('.w3k-card')).toHaveCount(100);
  });

  test('search filters by English word or Japanese meaning, and updates the progress count', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    await page.fill('#words3000Search', 'water');
    await expect(page.locator('.w3k-card')).toHaveCount(1);
    await expect(page.locator('.w3k-word').first()).toHaveText('water');
    await expect(page.locator('#words3000Progress')).toHaveText('覚えた 0 / 1');

    await page.fill('#words3000Search', '空気');
    await expect(page.locator('.w3k-word').first()).toHaveText('air');
  });

  test('marking a word learned toggles ✓, persists across reload, and syncs via getSyncableState', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    const card = page.locator('.w3k-card').first();
    await card.locator('[data-role="learn"]').click();
    await expect(card).toHaveClass(/learned/);
    await expect(card.locator('[data-role="learn"]')).toHaveClass(/done/);
    await expect(page.locator('#words3000Progress')).toHaveText('覚えた 1 / 500');

    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
    expect(stored).toEqual({ the: true });
    const syncable = await page.evaluate(() => window.getSyncableState());
    expect(syncable.wordsLearned).toEqual({ the: true });

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');
    await expect(page.locator('.w3k-card').first()).toHaveClass(/learned/);

    // unrelated to the phrase deck's own 覚えた state (learnedKey/learned) - keyed and stored separately
    const phraseLearned = await page.evaluate(() => localStorage.getItem('phrasebook-learned'));
    expect(phraseLearned === null || !JSON.parse(phraseLearned).the).toBeTruthy();
  });

  test('both speak buttons (word and example sentence) work without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await mockGoogleTTS(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    const card = page.locator('.w3k-card').first();
    await card.locator('[data-role="speak-word"]').click();
    await page.waitForTimeout(300);
    await card.locator('.w3k-front').click(); // reveal to access the example's speak button
    await card.locator('[data-role="speak-ex"]').click();
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
});
