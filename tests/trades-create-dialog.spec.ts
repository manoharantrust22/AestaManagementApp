import { test, expect } from "@playwright/test";

/**
 * /site/trades create dialog is payments-only now: the "How will you handle
 * this work?" chooser (Fixed-price job card + Count labourers by role) must
 * NOT appear. Daily labour is logged on /site/attendance instead.
 */
test.describe("Trades create dialog (payments-only)", () => {
  test("Add-a-section dialog shows no tracking-mode chooser", async ({ page }) => {
    test.setTimeout(120000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/site/trades");

    // Switch to Padmavathy Apartments — the site with a real contract tree.
    const sitePicker = page.getByRole("combobox").first();
    await expect(sitePicker).toBeVisible({ timeout: 30000 });
    await sitePicker.click();
    await page.getByRole("option", { name: /Padmavathy/ }).click();

    // The tree renders "+ Add a section" on expanded contract rows. Expand the
    // Civil group first if nothing is visible yet.
    const addSection = page.getByText("Add a section", { exact: true }).first();
    try {
      await addSection.waitFor({ state: "visible", timeout: 15000 });
    } catch {
      await page.getByText("Civil", { exact: true }).first().click();
      await addSection.waitFor({ state: "visible", timeout: 15000 });
    }
    await addSection.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText("Add a section").first()).toBeVisible();

    // The removed chooser and both laborer-logging cards must be gone.
    await expect(dialog.getByText("How will you handle this work?")).toHaveCount(0);
    await expect(dialog.getByText("Fixed-price job (maistry contract)")).toHaveCount(0);
    await expect(dialog.getByText("Count labourers by role")).toHaveCount(0);
    await expect(dialog.getByText("Just record payments")).toHaveCount(0);

    // Replacement copy + the rest of the form are intact.
    await expect(dialog.getByText(/Daily labour is logged on the/)).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Mesthri (team)" })).toBeVisible();
    await expect(dialog.getByText("Pricing")).toBeVisible();
    await expect(dialog.getByText("Start as")).toBeVisible();

    if (process.env.DIALOG_SCREENSHOT) {
      await page.screenshot({ path: process.env.DIALOG_SCREENSHOT, fullPage: false });
    }

    await dialog.getByRole("button", { name: "Cancel" }).click();

    // No console errors during the flow (ResizeObserver noise excluded).
    const real = consoleErrors.filter((e) => !/ResizeObserver/.test(e));
    expect(real).toEqual([]);
  });
});
