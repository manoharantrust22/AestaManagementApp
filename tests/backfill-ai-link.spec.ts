import { test, expect, Page } from "@playwright/test";
import * as path from "path";

/**
 * E2E for the AI-backfill Step-3 "link to existing catalog material/vendor" work.
 *
 * READ-ONLY BY DESIGN: dev:cloud points at the PRODUCTION database. This test
 * opens the AI-ingest wizard, parses a sample JSON, and asserts the Step-3 link
 * pickers render + that linking a row to an existing catalog material clears its
 * "+M" draft badge. It NEVER clicks "Ingest" — nothing is written to prod.
 */

// On-demand route compilation on a cold dev server is slow; keep tests serial
// and give each generous headroom.
test.describe.configure({ mode: "serial", timeout: 150_000 });

const BASE = process.env.E2E_BASE_URL || "http://localhost:3000";
const SHOT_DIR =
  "C:\\Users\\Haribabu\\AppData\\Local\\Temp\\claude\\c--Users-Haribabu-Documents-AppsCopilot-AestaManagementApp\\8b84553f-a2c3-46a3-9f2f-924562cf436a\\scratchpad";

// One unknown row → guaranteed +M (new material) + +V (new vendor), and it's
// inside the historical window so it counts as "included".
const SAMPLE_JSON = JSON.stringify([
  {
    vendor: "E2E Test Vendor ZZZ",
    material: "Zzz Nonexistent Material 9999",
    qty: 5,
    amount: 1000,
    unit: "nos",
    purchase_date: "2026-03-15",
    kind: "own",
    payment_status: "settled",
    paid_by: "office",
    used_qty: 0,
  },
]);

async function login(page: Page) {
  await page.goto(`${BASE}/dev-login`);
  await page.waitForURL((u) => u.pathname.includes("/dashboard"), { timeout: 60000 });
}

async function openAiIngestStep3(page: Page) {
  await page.goto(`${BASE}/site/materials/hub`);
  // Auto-selected site resolves + the heavy route finishes compiling, then the
  // launcher is available. First cold compile can take a while.
  await page.getByRole("button", { name: /new entry/i }).click({ timeout: 90000 });
  // These cards/choices have hover-transform animations → force past the
  // stability check rather than waiting for them to settle.
  await page.getByText("Backfill historical record", { exact: true }).click({ force: true });
  await page
    .getByRole("button", { name: /AI-assisted ingest/i })
    .click({ force: true, timeout: 15000 });

  // Step 1 → Step 2
  await page.getByRole("button", { name: /got the JSON/i }).click({ timeout: 15000 });

  // Step 2: paste + parse
  const dialog = page.getByRole("dialog");
  await dialog.locator("textarea").first().fill(SAMPLE_JSON);
  await page.getByRole("button", { name: /parse json/i }).click();

  // Step 3
  await expect(page.getByText(/records parsed/i)).toBeVisible({ timeout: 15000 });
}

test("Step-3 renders link pickers; the row starts as a draft (+M / +V)", async ({ page }) => {
  await login(page);
  await openAiIngestStep3(page);

  // The unknown row is flagged for draft creation.
  await expect(page.getByText("+M")).toBeVisible();
  await expect(page.getByText("+V")).toBeVisible();

  // Both link pickers are present (was a plain <input> before this change).
  await expect(page.getByPlaceholder(/search material/i)).toBeVisible();
  await expect(page.getByPlaceholder(/search vendor/i)).toBeVisible();

  await page.screenshot({ path: path.join(SHOT_DIR, "backfill-step3-pickers.png"), fullPage: true });
});

test("Linking the row to an existing catalog material clears the +M draft badge", async ({
  page,
}) => {
  await login(page);
  await openAiIngestStep3(page);

  await expect(page.getByText("+M")).toBeVisible();

  // Search the catalog and pick a real material → the row links, badge clears.
  const picker = page.getByPlaceholder(/search material/i);
  await picker.click();
  await picker.fill("cement");
  // Scope to the MUI Autocomplete popup — bare getByRole("option") also matches
  // the hidden native <option>s inside the Kind/Pay <select>s.
  const listbox = page.getByRole("listbox");
  await expect(listbox).toBeVisible({ timeout: 15000 });
  await listbox.getByRole("option").first().click();

  // Draft badge gone → row will ingest as material_id, not a new draft.
  await expect(page.getByText("+M")).toHaveCount(0, { timeout: 10000 });

  await page.screenshot({ path: path.join(SHOT_DIR, "backfill-step3-linked.png"), fullPage: true });
});
