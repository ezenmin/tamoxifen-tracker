// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Offline PWA tests', () => {
  test('service worker registers and app works offline', async ({ page, context }) => {
    // First load - let SW install
    await page.goto('/');
    await expect(page.locator('header h1')).toHaveText('Tamoxifen Tracker');

    // Wait for service worker to be registered and activated
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration && registration.active;
    }, { timeout: 15000 });

    // Small delay for caching to complete
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);

    // Reload the page while offline
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Verify core UI renders offline
    await expect(page.locator('header h1')).toHaveText('Tamoxifen Tracker');
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('.tabs')).toBeVisible();

    // Restore online for cleanup
    await context.setOffline(false);
  });

  test('demo.html works offline', async ({ page, context }) => {
    // First load - let SW install
    await page.goto('/demo.html');
    await expect(page.locator('header h1')).toHaveText('Tamoxifen Tracker');

    // Wait for service worker to be registered and activated
    await page.waitForFunction(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return registration && registration.active;
    }, { timeout: 15000 });

    // Small delay for caching to complete
    await page.waitForTimeout(1000);

    // Go offline
    await context.setOffline(true);

    // Reload the page while offline
    await page.reload({ waitUntil: 'domcontentloaded' });

    // Verify core UI renders offline
    await expect(page.locator('header h1')).toHaveText('Tamoxifen Tracker');
    await expect(page.locator('.demo-banner')).toBeVisible();

    // Restore online for cleanup
    await context.setOffline(false);
  });
});
