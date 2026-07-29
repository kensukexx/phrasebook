const { test, expect } = require('@playwright/test');

// Regression test: number/weekday/emergency cards once shipped with only an `en`
// field, so they silently disappeared from the deck in every non-English language.
// See tests/data-integrity.test.js for the data-level version of this check.
test.describe('language switching', () => {
  async function switchLanguage(page, label) {
    await page.click('#langPickerBtn');
    await page.waitForSelector('#langPickerOverlay.open');
    await page.click(`#langPickList >> text=${label}`);
    await page.waitForTimeout(200);
  }

  async function selectCategory(page, label) {
    const btn = page.locator('.cats button, .cats .cat-btn').filter({ hasText: label });
    await btn.click();
    await page.waitForTimeout(200);
  }

  for (const [label, category, expectedCount] of [
    ['韓国語', '数字', 10],
    ['ドイツ語', '曜日', 7],
    ['フランス語', '緊急', 8],
  ]) {
    test(`${category} cards still show in ${label} mode`, async ({ page }) => {
      await page.goto('/index.html');
      await page.waitForSelector('#deck .ticket');
      await switchLanguage(page, label);
      await selectCategory(page, category);
      const count = await page.locator('#deck .ticket').count();
      expect(count).toBe(expectedCount);
    });
  }
});
