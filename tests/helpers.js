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

async function setGeminiKey(page, key) {
  await page.click('#toolsBtn');
  await page.click('#menuSettings');
  await page.waitForSelector('#settingsOverlay.open');
  await page.fill('#geminiKeyInput', key);
  await page.dispatchEvent('#geminiKeyInput', 'change');
  await page.click('#closeSettings');
}

module.exports = { mockTranslate, mockGoogleTTS, mockGemini, mockGeminiError, setGeminiKey };
