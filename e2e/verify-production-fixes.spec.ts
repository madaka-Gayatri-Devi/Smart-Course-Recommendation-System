import { test, expect } from '@playwright/test';

test.describe('Production Fixes Visual & Functional Verification', () => {

    test('Verify Recommendations Summary Card Alignment on Desktop & Mobile', async ({ page, request }) => {
        // Authenticate via API
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

        // 1. Desktop 1440px
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('http://127.0.0.1:8080/student/recommendations.html');
        await page.waitForSelector('.rec-summary-banner', { timeout: 10000 });
        await page.waitForTimeout(1500);

        // Screenshot desktop summary banner
        await page.screenshot({ path: 'e2e/screenshots/Desktop-Recommendations-Summary.png', fullPage: false });

        // 2. Mobile 375px
        await page.setViewportSize({ width: 375, height: 812 });
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'e2e/screenshots/Mobile-Recommendations-Summary.png', fullPage: false });
    });

    test('Verify Payment History Records and Counters', async ({ page, request }) => {
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
        await page.goto('http://127.0.0.1:8080/student/payment-history.html');
        await page.waitForSelector('#paymentHistoryTableBody tr', { timeout: 10000 });
        await page.waitForTimeout(1500);
        await page.screenshot({ path: 'e2e/screenshots/Desktop-Payment-History.png', fullPage: false });
    });

    test('Verify Reset Password Page with Token', async ({ page }) => {
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('http://127.0.0.1:8080/reset-password.html?token=test_verification_token');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'e2e/screenshots/Desktop-Reset-Password-Page.png', fullPage: false });
    });
});
