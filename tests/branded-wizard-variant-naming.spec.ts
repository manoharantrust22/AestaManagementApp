import { test, expect, Page } from "@playwright/test";

/**
 * Regression coverage for the "two colors, one indistinguishable card" bug: a
 * user added Gray and White variants of a real adhesive (M1010 Bond Plus) but
 * typed the same literal name into both rows, so the Pack Sizes & Pricing step
 * rendered two cards with identical titles and no way to tell which was which.
 *
 * READ-ONLY BY DESIGN, same as material-quote-scoping.spec.ts: dev:cloud points
 * at the PRODUCTION database. The wizard is opened and driven up to (but never
 * past) the Pack Sizes & Pricing step, and its localStorage draft is discarded
 * afterward so no test data survives into the user's next real wizard session.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const DRAFT_KEY = "form_draft_material_wizard_branded";

async function login(page: Page) {
  await page.goto(`${BASE}/dev-login`);
  await page.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 60000 });
}

async function openBrandedWizardToVariants(page: Page) {
  await page.goto(`${BASE}/company/materials`);
  await page.getByRole("button", { name: "Add Material" }).click({ timeout: 30000 });

  const dialog = page.getByRole("dialog");
  // "Add material" fork: brand-carrying product vs. bulk/commodity.
  await expect(dialog.getByText(/do you buy this from a specific brand/i)).toBeVisible({
    timeout: 15000,
  });
  await dialog.getByRole("button", { name: /yes.*a brand/i }).click();

  await expect(dialog.getByText(/new branded product/i)).toBeVisible({ timeout: 15000 });

  // Category & Brand
  await dialog.getByLabel("Category").fill("Tile Adhesive");
  await page.getByRole("option", { name: /Tile Adhesive & Grout/i }).click();
  await dialog.getByLabel("Brand").fill("E2E Test Brand — safe to ignore");
  await page.keyboard.press("Escape"); // close the freeSolo suggestion popup, not the dialog
  await dialog.getByRole("button", { name: /^next$/i }).click();

  // Product identity
  await dialog.getByLabel(/product name/i).fill("E2E Test — variant naming regression");
  await dialog.getByRole("button", { name: /^next$/i }).click();

  await expect(dialog.getByText(/add one row per color/i)).toBeVisible({ timeout: 15000 });
  return dialog;
}

async function discardDraft(page: Page) {
  await page.keyboard.press("Escape");
  await page.evaluate((key) => localStorage.removeItem(key), DRAFT_KEY);
}

test("adhesive variants: name auto-derives from Shade/Color, and duplicate names are flagged and disambiguated", async ({
  page,
}) => {
  test.setTimeout(120_000); // /company/materials is one of the app's largest routes to first-compile
  await login(page);
  const dialog = await openBrandedWizardToVariants(page);

  try {
    // Draft row: typing the shade auto-fills the name (nameTemplate: '{shade}').
    // The shade placeholder also matches already-committed rows, so scope to
    // .last() — the draft row is always appended after any committed ones.
    const shadeDraft = dialog.getByPlaceholder("White, Grey, Ivory...").last();
    const nameDraft = dialog.getByPlaceholder("New variant name...");
    await shadeDraft.fill("Gray");
    await expect(nameDraft).toHaveValue("Gray", { timeout: 10000 });
    // The "+" icon button sits inside a MUI Tooltip <span> wrapper, whose
    // accessible name is unreliable to target — press Enter in the name field
    // instead, the same submit path VariantInlineTable's onKeyDown supports.
    await nameDraft.press("Enter");

    // One variant + a category that has a Shade/Color axis -> nudge to add more.
    await expect(dialog.getByText(/only one variant added/i)).toBeVisible({ timeout: 10000 });

    await shadeDraft.fill("White");
    await expect(nameDraft).toHaveValue("White", { timeout: 10000 });
    await nameDraft.press("Enter");

    // Second variant added -> the single-variant nudge clears.
    await expect(dialog.getByText(/only one variant added/i)).toHaveCount(0);

    // Reproduce the reported bug: rename the second row so it collides with the first.
    const committedNames = dialog.getByPlaceholder("e.g., 8mm, 20mm, 50kg...");
    await expect(committedNames).toHaveCount(2);
    await committedNames.nth(1).fill("Gray");

    await expect(dialog.getByText(/two or more variants are named "Gray"/i)).toBeVisible({
      timeout: 10000,
    });

    // Belt-and-suspenders: even with the warning ignored, Pack Sizes & Pricing
    // must not show two identically-titled cards.
    await dialog.getByRole("button", { name: /^next$/i }).click();
    await expect(dialog.getByText(/pack sizes|copy sizes to all variants/i).first()).toBeVisible({
      timeout: 15000,
    });
    await expect(dialog.getByText("Gray (#1)")).toBeVisible();
    await expect(dialog.getByText("Gray (#2)")).toBeVisible();
    await expect(dialog.getByText("Gray", { exact: true })).toHaveCount(0);
  } finally {
    await discardDraft(page);
  }
});
