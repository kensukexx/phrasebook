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

// A real, decodable WAV of silence. Needed when a test cares about the audio actually
// *playing for a while* rather than just being requested.
function silentWav(seconds, sampleRate = 8000) {
  const samples = Math.round(seconds * sampleRate);
  const buf = Buffer.alloc(44 + samples * 2); // 16-bit mono, already zero-filled = silence
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);          // PCM header size
  buf.writeUInt16LE(1, 20);           // format = PCM
  buf.writeUInt16LE(1, 22);           // channels
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);           // block align
  buf.writeUInt16LE(16, 34);          // bits per sample
  buf.write('data', 36);
  buf.writeUInt32LE(samples * 2, 40);
  return buf;
}

// `seconds` makes the mock return audio that really plays for that long. Without it the
// response is 4 bytes that no decoder accepts, so playback ends (with an error) almost
// immediately - fine when a test only checks that the request was made, but it makes any
// test that observes state *during* playback depend on machine load, which showed up as
// tests that passed alone and failed under parallel execution.
async function mockGoogleTTS(page, { seconds } = {}) {
  const body = seconds ? silentWav(seconds) : Buffer.from([0xff, 0xfb, 0x90, 0x00]);
  const contentType = seconds ? 'audio/wav' : 'audio/mpeg';
  await page.route('**/translate_tts**', route => {
    route.fulfill({ status: 200, contentType, body });
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
