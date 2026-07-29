// Shared mocks for the external services index.html calls, so tests don't depend on
// real network access, a real Gemini API key, or Google's endpoints staying up.

async function mockTranslate(page, map) {
  // map: { en: 'Hello', ko: '...', ... } keyed by Google's `tl` language code
  await page.route('**/translate.googleapis.com/**', route => {
    const tl = new URL(route.request().url()).searchParams.get('tl');
    const text = (map && map[tl]) || 'Translated';
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([[[text, '', null]]]) });
  });
}

async function mockGoogleTTS(page) {
  // a tiny valid-enough response; the app only checks for a 200 + audio content-type
  await page.route('**/translate_tts**', route => {
    route.fulfill({ status: 200, contentType: 'audio/mpeg', body: Buffer.from([0xff, 0xfb, 0x90, 0x00]) });
  });
}

async function mockGemini(page, jsonPayload) {
  await page.route('**/generativelanguage.googleapis.com/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(jsonPayload) }] } }],
      }),
    });
  });
}

async function mockGeminiError(page, status, message) {
  await page.route('**/generativelanguage.googleapis.com/**', route => {
    route.fulfill({ status, contentType: 'application/json', body: JSON.stringify({ error: { message } }) });
  });
}

async function mockCurrencyRates(page, rates) {
  // rates: { USD: 0.0067, EUR: 0.0061, ... } keyed by ISO currency code (JPY-based)
  await page.route('**/open.er-api.com/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        result: 'success',
        time_last_update_utc: 'Wed, 29 Jul 2026 00:00:00 +0000',
        rates: Object.assign({ JPY: 1 }, rates),
      }),
    });
  });
}

async function mockSpeechRecognition(page, transcript, { error } = {}) {
  // Replaces window.SpeechRecognition/webkitSpeechRecognition with a fake that "hears" `transcript`
  // shortly after start(). Must run via addInitScript (before index.html's classic script evaluates
  // and reads these globals into its own SpeechRecognitionAPI/micSupported consts).
  await page.addInitScript(({ transcript, error }) => {
    class FakeRecognition {
      constructor(){ this.lang = ''; this.interimResults = false; this.maxAlternatives = 1; }
      start(){
        setTimeout(() => {
          this.onstart && this.onstart();
          setTimeout(() => {
            if (error) { this.onerror && this.onerror({ error }); this.onend && this.onend(); return; }
            this.onresult && this.onresult({ results: [[{ transcript }]] });
            this.onend && this.onend();
          }, 20);
        }, 10);
      }
      abort(){ this.onend && this.onend(); }
      stop(){ this.onend && this.onend(); }
    }
    window.SpeechRecognition = FakeRecognition;
    window.webkitSpeechRecognition = FakeRecognition;
  }, { transcript, error });
}

async function setGeminiKey(page, key) {
  await page.click('#toolsBtn');
  await page.click('#menuSettings');
  await page.waitForSelector('#settingsOverlay.open');
  await page.fill('#geminiKeyInput', key);
  await page.dispatchEvent('#geminiKeyInput', 'change');
  await page.click('#closeSettings');
}

module.exports = { mockTranslate, mockGoogleTTS, mockGemini, mockGeminiError, mockCurrencyRates, mockSpeechRecognition, setGeminiKey };
