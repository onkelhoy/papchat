import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    // Navigate to your test page
    await page.goto('tests/core/');
});

test.describe.skip("@papchat/core visual regression", () => {
    test.skip('default snapshot', async ({ page }) => {
        await expect(page).toHaveScreenshot();
    });
})
