# Material Hub Mobile Detail Sheet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On mobile, tapping a Material Hub card opens a bottom sheet with the full thread detail and full action parity (instead of doing nothing).

**Architecture:** Reuse the existing `MaterialThreadExpanded` component (already reflows to one column on `xs`) inside a `SwipeableDrawer anchor="bottom"`. A page-level media query opens the sheet for the already-selected thread on mobile; desktop keeps its inline expansion untouched. One small pure helper (`threadDisplayName`) is extracted and unit-tested so the sheet header and the card share a single title rule.

**Tech Stack:** Next.js 15, React, MUI v7 (`SwipeableDrawer`, `useMediaQuery`), Vitest + React Testing Library, Playwright MCP for visual verification.

**Spec:** `docs/superpowers/specs/2026-06-01-material-hub-mobile-detail-sheet-design.md`

**Testing convention (important):** This codebase unit-tests **pure logic only** and verifies rendered components visually with Playwright (see `src/components/inventory/QuickUsageSheet.test.tsx`, which tests only the pure `getDateRangeFromPreset`, never the rendered drawer). So Task 1 is full TDD; the UI tasks (2–4) are verified by the TypeScript build (Task 5) and the Playwright pass (Task 6), not by RTL render tests.

---

## File Structure

- **Create** `src/lib/material-hub/threadTitle.ts` — pure title-derivation helpers (`threadVariantCategory`, `threadDisplayName`), shared by the card and the sheet.
- **Create** `src/lib/material-hub/threadTitle.test.ts` — Vitest unit tests for the helpers.
- **Create** `src/components/material-hub/MaterialThreadDetailSheet.tsx` — the mobile bottom sheet.
- **Modify** `src/components/material-hub/MaterialThreadRow.tsx` — import `threadVariantCategory` from the new module (remove the local copy); add a `Details ›` tap hint on the mobile card.
- **Modify** `src/app/(main)/site/materials/hub/page.tsx` — open the sheet for the selected thread on mobile.

---

## Task 1: Extract and test the thread-title helper

**Files:**
- Create: `src/lib/material-hub/threadTitle.ts`
- Test: `src/lib/material-hub/threadTitle.test.ts`
- Modify: `src/components/material-hub/MaterialThreadRow.tsx` (remove local `threadVariantCategory`, import the shared one)

- [ ] **Step 1: Write the failing test**

Create `src/lib/material-hub/threadTitle.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { threadVariantCategory, threadDisplayName } from "./threadTitle";

describe("threadVariantCategory", () => {
  it("returns the trimmed common prefix for related variants", () => {
    expect(
      threadVariantCategory(
        [{ material_name: "TMT Rods 16mm" }, { material_name: "TMT Rods 20mm" }],
        "TMT Rods 16mm"
      )
    ).toBe("TMT Rods");
  });

  it("falls back when the common prefix is too short", () => {
    expect(
      threadVariantCategory(
        [{ material_name: "Cement" }, { material_name: "Sand" }],
        "Materials"
      )
    ).toBe("Materials");
  });

  it("returns the single name when only one variant", () => {
    expect(threadVariantCategory([{ material_name: "Cement" }], "fallback")).toBe(
      "Cement"
    );
  });

  it("returns the fallback for an empty list", () => {
    expect(threadVariantCategory([], "fallback")).toBe("fallback");
  });
});

describe("threadDisplayName", () => {
  it("uses the variant category when there are multiple variants", () => {
    expect(
      threadDisplayName({
        material_name: "TMT Rods 16mm",
        variants: [
          { material_name: "TMT Rods 16mm" },
          { material_name: "TMT Rods 20mm" },
        ],
      } as never)
    ).toBe("TMT Rods");
  });

  it("uses the material name when one or no variants", () => {
    expect(
      threadDisplayName({ material_name: "Cement", variants: undefined } as never)
    ).toBe("Cement");
    expect(
      threadDisplayName({
        material_name: "Cement",
        variants: [{ material_name: "Cement 50kg" }],
      } as never)
    ).toBe("Cement");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- src/lib/material-hub/threadTitle.test.ts`
Expected: FAIL — `Failed to resolve import "./threadTitle"` (the module does not exist yet).

- [ ] **Step 3: Write the minimal implementation**

Create `src/lib/material-hub/threadTitle.ts`:

```ts
/**
 * Pure title-derivation helpers for Material Hub threads.
 *
 * Extracted from MaterialThreadRow so the card row and the mobile detail sheet
 * derive a thread's display title with one shared rule (DRY).
 */
import type { MaterialThread } from "./threadTypes";

/**
 * Longest common prefix of variant names, trimmed to a word boundary. Falls
 * back to `fallback` (typically the thread's primary material name) when the
 * prefix collapses to almost nothing (e.g. unrelated materials).
 */
export function threadVariantCategory(
  variants: Array<{ material_name: string }>,
  fallback: string
): string {
  if (variants.length === 0) return fallback;
  const names = variants.map((v) => v.material_name || "").filter(Boolean);
  if (names.length <= 1) return names[0] || fallback;
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    let j = 0;
    while (j < prefix.length && j < names[i].length && prefix[j] === names[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  prefix = prefix.replace(/[\s\-_/]+$/, "").trim();
  if (prefix.length < 3) return fallback;
  return prefix;
}

/**
 * Display name for a thread title: the shared variant category when the thread
 * carries multiple variants, else the material name.
 */
export function threadDisplayName(
  thread: Pick<MaterialThread, "variants" | "material_name">
): string {
  if (thread.variants && thread.variants.length > 1) {
    return threadVariantCategory(thread.variants, thread.material_name);
  }
  return thread.material_name;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- src/lib/material-hub/threadTitle.test.ts`
Expected: PASS — 6 tests pass.

- [ ] **Step 5: Point MaterialThreadRow at the shared helper**

In `src/components/material-hub/MaterialThreadRow.tsx`:

(a) Add the import near the other `@/lib/material-hub` imports (just below the `formatters` import around line 21):

```tsx
import { threadVariantCategory } from "@/lib/material-hub/threadTitle";
```

(b) Delete the local `threadVariantCategory` function definition (the whole block, currently around lines 463–482):

```tsx
function threadVariantCategory(
  variants: Array<{ material_name: string }>,
  fallback: string
): string {
  if (variants.length === 0) return fallback;
  const names = variants.map((v) => v.material_name || "").filter(Boolean);
  if (names.length <= 1) return names[0] || fallback;
  let prefix = names[0];
  for (let i = 1; i < names.length; i++) {
    let j = 0;
    while (j < prefix.length && j < names[i].length && prefix[j] === names[i][j]) {
      j++;
    }
    prefix = prefix.slice(0, j);
    if (!prefix) break;
  }
  prefix = prefix.replace(/[\s\-_/]+$/, "").trim();
  if (prefix.length < 3) return fallback;
  return prefix;
}
```

Leave `variantShortLabel` in place — it is only used by the row's variant chips. The two existing call sites of `threadVariantCategory` (in the title `Typography` and the variant-chip `.map`) now resolve to the imported function.

- [ ] **Step 6: Verify the row still type-checks and tests pass**

Run: `npm run test -- src/lib/material-hub/threadTitle.test.ts`
Expected: PASS (still 6 tests).
Run: `npx tsc --noEmit`
Expected: no errors referencing `MaterialThreadRow.tsx` or `threadTitle.ts`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/material-hub/threadTitle.ts src/lib/material-hub/threadTitle.test.ts src/components/material-hub/MaterialThreadRow.tsx
git commit -m "refactor(material-hub): extract shared threadDisplayName/threadVariantCategory helper"
```

---

## Task 2: Create the mobile detail bottom sheet

**Files:**
- Create: `src/components/material-hub/MaterialThreadDetailSheet.tsx`

- [ ] **Step 1: Write the component**

Create `src/components/material-hub/MaterialThreadDetailSheet.tsx`:

```tsx
"use client";

/**
 * Mobile-only bottom sheet showing one thread's full detail.
 *
 * On desktop the Hub expands `MaterialThreadExpanded` inline below the row; on
 * mobile that inline panel is gated off, so tapping a card did nothing. This
 * sheet is the mobile tap-through: it reuses `MaterialThreadExpanded` verbatim
 * (full action parity — corrections, attachments, usage log, Settle /
 * Push-to-expense) inside a `SwipeableDrawer`, matching the established
 * bottom-sheet pattern in `QuickUsageSheet`.
 */

import { Box, IconButton, SwipeableDrawer, Typography } from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { hubTokens } from "@/lib/material-hub/tokens";
import { stageLabel } from "@/lib/material-hub/stageHelpers";
import { threadDisplayName } from "@/lib/material-hub/threadTitle";
import MaterialThreadExpanded from "./MaterialThreadExpanded";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export interface MaterialThreadDetailSheetProps {
  open: boolean;
  thread: MaterialThread | null;
  onClose: () => void;
}

export default function MaterialThreadDetailSheet({
  open,
  thread,
  onClose,
}: MaterialThreadDetailSheetProps) {
  const accent = thread?.kind === "group" ? hubTokens.pink : hubTokens.primary;
  const variantCount =
    thread?.variants && thread.variants.length > 1 ? thread.variants.length : 0;

  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderRadius: "18px 18px 0 0",
          maxWidth: 520,
          mx: "auto",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
        },
      }}
    >
      {thread && (
        <>
          {/* Sticky header */}
          <Box
            sx={{
              flexShrink: 0,
              background: hubTokens.card,
              borderTop: `3px solid ${accent}`,
              borderBottom: `1px solid ${hubTokens.hairline}`,
              padding: "8px 14px 12px",
            }}
          >
            {/* Drag handle */}
            <Box
              sx={{
                width: 36,
                height: 4,
                bgcolor: "#e0e0e0",
                borderRadius: 1,
                mx: "auto",
                mb: 1.25,
              }}
            />
            <Box
              sx={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "10px",
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    mb: "3px",
                  }}
                >
                  <Typography
                    component="span"
                    sx={{
                      fontSize: 10.5,
                      fontFamily: hubTokens.mono,
                      fontWeight: 600,
                      color: hubTokens.subtle,
                    }}
                  >
                    {thread.id}
                  </Typography>
                  <Box
                    component="span"
                    sx={{
                      padding: "2px 7px",
                      borderRadius: "5px",
                      background: hubTokens.bg,
                      color: hubTokens.muted,
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: "0.4px",
                      textTransform: "uppercase",
                    }}
                  >
                    {stageLabel(thread.stage)}
                  </Box>
                </Box>
                <Typography
                  sx={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: hubTokens.text,
                    letterSpacing: "-0.1px",
                  }}
                >
                  <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
                    {thread.qty}
                  </Box>{" "}
                  <Box component="span" sx={{ color: hubTokens.muted, fontWeight: 500 }}>
                    {thread.material_unit} ·
                  </Box>{" "}
                  {threadDisplayName(thread)}
                  {variantCount > 0 ? ` · ${variantCount} sizes` : ""}
                </Typography>
              </Box>
              <IconButton
                onClick={onClose}
                size="small"
                aria-label="Close details"
                sx={{ flexShrink: 0, mt: "-2px" }}
              >
                <CloseIcon sx={{ fontSize: 20 }} />
              </IconButton>
            </Box>
          </Box>

          {/* Scrollable body — MaterialThreadExpanded supplies its own padding
              and reflows to a single column at the xs breakpoint. */}
          <Box sx={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}>
            <MaterialThreadExpanded thread={thread} />
          </Box>
        </>
      )}
    </SwipeableDrawer>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MaterialThreadDetailSheet.tsx`.

- [ ] **Step 3: Commit**

```bash
git add src/components/material-hub/MaterialThreadDetailSheet.tsx
git commit -m "feat(material-hub): add MaterialThreadDetailSheet mobile bottom sheet"
```

---

## Task 3: Open the sheet from the Hub page on mobile

**Files:**
- Modify: `src/app/(main)/site/materials/hub/page.tsx`

- [ ] **Step 1: Add the imports**

(a) Add `useMediaQuery` to the existing `@mui/material` import list (the block starting near line 17). Insert it among the named imports, e.g. after `Typography,`:

```tsx
  Typography,
  useMediaQuery,
```

(b) Add `HUB_BREAKPOINT_PX` to the existing tokens import (currently `import { hubTokens } from "@/lib/material-hub/tokens";`, near line 59):

```tsx
import { hubTokens, HUB_BREAKPOINT_PX } from "@/lib/material-hub/tokens";
```

(c) Add the component import near the other `@/components/material-hub` imports (e.g. just after the `MaterialThreadRow` import around line 41):

```tsx
import MaterialThreadDetailSheet from "@/components/material-hub/MaterialThreadDetailSheet";
```

- [ ] **Step 2: Compute `isMobile` and the selected thread**

Inside the component, after the `filteredThreads` `useMemo` block (it ends near line 171), add:

```tsx
  const isMobile = useMediaQuery(`(max-width:${HUB_BREAKPOINT_PX - 1}px)`);

  const expandedThread = useMemo(
    () => filteredThreads.find((t) => t.source_row_id === expandedId) ?? null,
    [filteredThreads, expandedId]
  );
```

(`useMemo` is already imported on line 15; `expandedId` / `setExpandedId` already exist on line 72.)

- [ ] **Step 3: Render the sheet**

Just before the closing `</Box>` of the page (after the `<Snackbar>…</Snackbar>` block, near line 380), add:

```tsx
      <MaterialThreadDetailSheet
        open={isMobile && !!expandedThread}
        thread={expandedThread}
        onClose={() => setExpandedId(null)}
      />
```

- [ ] **Step 4: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `page.tsx`.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(main)/site/materials/hub/page.tsx"
git commit -m "feat(material-hub): open detail sheet on mobile card tap"
```

---

## Task 4: Add a `Details ›` tap hint to the mobile card

**Files:**
- Modify: `src/components/material-hub/MaterialThreadRow.tsx`

- [ ] **Step 1: Import the chevron icon**

Add next to the existing `PersonOutlineIcon` import (near line 19):

```tsx
import KeyboardArrowRightIcon from "@mui/icons-material/KeyboardArrowRight";
```

- [ ] **Step 2: Add the hint beside the stage badge**

In the mobile compact branch, find the price/stage row (the `Box` with `justifyContent: "space-between"` and `marginTop: "6px"`, around lines 383–420). Replace the stage-badge `Box` (the one rendering `{stageLabel(thread.stage)}`) so the badge and a new `Details ›` hint sit together on the right. Change:

```tsx
              <Box
                sx={{
                  padding: "2px 7px",
                  borderRadius: "5px",
                  background: hubTokens.bg,
                  color: hubTokens.muted,
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.4px",
                  textTransform: "uppercase",
                }}
              >
                {stageLabel(thread.stage)}
              </Box>
```

to:

```tsx
              <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <Box
                  component="span"
                  sx={{
                    padding: "2px 7px",
                    borderRadius: "5px",
                    background: hubTokens.bg,
                    color: hubTokens.muted,
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.4px",
                    textTransform: "uppercase",
                  }}
                >
                  {stageLabel(thread.stage)}
                </Box>
                <Box
                  component="span"
                  sx={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "1px",
                    color: hubTokens.primary,
                    fontSize: 10,
                    fontWeight: 700,
                  }}
                >
                  Details
                  <KeyboardArrowRightIcon sx={{ fontSize: 14 }} />
                </Box>
              </Box>
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors referencing `MaterialThreadRow.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/components/material-hub/MaterialThreadRow.tsx
git commit -m "feat(material-hub): add Details tap hint to mobile thread card"
```

---

## Task 5: Full build + test gate

**Files:** none (verification only)

- [ ] **Step 1: Run the unit tests**

Run: `npm run test -- src/lib/material-hub/threadTitle.test.ts`
Expected: PASS — 6 tests.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build completes with no type errors and no new warnings. If it fails, fix the reported file and re-run before continuing.

---

## Task 6: Playwright visual verification (mobile viewport)

**Files:** none (verification only). Follow CLAUDE.md "After UI Changes". Requires `npm run dev:cloud` running on `http://localhost:3000`.

- [ ] **Step 1: Ensure the dev server is up**

If not already running, start it (background): `npm run dev:cloud`. Wait until `http://localhost:3000` responds.

- [ ] **Step 2: Log in and size the viewport to mobile**

- `mcp__playwright__browser_navigate` → `http://localhost:3000/dev-login` (auto sets password + signs in).
- `mcp__playwright__browser_resize` → width `390`, height `844`.

- [ ] **Step 3: Open the Hub and confirm the card is tappable**

- `mcp__playwright__browser_navigate` → `http://localhost:3000/site/materials/hub`.
- `mcp__playwright__browser_snapshot` — confirm a card shows the `Details ›` hint and the cards/table toggle is hidden.

- [ ] **Step 4: Tap a card and screenshot the sheet**

- `mcp__playwright__browser_click` on a thread card body (not its action button).
- `mcp__playwright__browser_take_screenshot`.
- Expected: a bottom sheet slides up with the drag handle, the header (id chip + stage badge + title + ✕), and the 6 detail blocks stacked in a single column. The sheet body scrolls; the header stays pinned.

- [ ] **Step 5: Check the console is clean**

- `mcp__playwright__browser_console_messages` — expect no errors, no warnings, no hydration mismatches. Fix any that appear (per CLAUDE.md HTML-nesting / hydration rules) and re-verify.

- [ ] **Step 6: Exercise close + key thread types**

- Close via the ✕ button; reopen; close via backdrop tap; reopen; close via swipe-down (`mcp__playwright__browser_drag` from the handle downward). Each should dismiss the sheet and leave the list scroll position intact.
- Open a **group** thread → confirm the Inter-site usage block + "Settle this batch" button render and are tappable.
- Open a **mirror** thread (if present) → confirm the read-only banner renders and correction menus are absent.

- [ ] **Step 7: Close the browser**

- `mcp__playwright__browser_close`.

---

## Self-Review Notes

- **Spec coverage:** bottom-sheet pattern → Task 2; full action parity (reuse `MaterialThreadExpanded`) → Task 2 Step 1; page wiring with `isMobile` + `expandedThread` → Task 3; desktop untouched (sheet gated on `isMobile`) → Task 3 Step 2–3; `Details ›` discoverability hint → Task 4; RPC-on-open via Drawer unmount → satisfied by rendering the body only when `thread` is non-null (Task 2) + `open` gating (Task 3); mirror/spot/no-PO edge cases → handled inside the reused `MaterialThreadExpanded`; verification → Tasks 5–6.
- **Type consistency:** `threadDisplayName` / `threadVariantCategory` signatures match between `threadTitle.ts`, the test, the row import, and the sheet usage. Props `{ open, thread, onClose }` match between the sheet definition (Task 2) and the page render (Task 3). `HUB_BREAKPOINT_PX` (820) is imported from `tokens.ts`; the row uses the same `HUB_BREAKPOINT_PX - 1` breakpoint.
- **No placeholders:** every code step shows the full content to add or remove.
```
