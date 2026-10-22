import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Auth tokens for test roles
const TOKENS = {
  Student: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJnYXlhdHJpQGdtYWlsLmNvbSIsInJvbGUiOiJTdHVkZW50IiwiaWQiOjQsImV4cCI6MTc5MzI1MDMwMX0.JbD0TkWTzUVg56GOVgGwkWAJgV8w2fpzGcYA3SO-xSE',
    user: { id: 4, email: 'gayatri@gmail.com', full_name: 'Gayatri Devi', name: 'Gayatri Devi', role: 'Student', is_active: true },
  },
  Instructor: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0dWxhc2lAZ21haWwuY29tIiwicm9sZSI6Ikluc3RydWN0b3IiLCJpZCI6MTQsImV4cCI6MTc5MzI1MDMwMX0.b-OCqwxSpdYunN-qFj-ULgE-x5vOEoL4_z852VKGK8M',
    user: { id: 14, email: 'tulasi@gmail.com', full_name: 'Tulasi Rao', name: 'Tulasi Rao', role: 'Instructor', is_active: true },
  },
  Admin: {
    token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbkBzbWFydGxlYXJuLmNvbSIsInJvbGUiOiJBZG1pbiIsImlkIjozMCwiZXhwIjoxNzkzMjUwMzAxfQ.wOwZW3gAcgo-dTjdhtbbRvlU7H4PoekHIqX63d_R3Fg',
    user: { id: 30, email: 'admin@smartlearn.com', full_name: 'System Administrator', name: 'System Administrator', role: 'Admin', is_active: true },
  },
};

// Target Pages across roles
const PAGES = [
  // Public
  { path: '/index.html', name: 'Landing-Public', role: null },
  { path: '/login.html', name: 'Login-Public', role: null },
  { path: '/register.html', name: 'Register-Public', role: null },

  // Student
  { path: '/student/dashboard.html', name: 'Student-Dashboard', role: 'Student' as const },
  { path: '/student/courses.html', name: 'Student-Catalog', role: 'Student' as const },
  { path: '/student/my-courses.html', name: 'Student-MyCourses', role: 'Student' as const },
  { path: '/student/recommendations.html', name: 'Student-Recommendations', role: 'Student' as const },
  { path: '/student/learning-path.html', name: 'Student-LearningPath', role: 'Student' as const },
  { path: '/student/progress.html', name: 'Student-Progress', role: 'Student' as const },
  { path: '/student/skill-gaps.html', name: 'Student-SkillGaps', role: 'Student' as const },
  { path: '/student/assessment.html', name: 'Student-Assessment', role: 'Student' as const },
  { path: '/student/wishlist.html', name: 'Student-Wishlist', role: 'Student' as const },
  { path: '/student/chat.html', name: 'Student-Chat', role: 'Student' as const },
  { path: '/student/notifications.html', name: 'Student-Notifications', role: 'Student' as const },
  { path: '/student/profile.html', name: 'Student-Profile', role: 'Student' as const },

  // Instructor
  { path: '/instructor/dashboard.html', name: 'Instructor-Dashboard', role: 'Instructor' as const },
  { path: '/instructor/courses.html', name: 'Instructor-Courses', role: 'Instructor' as const },
  { path: '/instructor/course-editor.html', name: 'Instructor-CourseEditor', role: 'Instructor' as const },
  { path: '/instructor/students.html', name: 'Instructor-Students', role: 'Instructor' as const },
  { path: '/instructor/analytics.html', name: 'Instructor-Analytics', role: 'Instructor' as const },
  { path: '/instructor/reviews.html', name: 'Instructor-Reviews', role: 'Instructor' as const },
  { path: '/instructor/chat.html', name: 'Instructor-Chat', role: 'Instructor' as const },
  { path: '/instructor/notifications.html', name: 'Instructor-Notifications', role: 'Instructor' as const },

  // Admin
  { path: '/admin/dashboard.html', name: 'Admin-Dashboard', role: 'Admin' as const },
  { path: '/admin/users.html', name: 'Admin-Users', role: 'Admin' as const },
  { path: '/admin/courses.html', name: 'Admin-Courses', role: 'Admin' as const },
  { path: '/admin/categories.html', name: 'Admin-Categories', role: 'Admin' as const },
  { path: '/admin/skills.html', name: 'Admin-Skills', role: 'Admin' as const },
  { path: '/admin/career-goals.html', name: 'Admin-CareerGoals', role: 'Admin' as const },
  { path: '/admin/assessment-questions.html', name: 'Admin-AssessmentQuestions', role: 'Admin' as const },
  { path: '/admin/enrollments.html', name: 'Admin-Enrollments', role: 'Admin' as const },
  { path: '/admin/reports.html', name: 'Admin-Reports', role: 'Admin' as const },
  { path: '/admin/analytics.html', name: 'Admin-Analytics', role: 'Admin' as const },
  { path: '/admin/chat.html', name: 'Admin-Chat', role: 'Admin' as const },
  { path: '/admin/notifications.html', name: 'Admin-Notifications', role: 'Admin' as const },
];

test.describe('SmartLearn Responsive Layout & UI Consistency Audit', () => {
  for (const pageInfo of PAGES) {
    test(`Audit ${pageInfo.name} at viewport`, async ({ page }, testInfo) => {
      const consoleErrors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        consoleErrors.push(err.message);
      });

      // Inject auth if page requires role
      if (pageInfo.role) {
        const authData = TOKENS[pageInfo.role];
        await page.addInitScript((data) => {
          window.localStorage.setItem('smartlearn_token', data.token);
          window.localStorage.setItem('smartlearn_user', JSON.stringify(data.user));
          window.localStorage.setItem('smartlearn_role', data.user.role);
        }, authData);
      }

      // Navigate to page
      await page.goto(pageInfo.path, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(600); // Allow responsive handlers & init scripts to run

      // 1. Detect Horizontal Overflow
      const overflowInfo = await page.evaluate(() => {
        const docEl = document.documentElement;
        const body = document.body;
        const scrollWidth = Math.max(docEl.scrollWidth, body ? body.scrollWidth : 0);
        const clientWidth = docEl.clientWidth;
        const isOverflow = scrollWidth > clientWidth + 1; // 1px threshold for fractional pixels
        const offendingElements: string[] = [];
        if (isOverflow) {
          const allEls = document.querySelectorAll('*');
          for (const el of allEls) {
            const rect = el.getBoundingClientRect();
            if (rect.right > clientWidth + 2) {
              const id = el.id ? `#${el.id}` : '';
              const cls = el.className && typeof el.className === 'string'
                ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}`
                : '';
              offendingElements.push(`${el.tagName.toLowerCase()}${id}${cls} (right: ${Math.round(rect.right)}px > ${clientWidth}px)`);
              if (offendingElements.length >= 5) break;
            }
          }
        }
        return { isOverflow, scrollWidth, clientWidth, offendingElements };
      });

      // 2. Responsive Navigation Drawer Test (< 1024px)
      const viewport = page.viewportSize();
      if (viewport && viewport.width < 1024 && pageInfo.role) {
        const menuToggle = page.locator('#menuToggle, .menu-toggle, .mobile-menu-btn').first();
        if (await menuToggle.isVisible()) {
          // Verify clicking menu toggle opens sidebar
          await menuToggle.click();
          await page.waitForTimeout(300);

          const sidebar = page.locator('#dashboardSidebar, .dashboard-sidebar, .app-sidebar').first();
          const overlay = page.locator('#sidebarOverlay, .sidebar-overlay').first();

          const isSidebarVisible = await sidebar.isVisible();
          expect(isSidebarVisible).toBeTruthy();

          // Close sidebar via overlay if visible
          if (await overlay.isVisible()) {
            await overlay.click({ force: true });
            await page.waitForTimeout(300);
          }
        }
      }

      // 3. Capture Screenshot for key viewports
      const screenshotDir = path.join('e2e', 'screenshots', testInfo.project.name);
      if (!fs.existsSync(screenshotDir)) {
        fs.mkdirSync(screenshotDir, { recursive: true });
      }
      const screenshotPath = path.join(screenshotDir, `${pageInfo.name}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false });

      // Assertions
      if (overflowInfo.isOverflow) {
        console.warn(`[OVERFLOW WARN] ${pageInfo.name} on ${testInfo.project.name}: scrollWidth ${overflowInfo.scrollWidth} > clientWidth ${overflowInfo.clientWidth}`, overflowInfo.offendingElements);
      }
      expect(overflowInfo.isOverflow, `Page ${pageInfo.name} has horizontal overflow at ${testInfo.project.name}: ${overflowInfo.offendingElements.join(', ')}`).toBeFalsy();
    });
  }
});
