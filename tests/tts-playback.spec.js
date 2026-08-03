const { test, expect } = require('@playwright/test');

// A real, decodable (silent) WAV so the browser goes through its actual load/decode/play
// lifecycle instead of erroring on a fake byte buffer - needed to catch a *real* async
// playbackRate reset that only happens once genuine audio metadata has loaded.
function makeSilentWavBuffer(durationSec = 0.3, sampleRate = 8000) {
  const numSamples = Math.floor(durationSec * sampleRate);
  const dataSize = numSamples * 2; // 16-bit mono
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer; // remaining bytes are already zero (silence)
}

// These tests drive playback with a fully scripted fake Audio element instead of mocked
// network responses, because the bugs they guard against are about *when* onended/onerror
// fire relative to other user actions - timing that's hard to control with real (even mocked)
// audio decoding.
async function installFakeAudio(page) {
  await page.addInitScript(() => {
    window.__audioInstances = [];
    class FakeAudio {
      constructor(){ this._src=''; this.playbackRate=1; this.onended=null; this.onerror=null; this.released=false; window.__audioInstances.push(this); }
      set src(v){ this._src = v; }
      get src(){ return this._src; }
      play(){ return Promise.resolve(); }
      pause(){}
      removeAttribute(){ this._src = ''; this.released = true; }
      load(){}
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

  test('an Audio element\'s resources are released (src cleared) once it is done, on both natural completion and interruption', async ({ page }) => {
    // Reported: audio during 聞き流し (auto-loop) in Chrome sometimes speeds up or stalls partway
    // through a long session. Every phrase creates a fresh Audio element via new Audio(), and
    // Chrome is known to accumulate decoder resources if those elements are never explicitly
    // detached (relying on GC alone isn't prompt enough for media resources). Every path that's
    // done with an Audio element must now release it.
    await installFakeAudio(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.locator('.ticket .speak').first().click();
    await expect.poll(() => page.evaluate(() => window.__audioInstances.length)).toBeGreaterThan(0);
    await page.evaluate(() => window.__audioInstances[0].onended());
    await expect.poll(() => page.evaluate(() => window.__audioInstances[0].released)).toBe(true);

    await page.locator('.ticket .speak').nth(1).click(); // interrupts nothing (previous already ended), but starts a new one
    await expect.poll(() => page.evaluate(() => window.__audioInstances.length)).toBeGreaterThan(1);
    await page.locator('.ticket .speak').nth(2).click(); // interrupts instance[1] mid-playback
    await expect.poll(() => page.evaluate(() => window.__audioInstances[1].released)).toBe(true);
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

    // now simulate the second chunk failing twice in a row (the single retry also fails) - a
    // network hiccup that clears up on the first retry should NOT reach the fallback at all,
    // see the dedicated retry test below, so this needs a second failure to trigger it here.
    await page.evaluate(() => window.__audioInstances[0].onerror());
    await page.waitForTimeout(450); // past the 400ms retry delay
    await page.evaluate(() => window.__audioInstances[0].onerror());

    await expect.poll(() => page.evaluate(() => window.__deviceTTSCalls.length)).toBeGreaterThan(0);
    const deviceCalls = await page.evaluate(() => window.__deviceTTSCalls);
    expect(deviceCalls[0].length).toBeLessThan(longText.length);
    expect(deviceCalls[0]).not.toBe(longText);
  });

  test.describe('retrying a failed Google TTS chunk once before falling back', () => {
    // Requested after a report of the voice/speed suddenly changing mid-聞き流し (auto-loop):
    // Google's unofficial endpoint occasionally has a transient hiccup, and immediately switching
    // to a different voice (Gemini/device) for that one phrase was jarring. Retrying the same
    // chunk once after a short delay lets most transient failures recover silently.
    async function installFakeAudioWithSrcLog(page) {
      await page.addInitScript(() => {
        window.__audioInstances = [];
        window.__srcLog = [];
        class FakeAudio {
          constructor(){ this._src=''; this.playbackRate=1; this.onended=null; this.onerror=null; window.__audioInstances.push(this); }
          set src(v){ this._src = v; window.__srcLog.push(v); }
          get src(){ return this._src; }
          play(){ return Promise.resolve(); }
          pause(){}
          removeAttribute(){ this._src = ''; }
          load(){}
        }
        window.Audio = FakeAudio;
      });
    }

    test('a single transient failure retries the same chunk and succeeds without ever falling back', async ({ page }) => {
      await installFakeAudioWithSrcLog(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.evaluate(() => {
        window.__deviceCalls = [];
        window.speakViaBrowserTTS = (text) => { window.__deviceCalls.push(text); };
      });

      await page.evaluate(() => { window.speakRaw('こんにちは', 'ja-JP', null, () => {}, 'ja'); });
      await expect.poll(() => page.evaluate(() => window.__srcLog.length)).toBe(1);

      await page.evaluate(() => window.__audioInstances[0].onerror()); // transient failure
      await page.waitForTimeout(200); // still well within the 400ms retry delay
      expect(await page.evaluate(() => window.__srcLog.length)).toBe(1); // no retry request yet - not premature

      await expect.poll(() => page.evaluate(() => window.__srcLog.length)).toBe(2); // retry fires after the delay
      await page.evaluate(() => window.__audioInstances[0].onended()); // the retry succeeds

      await page.waitForTimeout(100);
      expect(await page.evaluate(() => window.__deviceCalls.length)).toBe(0); // fallback never engaged
    });

    test('two failures in a row for the same chunk still falls back (retry is not infinite)', async ({ page }) => {
      await installFakeAudioWithSrcLog(page);
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await page.evaluate(() => {
        window.__deviceCalls = [];
        window.speakViaBrowserTTS = (text) => { window.__deviceCalls.push(text); };
      });

      await page.evaluate(() => { window.speakRaw('こんにちは', 'ja-JP', null, () => {}, 'ja'); });
      await expect.poll(() => page.evaluate(() => window.__srcLog.length)).toBe(1);

      await page.evaluate(() => window.__audioInstances[0].onerror()); // 1st failure
      await expect.poll(() => page.evaluate(() => window.__srcLog.length)).toBe(2); // retry fires
      await page.evaluate(() => window.__audioInstances[0].onerror()); // retry also fails

      await expect.poll(() => page.evaluate(() => window.__deviceCalls.length)).toBeGreaterThan(0);
      expect(await page.evaluate(() => window.__deviceCalls[0])).toBe('こんにちは');
    });
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

  test('playbackRate stays correct through real audio decoding, for every one of the 9 languages', async ({ page, browserName }) => {
    // Regression coverage for a reported "audio suddenly glitches / speed suddenly changes in
    // Chrome" - uses a real (silent but genuinely decodable) WAV instead of a fake byte buffer, so
    // the browser goes through its actual load/decode/play lifecycle. Confirms the fix that
    // reapplies playbackRate after every .src assignment holds for real decoding, not just the
    // instant a fake buffer resolves, and holds identically across all 9 target languages.
    test.skip(browserName === 'webkit', 'Playwright WebKit does not reliably intercept this route; the real translate_tts network call goes through instead of the mock');
    const wavBuf = makeSilentWavBuffer();
    await page.route('**/translate_tts**', route => route.fulfill({ status: 200, contentType: 'audio/wav', body: wavBuf }));
    await page.addInitScript(() => {
      window.__log = [];
      const NativeAudio = window.Audio;
      class LoggingAudio extends NativeAudio {
        constructor(...args){
          super(...args);
          const rec = { rates: [], sawError: false };
          window.__log.push(rec);
          ['loadedmetadata', 'canplay', 'playing', 'ended'].forEach(evt => {
            this.addEventListener(evt, () => rec.rates.push(this.playbackRate));
          });
          this.addEventListener('error', () => { rec.sawError = true; });
        }
      }
      window.Audio = LoggingAudio;
    });

    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await page.fill('#rateSlider', '1.5');
    await page.dispatchEvent('#rateSlider', 'input');
    await page.dispatchEvent('#rateSlider', 'change');
    await page.click('#closeSettings');

    const langLabels = ['英語', '韓国語', 'ドイツ語', 'ルーマニア語', 'スペイン語', 'フランス語', 'ベトナム語', '中国語', 'ポルトガル語'];
    for (const label of langLabels) {
      await page.click('#langPickerBtn');
      await page.waitForSelector('#langPickerOverlay.open');
      await page.click(`.lang-row:has-text("${label}")`);
      await page.waitForTimeout(100);

      await page.evaluate(() => { window.__log = []; });
      await page.locator('.ticket .speak').first().click();
      await expect.poll(() => page.evaluate(() => window.__log[0] && window.__log[0].rates.includes(1) === false && window.__log[0].rates.length > 0)).toBe(true);

      const log = await page.evaluate(() => window.__log[0]);
      expect(log.sawError, `${label}: unexpected decode error`).toBe(false);
      expect(new Set(log.rates), `${label}: rate should stay 1.5 throughout, never reset to 1`).toEqual(new Set([1.5]));
    }
  });
});
