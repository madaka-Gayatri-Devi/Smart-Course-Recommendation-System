import { test, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';

const studentAuth = {
  token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnYXlhdHJpQGdtYWlsLmNvbSIsInJvbGUiOiJTdHVkZW50IiwiaWQiOjQsImV4cCI6MTc5MzI1MDMwMX0.JbD0TkWTzUVg56GOVgGwkWAJgV8w2fpzGcYA3SO-xSE',
  user: { id: 4, email: 'gayatri@gmail.com', full_name: 'Gayatri Devi', name: 'Gayatri Devi', role: 'Student', is_active: true }
};

test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
});

test.describe('Targeted Mobile 360x800 Verification', () => {
  const outDir = path.join('e2e', 'screenshots', 'verified-mobile');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  test('Verify Login Page Layout', async ({ page }) => {
    await page.goto('/login.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const screenshotPath = path.join(outDir, '01-Login-Page.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Verify Google button is visible
    const googleBtn = page.locator('#googleSignInBtn, .google-btn');
    await expect(googleBtn).toBeVisible();

    // Verify contrast color of hero text
    const heroDesc = page.locator('.brand-content p');
    if (await heroDesc.isVisible()) {
      const color = await heroDesc.evaluate((el) => window.getComputedStyle(el).color);
      expect(color).toContain('255, 255, 255');
    }
  });

  test('Verify Student Dashboard Layout', async ({ page }) => {
    await page.addInitScript((data) => {
      window.localStorage.setItem('smartlearn_token', data.token);
      window.localStorage.setItem('smartlearn_user', JSON.stringify(data.user));
      window.localStorage.setItem('smartlearn_role', data.user.role);
    }, studentAuth);

    await page.goto('/student/dashboard.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const screenshotPath = path.join(outDir, '02-Student-Dashboard.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Verify page title is on single line
    const title = page.locator('.topbar-left .page-title');
    await expect(title).toBeVisible();
    const titleHeight = await title.evaluate((el) => el.getBoundingClientRect().height);
    // Single line at 15-16px font is ~20-25px, 2 lines is >= 38px
    expect(titleHeight).toBeLessThan(32);

    // Verify Theme Palette button is compact circle
    const themeBtn = page.locator('#themePaletteButton');
    await expect(themeBtn).toBeVisible();
    const btnRect = await themeBtn.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });
    expect(btnRect.width).toBeLessThanOrEqual(40);
  });

  test('Verify Recommendations Summary & Actions', async ({ page }) => {
    await page.addInitScript((data) => {
      window.localStorage.setItem('smartlearn_token', data.token);
      window.localStorage.setItem('smartlearn_user', JSON.stringify(data.user));
      window.localStorage.setItem('smartlearn_role', data.user.role);
    }, studentAuth);

    await page.goto('/student/recommendations.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const screenshotPath = path.join(outDir, '03-Student-Recommendations.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Verify 3rd stat box does not overflow
    const statBox3 = page.locator('.rec-summary-stat-box').nth(2);
    if (await statBox3.isVisible()) {
      const boxRect = await statBox3.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { right: r.right, clientWidth: document.documentElement.clientWidth };
      });
      expect(boxRect.right).toBeLessThanOrEqual(boxRect.clientWidth + 2);
    }
  });

  test('Verify Chat Header & FAB Clear Composer', async ({ page }) => {
    await page.addInitScript((data) => {
      window.localStorage.setItem('smartlearn_token', data.token);
      window.localStorage.setItem('smartlearn_user', JSON.stringify(data.user));
      window.localStorage.setItem('smartlearn_role', data.user.role);
    }, studentAuth);

    await page.goto('/student/chat.html', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);

    const screenshotPath = path.join(outDir, '04-Student-Chat.png');
    await page.screenshot({ path: screenshotPath, fullPage: false });

    // Verify Chatbot toggle does not overlap the composer
    const toggle = page.locator('#smartlearn-chatbot-toggle');
    const composer = page.locator('.chat-composer');
    if ((await toggle.isVisible()) && (await composer.isVisible())) {
      const toggleBottom = await toggle.evaluate((el) => el.getBoundingClientRect().bottom);
      const composerTop = await composer.evaluate((el) => el.getBoundingClientRect().top);
      // Toggle bottom must be above or at composer top, not overlapping the send button
      expect(toggleBottom).toBeLessThanOrEqual(composerTop + 10);
    }
  });
});
