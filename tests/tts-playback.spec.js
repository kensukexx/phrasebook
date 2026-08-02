const { test, expect } = require('@playwright/test');

// These tests drive playback with a fully scripted fake Audio element instead of mocked
// network responses, because the bugs they guard against are about *when* onended/onerror
// fire relative to other user actions - timing that's hard to control with real (even mocked)
// audio decoding.
async function installFakeAudio(page) {
  await page.addInitScript(() => {
    window.__audioInstances = [];
    class FakeAudio {
      constructor(){ this._src=''; this.playbackRate=1; this.onended=null; this.onerror=null; window.__audioInstances.push(this); }
      set src(v){ this._src = v; }
      get src(){ return this._src; }
      play(){ return Promise.resolve(); }
      pause(){}
    }
    window.Audio = FakeAudio;
  });
}

test.describe('TTS playback robustness', () => {
  test('switching to another card mid-playback clears the previous card\'s "playing" highlight (no stuck indicator)', async ({ page }) => {
    await installFakeAudio(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    const card1 = page.locator('.ticket').nth(0);
    const card2 = page.locator('.ticket').nth(1);

    // start card1 playing, but never let its fake audio fire onended/onerror
    await card1.locator('.speak').click();
    await expect(card1.locator('.speak')).toHaveClass(/playing/);

    // switch to card2 before card1 "finishes"
    await card2.locator('.speak').click();

    await expect(card1.locator('.speak')).not.toHaveClass(/playing/);
    await expect(card2.locator('.speak')).toHaveClass(/playing/);
  });

  test('a TTS chunk failing partway through a long phrase only re-sends the unplayed remainder to the fallback, not the whole phrase', async ({ page }) => {
    await installFakeAudio(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.evaluate(() => {
      window.__deviceTTSCalls = [];
      window.speakViaBrowserTTS = function(text, speechLang, langKeyForVoice, rateVal, finish) {
        window.__deviceTTSCalls.push(text);
        finish();
      };
    });

    const longText = 'これはとても長いテストの文章です。'.repeat(15); // 255 chars -> splits into 2 Google TTS chunks

    await page.evaluate((text) => {
      window.speakRaw(text, 'ja-JP', null, () => {}, 'ja');
    }, longText);

    // wait for the first chunk to be requested, then simulate it finishing successfully
    await expect.poll(() => page.evaluate(() => window.__audioInstances.length)).toBeGreaterThanOrEqual(1);
    await page.evaluate(() => window.__audioInstances[0].onended());

    // now simulate the second chunk failing (e.g. a network hiccup on Google's endpoint)
    await page.evaluate(() => window.__audioInstances[0].onerror());

    await expect.poll(() => page.evaluate(() => window.__deviceTTSCalls.length)).toBeGreaterThan(0);
    const deviceCalls = await page.evaluate(() => window.__deviceTTSCalls);
    expect(deviceCalls[0].length).toBeLessThan(longText.length);
    expect(deviceCalls[0]).not.toBe(longText);
  });

  test('a manual tap tells the user when no TTS engine worked at all (Google fails, no device synth); background auto-play stays silent about it', async ({ page, browserName }) => {
    // On mobile, occasionally *everything* fails (network hiccup on Google's endpoint, no Gemini
    // key set, and the browser has no speechSynthesis support at all e.g. a restrictive in-app
    // browser) and previously the app just did nothing with zero feedback - indistinguishable from
    // a broken tap. Recognition failures already alert the user elsewhere in the app; playback
    // failures should too, but only for a deliberate tap (not every step of a 聞き流し loop).
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this route; the real translate_tts network call goes through instead of the mock');
    await page.route('**/translate_tts**', route => route.fulfill({ status: 500, body: 'fail' }));
    await page.addInitScript(() => {
      Object.defineProperty(window, 'speechSynthesis', { value: undefined, configurable: true });
    });
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    let alertMsg = null;
    page.on('dialog', async (dialog) => { alertMsg = dialog.message(); await dialog.accept(); });

    await page.locator('.ticket').first().locator('.speak').click();
    await expect.poll(() => alertMsg).toContain('音声合成');

    alertMsg = null;
    await page.evaluate(() => window.speakRaw('テスト', 'ja-JP', null, () => {}, 'ja'));
    await page.waitForTimeout(300);
    expect(alertMsg).toBeNull();
  });
});
