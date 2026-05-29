# Per-tab Site & Company Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the selected Site and Company independent per browser tab so two tabs can show different sites/companies for side-by-side comparison.

**Architecture:** `sessionStorage` (per-tab) becomes the source of truth for the selected site/company. The shared `localStorage` and the shared `selectedSiteId` cookie only *seed* a brand-new tab; once a tab resolves its selection it writes the id back into its own `sessionStorage` and "owns" it, so a switch in another tab can never override it. The two SSR pages (`/site/dashboard`, `/site/attendance`) read the shared cookie and already self-correct on the client when the tab's site differs.

**Tech Stack:** Next.js 15, React, TypeScript, React Context, Vitest + jsdom (unit), Playwright MCP (manual cross-tab verification).

**Spec:** `docs/superpowers/specs/2026-05-29-per-tab-site-company-selection-design.md`

---

## File Structure

| File | Responsibility | Action |
|------|----------------|--------|
| `src/contexts/CompanyContext/CompanyProvider.tsx` | Company selection state + storage helpers | Modify: session-first storage + per-tab ownership; export helpers for test |
| `src/contexts/CompanyContext/companyStorage.test.ts` | Unit test for company storage priority | Create |
| `src/contexts/SiteContext/SiteProvider.tsx` | Site selection state + storage helpers | Modify: flip restore priority (stored→cookie) + per-tab ownership; export helpers for test |
| `src/contexts/SiteContext/siteStorage.test.ts` | Unit test for site storage priority invariant | Create |

**Why no jsdom test for the cross-tab override itself:** jsdom cannot simulate two independent tabs (it has a single `sessionStorage`). The unit tests lock the *storage-helper read priority* invariant that the whole feature depends on (session beats local). The actual two-tab behavior is verified manually with Playwright in Task 3 — that is the real test for this bug.

---

## Task 1: CompanyProvider — per-tab company storage

The company selector currently persists to `localStorage` only, so every tab shares one company. Add `sessionStorage` as the per-tab source of truth, and make a fresh tab claim ownership of its resolved company.

**Files:**
- Modify: `src/contexts/CompanyContext/CompanyProvider.tsx` (helpers at lines 20-51; mount effect at lines 195-217)
- Test: `src/contexts/CompanyContext/companyStorage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/contexts/CompanyContext/companyStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getStoredCompanyId, storeCompanyId } from "./CompanyProvider";

const KEY = "selectedCompanyId";

describe("company storage (per-tab)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("returns null when nothing is stored", () => {
    expect(getStoredCompanyId()).toBeNull();
  });

  it("storeCompanyId writes BOTH sessionStorage and localStorage", () => {
    storeCompanyId("c-1");
    expect(sessionStorage.getItem(KEY)).toBe("c-1");
    expect(localStorage.getItem(KEY)).toBe("c-1");
  });

  it("prefers per-tab sessionStorage over shared localStorage", () => {
    localStorage.setItem(KEY, "shared-company");
    sessionStorage.setItem(KEY, "this-tab-company");
    expect(getStoredCompanyId()).toBe("this-tab-company");
  });

  it("falls back to shared localStorage when sessionStorage is empty (fresh-tab seed)", () => {
    localStorage.setItem(KEY, "shared-company");
    expect(getStoredCompanyId()).toBe("shared-company");
  });

  it("clearing (null) removes from BOTH stores", () => {
    storeCompanyId("c-1");
    storeCompanyId(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/contexts/CompanyContext/companyStorage.test.ts`
Expected: FAIL — `getStoredCompanyId`/`storeCompanyId` are not exported (import error), and once exported the "prefers sessionStorage" + "writes BOTH" assertions fail because the current helper reads/writes `localStorage` only.

- [ ] **Step 3: Export and rewrite `getStoredCompanyId` (session-first)**

In `src/contexts/CompanyContext/CompanyProvider.tsx`, replace the current helper (lines 21-28):

```tsx
function getStoredCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SELECTED_COMPANY_KEY);
  } catch {
    return null;
  }
}
```

with:

```tsx
export function getStoredCompanyId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Per-tab sessionStorage wins; shared localStorage is the fresh-tab seed.
    const sessionVal = sessionStorage.getItem(SELECTED_COMPANY_KEY);
    if (sessionVal !== null) return sessionVal;
    return localStorage.getItem(SELECTED_COMPANY_KEY);
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Export and rewrite `storeCompanyId` (write both stores)**

Replace the current helper (lines 40-51):

```tsx
function storeCompanyId(companyId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (companyId) {
      localStorage.setItem(SELECTED_COMPANY_KEY, companyId);
    } else {
      localStorage.removeItem(SELECTED_COMPANY_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}
```

with:

```tsx
export function storeCompanyId(companyId: string | null): void {
  if (typeof window === "undefined") return;
  try {
    if (companyId) {
      sessionStorage.setItem(SELECTED_COMPANY_KEY, companyId); // per-tab
      localStorage.setItem(SELECTED_COMPANY_KEY, companyId); // shared seed
    } else {
      sessionStorage.removeItem(SELECTED_COMPANY_KEY);
      localStorage.removeItem(SELECTED_COMPANY_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test -- src/contexts/CompanyContext/companyStorage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Claim per-tab ownership in the mount restore effect**

A fresh tab seeds its company from the shared `localStorage` but must write it into its own `sessionStorage` so a later switch in another tab cannot override it on reload. The `fetchCompanies` no-`prevSelected` branch already calls `storeCompanyId` (lines 171, 179), but the cache-present mount path does not. Replace the mount effect (lines 195-217):

```tsx
  // Restore from localStorage on mount
  useEffect(() => {
    const cachedCompanies = getStoredCompanies();
    const savedCompanyId = getStoredCompanyId();

    if (cachedCompanies.length > 0) {
      console.log(
        "[CompanyContext] Restoring from cache:",
        cachedCompanies.length,
        "companies"
      );
      setCompanies(cachedCompanies);

      if (savedCompanyId) {
        const found = cachedCompanies.find((c) => c.id === savedCompanyId);
        const selectedCompany = found || cachedCompanies.find((c) => c.is_primary) || cachedCompanies[0] || null;
        setSelectedCompanyState(selectedCompany);
      } else {
        const primaryCompany = cachedCompanies.find((c) => c.is_primary) || cachedCompanies[0] || null;
        setSelectedCompanyState(primaryCompany);
      }
    }
  }, []);
```

with:

```tsx
  // Restore from sessionStorage (per-tab) → localStorage (shared seed) on mount.
  useEffect(() => {
    const cachedCompanies = getStoredCompanies();
    const savedCompanyId = getStoredCompanyId(); // sessionStorage → localStorage

    if (cachedCompanies.length > 0) {
      console.log(
        "[CompanyContext] Restoring from cache:",
        cachedCompanies.length,
        "companies"
      );
      setCompanies(cachedCompanies);

      const found = savedCompanyId
        ? cachedCompanies.find((c) => c.id === savedCompanyId)
        : undefined;
      const selectedCompany =
        found || cachedCompanies.find((c) => c.is_primary) || cachedCompanies[0] || null;
      setSelectedCompanyState(selectedCompany);

      if (selectedCompany) {
        // Claim per-tab ownership so another tab's switch can't override us.
        storeCompanyId(selectedCompany.id);
      }
    }
  }, []);
```

- [ ] **Step 7: Re-run the company test to confirm still green**

Run: `npm run test -- src/contexts/CompanyContext/companyStorage.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 8: Commit**

```bash
git add src/contexts/CompanyContext/CompanyProvider.tsx src/contexts/CompanyContext/companyStorage.test.ts
git commit -m "feat(company-context): per-tab company selection via sessionStorage

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: SiteProvider — per-tab restore priority

`sessionStorage` and the session-first `getStoredSiteId()` already exist, but both restore paths read the **shared cookie first** (`cookie || stored`), which defeats per-tab isolation. Flip the priority to `stored || cookie` and make the mount path write the resolved id to `sessionStorage`.

**Files:**
- Modify: `src/contexts/SiteContext/SiteProvider.tsx` (helpers at lines 31-65; `fetchSites` restore at lines 156-159; mount effect at lines 206-236)
- Test: `src/contexts/SiteContext/siteStorage.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/contexts/SiteContext/siteStorage.test.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { getStoredSiteId, storeSiteId } from "./SiteProvider";

const KEY = "selectedSiteId";

describe("site storage (per-tab invariant)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it("storeSiteId writes BOTH sessionStorage and localStorage", () => {
    storeSiteId("s-1");
    expect(sessionStorage.getItem(KEY)).toBe("s-1");
    expect(localStorage.getItem(KEY)).toBe("s-1");
  });

  it("prefers per-tab sessionStorage over shared localStorage", () => {
    localStorage.setItem(KEY, "shared-site");
    sessionStorage.setItem(KEY, "this-tab-site");
    expect(getStoredSiteId()).toBe("this-tab-site");
  });

  it("falls back to shared localStorage when sessionStorage is empty (fresh-tab seed)", () => {
    localStorage.setItem(KEY, "shared-site");
    expect(getStoredSiteId()).toBe("shared-site");
  });

  it("clearing (null) removes from BOTH stores", () => {
    storeSiteId("s-1");
    storeSiteId(null);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/contexts/SiteContext/siteStorage.test.ts`
Expected: FAIL — `getStoredSiteId`/`storeSiteId` are not exported (import error).

- [ ] **Step 3: Export the existing site storage helpers**

In `src/contexts/SiteContext/SiteProvider.tsx`, add `export` to the two helpers (the bodies are already correct — session-first read, dual write). Change line 31 `function getStoredSiteId(): string | null {` to:

```tsx
export function getStoredSiteId(): string | null {
```

and change line 52 `function storeSiteId(siteId: string | null): void {` to:

```tsx
export function storeSiteId(siteId: string | null): void {
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/contexts/SiteContext/siteStorage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Flip restore priority in `fetchSites`**

Replace lines 156-159:

```tsx
        // Try to restore from cookie first, then localStorage
        const cookieSiteId = getSelectedSiteCookie();
        const localStorageSiteId = getStoredSiteId();
        const savedSiteId = cookieSiteId || localStorageSiteId;
```

with:

```tsx
        // Per-tab sessionStorage/localStorage wins; the shared cookie only seeds a fresh tab.
        const cookieSiteId = getSelectedSiteCookie();
        const storedSiteId = getStoredSiteId(); // sessionStorage → localStorage
        const savedSiteId = storedSiteId || cookieSiteId;
```

(The rest of this branch already calls `storeSiteId(...)` + `setSelectedSiteCookie(...)`, so ownership is written here.)

- [ ] **Step 6: Flip restore priority + claim ownership in the mount effect**

Replace the mount effect (lines 206-236):

```tsx
  // Restore from localStorage/cookie on mount
  useEffect(() => {
    const cachedSites = getStoredSites();
    const cookieSiteId = getSelectedSiteCookie();
    const localStorageSiteId = getStoredSiteId();
    const savedSiteId = cookieSiteId || localStorageSiteId;

    if (cachedSites.length > 0) {
      console.log(
        "[SiteContext] Restoring from cache:",
        cachedSites.length,
        "sites"
      );
      setSites(cachedSites);

      if (savedSiteId) {
        const found = cachedSites.find((s) => s.id === savedSiteId);
        const selectedSite = found || cachedSites[0] || null;
        setSelectedSiteState(selectedSite);
        if (!cookieSiteId && localStorageSiteId && selectedSite) {
          setSelectedSiteCookie(selectedSite.id);
        }
      } else {
        const firstSite = cachedSites[0] || null;
        setSelectedSiteState(firstSite);
        if (firstSite) {
          setSelectedSiteCookie(firstSite.id);
        }
      }
    }
  }, []);
```

with:

```tsx
  // Restore on mount. Priority: per-tab sessionStorage → shared localStorage → shared cookie.
  // After resolving, write the id back to sessionStorage so this tab owns its selection
  // and a site switch in another tab can never override it on reload/remount.
  useEffect(() => {
    const cachedSites = getStoredSites();
    const cookieSiteId = getSelectedSiteCookie();
    const storedSiteId = getStoredSiteId(); // sessionStorage → localStorage
    const savedSiteId = storedSiteId || cookieSiteId;

    if (cachedSites.length > 0) {
      console.log(
        "[SiteContext] Restoring from cache:",
        cachedSites.length,
        "sites"
      );
      setSites(cachedSites);

      const found = savedSiteId
        ? cachedSites.find((s) => s.id === savedSiteId)
        : undefined;
      const selectedSite = found || cachedSites[0] || null;
      setSelectedSiteState(selectedSite);

      if (selectedSite) {
        storeSiteId(selectedSite.id); // claim per-tab ownership (session + local)
        if (!cookieSiteId) setSelectedSiteCookie(selectedSite.id);
      }
    }
  }, []);
```

- [ ] **Step 7: Re-run the site test to confirm still green**

Run: `npm run test -- src/contexts/SiteContext/siteStorage.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 8: Commit**

```bash
git add src/contexts/SiteContext/SiteProvider.tsx src/contexts/SiteContext/siteStorage.test.ts
git commit -m "feat(site-context): per-tab site selection — sessionStorage wins over shared cookie

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Full verification (build + manual two-tab check)

This is the verification that actually exercises the cross-tab bug. Requires the dev server running against cloud Supabase.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck + full unit suite**

Run: `npm run test -- src/contexts`
Expected: PASS (both new test files green, 9 tests total).

- [ ] **Step 2: Production build passes**

Run: `npm run build`
Expected: Build completes with no type errors.

- [ ] **Step 3: Start the dev server (if not already running)**

Run: `npm run dev:cloud`
Expected: Server on `http://localhost:3000`.

- [ ] **Step 4: Manual two-tab verification via Playwright MCP**

1. Log in: navigate to `http://localhost:3000/dev-login` (auto-login).
2. Open Tab A → `http://localhost:3000/site/payments`. Set the site picker to **Site X**.
3. Open Tab B (`browser_tabs` new) → same page. Set the site picker to a **different Site Y**.
4. Switch back to Tab A (`browser_tabs` select). Take a screenshot. **Expected: Tab A still shows Site X** (was previously following Tab B).
5. Switch Tab B between sites a couple of times, return to Tab A. **Expected: Tab A unchanged.**
6. Reload Tab A. **Expected: still Site X** (sessionStorage wins over the shared cookie/localStorage).
7. Open a fresh Tab C. **Expected: it inherits the last-used site as its starting point, then can be switched independently.**
8. Repeat steps 2-6 for the **Company** picker (switch company in Tab B, confirm Tab A's company is unchanged).
9. Check `browser_console_messages` for errors/warnings on each tab; fix any per CLAUDE.md before closing.
10. Close the browser (`browser_close`).

- [ ] **Step 5: Final commit (only if any fix was needed during verification)**

```bash
git add -A
git commit -m "fix(site-context): address issues found during two-tab verification

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:**
- "Make per-tab sessionStorage the source of truth" → Tasks 1 (company) + 2 (site).
- "Restore priority: sessionStorage → localStorage → cookie" → Task 2 Steps 5-6 (site); Task 1 Step 3 (company, no cookie).
- "Fresh tab seeds from shared store then owns its choice" → Task 1 Step 6 + Task 2 Step 6 (storeX on mount-seed).
- "Both Site and Company isolated" → Task 1 + Task 2.
- "Accepted SSR tradeoff handled by existing useServerData check" → unchanged; verified by Task 3 Step 6 (reload Tab A).
- "Unit (if practical): assert storage-helper read priority" → Task 1 Step 1, Task 2 Step 1.
- "Manual two-tab Playwright" → Task 3 Step 4.

**Placeholder scan:** No TBD/TODO; every code step shows full before/after; commands have expected output. ✓

**Type/name consistency:** Helper names (`getStoredSiteId`, `storeSiteId`, `getStoredCompanyId`, `storeCompanyId`), keys (`selectedSiteId`, `selectedCompanyId`), and import paths (`./SiteProvider`, `./CompanyProvider`) match across tasks. `getStoredSiteId()` returns `string | null`, so `stored || cookie` correctly falls through on `null`. ✓

**Risk note:** If `vitest.config` restricts includes to `*.test.tsx`, add `*.test.ts` (or rename the two test files to `.test.ts` already matches typical `**/*.{test,spec}.{ts,tsx}` globs) — verify in Task 3 Step 1.
