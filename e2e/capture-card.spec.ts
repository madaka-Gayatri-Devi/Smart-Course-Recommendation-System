import { test, expect } from '@playwright/test';
import * as path from 'path';

test.use({
  viewport: { width: 360, height: 800 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2
});

test('Capture Recommendation Course Cards', async ({ page }) => {
  const studentAuth = {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnYXlhdHJpQGdtYWlsLmNvbSIsInJvbGUiOiJTdHVkZW50IiwiaWQiOjQsImV4cCI6MTc5MzI1MDMwMX0.JbD0TkWTzUVg56GOVgGwkWAJgV8w2fpzGcYA3SO-xSE',
    user: { id: 4, email: 'gayatri@gmail.com', full_name: 'Gayatri Devi', name: 'Gayatri Devi', role: 'Student', is_active: true }
  };

  await page.addInitScript((data) => {
    window.localStorage.setItem('smartlearn_token', data.token);
    window.localStorage.setItem('smartlearn_user', JSON.stringify(data.user));
    window.localStorage.setItem('smartlearn_role', data.user.role);
  }, studentAuth);

  await page.goto('/student/recommendations.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);

  // Scroll down to course cards
  const card = page.locator('.rec-card, .course-card').first();
  if (await card.isVisible()) {
    await card.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
  }

  const outPath = path.join('e2e', 'screenshots', 'verified-mobile', '05-Course-Card.png');
  await page.screenshot({ path: outPath, fullPage: false });
});
