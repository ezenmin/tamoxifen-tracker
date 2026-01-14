// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Smoke tests', () => {
  test('index.html loads and shows header', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header h1')).toHaveText('Tamoxifen Tracker');
  });

  test('demo.html loads and shows header', async ({ page }) => {
    await page.goto('/demo.html');
    await expect(page.locator('header h1')).toHaveText('Tamoxifen Tracker');
    await expect(page.locator('.demo-banner')).toBeVisible();
  });

  test('can log a symptom entry via UI', async ({ page }) => {
    await page.goto('/');

    // Wait for effect list to load
    await expect(page.locator('#effect-list')).toBeVisible();

    // Find the Hot Flashes item and click severity dot 3
    const hotFlashesItem = page.locator('.effect-item', { hasText: 'Hot Flashes' });
    await expect(hotFlashesItem).toBeVisible();

    // Click the 3rd dot (severity 3)
    const dots = hotFlashesItem.locator('.dot');
    await dots.nth(2).click();

    // Verify the dot becomes logged (green)
    await expect(dots.nth(2)).toHaveClass(/logged/);
  });

  test('tabs work correctly', async ({ page }) => {
    await page.goto('/');

    // Initially on Log tab
    await expect(page.locator('#tab-log')).toBeVisible();

    // Click Summary tab
    await page.click('.tab:has-text("Summary")');
    await expect(page.locator('#tab-summary')).toBeVisible();

    // Click Info tab
    await page.click('.tab:has-text("Info")');
    await expect(page.locator('#tab-info')).toBeVisible();
  });
});
