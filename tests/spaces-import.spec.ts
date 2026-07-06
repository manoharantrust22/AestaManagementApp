import { test, expect } from "@playwright/test";

/**
 * Spaces register v2 — quick entry, floor filtering, and the "Import from
 * plan" preview pipeline. These checks are non-destructive: nothing is
 * committed to the site (the bulk-insert shape is covered by unit tests).
 */

const SRINIVASAN_JSON = JSON.stringify({
  spaces: [
    { name: "Kitchen", type: "kitchen", floors: ["Ground Floor"], x: "9'", y: "9'", height: "10'", doors: [{ width: "3'", height: "7'", count: 1 }], windows: [{ width: "3'", height: "4'", count: 1 }], granite: [{ label: "Kitchen counter", length: "8'", width: "2'", count: 1 }] },
    { name: "Bed 2", type: "bedroom", floors: ["Ground Floor"], x: "9'4\"", y: "11'", height: "10'", doors: [{ width: "3'", height: "7'", count: 1 }], windows: [{ width: "4'", height: "4'", count: 1 }] },
    { name: "Bath", type: "bathroom", floors: ["Ground Floor"], x: "4'6\"", y: "7'", height: "10'", doors: [{ width: "2'6\"", height: "7'", count: 1 }], wall_tile: true, tiling_height: "7'" },
    { name: "Bed 1", type: "bedroom", floors: ["Ground Floor"], x: "9'2\"", y: "12'", height: "10'", doors: [{ width: "3'", height: "7'", count: 1 }], windows: [{ width: "4'", height: "4'", count: 1 }] },
    { name: "Living", type: "living", floors: ["Ground Floor"], x: "9'5\"", y: "13'11\"", height: "10'", doors: [{ width: "3'6\"", height: "7'", count: 1 }] },
    { name: "Corridor", type: "corridor", floors: ["Ground Floor"], x: "4'2\"", y: "40'8\"", height: "10'", doors: [{ width: "3'", height: "7'", count: 4 }] },
    { name: "Shop", type: "other", floors: ["Ground Floor"], x: "8'2\"", y: "16'9\"", height: "10'", doors: [{ width: "7'", height: "7'", count: 1 }] },
  ],
});

async function gotoSpaces(page: import("@playwright/test").Page) {
  await page.goto("/site/spaces");
  const sitePicker = page.getByRole("combobox").first();
  await expect(sitePicker).toBeVisible({ timeout: 30000 });
  await sitePicker.click();
  await page.getByRole("option", { name: /Srinivasan/ }).click();
  await expect(page.getByRole("heading", { name: "Spaces" })).toBeVisible({
    timeout: 30000,
  });
}

test.describe("Spaces register v2", () => {
  test("quick-entry dialog: auto-name, 10' height default, X/Y labels", async ({ page }) => {
    test.setTimeout(120000);
    await gotoSpaces(page);

    await page.getByRole("button", { name: "Add space" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Name is pre-filled from the default type (not blank).
    const nameField = dialog.getByLabel("Name");
    await expect(nameField).not.toHaveValue("");

    // Height pre-filled to 10' with the "Typical 10'" helper.
    await expect(dialog.getByLabel("Height")).toHaveValue("10'");
    await expect(dialog.getByText("Typical 10'")).toBeVisible();

    // Plan-convention labels.
    await expect(dialog.getByLabel("X (horizontal)")).toBeVisible();
    await expect(dialog.getByLabel("Y (vertical)")).toBeVisible();
    await expect(dialog.getByText(/first number is horizontal/i)).toBeVisible();

    // Switching to Bathroom pre-enables wall tile.
    await dialog.getByLabel("Type").click();
    await page.getByRole("option", { name: "Bathroom" }).click();
    await expect(dialog.getByText("Wall tile (bathroom / dado)")).toBeVisible();
    await expect(dialog.getByLabel("Tiling height")).toHaveValue("7'");

    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("floor picker lists floors, not work phases", async ({ page }) => {
    test.setTimeout(120000);
    await gotoSpaces(page);

    await page.getByRole("button", { name: "Add space" }).click();
    const dialog = page.getByRole("dialog");
    // Exact match: "Also on floors (typical unit)" also contains "Floor".
    const floorSelect = dialog.getByRole("combobox", { name: "Floor", exact: true });
    await floorSelect.click();

    // A floor-like option is present; a pure work phase is not (until "show all").
    await expect(page.getByRole("option", { name: "Ground Floor" })).toBeVisible();
    await expect(page.getByRole("option", { name: "Site Preparation" })).toHaveCount(0);

    // "Show all sections" reveals the work phases.
    await page.getByRole("option", { name: /Show all/ }).click();
    await floorSelect.click();
    await expect(page.getByRole("option", { name: "Site Preparation" })).toBeVisible();

    await page.keyboard.press("Escape");
    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("import preview parses 7 rooms with correct live quantities", async ({ page }) => {
    test.setTimeout(120000);
    await gotoSpaces(page);

    await page.getByRole("button", { name: "Import from plan" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Step 1: prompt lists floor names verbatim.
    await expect(dialog.getByText(/Ground Floor/)).toBeVisible();
    await dialog.getByRole("button", { name: /I have the JSON/ }).click();

    // Step 2: paste and parse.
    await dialog.getByRole("textbox").fill(SRINIVASAN_JSON);
    await dialog.getByRole("button", { name: /Parse & preview/ }).click();

    // Step 3: 7 rows + the commit button reads "Add 7 spaces".
    await expect(dialog.getByRole("button", { name: /Add 7 spaces/ })).toBeVisible({
      timeout: 15000,
    });
    // Known live quantities from the unit tests.
    await expect(dialog.getByText("81", { exact: true }).first()).toBeVisible(); // Kitchen floor sqft
    await expect(dialog.getByText("169.44").first()).toBeVisible(); // Corridor floor sqft

    // Untick one room → the button decrements. Do NOT commit (keep prod clean).
    await dialog.getByRole("checkbox").first().uncheck();
    await expect(dialog.getByRole("button", { name: /Add 6 spaces/ })).toBeVisible();

    await dialog.getByRole("button", { name: "Cancel" }).click();
  });

  test("floor plans dialog is reachable and lists floors", async ({ page }) => {
    test.setTimeout(120000);
    await gotoSpaces(page);

    await page.getByRole("button", { name: "Floor plans" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Floor plans")).toBeVisible();
    await expect(dialog.getByText("Ground Floor")).toBeVisible();
    await dialog.getByRole("button", { name: "Close" }).click();
  });
});
