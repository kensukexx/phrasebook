const { test, expect } = require('@playwright/test');
const { mockGoogleTTS } = require('./helpers');

test.describe('英単語3000（頻出英単語を頻度順に学ぶ独立ページ）', () => {
  test('opens as its own page, defaulting to the examples-collapsed state', async ({ page }) => {
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');

    const card = page.locator('.w3k-card').first();
    await expect(card).toBeVisible();
    await expect(card.locator('.w3k-word')).toHaveText('the');
    // the word meaning and the example sentence (English + Japanese) are visible on the
    // front at a glance, without tapping - laid out beside the word/kana column so the
    // whitespace that would otherwise sit to the right of a short word is put to use
    await expect(card.locator('.w3k-ja-front')).toHaveText('その、あの（定冠詞）');
    await expect(card.locator('.w3k-ex-front')).toHaveText('I saw the movie.');
    await expect(card.locator('.w3k-ex-ja-front')).toHaveText('私はその映画を見た。');
    // the example's kana and the word-by-word gloss stay hidden until the card is tapped
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

    test('stopping mid-playback and pressing ▶ again resumes from where it left off, not from the start', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      // "can" matches exactly two words in tier 1 (rank order: can, then cancel)
      await page.fill('#words3000Search', 'can');

      await page.click('#words3000ListenBtn');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'can');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'cancel', { timeout: 10000 });
      await page.click('#words3000ListenBtn'); // stop while "cancel" is playing
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶');

      await page.click('#words3000ListenBtn'); // resume
      // resumes at "cancel" (where it was stopped), not back at "can" (the start of the range)
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'cancel');
    });

    test('changing a filter after pausing discards the resume point, so the next play starts fresh', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.fill('#words3000Search', 'can');

      await page.click('#words3000ListenBtn');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'cancel', { timeout: 10000 });
      await page.click('#words3000ListenBtn'); // stop
      await page.fill('#words3000Search', 'water'); // change the filter while paused

      await page.click('#words3000ListenBtn'); // start again
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'water');
    });
  });

  test.describe('上部コントロールの固定表示（自動再生中に隠れない）', () => {
    test('the range/part-of-speech/playback controls stay pinned near the top of the viewport even after scrolling down the list', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      const position = await page.locator('.w3k-sticky').evaluate(el => getComputedStyle(el).position);
      expect(position).toBe('sticky');

      await page.evaluate(() => window.scrollTo(0, 3000));
      const rect = await page.locator('.w3k-sticky').evaluate(el => el.getBoundingClientRect());
      expect(rect.top).toBeGreaterThanOrEqual(-1);
      expect(rect.top).toBeLessThan(5);

      // and it's still interactive - not just visually present
      await page.selectOption('#words3000PosSel', '動詞');
      await expect(page.locator('#words3000PosSel')).toHaveValue('動詞');
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

  test.describe('英語/日本語のくり返し回数（自動再生）', () => {
    test('plays English enReps times, then Japanese jaReps times, in that order, per word', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.fill('#words3000Search', 'water'); // exactly one match, keeps the request order unambiguous

      await page.selectOption('#words3000EnRepsSel', '2');
      await page.selectOption('#words3000JaRepsSel', '1');

      const requests = [];
      page.on('request', req => {
        if (req.url().includes('translate_tts')) {
          const u = new URL(req.url());
          requests.push(`${u.searchParams.get('tl')}:${u.searchParams.get('q')}`);
        }
      });

      await page.click('#words3000ListenBtn');
      // only one word in range and loop is off, so playback finishes on its own
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶', { timeout: 10000 });

      // Collapse consecutive duplicates into "runs" rather than asserting an exact request
      // count: the mocked <audio> occasionally re-requests the same URL under headless
      // Chromium's autoplay handling, but that's an artifact of the mock, not of the app's
      // playback logic. What actually matters here is (a) English is played entirely before
      // Japanese (not alternated en/ja/en/ja), and (b) English's run is twice as long as
      // Japanese's, matching enReps:jaReps = 2:1.
      const runs = [];
      for (const r of requests) {
        if (runs.length === 0 || runs[runs.length - 1].value !== r) runs.push({ value: r, count: 1 });
        else runs[runs.length - 1].count++;
      }
      expect(runs.map(r => r.value)).toEqual(['en:water', 'ja:水']);
      expect(runs[0].count).toBe(runs[1].count * 2);
    });

    test('the selected counts persist across reload via the words3000-only prefs key', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await page.selectOption('#words3000EnRepsSel', '3');
      await page.selectOption('#words3000JaRepsSel', '2');
      const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words3000-prefs')));
      expect(prefs.enReps).toBe(3);
      expect(prefs.jaReps).toBe(2);

      await page.reload();
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000EnRepsSel')).toHaveValue('3');
      await expect(page.locator('#words3000JaRepsSel')).toHaveValue('2');
    });

    test('the "例文も読む" toggle appends the example sentence (English then Japanese) after the word, and persists', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.fill('#words3000Search', 'water'); // exactly one match

      await page.check('#words3000ExampleToggle');
      const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words3000-prefs')));
      expect(prefs.readExample).toBe(true);

      const requests = [];
      page.on('request', req => {
        if (req.url().includes('translate_tts')) {
          const u = new URL(req.url());
          requests.push(`${u.searchParams.get('tl')}:${u.searchParams.get('q')}`);
        }
      });

      await page.click('#words3000ListenBtn');
      await expect(page.locator('#words3000ListenBtn')).toHaveText('▶', { timeout: 10000 });

      const runs = [];
      for (const r of requests) { if (runs.length === 0 || runs[runs.length - 1] !== r) runs.push(r); }
      expect(runs).toEqual(['en:water', 'en:Can I have some water, please?', 'ja:お水をいただけますか？']);

      await page.reload();
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000ExampleToggle')).toBeChecked();
    });
  });

  test.describe('自動再生は覚えた単語を飛ばす', () => {
    test('already-learned words are skipped entirely during auto-play, not just played anyway', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.fill('#words3000Search', 'can'); // matches "can" then "cancel", in that rank order
      await page.locator('.w3k-card[data-word="can"] [data-role="learn"]').click();

      const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 15000 });
      await page.click('#words3000ListenBtn');
      const req = await ttsRequest;
      // "can" is already learned, so playback jumps straight to "cancel" instead of playing "can" first
      expect(new URL(req.url()).searchParams.get('q')).toBe('cancel');
      await expect(page.locator('.w3k-card.now-playing')).toHaveAttribute('data-word', 'cancel');
    });
  });

  test.describe('詳細設定の折りたたみ（上部パネルの表示量を自分で調整できる）', () => {
    test('collapsing hides 品詞・くり返し回数・検索など, while 範囲 and the playback buttons stay visible', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await expect(page.locator('#words3000CollapsibleControls')).toBeVisible();
      await expect(page.locator('#words3000PosSel')).toBeVisible();

      await page.click('#words3000CollapseToggle');
      await expect(page.locator('#words3000CollapsibleControls')).toBeHidden();
      // 範囲・自動再生ボタンはパネル折りたたみの影響を受けず常に見える
      await expect(page.locator('#words3000TierSel')).toBeVisible();
      await expect(page.locator('#words3000ListenBtn')).toBeVisible();
      await expect(page.locator('#words3000RateBtn')).toBeVisible();

      await page.click('#words3000CollapseToggle');
      await expect(page.locator('#words3000CollapsibleControls')).toBeVisible();
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

  test.describe('端末間同期（「覚えた」状態のみ、このページ単独で完結）', () => {
    // 本物のサインインが必要な経路（クラウドへのpull/pushそのもの）はCIでは再現できない
    // （tests/sync.spec.jsのファイル冒頭コメントと同じ理由）。ここでは、このページ用に
    // 追加したFirebaseモジュール（words3000.htmlはindex.html本体の保存関数を一切経由しない
    // ため、単独でpushできる仕組みを別途持たせた）が、未サインイン状態で読み込まれても
    // クラッシュしないことと、let宣言のwordsLearnedを直接読み書きするための橋渡し関数
    // （getWordsLearnedSnapshot/applyCloudWordsLearned）が正しく動くことを確認する。
    test('the sync module loads without errors while signed out', async ({ page }) => {
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      page.on('console', msg => { if (msg.type() === 'error' && !msg.text().includes('favicon')) errors.push(msg.text()); });

      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.waitForTimeout(1000); // let the module script's dynamic Firebase imports resolve

      expect(errors).toEqual([]);
    });

    test('getWordsLearnedSnapshot/applyCloudWordsLearned bridge functions merge (not overwrite) and report local-only entries', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.locator('.w3k-card').first().locator('[data-role="learn"]').click(); // learns "the" locally
      await expect(page.evaluate(() => window.getWordsLearnedSnapshot())).resolves.toEqual({ the: true });

      const hadLocalOnly1 = await page.evaluate(() => window.applyCloudWordsLearned({ water: true }));
      expect(hadLocalOnly1).toBe(true); // "the" isn't in the cloud snapshot yet
      await expect(page.evaluate(() => window.getWordsLearnedSnapshot())).resolves.toEqual({ water: true, the: true });
      const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(stored).toEqual({ water: true, the: true }); // merged result also persisted locally

      const hadLocalOnly2 = await page.evaluate(() => window.applyCloudWordsLearned({ water: true, the: true }));
      expect(hadLocalOnly2).toBe(false); // nothing local-only left to push
    });
  });
});
