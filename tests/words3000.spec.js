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

  test('the back-to-phrasebook link lives in the sticky panel, so it stays reachable after scrolling (not stuck at the top of the page)', async ({ page }) => {
    // Regression guard: this link used to sit only in the page header, which isn't sticky -
    // scrolling down (e.g. during auto-play, which auto-scrolls to the playing card) carried
    // it off-screen with no way back short of scrolling all the way back up.
    await page.goto('/words3000.html');
    await page.waitForSelector('.w3k-card');
    const backLink = page.locator('.w3k-back-btn');
    await expect(backLink).toHaveAttribute('href', './index.html');
    await expect(backLink).toBeVisible();

    await page.evaluate(() => window.scrollTo(0, 3000));
    await expect(backLink).toBeVisible(); // still reachable, inside .w3k-sticky
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
      '🔁 今日の復習（0語）',
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

    // the value carries the spaced-repetition schedule ({step, due}); what the rest of the app
    // cares about is only that the entry exists and is truthy
    const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
    expect(Object.keys(stored)).toEqual(['the']);
    expect(stored.the).toBeTruthy();

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
    expect(Object.keys(syncable.wordsLearned)).toEqual(['the']);
    expect(syncable.wordsLearned.the).toBeTruthy();
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

  test.describe('自動再生の読み上げ順', () => {
    // Collapsing consecutive duplicates into "runs" (rather than asserting an exact request
    // count) is deliberate: the mocked <audio> occasionally re-requests the same URL under
    // headless Chromium's autoplay handling, which is an artifact of the mock, not of the
    // app's playback logic. The order of distinct steps is what actually matters here.
    async function playOnceAndCollectOrder(page, order) {
      await page.fill('#words3000Search', 'water'); // exactly one match, so the order is unambiguous
      await page.selectOption('#words3000ReadOrderSel', order);

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
      return requests.filter((r, i) => r !== requests[i - 1]);
    }

    test('reads the word in exactly the order picked - batched (英語→英語→日本語)', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      expect(await playOnceAndCollectOrder(page, 'en,en,ja')).toEqual(['en:water', 'ja:水']);
    });

    test('reads the word in exactly the order picked - alternating (英語→日本語→英語→日本語)', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      // the point of this option: en/ja alternate rather than being grouped together
      expect(await playOnceAndCollectOrder(page, 'en,ja,en,ja')).toEqual(['en:water', 'ja:水', 'en:water', 'ja:水']);
    });

    test('reads the word in exactly the order picked - Japanese first (日本語→英語)', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      expect(await playOnceAndCollectOrder(page, 'ja,en')).toEqual(['ja:水', 'en:water']);
    });

    test('the selected order persists across reload via the words3000-only prefs key', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      await page.selectOption('#words3000ReadOrderSel', 'en,ja,en,ja');
      const prefs = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words3000-prefs')));
      expect(prefs.readOrder).toBe('en,ja,en,ja');

      await page.reload();
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000ReadOrderSel')).toHaveValue('en,ja,en,ja');
    });

    test('settings saved in the old enReps/jaReps format are carried over to the equivalent order', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('phrasebook-words3000-prefs', JSON.stringify({ enReps: 2, jaReps: 1 }));
      });
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000ReadOrderSel')).toHaveValue('en,en,ja');
    });

    test('an old combination with no matching order falls back to 英語→日本語 instead of breaking', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('phrasebook-words3000-prefs', JSON.stringify({ enReps: 3, jaReps: 2 }));
      });
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000ReadOrderSel')).toHaveValue('en,ja');
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

  test.describe('間隔反復（忘れかけた頃に復習する）', () => {
    // wordsLearnedは元々`{単語: true}`だったが、復習スケジュールを持たせるため
    // `{単語: {step, due}}`も入るようにした。どちらもtruthyなので「覚えたかどうか」を見る
    // 既存の判定や端末間同期はそのまま動く、というのがこの設計の肝。
    test('marking a word learned schedules its first review for the next day (not today)', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.locator('.w3k-card[data-word="the"] [data-role="learn"]').click();

      const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(stored.the.step).toBe(0);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const pad = n => String(n).padStart(2, '0');
      expect(stored.the.due).toBe(`${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`);
      // just learned, so it is not part of today's review batch yet
      await expect(page.locator('#words3000TierSel option[value="review"]')).toHaveText('🔁 今日の復習（0語）');
    });

    test('the review range collects only words whose due date has arrived (legacy true entries count as due)', async ({ page }) => {
      await page.addInitScript(() => {
        localStorage.setItem('phrasebook-words-learned', JSON.stringify({
          water: { step: 1, due: '2020-01-01' },   // overdue
          people: true,                             // old-format entry: treated as due
          time: { step: 2, due: '2099-01-01' },     // not due yet
        }));
      });
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000TierSel option[value="review"]')).toHaveText('🔁 今日の復習（2語）');

      await page.selectOption('#words3000TierSel', 'review');
      await expect(page.locator('.w3k-card')).toHaveCount(2);
      const shown = await page.locator('.w3k-word').allTextContents();
      expect(shown.sort()).toEqual(['people', 'water']);
      await expect(page.locator('#words3000Progress')).toHaveText('今日の復習 2語');
    });

    test('answering ✓ in the review batch pushes the next review further out, and ❌ drops it back to unlearned', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.addInitScript(() => {
        localStorage.setItem('phrasebook-words-learned', JSON.stringify({ water: { step: 1, due: '2020-01-01' } }));
      });
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.selectOption('#words3000TierSel', 'review');
      await page.click('#words3000TestModeBtn');

      await page.click('#testShowBtn');
      await page.click('#testRightBtn');
      let stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(stored.water.step).toBe(2); // 1 -> 2, i.e. next review in 7 days instead of 3
      expect(stored.water.due > new Date().toISOString().slice(0, 10)).toBeTruthy();
      await expect(page.locator('#words3000TierSel option[value="review"]')).toHaveText('🔁 今日の復習（0語）');

      // getting it wrong on a later review clears the ✓ entirely, so it returns to the 未習得 pool
      await page.evaluate(() => localStorage.setItem('phrasebook-words-learned', JSON.stringify({ water: { step: 3, due: '2020-01-01' } })));
      await page.reload();
      await page.waitForSelector('.w3k-card');
      await page.selectOption('#words3000TierSel', 'review');
      await page.click('#words3000TestModeBtn');
      await page.click('#testShowBtn');
      await page.click('#testWrongBtn');
      stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(stored.water).toBeUndefined();
    });

    test('the review range ignores 未習得のみ and the auto-play skip, which would otherwise empty it (review words are all learned)', async ({ page }) => {
      await mockGoogleTTS(page);
      await page.addInitScript(() => {
        localStorage.setItem('phrasebook-words-learned', JSON.stringify({ water: { step: 1, due: '2020-01-01' } }));
        localStorage.setItem('phrasebook-words3000-prefs', JSON.stringify({ unlearnedOnly: true }));
      });
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.selectOption('#words3000TierSel', 'review');
      await expect(page.locator('.w3k-card')).toHaveCount(1); // 未習得のみ is on, but ignored here

      const ttsRequest = page.waitForRequest(req => req.url().includes('translate_tts'), { timeout: 15000 });
      await page.click('#words3000ListenBtn');
      expect(new URL((await ttsRequest).url()).searchParams.get('q')).toBe('water');
    });

    test('a prompt appears when reviews are due and switches to the review batch when tapped', async ({ page }) => {
      // the count inside the 範囲 selector is invisible while another range is selected, so due
      // reviews would otherwise go unnoticed - this prompt is what makes the feature discoverable
      await page.addInitScript(() => {
        localStorage.setItem('phrasebook-words-learned', JSON.stringify({ water: { step: 1, due: '2020-01-01' } }));
      });
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');

      const prompt = page.locator('#words3000ReviewPrompt');
      await expect(prompt).toBeVisible();
      await expect(prompt).toHaveText('🔁 今日の復習が1語あります → まとめて復習する');

      await prompt.click();
      await expect(page.locator('#words3000TierSel')).toHaveValue('review');
      await expect(page.locator('.w3k-card')).toHaveCount(1);
      await expect(prompt).toBeHidden(); // already in the review batch, so the nudge goes away
    });

    test('no prompt is shown when nothing is due', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await expect(page.locator('#words3000ReviewPrompt')).toBeHidden();
    });

    test('an empty review batch shows a "done for today" message rather than a generic empty state', async ({ page }) => {
      await page.goto('/words3000.html');
      await page.waitForSelector('.w3k-card');
      await page.selectOption('#words3000TierSel', 'review');
      await expect(page.locator('#words3000List')).toContainText('今日の復習は完了しています');
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
      expect(stored.can).toBeTruthy(); // value is the {step, due} review schedule
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
      expect(Object.keys(await page.evaluate(() => window.getWordsLearnedSnapshot()))).toEqual(['the']);

      // the cloud copy may still hold old-format `true` values; merging must keep both sides
      const hadLocalOnly1 = await page.evaluate(() => window.applyCloudWordsLearned({ water: true }));
      expect(hadLocalOnly1).toBe(true); // "the" isn't in the cloud snapshot yet
      expect(Object.keys(await page.evaluate(() => window.getWordsLearnedSnapshot())).sort()).toEqual(['the', 'water']);
      const stored = JSON.parse(await page.evaluate(() => localStorage.getItem('phrasebook-words-learned')));
      expect(Object.keys(stored).sort()).toEqual(['the', 'water']); // merged result also persisted locally
      expect(stored.the).toBeTruthy();
      expect(stored.water).toBeTruthy();

      const hadLocalOnly2 = await page.evaluate(() => window.applyCloudWordsLearned({ water: true, the: true }));
      expect(hadLocalOnly2).toBe(false); // nothing local-only left to push
    });
  });
});
