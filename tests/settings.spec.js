const { test, expect } = require('@playwright/test');
const { setGeminiKey, mockGoogleTTS } = require('./helpers');

test.describe('settings', () => {
  test('language speed and Japanese speed are independent', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');

    const rateBefore = await page.locator('#rateLabel').textContent();
    await page.fill('#jaRateSlider', '1.75');
    await page.dispatchEvent('#jaRateSlider', 'input');
    await page.dispatchEvent('#jaRateSlider', 'change');
    await page.waitForTimeout(100);

    await expect(page.locator('#jaRateLabel')).toHaveText('1.75x');
    await expect(page.locator('#rateLabel')).toHaveText(rateBefore);
  });

  test('Gemini API key persists across reload', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await setGeminiKey(page, 'TEST_KEY_12345');

    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await expect(page.locator('#geminiKeyInput')).toHaveValue('TEST_KEY_12345');
  });

  test('phrase interval slider is independently adjustable', async ({ page }) => {
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await page.fill('#gapSlider', '1000');
    await page.dispatchEvent('#gapSlider', 'input');
    await expect(page.locator('#gapLabel')).toHaveText('1.00秒');
  });

  test('rate slider has a large enough touch target and responds to a real drag gesture', async ({ page }) => {
    // Regression guard for a reported "slider sometimes doesn't respond" issue on mobile - the
    // native thumb was tiny (browser default) and hard to grab precisely; index.html now styles a
    // 26px custom thumb. This drives an actual mouse drag (not .fill()) to catch a similarly-tiny
    // thumb regression, and checks the touch target is at least reasonably sized.
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');

    const slider = page.locator('#rateSlider');
    const box = await slider.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(24); // roomy touch target, not a hairline default track

    await page.mouse.move(box.x + box.width * 0.5, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.9, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();

    const value = parseFloat(await slider.inputValue());
    expect(value).toBeGreaterThan(1.5); // dragged well past the 1.0x default
    await expect(page.locator('#rateLabel')).toContainText('x');

    await page.click('#closeSettings');
    await page.reload();
    await page.waitForSelector('#deck .ticket');
    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    expect(parseFloat(await page.locator('#rateSlider').inputValue())).toBeCloseTo(value, 1);
  });

  test('the rate setting actually changes audio.playbackRate at playback time', async ({ page }) => {
    // Regression test: audio.playbackRate was set once on the <audio> element right after creation,
    // but assigning .src afterward resets playbackRate back to 1 in Chromium - so the slider updated
    // the label but never actually sped up (or slowed down) playback. Fixed by re-applying
    // playbackRate after every .src assignment, right before play(). Verified here by intercepting
    // HTMLMediaElement.play() and reading the real native playbackRate at that exact moment.
    await page.addInitScript(() => {
      window.__playbackRates = [];
      const origPlay = HTMLMediaElement.prototype.play;
      HTMLMediaElement.prototype.play = function (...args) {
        window.__playbackRates.push(this.playbackRate);
        return origPlay.apply(this, args);
      };
    });
    await mockGoogleTTS(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await page.fill('#rateSlider', '1.8');
    await page.dispatchEvent('#rateSlider', 'input');
    await page.dispatchEvent('#rateSlider', 'change');
    await page.click('#closeSettings');

    await page.locator('.ticket .speak').first().click();
    await expect.poll(() => page.evaluate(() => window.__playbackRates.length)).toBeGreaterThan(0);
    const rates = await page.evaluate(() => window.__playbackRates);
    expect(rates.every(r => r === 1.8)).toBe(true);
  });

  test('dragging the rate slider mid-playback speeds up/slows down the audio immediately, not just the next phrase', async ({ page }) => {
    // Requested: users want to adjust speed while a phrase is still playing, not only have it
    // apply starting from the next tap. HTMLMediaElement.playbackRate can be changed live, so the
    // slider's input handler now pokes the currently-playing <audio> element directly - as long as
    // it's the same rate "kind" (現地語 vs 日本語) as what's actually playing.
    await installFakeAudio(page);
    await page.goto('/index.html');
    await page.waitForSelector('#deck .ticket');

    await page.locator('.ticket .speak').first().click();
    await expect.poll(() => page.evaluate(() => window.__audioInstances.length)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__audioInstances[0].playbackRate)).toBe(1);

    await page.click('#toolsBtn');
    await page.click('#menuSettings');
    await page.waitForSelector('#settingsOverlay.open');
    await page.fill('#rateSlider', '1.8');
    await page.dispatchEvent('#rateSlider', 'input');

    expect(await page.evaluate(() => window.__audioInstances[0].playbackRate)).toBe(1.8);
  });
});

async function installFakeAudio(page) {
  await page.addInitScript(() => {
    window.__audioInstances = [];
    class FakeAudio {
      constructor(){ this._src=''; this.playbackRate=1; this.onended=null; this.onerror=null; window.__audioInstances.push(this); }
      set src(v){ this._src = v; }
      get src(){ return this._src; }
      play(){ return Promise.resolve(); }
      pause(){}
      removeAttribute(){ this._src = ''; }
      load(){}
    }
    window.Audio = FakeAudio;
  });
}
