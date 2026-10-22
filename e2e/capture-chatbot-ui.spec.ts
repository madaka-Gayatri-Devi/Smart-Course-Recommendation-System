import { test, expect } from '@playwright/test';

test('Capture AI Chatbot Assistant Widget in Action', async ({ page, request }) => {
    const loginRes = await request.post('http://127.0.0.1:8080/auth/login', {
        data: { email: 'gayatri@gmail.com', password: 'Gayatri@123' }
    });
    const loginJson = await loginRes.json();
    let token = loginJson.access_token;
    if (loginJson.two_factor_required) {
        const vRes = await request.post('http://127.0.0.1:8080/auth/verify-2fa', {
            data: { pre_auth_token: loginJson.pre_auth_token, otp_code: loginJson.otp_code }
        });
        token = (await vRes.json()).access_token;
    }

    const userObj = {
        id: 4,
        email: 'gayatri@gmail.com',
        full_name: 'Gayatri Devi',
        role: 'Student'
    };

    await page.addInitScript(({ token, userObj }) => {
        localStorage.setItem('smartlearn_token', token);
        localStorage.setItem('smartlearn_user', JSON.stringify(userObj));
        localStorage.setItem('smartlearn_role', 'Student');
    }, { token, userObj });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://127.0.0.1:8080/student/dashboard.html');
    await page.waitForTimeout(2000);

    // Open Chatbot
    const toggleBtn = page.locator('#smartlearn-chatbot-toggle');
    await toggleBtn.waitFor({ state: 'visible', timeout: 8000 });
    await toggleBtn.click();
    await page.waitForTimeout(1000);

    // Verify status indicator is Online / AI Ready
    const statusPill = page.locator('#chatbot-status-pill');
    await expect(statusPill).toBeVisible();

    // Click a prompt chip
    const chip = page.locator('.chatbot-prompt-chip').first();
    if (await chip.isVisible()) {
        await chip.click();
        await page.waitForTimeout(3000);
    }

    await page.screenshot({ path: 'e2e/screenshots/Desktop-Chatbot-Active.png', fullPage: false });
});
