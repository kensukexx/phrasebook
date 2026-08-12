// @ts-check
const path = require('path');
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:8934',
    trace: 'retain-on-failure',
    // pre-seeds phrasebook-whatsnew-seen to a value far beyond any real CHANGELOG id, so the
    // "🎉 新機能のお知らせ" popup (index.html's checkWhatsNew(), shown on first load after an update)
    // doesn't cover the screen and block clicks in tests that don't care about it. tests/whats-new.spec.js
    // overrides this back to a blank storageState to actually exercise the popup.
    storageState: path.join(__dirname, 'tests/fixtures/whatsnew-seen-state.json'),
  },
  webServer: {
    command: 'python3 -m http.server 8934',
    url: 'http://127.0.0.1:8934/index.html',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
  ],
});
