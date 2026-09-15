const { test, expect } = require('@playwright/test');
const { mockGoogleTTS } = require('./helpers');

test.describe('英単語3000（頻出英単語を頻度順に学ぶ独立ページ）', () => {
  test('opens as its own page, defaulting to the examples-collapsed state', async ({ page }) => {
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    const card = page.locator('.w3k-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.w3k-word')).toHaveText('the');
    // the Japanese meaning is visible on the front at a glance, without tapping
    await expect(card.locator('.w3k-ja-front')).toHaveText('その、あの（定冠詞）');
    // the example sentence stays hidden until the card is tapped
    await expect(card).not.toHaveClass(/revealed/);
    await expect(card.locator('.w3k-back')).toBeHidden();
  });

  test('the tools menu in the main phrase deck links directly to this page', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await expect(page.locator('#menuWords3000')).toHaveAttribute('href', 'words3000.html');
  });

  test('tapping a card reveals the meaning and example sentence, tapping again hides it', async ({ page }) => {
    await mockGoogleTTS(page);
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    const card = page.locator('.w3k-card').first();
    await card.locator('.w3k-front').click();
    await expect(card).toHaveClass(/revealed/);
    await expect(card.locator('.w3k-ja')).toHaveText('その、あの（定冠詞）');
    await expect(card.locator('.w3k-ex-en')).toHaveText('I saw the movie.');
    // word-by-word gloss for the example sentence, same "word(meaning)" format/display as the main phrasebook's gloss feature
    await expect(card.locator('.w3k-ex-gloss .gloss-line')).toHaveText('🔤 I(私は) saw(見た) the(その、あの（定冠詞）) movie(映画).');

    await card.locator('.w3k-front').click();
    await expect(card).not.toHaveClass(/revealed/);
  });

  test('tapping a card immediately plays its pronunciation, not just on the dedicated 🔊 button', async ({ page }) => {
    await mockGoogleTTS(page);
    const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 15000 });
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    await page.locator('.w3k-card').first().locator('.w3k-front').click();
    const req = await ttsRequest;
    expect(new URL(req.url()).searchParams.get('q')).toBe('the');
  });

  test('the tier selector is computed from the data (six 500-word tiers, plus a whole-3000 option, for the complete set)', async ({ page }) => {
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    const options = await page.locator('#words3000TierSel option').allTextContents();
    expect(options).toEqual([
      '1〜500語', '501〜1000語', '1001〜1500語', '1501〜2000語', '2001〜2500語', '2501〜3000語',
      '全3000語（1〜3000語）',
    ]);
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '501-1000');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '1001-1500');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '1501-2000');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '2001-2500');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '2501-3000');
    await expect(page.locator('.w3k-card')).toHaveCount(500);
    await page.selectOption('#words3000TierSel', '1-3000');
    await expect(page.locator('.w3k-card')).toHaveCount(3000);
  });

  test('search filters by English word or Japanese meaning, and updates the progress count', async ({ page }) => {
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    await page.fill('#words3000Search', 'water');
    await expect(page.locator('.w3k-card')).toHaveCount(1);
    await expect(page.locator('.w3k-word').first()).toHaveText('water');
    await expect(page.locator('#words3000Progress')).toHaveText('覚えた 0 / 1');

    await page.fill('#words3000Search', '空気');
    await expect(page.locator('.w3k-word').first()).toHaveText('air');
  });

  test('marking a word learned toggles ✓, persists across reload, and is stored under the same key the main phrase deck syncs', async ({ page }) => {
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    const card = page.locator('.w3k-card').first();
    await card.locator('[data-role="learn"]').click();
    await expect(card).toHaveClass(/learned/);
    await expect(card.locator('[data-role="learn"]')).toHaveClass(/done/);
    await expect(page.locator('#words3000Progress')).toHaveText('覚えた 1 / 500');

    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
    expect(stored).toEqual({ the: true });

    await page.reload();
    await page.waitForSelector('.w3k-card');
    await expect(page.locator('.w3k-card').first()).toHaveClass(/learned/);

    // unrelated to the phrase deck's own 覚えた state (learnedKey/learned) - keyed and stored separately
    const phraseLearned = await page.evaluate(() => localStorage.getItem('phrasebook-learned'));
    expect(phraseLearned === null || !JSON.parse(phraseLearned).the).toBeTruthy();
  });

  test('a word learned here shows up as learned when the main phrase deck reads the syncable state (same localStorage key, same origin)', async ({ page }) => {
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');
    await page.locator('.w3k-card').first().locator('[data-role="learn"]').click();
    await expect(page.locator('.w3k-card').first()).toHaveClass(/learned/);

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    const syncable = await page.evaluate(() => window.getSyncableState());
    expect(syncable.wordsLearned).toEqual({ the: true });
  });

  test('both speak buttons (word and example sentence) work without crashing', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await mockGoogleTTS(page);
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

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
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

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
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      // "can" matches exactly two words in tier 1 (rank order: can, then cancel)
      await page.fill('#words3000Search', 'can');
      await expect(page.locator('.w3k-card')).toHaveCount(2);

      await page.click('#words3000LoopBtn');
      await expect(page.locator('#words3000LoopBtn')).toHaveClass(/on/);

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
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await page.fill('#words3000Search', 'water'); // exactly one match
      await expect(page.locator('.w3k-card')).toHaveCount(1);

      await page.click('#words3000ListenBtn');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'water');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶', { timeout: 10000 });
      await expect(page.locator('.w3k-card.now-playing')).toHaveCount(0);
    });

    test('the speed button cycles through presets and persists via the shared settings key', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await expect(page.locator('#words3000RateBtn')).toHaveText('1.0x');
      await page.click('#words3000RateBtn');
      await expect(page.locator('#words3000RateBtn')).toHaveText('1.25x');

      const settings = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-settings')));
      expect(settings.rate).toBe(1.25);
    });

    test('changing the tier or the search filter while playing stops playback', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await page.click('#words3000ListenBtn');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('■');
      await page.fill('#words3000Search', 'water');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶');
      await expect(page.locator('.w3k-card.now-playing')).toHaveCount(0);
    });
  });

  test.describe('品詞フィルタ', () => {
    test('narrows the list to words of the selected part of speech only', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      const options = await page.locator('#words3000PosSel option').allTextContents();
      expect(options[0]).toBe('すべての品詞');
      expect(options).toEqual(expect.arrayContaining(['名詞', '動詞', '形容詞', '副詞']));

      await page.selectOption('#words3000PosSel', '動詞');
      // rank 1-500 (デフォルトの範囲) 内の「動詞」は67件
      await expect(page.locator('.w3k-card')).toHaveCount(67);
      const posTexts = await page.locator('.w3k-pos').allTextContents();
      expect(posTexts.every(t => t === '動詞')).toBeTruthy();

      await page.selectOption('#words3000PosSel', '');
      await expect(page.locator('.w3k-card')).toHaveCount(500);
    });
  });

  test.describe('未習得のみ', () => {
    test('hides words already marked learned, and the toggle persists across reload', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await page.fill('#words3000Search', 'water');
      await page.locator('.w3k-card').first().locator('[data-role="learn"]').click();
      await page.fill('#words3000Search', '');
      await expect(page.locator('.w3k-card')).toHaveCount(500);

      await page.click('#words3000UnlearnedBtn');
      await expect(page.locator('#words3000UnlearnedBtn')).toHaveClass(/on/);
      await expect(page.locator('.w3k-card')).toHaveCount(499);
      await expect(page.locator('.w3k-word', { hasText: 'water' })).toHaveCount(0);

      await page.reload();
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000UnlearnedBtn')).toHaveClass(/on/);
      await expect(page.locator('.w3k-card')).toHaveCount(499);
    });
  });

  test.describe('ランダム再生（シャッフル）', () => {
    test('the shuffle toggle persists across reload via its own storage key', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      // note: a plain /on/ regex would false-positive on the base "filter-icon" class (contains "icon" → "on")
      await expect(page.locator('#words3000ShuffleBtn')).not.toHaveClass(/\bon\b/);
      await page.click('#words3000ShuffleBtn');
      await expect(page.locator('#words3000ShuffleBtn')).toHaveClass(/on/);

      const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words3000-prefs')));
      expect(prefs.shuffleListen).toBe(true);

      await page.reload();
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000ShuffleBtn')).toHaveClass(/on/);
    });
  });

  test.describe('テストモード（意味を隠して自己採点するフラッシュカード）', () => {
    test('shows the word without its meaning until "こたえを見る" is tapped', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.fill('#words3000Search', 'water'); // exactly one match, keeps the test fast/deterministic

      await page.click('#words3000TestModeBtn');
      await expect(page.locator('#words3000TestModeBtn')).toHaveClass(/on/);
      await expect(page.locator('#words3000List')).toBeHidden();
      await expect(page.locator('.w3k-testword')).toHaveText('water');
      await expect(page.locator('.w3k-testanswer')).toHaveCount(0);
      await expect(page.locator('#testShowBtn')).toBeVisible();

      await page.click('#testShowBtn');
      await expect(page.locator('.w3k-ja')).toHaveText('水');
      await expect(page.locator('.w3k-ex-en')).toHaveText('Can I have some water, please?');
      await expect(page.locator('.w3k-ex-gloss .gloss-line')).toHaveText('🔤 Can(〜できる) I(私は) have(持っている) some(いくつかの) water(水), please(喜ばせる)?');
      await expect(page.locator('#testShowBtn')).toHaveCount(0);
      await expect(page.locator('#testWrongBtn')).toBeVisible();
      await expect(page.locator('#testRightBtn')).toBeVisible();
    });

    test('"✓ わかった" marks the word learned and advances; "❌ もう一度" does not mark it learned', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      // "can" matches exactly two words in tier 1 (rank order: can, then cancel)
      await page.fill('#words3000Search', 'can');
      await page.click('#words3000TestModeBtn');

      await expect(page.locator('.w3k-testword')).toHaveText('can');
      await page.click('#testShowBtn');
      await page.click('#testRightBtn');

      let stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(stored.can).toBe(true);
      await expect(page.locator('.w3k-testword')).toHaveText('cancel');

      await page.click('#testShowBtn');
      await page.click('#testWrongBtn');
      stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(stored.cancel).toBeFalsy();
    });

    test('finishing every word in the set shows a completion message with a restart button', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.fill('#words3000Search', 'water'); // exactly one match
      await page.click('#words3000TestModeBtn');

      await page.click('#testShowBtn');
      await page.click('#testRightBtn');
      await expect(page.locator('.w3k-test-done')).toContainText('テストが終わりました');
      await expect(page.locator('#testRestartBtn')).toBeVisible();

      await page.click('#testRestartBtn');
      await expect(page.locator('.w3k-testword')).toHaveText('water');
    });

    test('switching back to list mode restores the card list', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.click('#words3000TestModeBtn');
      await expect(page.locator('#words3000List')).toBeHidden();

      await page.click('#words3000TestModeBtn');
      await expect(page.locator('#words3000TestModeBtn')).not.toHaveClass(/on/);
      await expect(page.locator('#words3000List')).toBeVisible();
      await expect(page.locator('.w3k-card')).toHaveCount(500);
    });
  });
});
