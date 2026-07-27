import { test, expect } from "@playwright/test";
import path from "path";

/**
 * /site/payments (Salary Settlements) must ADD UP on screen. Before this change
 * the hero showed Wages Due and Paid Out but never "Applied to weeks", so
 * Paid − Due gave a third number matching nothing, and the tile showed either
 * the excess or the arrears — never both, though under crew pay both are real.
 *
 * Padmavathy, Civil, All Time (post-migration truth):
 *   ₹6,90,470 paid out = ₹6,73,900 applied + ₹16,570 not on any week
 *   ₹6,80,025 due      = ₹6,73,900 applied + ₹6,125 still owed
 *   ₹16,570 excess     = ₹8,445 mesthri credit + ₹5,875 paid ahead + ₹2,250 off-week
 */
const SHOT_DIR =
  "C:/Users/Haribabu/AppData/Local/Temp/claude/c--Users-Haribabu-Documents-AppsCopilot-AestaManagementApp/43947c6f-836c-4f54-a45e-8ae7e99f2784/scratchpad";

test.describe("Salary Settlements hero reconciles", () => {
  test("hero bridge + unapplied-money strip", async ({ page }) => {
    test.setTimeout(180000);
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/site/payments");

    // Site lives in a cookie, not the URL — pick it explicitly.
    const sitePicker = page.getByRole("combobox").first();
    await expect(sitePicker).toBeVisible({ timeout: 45000 });
    await sitePicker.click();
    await page.getByRole("option", { name: /Padmavathy/ }).click();

    // Date range is scoped per page and defaults to the current month — the
    // figures below are All Time, so switch before asserting.
    await page.getByRole("button", { name: /Change date range/i }).click();
    const picker = page.getByRole("presentation").last();
    await picker.getByRole("button", { name: "All Time" }).click();
    await picker.getByRole("button", { name: "Apply" }).first().click();

    // The hero collapses by default; open it.
    const expander = page.getByRole("button", { name: /expand summary/i });
    await expect(expander).toBeVisible({ timeout: 45000 });
    await expander.click();

    // Wait for the site's real figures to land before asserting anything.
    await expect(page.getByText("₹6,80,025", { exact: true }).first()).toBeVisible({
      timeout: 60000,
    });

    // The five tiles now read left-to-right as a bridge.
    await expect(page.getByText("Wages Due", { exact: true })).toBeVisible();
    await expect(page.getByText("Applied to weeks", { exact: true })).toBeVisible();
    await expect(page.getByText("Excess Paid", { exact: true })).toBeVisible();
    await expect(page.getByText("Paid Out", { exact: true })).toBeVisible();
    await expect(page.getByText("Still Owed", { exact: true }).first()).toBeVisible();

    // Both halves show at once — the case that caused the confusion.
    await expect(page.getByText("₹6,73,900", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("₹16,570", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("₹6,125", { exact: true }).first()).toBeVisible();

    // The one-line explanation.
    await expect(
      page.getByText(/₹6,90,470 paid out = ₹6,73,900 applied to weeks/)
    ).toBeVisible();

    await page.screenshot({
      path: path.join(SHOT_DIR, "salary-hero.png"),
      fullPage: false,
    });

    // "By laborer" names the three sources of the excess.
    await page.getByRole("button", { name: /By laborer/i }).click();
    await expect(page.getByText("Paid but not on any week")).toBeVisible({
      timeout: 30000,
    });
    await expect(page.getByText(/credit with Jithin/)).toBeVisible();
    await expect(page.getByText(/laborers paid ahead/)).toBeVisible();
    // The double-pay warning for the off-week payment.
    await expect(page.getByText(/Bulu Majhi/).first()).toBeVisible();
    await expect(
      page.getByText(/a week with no salary days for them/)
    ).toBeVisible();

    // Arrears now match the per-laborer rows.
    await expect(page.getByText("Still owed to laborers in total")).toBeVisible();

    await page.screenshot({
      path: path.join(SHOT_DIR, "salary-by-laborer.png"),
      fullPage: false,
    });

    const realErrors = consoleErrors.filter(
      (e) => !/favicon|ResizeObserver|Download the React DevTools/i.test(e)
    );
    expect(realErrors, `console errors: ${realErrors.join("\n")}`).toHaveLength(0);
  });
});
