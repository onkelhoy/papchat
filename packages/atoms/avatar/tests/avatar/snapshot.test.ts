import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
    // Navigate to your test page
    await page.goto('tests/avatar/');
});

test.describe.skip("@papchat/avatar visual regression", () => {
    test.skip('default snapshot', async ({ page }) => {
        await expect(page).toHaveScreenshot();
    });
})
