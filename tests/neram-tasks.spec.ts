import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * Task screens on Neram's task hub, with every /api/neram/* call mocked (the
 * real hub is never called). Needs the dev server started with the flag on:
 *
 *   set NEXT_PUBLIC_FF_NERAM_TASKS=true  (PowerShell: $env:NEXT_PUBLIC_FF_NERAM_TASKS="true")
 *   npm run dev:cloud
 *   npx playwright test tests/neram-tasks.spec.ts --workers=1
 */
test.skip(process.env.NEXT_PUBLIC_FF_NERAM_TASKS !== "true", "Start the dev server and tests with NEXT_PUBLIC_FF_NERAM_TASKS=true");

const ME = { externalId: "bf3db0ff-a52b-47e5-9a3d-9bdb7d5a5b51", name: "Hari Admin" };
const AJIT = { externalId: "59ab8650-9436-469f-99a0-192af1e08198", name: "Ajith Kumar" };
const TASK_ID = "0b9c0000-0000-4000-8000-0000000000aa";

const task = (over: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  title: "Count the cement bags",
  notes: "Before the truck comes",
  status: "doing",
  checkAsked: false,
  priority: "high",
  size: "short",
  dueDate: null,
  dueTime: null,
  owner: ME,
  givenBy: AJIT,
  checker: null,
  waitingOn: null,
  waitingReason: null,
  proofRequired: true,
  checklist: [],
  page: { url: "https://app.aesta.co.in/site/dashboard?site=s1", title: "Mathur dashboard", siteId: "s1", siteName: "Mathur" },
  createdAt: "2026-11-17T04:00:00.000Z",
  updatedAt: "2026-11-17T05:00:00.000Z",
  doneAt: null,
  comments: [{ id: "c1", by: AJIT, text: "Truck comes at 4", at: "2026-11-17T04:30:00.000Z" }],
  photos: [],
  time: { running: true, startedAt: "2026-11-17T04:10:00.000Z", elapsedSec: 600, workingSec: null, basis: null, stretches: 1 },
  ...over,
});

interface Mock {
  linked?: boolean;
  running?: Array<Record<string, unknown>>;
  /** What POST /actions answers. */
  actionAnswer?: (body: any) => { status: number; json: unknown };
  sent: Array<{ method: string; path: string; body: any }>;
}

async function mockHub(page: Page, m: Mock) {
  await page.route("**/api/neram/**", async (route: Route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    m.sent.push({ method, path: path + url.search, body });
    const json = (status: number, data: unknown) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(data) });

    if (m.linked === false && path !== "/api/neram/events/sync") {
      return json(403, { error: "Your account is not connected to tasks yet. Ask Hari.", code: "not_linked" });
    }
    if (path === "/api/neram/events/sync") return json(200, { stored: 0, cursor: 0, skipped: false });
    if (path === "/api/neram/people") {
      return json(200, { people: [{ ...ME, kind: "staff", role: "admin" }, { ...AJIT, kind: "staff", role: "site_engineer" }] });
    }
    if (path === "/api/neram/running") {
      return json(200, { now: new Date().toISOString(), running: m.running ?? [] });
    }
    if (path === "/api/neram/tasks" && method === "GET") {
      return json(200, { tasks: url.searchParams.get("state") === "closed" ? [] : [task()] });
    }
    if (path === "/api/neram/tasks" && method === "POST") {
      return json(201, { task: task({ id: "new-task-1", title: body.title, status: "todo", comments: [] }) });
    }
    if (path === `/api/neram/tasks/${TASK_ID}` && method === "GET") return json(200, { task: task() });
    if (path.endsWith("/actions")) {
      const a = m.actionAnswer?.(body) ?? { status: 200, json: { task: task() } };
      return json(a.status, a.json);
    }
    if (path.endsWith("/files")) return json(201, { task: task({ photos: [{ name: "proof.jpg", url: null }] }) });
    if (path.endsWith("/comments")) return json(201, { task: task() });
    return json(404, { error: "Not mocked", code: "not_found" });
  });
}

async function waitForApp(page: Page) {
  await page.locator("header").first().waitFor({ timeout: 120_000 });
}

test.describe("Neram task hub screens", () => {
  test("Tasks page: lists hub tasks, Done asks for proof and opens the photo picker", async ({ page }) => {
    const m: Mock = {
      sent: [],
      actionAnswer: (b) =>
        b.action === "done"
          ? { status: 400, json: { error: "This task needs a photo or a note to close.", code: "proof" } }
          : { status: 200, json: { task: task() } },
    };
    await mockHub(page, m);
    await page.goto("/tasks", { timeout: 180_000 });
    await waitForApp(page);

    await expect(page.getByText("Count the cement bags").first()).toBeVisible({ timeout: 60_000 });
    // doing → "In progress", high stays High
    await expect(page.getByText("In progress").first()).toBeVisible();
    // The page asked the hub for missed events.
    expect(m.sent.some((s) => s.method === "POST" && s.path === "/api/neram/events/sync")).toBe(true);

    await page.getByText("Count the cement bags").first().click();
    const drawer = page.locator(".MuiDrawer-paper").filter({ hasText: "Truck comes at 4" });
    await expect(drawer).toBeVisible();

    const chooser = page.waitForEvent("filechooser");
    await drawer.getByRole("button", { name: "Done" }).click();
    await chooser; // the photo picker opened
    await expect(drawer.getByText("This task needs a photo or a note to close.")).toBeVisible();
    await expect(drawer.getByRole("button", { name: "Add photo" }).first()).toBeVisible();
  });

  test("New task from this page attaches the page with ?site=", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const m: Mock = { sent: [] };
    await mockHub(page, m);
    await page.goto("/site/dashboard", { timeout: 180_000 });
    await waitForApp(page);

    await page.getByRole("button", { name: "New task from this page" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("About this page")).toBeVisible();

    await dialog.getByLabel("What needs to be done?").fill("Check the shuttering");
    await dialog.getByLabel("Assign to").click();
    await page.getByRole("option", { name: "Ajith Kumar" }).click();
    await dialog.getByRole("button", { name: "Assign task" }).click();

    await expect.poll(() => m.sent.find((s) => s.method === "POST" && s.path === "/api/neram/tasks")).toBeTruthy();
    const sent = m.sent.find((s) => s.method === "POST" && s.path === "/api/neram/tasks")!.body;
    expect(sent).toMatchObject({ title: "Check the shuttering", owner: AJIT.externalId, priority: "normal", size: "short" });
    expect(sent.page.url).toMatch(/^\/site\/dashboard\?(.*&)?site=[0-9a-f-]{36}/);
    expect(sent.page.siteId).toBeTruthy();
    expect(sent).not.toHaveProperty("as");
  });

  for (const vp of [
    { width: 375, height: 812 },
    { width: 1280, height: 800 },
  ]) {
    test(`running chip at ${vp.width}px: time, Still on this?, Done/Open`, async ({ page }) => {
      await page.setViewportSize(vp);
      const startedAt = new Date(Date.now() - 65 * 60_000).toISOString();
      const m: Mock = {
        sent: [],
        running: [{ id: TASK_ID, title: "Count the cement bags", startedAt, stale: true, priority: "normal", dueDate: null, page: null }],
      };
      await mockHub(page, m);
      await page.goto("/site/dashboard", { timeout: 180_000 });
      await waitForApp(page);

      const chip = page.getByTestId("running-tasks-chip");
      await expect(chip).toBeVisible({ timeout: 60_000 });
      await expect(chip).toContainText("1h 05m");
      const box = await chip.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width);
      // The ticking time is not read out.
      await expect(chip.locator('[aria-live="off"]')).toHaveCount(1);
      // Below 1536px the AppBar has room only for the time; the title is in the label.
      await expect(chip.getByText("Count the cement bags")).toBeHidden();
      await expect(chip).toHaveAttribute("aria-label", /Running: Count the cement bags, for 1 hour 5 minutes\. Still on this\?/);

      await chip.focus();
      await page.keyboard.press("Enter");
      const pop = page.getByRole("dialog", { name: "Running task" });
      await expect(pop.getByText("Still on this?")).toBeVisible();
      await expect(pop.getByRole("button", { name: "Done" })).toBeVisible();
      await expect(pop.getByRole("button", { name: "Open" })).toBeVisible();
      await pop.getByRole("button", { name: "Yes, still on it" }).click();
      await expect
        .poll(() => m.sent.find((s) => s.path === `/api/neram/tasks/${TASK_ID}/actions`)?.body)
        .toEqual({ action: "still_on" });
    });
  }

  test("not connected: the Tasks page says so in plain words", async ({ page }) => {
    const m: Mock = { sent: [], linked: false };
    await mockHub(page, m);
    await page.goto("/tasks", { timeout: 180_000 });
    await waitForApp(page);
    await expect(page.getByText("Your account is not connected to tasks yet. Ask Hari.")).toBeVisible({ timeout: 60_000 });
    // And no running chip for someone who isn't linked.
    await expect(page.getByTestId("running-tasks-chip")).toHaveCount(0);
  });
});
