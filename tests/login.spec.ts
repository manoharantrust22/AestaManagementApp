import { test, expect } from "@playwright/test";

// Login tests should NOT use pre-authenticated state
test.use({ storageState: { cookies: [], origins: [] } });

test.describe("Login Page", () => {
  test("should display session expired warning without connection error", async ({
    page,
  }) => {
    // Navigate to login with session_expired=true
    await page.goto("/login?session_expired=true");

    // Wait for the login form to be ready
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Should show session expired warning
    const sessionExpiredAlert = page.locator("text=Your session has expired");
    await expect(sessionExpiredAlert).toBeVisible();

    // Wait a moment for any background token refresh attempts
    await page.waitForTimeout(3000);

    // Should NOT show "Unable to connect to the server" error
    const connectionError = page.locator(
      "text=Unable to connect to the server"
    );
    await expect(connectionError).not.toBeVisible();
  });

  test("should login successfully with valid credentials", async ({ page }) => {
    // Credentials come from env (same vars as /dev-login), never from code.
    const email = process.env.DEV_LOGIN_EMAIL;
    const password = process.env.DEV_LOGIN_PASSWORD;
    test.skip(!email || !password, "Set DEV_LOGIN_EMAIL and DEV_LOGIN_PASSWORD");

    // Navigate to login page
    await page.goto("/login");

    // Wait for login form
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Fill in credentials
    await page.fill('input[type="email"]', email!);
    await page.fill('input[type="password"]', password!);

    // Click sign in
    await page.click('button[type="submit"]');

    // Should show success message and redirect
    await expect(page.locator("text=Login successful")).toBeVisible({
      timeout: 15000,
    });

    // Should redirect to dashboard
    await page.waitForURL((url) => !url.pathname.includes("/login"), {
      timeout: 30000,
    });

    // Verify we're on the dashboard
    expect(page.url()).toContain("/site/dashboard");
  });

  test("should show error for invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.waitForSelector('input[type="email"]', { timeout: 10000 });

    // Fill in wrong credentials
    await page.fill('input[type="email"]', "wrong@example.com");
    await page.fill('input[type="password"]', "wrongpassword");

    // Click sign in
    await page.click('button[type="submit"]');

    // Should show error message
    const errorAlert = page.locator('[role="alert"]').filter({
      hasText: /invalid|error|unable/i,
    });
    await expect(errorAlert).toBeVisible({ timeout: 15000 });
  });
});
