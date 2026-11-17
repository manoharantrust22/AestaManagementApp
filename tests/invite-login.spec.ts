import { test, expect, type Page } from "@playwright/test";

/**
 * Invite-only login: the login page (Microsoft / Google / password), the
 * /no-access page, the invite and "Change login email" dialogs, and a refused
 * API call. Supabase OAuth and the admin APIs are mocked — nothing is created.
 *
 *   npx playwright test tests/invite-login.spec.ts --workers=1
 */

/** Catch the jump to Supabase's /auth/v1/authorize and answer it locally. */
async function catchAuthorize(page: Page) {
  const seen: URL[] = [];
  await page.route("**/auth/v1/authorize**", async (route) => {
    seen.push(new URL(route.request().url()));
    await route.fulfill({ status: 200, contentType: "text/html", body: "<h1>provider</h1>" });
  });
  return seen;
}

test.describe("Login page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const vp of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 },
  ]) {
    test(`at ${vp.width}px: two equal buttons, password form, Microsoft round trip`, async ({ page }) => {
      await page.setViewportSize(vp);
      await page.goto("/login", { timeout: 180_000 });

      const ms = page.getByTestId("oauth-azure");
      const google = page.getByTestId("oauth-google");
      await expect(ms).toBeVisible({ timeout: 60_000 });
      await expect(ms).toHaveText(/Continue with Microsoft/);
      await expect(google).toHaveText(/Continue with Google/);

      const a = (await ms.boundingBox())!;
      const b = (await google.boundingBox())!;
      expect(a.height).toBeGreaterThanOrEqual(44);
      expect(Math.round(a.width)).toBe(Math.round(b.width));
      expect(Math.round(a.height)).toBe(Math.round(b.height));
      expect(a.y).toBeLessThan(b.y); // Microsoft first by default
      expect(a.x + a.width).toBeLessThanOrEqual(vp.width);
      // No sideways scroll.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vp.width);

      const email = page.getByLabel("Email Address");
      if (vp.width < 600) {
        await expect(email).toBeHidden();
        const toggle = page.getByRole("button", { name: "Sign in with password" });
        await expect(toggle).toBeVisible();
        expect((await toggle.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        await toggle.click();
        await expect(email).toBeVisible();
        await expect(email).toBeFocused();
      } else {
        await expect(email).toBeVisible();
        await expect(page.getByRole("button", { name: "Sign in with password" })).toBeHidden();
      }

      // Visible focus on the Microsoft button.
      await ms.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      const outline = await ms.evaluate((el) => getComputedStyle(el).outlineStyle);
      expect(outline).toBe("solid");

      const seen = await catchAuthorize(page);
      await ms.click();
      await expect.poll(() => seen.length).toBe(1);
      const url = seen[0];
      expect(url.searchParams.get("provider")).toBe("azure");
      expect(url.searchParams.get("scopes")).toBe("email");
      const redirectTo = new URL(url.searchParams.get("redirect_to")!);
      expect(redirectTo.pathname).toBe("/auth/callback");
      expect(redirectTo.searchParams.get("next")).toBe("/site/dashboard");
      // PKCE: the code is swapped on our server, never in the URL hash.
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
    });
  }

  test("remembers Google as last used and shows it first", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const seen = await catchAuthorize(page);
    await page.goto("/login", { timeout: 180_000 });
    await page.getByTestId("oauth-google").click();
    await expect.poll(() => seen.length).toBe(1);
    expect(seen[0].searchParams.get("provider")).toBe("google");

    await page.goto("/login");
    const google = page.getByTestId("oauth-google");
    await expect(google).toBeVisible({ timeout: 60_000 });
    await expect(google).toContainText("Last used");
    const g = (await google.boundingBox())!;
    const m = (await page.getByTestId("oauth-azure").boundingBox())!;
    expect(g.y).toBeLessThan(m.y);
  });

  test("OAuth errors in the URL become plain words", async ({ page }) => {
    await page.goto(
      "/login?error=access_denied&error_code=signup_disabled&error_description=Signups+not+allowed+for+this+instance",
      { timeout: 180_000 }
    );
    await expect(page.getByText("This account has not been added to Aesta. Ask your company admin.")).toBeVisible({
      timeout: 60_000,
    });
    // The URL is tidied so a reload doesn't show it again.
    await expect.poll(() => new URL(page.url()).search).toBe("");

    await page.goto(
      "/login?error=server_error&error_description=AADSTS50020%3A+User+account+does+not+exist+in+tenant"
    );
    await expect(page.getByText("Use your Neram work account, or ask your company admin.")).toBeVisible({
      timeout: 60_000,
    });
  });
});

test.describe("No access page", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("explains in plain words and offers both ways out", async ({ page, context }) => {
    await context.addCookies([
      { name: "aesta_no_access_email", value: "stranger@gmail.com", domain: "localhost", path: "/" },
    ]);
    await page.goto("/no-access?reason=no_profile", { timeout: 180_000 });
    await expect(page.getByRole("heading", { name: "You don't have access to Aesta yet" })).toBeVisible();
    await expect(page.getByText("stranger@gmail.com")).toBeVisible();
    await expect(page.getByText(/Ask your company admin to add you/)).toBeVisible();
    // The reason code is never shown.
    await expect(page.getByText("no_profile")).toHaveCount(0);
    await expect(page.getByRole("link", { name: "Use a different account" })).toHaveAttribute("href", "/login");
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});

test.describe("Settings > Users (admin)", () => {
  async function openUsers(page: Page) {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/settings", { timeout: 180_000 });
    await page.getByRole("tab", { name: "Users" }).click({ timeout: 120_000 });
    await expect(page.getByRole("button", { name: "Invite person" })).toBeVisible({ timeout: 60_000 });
  }

  test("Invite person: optional password, sends company, shows result", async ({ page }) => {
    const sent: any[] = [];
    await page.route("**/api/admin/users", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      sent.push(JSON.parse(route.request().postData()!));
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ success: true, userId: "u-new" }) });
    });
    await openUsers(page);

    await page.getByRole("button", { name: "Invite person" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite person" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Leave empty if they will use Continue with Google")).toBeVisible();
    // No status choice when inviting.
    await expect(dialog.getByLabel("Status")).toHaveCount(0);

    await dialog.getByLabel("Name").fill("Test Person");
    await dialog.getByLabel("Email").fill("test.person@gmail.com");
    await dialog.getByRole("button", { name: "Invite" }).click();

    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0]).toMatchObject({ email: "test.person@gmail.com", name: "Test Person", role: "site_engineer" });
    expect(sent[0].password).toBeUndefined();
    expect(sent[0]).toHaveProperty("company_id");
    await expect(dialog.getByText(/Continue with Google/).last()).toBeVisible();
  });

  test("Invite person: an email that exists is refused with a clear message", async ({ page }) => {
    await page.route("**/api/admin/users", async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ success: false, code: "email_taken", error: "This email is already used by another account. Use a different email." }),
      });
    });
    await openUsers(page);
    await page.getByRole("button", { name: "Invite person" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite person" });
    await dialog.getByLabel("Name").fill("Dup");
    await dialog.getByLabel("Email").fill("dup@gmail.com");
    await dialog.getByRole("button", { name: "Invite" }).click();
    await expect(dialog.getByText("This email is already used by another account. Use a different email.")).toBeVisible();
  });

  test("Change login email: says data stays, posts user id + new email", async ({ page }) => {
    const sent: any[] = [];
    await page.route("**/api/admin/users/email", async (route) => {
      sent.push(JSON.parse(route.request().postData()!));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, email: "new.login@gmail.com" }) });
    });
    await openUsers(page);

    const button = page.getByRole("button", { name: /^Change login email for / }).first();
    await expect(button).toBeVisible({ timeout: 60_000 });
    const who = (await button.getAttribute("aria-label"))!.replace("Change login email for ", "");
    await button.click();

    const dialog = page.getByRole("dialog", { name: "Change login email" });
    await expect(dialog.getByText("They will sign in with the new email from now on. Their data stays the same.")).toBeVisible();
    await expect(dialog.getByText(new RegExp(`^${who.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} signs in with`))).toBeVisible();

    await dialog.getByLabel("New login email").fill("New.Login@Gmail.com");
    await dialog.getByRole("button", { name: "Change email" }).click();
    await expect.poll(() => sent.length).toBe(1);
    expect(sent[0].email).toBe("new.login@gmail.com");
    expect(sent[0].userId).toMatch(/^[0-9a-f-]{36}$/);
    await expect(dialog).toBeHidden();
  });

  test("Change login email: a taken email shows the server's message", async ({ page }) => {
    await page.route("**/api/admin/users/email", (route) =>
      route.fulfill({
        status: 409,
        contentType: "application/json",
        body: JSON.stringify({ success: false, code: "email_taken", error: "This email is already used by another account. Use a different email." }),
      })
    );
    await openUsers(page);
    await page.getByRole("button", { name: /^Change login email for / }).first().click();
    const dialog = page.getByRole("dialog", { name: "Change login email" });
    await dialog.getByLabel("New login email").fill("taken@gmail.com");
    await dialog.getByRole("button", { name: "Change email" }).click();
    await expect(dialog.getByText("This email is already used by another account. Use a different email.")).toBeVisible();
  });
});

test.describe("Refused API call", () => {
  test("a 403 no_access answer takes the person to /no-access", async ({ page }) => {
    await page.route("**/api/probe-refused", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        headers: { "X-No-Access": "true" },
        body: JSON.stringify({ error: "You don't have access to Aesta.", code: "no_access" }),
      })
    );
    await page.goto("/site/dashboard", { timeout: 180_000 });
    await page.locator("header").first().waitFor({ timeout: 120_000 });
    const status = await page.evaluate(async () => (await fetch("/api/probe-refused")).status);
    expect(status).toBe(403);
    await page.waitForURL("**/no-access", { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "You don't have access to Aesta yet" })).toBeVisible();
  });
});
