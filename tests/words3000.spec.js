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
    // the Japanese meaning is visible on the front at a glance, without tapping
    await expect(card.locator('.w3k-ja-front')).toHaveText('その、あの（定冠詞）');
    // the example sentence stays hidden until the card is tapped
    await expect(card).not.toHaveClass(/revealed/);
    await expect(card.locator('.w3k-back')).toBeHidden();
  });

  test('tapping a card reveals the meaning and example sentence, tapping again hides it', async ({ page }) => {
    await mockGoogleTTS(page);
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

  test('tapping a card immediately plays its pronunciation, not just on the dedicated 🔊 button', async ({ page }) => {
    await mockGoogleTTS(page);
    const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 15000 });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    await page.locator('.w3k-card').first().locator('.w3k-front').click();
    const req = await ttsRequest;
    expect(new URL(req.url()).searchParams.get('q')).toBe('the');
  });

  test('the tier selector is computed from the data (six 500-word tiers for the complete 3000-word set)', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuWords3000');
    await page.waitForSelector('#words3000Overlay.open');

    const options = await page.locator('#words3000TierSel option').allTextContents();
    expect(options).toEqual(['1〜500語', '501〜1000語', '1001〜1500語', '1501〜2000語', '2001〜2500語', '2501〜3000語']);
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '501');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '1001');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '1501');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '2001');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '2501');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
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

  test.describe('自動再生（フレーズ帳の聞き流しと同じ操作感を再現した独立版）', () => {
    test('the listen button plays through the current range in rank order and highlights the playing card', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.click('#toolsBtn');
      await page.click('#menuWords3000');
      await page.waitForSelector('#words3000Overlay.open');

      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶');
      const firstReq = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 15000 });
      await page.click('#words3000ListenBtn');
      expect(new URL((await firstReq).url()).searchParams.get('q')).toBe('the');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('■');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'the');

      await page.click('#words3000ListenBtn'); // stop
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶');
      await expect(page.locator('.w3k-card.now-playing')).toHaveCount(0);
    });

    test('loop playback wraps back to the first word of the filtered list when the loop toggle is on', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.click('#toolsBtn');
      await page.click('#menuWords3000');
      await page.waitForSelector('#words3000Overlay.open');

      // "can" matches exactly two words in tier 1 (rank order: can, then cancel)
      await page.fill('#words3000Search', 'can');
      await expect(page.locator('.w3k-card')).toHaveCount(2);

      await page.click('#words3000LoopBtn');
      await expect(page.locator('#words3000LoopBtn')).toHaveClass(/on/);
      // the loop toggle is a shared setting with the main phrase deck's 聞き流し
      await expect(page.locator('#loopToggle')).toHaveClass(/on/);

      await page.click('#words3000ListenBtn');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'can');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'cancel', { timeout: 10000 });
      // with loop on, after the last word it wraps back to the first instead of stopping
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'can', { timeout: 10000 });
      await expect(page.locator('#words3000ListenBtn')).toHaveText('■');

      await page.click('#words3000ListenBtn'); // stop before the test ends
    });

    test('without loop, playback stops automatically after the last word in the filtered list', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.click('#toolsBtn');
      await page.click('#menuWords3000');
      await page.waitForSelector('#words3000Overlay.open');

      await page.fill('#words3000Search', 'water'); // exactly one match
      await expect(page.locator('.w3k-card')).toHaveCount(1);

      await page.click('#words3000ListenBtn');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'water');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶', { timeout: 10000 });
      await expect(page.locator('.w3k-card.now-playing')).toHaveCount(0);
    });

    test('the speed button cycles through presets and stays in sync with the main deck\'s speed button', async ({ page }) => {
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.click('#toolsBtn');
      await page.click('#menuWords3000');
      await page.waitForSelector('#words3000Overlay.open');

      await expect(page.locator('#words3000RateBtn')).toHaveText('1.0x');
      await page.click('#words3000RateBtn');
      await expect(page.locator('#words3000RateBtn')).toHaveText('1.25x');
      await expect(page.locator('#rateQuickBtn')).toHaveText('1.25x');
    });

    test('changing the tier or the search filter while playing stops playback', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.click('#toolsBtn');
      await page.click('#menuWords3000');
      await page.waitForSelector('#words3000Overlay.open');

      await page.click('#words3000ListenBtn');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('■');
      await page.fill('#words3000Search', 'water');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶');
      await expect(page.locator('.w3k-card.now-playing')).toHaveCount(0);
    });

    test('opening 英単語3000 stops the phrase deck\'s own 聞き流し playback to avoid overlapping audio', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.click('#listenBtn');
      await expect(page.locator('#listenBtn')).toHaveText('■');

      await page.click('#toolsBtn');
      await page.click('#menuWords3000');
      await page.waitForSelector('#words3000Overlay.open');
      await expect(page.locator('#listenBtn')).toHaveText('▶');
    });
  });
});
