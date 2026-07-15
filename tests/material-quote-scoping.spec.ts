import { test, expect, Page } from "@playwright/test";

/**
 * End-to-end verification for category-appropriate variant specs + vendor quote
 * scoping at /company/materials.
 *
 * READ-ONLY BY DESIGN: dev:cloud/next start point at the PRODUCTION database, so
 * these tests open forms and assert what they render, and never save. The
 * save-is-blocked behaviour is covered with a mocked mutation in
 * src/components/shared/__tests__/VendorQuoteDialog.test.tsx.
 */

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";

async function login(page: Page) {
  await page.goto(`${BASE}/dev-login`);
  await page.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 60000 });
}

async function openMaterial(page: Page, search: string, exactName: string) {
  await page.goto(`${BASE}/company/materials`);
  // Specifically the catalog filter — a bare /search/i also matches other inputs.
  const box = page.getByPlaceholder(/search materials/i).first();
  await box.waitFor({ timeout: 30000 });
  await box.fill(search);
  await page.getByText(exactName, { exact: true }).first().click({ timeout: 30000 });
  await expect(page.getByRole("tab", { name: /vendors/i })).toBeVisible({ timeout: 30000 });
}

test("Plywood variant form offers sheet size + thickness, and names itself from them", async ({
  page,
}) => {
  await login(page);
  await openMaterial(page, "ply", "Plywood");

  await page.getByRole("tab", { name: /variants/i }).click();
  await page.getByText("Add variant", { exact: true }).click({ timeout: 20000 });

  // The reported bug: this used to read "Cross-section (mm)" + "Length (ft)".
  // Sheet size is a MUI Select (role=combobox), not a textbox.
  await expect(page.getByRole("combobox", { name: "Sheet size" })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole("combobox", { name: "Sheet size" })).toHaveText(/8 x 4 ft/);
  await expect(page.getByRole("spinbutton", { name: /Thickness/ })).toBeVisible();
  await expect(page.getByText(/cross-section/i)).toHaveCount(0);

  // Specs derive the name, so filling them is the shortest path to the name the
  // user wanted anyway.
  const name = page.getByLabel(/variant name/i);
  await page.getByRole("spinbutton", { name: /Thickness/ }).fill("18");
  await expect(name).toHaveValue("8x4 · 18mm", { timeout: 10000 });

  // ...until the user takes the wheel.
  await name.fill("My own name");
  await page.getByRole("spinbutton", { name: /Thickness/ }).fill("19");
  await expect(name).toHaveValue("My own name");
});

test("Teak keeps linear-timber fields — the split didn't regress it", async ({ page }) => {
  await login(page);
  await openMaterial(page, "teak", "Teak wood");

  await page.getByRole("tab", { name: /variants/i }).click();
  await page.getByText("Add variant", { exact: true }).click({ timeout: 20000 });

  await expect(page.getByRole("spinbutton", { name: /Thickness/ })).toBeVisible({
    timeout: 15000,
  });
  await expect(page.getByRole("combobox", { name: "Sheet size" })).toHaveCount(0);
  await expect(page.getByRole("spinbutton", { name: /Width/ })).toBeVisible();
});

test("Plywood: legacy quote is flagged, and a new quote must name brand + variant", async ({
  page,
}) => {
  await login(page);
  await openMaterial(page, "ply", "Plywood");

  await page.getByRole("tab", { name: /vendors/i }).click();

  // The ₹75 Vijaya Plywoods quote — priced with no brand and no thickness.
  await expect(page.getByText(/1 unscoped/i)).toBeVisible({ timeout: 20000 });

  await page.getByText(/add vendor quote/i).click();
  const dialog = page.getByRole("dialog");

  await expect(dialog.getByText(/plywood's price varies by brand/i)).toBeVisible({
    timeout: 15000,
  });
  await expect(dialog.getByText(/has no variants yet/i)).toBeVisible();
});

test("M Sand states outright that its price is brand/size independent", async ({ page }) => {
  await login(page);
  await openMaterial(page, "sand", "M Sand (Manufactured Sand)");

  await page.getByRole("tab", { name: /vendors/i }).click();
  await page.getByText(/add vendor quote/i).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/one price for all brands/i)).toBeVisible({
    timeout: 15000,
  });
  // The point: no brand field, but the absence is explained rather than silent.
  await expect(dialog.getByLabel(/^Brand/)).toHaveCount(0);
});

test("Overview exposes the declaration where the price is being questioned", async ({
  page,
}) => {
  await login(page);
  await openMaterial(page, "ply", "Plywood");

  await expect(page.getByText(/vendor price depends on/i)).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByText(/vendor quotes must name the brand and variant/i)
  ).toBeVisible();
});
