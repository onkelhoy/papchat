import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    // Navigate to your test page
    await page.goto('tests/composer/');
});

test.describe.skip("@papchat/composer visual regression", () => {
    test.skip('default snapshot', async ({ page }) => {
        await expect(page).toHaveScreenshot();
    });
})
