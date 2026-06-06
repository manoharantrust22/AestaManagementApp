# Material Hub — Material/Date Filters + Row Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the lost "filter by material + filter by date" controls on the Material Hub and add a per-row kebab "Delete this entry & chain" affordance.

**Architecture:** Pure, unit-tested filter helpers in `src/lib/material-hub/threadFilters.ts` drive a new page-level toolbar (`MaterialHubToolbar`) holding an MUI `Autocomplete` + the existing standalone `DateRangePicker`. The hub page extends its `filteredThreads` memo to AND the kind chip, material, and date predicates. A self-contained `ThreadDeleteMenu` reuses the proven `useDeleteMaterialRequestCascade` hook and mounts on each `MaterialThreadRow`.

**Tech Stack:** Next.js 15, React, MUI v7, TanStack Query, dayjs, Vitest. Frontend-only — no migration, no RPC, no type changes.

Spec: [docs/superpowers/specs/2026-06-06-material-hub-filters-and-row-delete-design.md](../specs/2026-06-06-material-hub-filters-and-row-delete-design.md)

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/lib/material-hub/threadFilters.ts` (new) | Pure helpers: `collectMaterialOptions`, `matchesMaterial`, `matchesDateRange`, type `MaterialOption`. |
| `src/lib/material-hub/threadFilters.test.ts` (new) | Vitest unit tests for the three helpers. |
| `src/components/material-hub/MaterialHubToolbar.tsx` (new) | Presentational filter row: material Autocomplete + DateRangePicker + Clear link. |
| `src/components/material-hub/ThreadDeleteMenu.tsx` (new) | Self-contained kebab menu + confirm dialog; cascade delete; self-gates on `canEdit` + `source`. |
| `src/app/(main)/site/materials/hub/page.tsx` (modify) | Filter state, material options, extended `filteredThreads`, render toolbar. |
| `src/components/material-hub/MaterialThreadRow.tsx` (modify) | Mount `<ThreadDeleteMenu>` (desktop near action button; mobile absolute top-right). |

---

## Task 1: Pure filter helpers + tests

**Files:**
- Create: `src/lib/material-hub/threadFilters.ts`
- Test: `src/lib/material-hub/threadFilters.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/lib/material-hub/threadFilters.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  collectMaterialOptions,
  matchesMaterial,
  matchesDateRange,
} from "./threadFilters";

describe("collectMaterialOptions", () => {
  it("dedupes primary + variant materials and sorts by name", () => {
    const opts = collectMaterialOptions([
      { material_id: "m-cement", material_name: "Cement" },
      {
        material_id: "m-tmt16",
        material_name: "TMT Rods 16mm",
        variants: [
          { material_id: "m-tmt16", material_name: "TMT Rods 16mm" },
          { material_id: "m-tmt20", material_name: "TMT Rods 20mm" },
        ],
      },
      { material_id: "m-cement", material_name: "Cement" },
    ]);
    expect(opts).toEqual([
      { material_id: "m-cement", material_name: "Cement" },
      { material_id: "m-tmt16", material_name: "TMT Rods 16mm" },
      { material_id: "m-tmt20", material_name: "TMT Rods 20mm" },
    ]);
  });

  it("returns an empty array for no threads", () => {
    expect(collectMaterialOptions([])).toEqual([]);
  });
});

describe("matchesMaterial", () => {
  const thread = {
    material_id: "m-tmt16",
    material_name: "TMT Rods 16mm",
    variants: [
      { material_id: "m-tmt16", material_name: "TMT Rods 16mm" },
      { material_id: "m-tmt20", material_name: "TMT Rods 20mm" },
    ],
  };

  it("passes everything when no material is selected", () => {
    expect(matchesMaterial(thread, null)).toBe(true);
  });

  it("matches on the primary material_id", () => {
    expect(matchesMaterial(thread, "m-tmt16")).toBe(true);
  });

  it("matches when the material appears as a variant", () => {
    expect(matchesMaterial(thread, "m-tmt20")).toBe(true);
  });

  it("rejects a material that is neither primary nor a variant", () => {
    expect(matchesMaterial(thread, "m-cement")).toBe(false);
  });
});

describe("matchesDateRange", () => {
  const thread = { requested_at: "2025-12-08" };

  it("passes everything when either bound is null", () => {
    expect(matchesDateRange(thread, null, null)).toBe(true);
    expect(matchesDateRange(thread, new Date("2025-12-01"), null)).toBe(true);
  });

  it("matches a request date inside the range (inclusive boundaries)", () => {
    expect(
      matchesDateRange(thread, new Date("2025-12-01"), new Date("2025-12-31"))
    ).toBe(true);
    expect(
      matchesDateRange(thread, new Date("2025-12-08"), new Date("2025-12-08"))
    ).toBe(true);
  });

  it("rejects a request date outside the range", () => {
    expect(
      matchesDateRange(thread, new Date("2026-01-01"), new Date("2026-01-31"))
    ).toBe(false);
  });

  it("rejects a thread with no request date when a range is set", () => {
    expect(
      matchesDateRange({ requested_at: "" }, new Date("2025-12-01"), new Date("2025-12-31"))
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/material-hub/threadFilters.test.ts`
Expected: FAIL — "Failed to resolve import './threadFilters'" / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/material-hub/threadFilters.ts`:

```ts
import dayjs from "dayjs";
import type { MaterialThread } from "./threadTypes";

export interface MaterialOption {
  material_id: string;
  material_name: string;
}

/** Narrow shapes so unit tests can pass minimal objects. */
type MaterialFilterable = Pick<MaterialThread, "material_id" | "material_name"> & {
  variants?: { material_id: string; material_name: string }[];
};
type DateFilterable = Pick<MaterialThread, "requested_at">;

/**
 * Distinct materials present across the given threads — primary material plus
 * every variant — deduped by material_id and sorted by name. Drives the Hub
 * material-filter dropdown, so options always correspond to real rows.
 */
export function collectMaterialOptions(
  threads: MaterialFilterable[]
): MaterialOption[] {
  const byId = new Map<string, string>();
  for (const t of threads) {
    if (t.material_id) byId.set(t.material_id, t.material_name);
    for (const v of t.variants ?? []) {
      if (v.material_id) byId.set(v.material_id, v.material_name);
    }
  }
  return [...byId.entries()]
    .map(([material_id, material_name]) => ({ material_id, material_name }))
    .sort((a, b) => a.material_name.localeCompare(b.material_name));
}

/**
 * True when the thread's primary material OR any of its variants equals the
 * selected material. A null selection passes everything.
 */
export function matchesMaterial(
  t: MaterialFilterable,
  materialId: string | null
): boolean {
  if (!materialId) return true;
  if (t.material_id === materialId) return true;
  return (t.variants ?? []).some((v) => v.material_id === materialId);
}

/**
 * True when the thread's request date falls within [start, end] inclusive
 * (day granularity). A null bound disables the date filter (passes everything).
 * A thread with no requested_at fails a set range.
 */
export function matchesDateRange(
  t: DateFilterable,
  start: Date | null,
  end: Date | null
): boolean {
  if (!start || !end) return true;
  if (!t.requested_at) return false;
  const d = dayjs(t.requested_at).startOf("day").valueOf();
  const s = dayjs(start).startOf("day").valueOf();
  const e = dayjs(end).startOf("day").valueOf();
  return d >= s && d <= e;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/material-hub/threadFilters.test.ts`
Expected: PASS — all 3 describe blocks green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/material-hub/threadFilters.ts src/lib/material-hub/threadFilters.test.ts
git commit -m "feat(material-hub): pure material/date filter helpers + tests"
```

---

## Task 2: MaterialHubToolbar component

**Files:**
- Create: `src/components/material-hub/MaterialHubToolbar.tsx`

No unit test (presentational, matches repo norm — `MaterialHubFilterChips` has none); verified via the manual UI step in Task 6.

- [ ] **Step 1: Create the component**

Create `src/components/material-hub/MaterialHubToolbar.tsx`:

```tsx
"use client";

/**
 * Filter toolbar row for the Material Hub, rendered directly under the kind
 * chips. Holds a single-select material Autocomplete + the standalone compact
 * DateRangePicker (by request date) + a "Clear filters" link. Stateless — the
 * Hub page owns the filter state and AND-combines these with the active chip.
 */

import { Autocomplete, Box, Button, TextField } from "@mui/material";
import DateRangePicker from "@/components/common/DateRangePicker";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialOption } from "@/lib/material-hub/threadFilters";

export interface MaterialHubToolbarProps {
  materialOptions: MaterialOption[];
  selectedMaterialId: string | null;
  onMaterialChange: (id: string | null) => void;
  dateStart: Date | null;
  dateEnd: Date | null;
  onDateChange: (start: Date | null, end: Date | null) => void;
  onClear: () => void;
}

export default function MaterialHubToolbar({
  materialOptions,
  selectedMaterialId,
  onMaterialChange,
  dateStart,
  dateEnd,
  onDateChange,
  onClear,
}: MaterialHubToolbarProps) {
  const selectedOption =
    materialOptions.find((o) => o.material_id === selectedMaterialId) ?? null;
  const hasActiveFilters =
    !!selectedMaterialId || (!!dateStart && !!dateEnd);

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 1,
      }}
    >
      <Autocomplete
        size="small"
        options={materialOptions}
        value={selectedOption}
        onChange={(_, val) => onMaterialChange(val?.material_id ?? null)}
        getOptionLabel={(o) => o.material_name}
        isOptionEqualToValue={(o, v) => o.material_id === v.material_id}
        sx={{ width: 240 }}
        renderInput={(params) => (
          <TextField {...params} placeholder="Filter by material…" />
        )}
      />

      <DateRangePicker
        standalone
        compact
        startDate={dateStart}
        endDate={dateEnd}
        onChange={onDateChange}
      />

      {hasActiveFilters && (
        <Button
          size="small"
          onClick={onClear}
          sx={{
            textTransform: "none",
            color: hubTokens.muted,
            fontSize: 12.5,
            minWidth: 0,
          }}
        >
          Clear filters
        </Button>
      )}
    </Box>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — no errors referencing `MaterialHubToolbar`. (The component is not yet imported; this just confirms it compiles standalone.)

- [ ] **Step 3: Commit**

```bash
git add src/components/material-hub/MaterialHubToolbar.tsx
git commit -m "feat(material-hub): MaterialHubToolbar (material + date filter row)"
```

---

## Task 3: ThreadDeleteMenu component

**Files:**
- Create: `src/components/material-hub/ThreadDeleteMenu.tsx`

Self-gates: renders nothing unless `!is_mirror && hasEditPermission(role) && source === "material_request"`. Mirrors the cascade-delete dialog already proven in `ThreadCorrectionMenu`.

- [ ] **Step 1: Create the component**

Create `src/components/material-hub/ThreadDeleteMenu.tsx`:

```tsx
"use client";

/**
 * Per-row kebab on the Material Hub. Single destructive action:
 * "Delete this entry & chain" → confirm dialog → cascade_delete_material_request
 * via useDeleteMaterialRequestCascade (the exact path the buried
 * ThreadCorrectionMenu "Delete request & entire chain" uses). Self-gated to
 * editable, non-mirror, standard request threads; spot + mirror threads render
 * nothing. All click handlers stopPropagation so the row's inline expand never
 * toggles.
 */

import { useState } from "react";
import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  ListItemIcon,
  ListItemText,
  Menu,
  MenuItem,
  Typography,
} from "@mui/material";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import { useAuth } from "@/contexts/AuthContext";
import { hasEditPermission } from "@/lib/permissions";
import { useDeleteMaterialRequestCascade } from "@/hooks/queries/useMaterialRequests";
import { hubTokens } from "@/lib/material-hub/tokens";
import type { MaterialThread } from "@/lib/material-hub/threadTypes";

export default function ThreadDeleteMenu({ thread }: { thread: MaterialThread }) {
  const { userProfile } = useAuth();
  const canEdit =
    !thread.is_mirror &&
    hasEditPermission(userProfile?.role) &&
    thread.source === "material_request";

  const deleteCascade = useDeleteMaterialRequestCascade();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!canEdit) return null;

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  const handleDelete = async () => {
    setRunning(true);
    setError(null);
    try {
      await deleteCascade.mutateAsync({
        id: thread.source_row_id,
        siteId: thread.site_id,
      });
      setConfirmOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <IconButton
        size="small"
        aria-label="Row actions"
        onClick={(e) => {
          e.stopPropagation();
          setAnchorEl(e.currentTarget);
        }}
        sx={{ color: hubTokens.subtle }}
      >
        <MoreVertIcon sx={{ fontSize: 18 }} />
      </IconButton>

      <Menu
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={() => setAnchorEl(null)}
        onClick={stop}
      >
        <MenuItem
          onClick={(e) => {
            e.stopPropagation();
            setAnchorEl(null);
            setConfirmOpen(true);
          }}
          sx={{ color: "error.main" }}
        >
          <ListItemIcon>
            <DeleteForeverIcon fontSize="small" color="error" />
          </ListItemIcon>
          <ListItemText>Delete this entry & chain</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog
        open={confirmOpen}
        onClose={() => !running && setConfirmOpen(false)}
        onClick={stop}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle sx={{ fontSize: 16, fontWeight: 700 }}>
          Delete this entry and its entire chain?
        </DialogTitle>
        <DialogContent>
          {error && (
            <Alert severity="error" sx={{ mb: 1.5 }}>
              {error}
            </Alert>
          )}
          <Typography sx={{ fontSize: 13.5 }}>
            This permanently removes the request <b>and every record built on
            it</b> — purchase orders, deliveries, stock, batch usage,
            settlements and expenses. Use this only to redo a mistaken entry
            from scratch. This cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)} disabled={running}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDelete}
            disabled={running}
          >
            {running ? "Deleting…" : "Delete entire chain"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: PASS — no errors. Confirms `useAuth().userProfile`, `hasEditPermission`, and `useDeleteMaterialRequestCascade().mutateAsync({ id, siteId })` signatures line up.

- [ ] **Step 3: Commit**

```bash
git add src/components/material-hub/ThreadDeleteMenu.tsx
git commit -m "feat(material-hub): ThreadDeleteMenu kebab — cascade delete a thread"
```

---

## Task 4: Wire filters into the Hub page

**Files:**
- Modify: `src/app/(main)/site/materials/hub/page.tsx`

- [ ] **Step 1: Add imports**

In `src/app/(main)/site/materials/hub/page.tsx`, after the existing
`MaterialHubFilterChips` import (around line 39-41), add:

```tsx
import MaterialHubToolbar from "@/components/material-hub/MaterialHubToolbar";
import {
  collectMaterialOptions,
  matchesMaterial,
  matchesDateRange,
} from "@/lib/material-hub/threadFilters";
```

- [ ] **Step 2: Add filter state**

Immediately after `const [filter, setFilter] = useState<HubFilterKey>("all");`
(line 72), add:

```tsx
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    null
  );
  const [dateStart, setDateStart] = useState<Date | null>(null);
  const [dateEnd, setDateEnd] = useState<Date | null>(null);
```

- [ ] **Step 3: Derive material options + clear handler**

After the `counts`/`debt` memos (around line 170-174), add:

```tsx
  const materialOptions = useMemo(
    () => collectMaterialOptions(threads),
    [threads]
  );

  const clearFilters = () => {
    setSelectedMaterialId(null);
    setDateStart(null);
    setDateEnd(null);
  };
```

- [ ] **Step 4: Extend the filteredThreads memo**

Replace the entire existing `filteredThreads` memo (currently
`src/app/(main)/site/materials/hub/page.tsx:186-197`) with:

```tsx
  const filteredThreads = useMemo(() => {
    let list = threads;
    if (filter === "action") list = list.filter((t) => nextAction(t) != null);
    else if (filter === "own") list = list.filter((t) => t.kind === "own");
    else if (filter === "group") list = list.filter((t) => t.kind === "group");
    else if (filter === "advance") list = list.filter((t) => t.advance);
    else if (filter === "spot")
      list = list.filter((t) => t.purchase_type === "spot");
    else if (filter === "historical")
      list = list.filter((t) => !!t.is_historical);

    list = list.filter((t) => matchesMaterial(t, selectedMaterialId));
    list = list.filter((t) => matchesDateRange(t, dateStart, dateEnd));
    return list;
  }, [threads, filter, selectedMaterialId, dateStart, dateEnd]);
```

- [ ] **Step 5: Render the toolbar under the chips**

Replace the existing chips wrapper block (currently
`src/app/(main)/site/materials/hub/page.tsx:299-305`):

```tsx
      <Box sx={{ mt: 2.5, mb: 1.5 }}>
        <MaterialHubFilterChips
          active={filter}
          onChange={setFilter}
          counts={counts}
        />
      </Box>
```

with:

```tsx
      <Box sx={{ mt: 2.5, mb: 1.5 }}>
        <MaterialHubFilterChips
          active={filter}
          onChange={setFilter}
          counts={counts}
        />
      </Box>

      <Box sx={{ mb: 1.5 }}>
        <MaterialHubToolbar
          materialOptions={materialOptions}
          selectedMaterialId={selectedMaterialId}
          onMaterialChange={setSelectedMaterialId}
          dateStart={dateStart}
          dateEnd={dateEnd}
          onDateChange={(s, e) => {
            setDateStart(s);
            setDateEnd(e);
          }}
          onClear={clearFilters}
        />
      </Box>
```

- [ ] **Step 6: Type-check + run the full test suite**

Run: `npx tsc --noEmit`
Expected: PASS — no errors.

Run: `npx vitest run`
Expected: PASS — existing suite plus the new `threadFilters.test.ts` all green.

- [ ] **Step 7: Commit**

```bash
git add src/app/(main)/site/materials/hub/page.tsx
git commit -m "feat(material-hub): wire material + date filters into the Hub page"
```

---

## Task 5: Mount the delete kebab on each row

**Files:**
- Modify: `src/components/material-hub/MaterialThreadRow.tsx`

- [ ] **Step 1: Add the import**

After the `ThreadActionButton` import (line 28), add:

```tsx
import ThreadDeleteMenu from "./ThreadDeleteMenu";
```

- [ ] **Step 2: Make the card a positioning context (for the mobile kebab)**

In the outermost card `Box` (the one starting at line 82 with
`background: hubTokens.card`), add `position: "relative",` to its `sx` —
place it right after `background: hubTokens.card,`:

```tsx
      sx={{
        background: hubTokens.card,
        position: "relative",
        borderRadius: "12px",
```

- [ ] **Step 3: Add the mobile kebab (absolute top-right)**

As the FIRST child inside that outermost card `Box` (immediately before the
`<Box onClick={onSelect} ...>` inner block at line 94), insert:

```tsx
      {isMobile && (
        <Box sx={{ position: "absolute", top: 6, right: 6, zIndex: 2 }}>
          <ThreadDeleteMenu thread={thread} />
        </Box>
      )}
```

- [ ] **Step 4: Add the desktop kebab (left of the action button)**

Replace the desktop action-button column (currently lines 446-455):

```tsx
        {/* Action button (desktop) */}
        {!isMobile && (
          <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
            <ThreadActionButton
              thread={thread}
              accent={accent}
              onAction={handleAction}
            />
          </Box>
        )}
```

with:

```tsx
        {/* Action button + row kebab (desktop) */}
        {!isMobile && (
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "flex-end",
              gap: "4px",
            }}
          >
            <ThreadDeleteMenu thread={thread} />
            <ThreadActionButton
              thread={thread}
              accent={accent}
              onAction={handleAction}
            />
          </Box>
        )}
```

(`ThreadDeleteMenu` returns `null` for non-editable / spot / mirror threads, so the action button keeps its position when no kebab renders.)

- [ ] **Step 5: Type-check + build**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run build`
Expected: PASS — production build completes with no errors.

- [ ] **Step 6: Commit**

```bash
git add src/components/material-hub/MaterialThreadRow.tsx
git commit -m "feat(material-hub): per-row delete kebab on thread cards (desktop + mobile)"
```

---

## Task 6: Manual verification (per CLAUDE.md "After UI Changes")

**Files:** none (verification only).

- [ ] **Step 1: Ensure the dev server is running**

`npm run dev:cloud` must be running (production Supabase). If a Playwright run
is used, it auto-starts it.

- [ ] **Step 2: Log in + navigate**

Using Playwright MCP: navigate to `http://localhost:3000/dev-login`, wait for
the redirect, then navigate to `http://localhost:3000/site/materials/hub`.

- [ ] **Step 3: Exercise the material filter**

- Open the "Filter by material…" Autocomplete; confirm options are real
  materials from the visible threads, sorted by name.
- Select one; confirm the list narrows to threads of that material (including a
  multi-size thread surfacing under one of its variant sizes).
- Clear it (the `×`); confirm all threads return.

- [ ] **Step 4: Exercise the date filter**

- Open the compact calendar trigger; pick a preset (e.g. "Last 30 days"); confirm
  the list narrows to threads whose "requested …" date is in range.
- Pick "All Time"; confirm the date filter clears.

- [ ] **Step 5: Exercise stacking + clear**

- Apply a kind chip (e.g. Group) + a material + a date range together; confirm
  all three AND-narrow the list.
- Confirm the "Clear filters" link appears and resets material + date (chip
  stays). Confirm the empty-state panel "No threads match this filter." shows
  when a combination yields nothing.

- [ ] **Step 6: Exercise the row kebab**

- On an editable standard (non-spot, non-mirror) thread, confirm the `⋮` kebab
  appears (desktop: left of the action button; mobile width: top-right of the
  card). Confirm spot and "Shared from …" mirror threads have NO kebab.
- Click the kebab → confirm the row does NOT expand. Open "Delete this entry &
  chain" → confirm the confirmation dialog copy lists the cascade.
- Cancel (do not delete during verification unless using a disposable test
  thread). If a disposable thread exists, confirm delete removes it and the Hub
  refreshes without a manual reload.

- [ ] **Step 7: Console check (per CLAUDE.md)**

Read `playwright_console_logs`; confirm no new errors/warnings (hydration,
aria-hidden, missing keys). Re-check at a mobile viewport width. Fix any issue
and re-verify before closing the browser (`playwright_close`).

---

## Self-Review Notes

- **Spec coverage:** F1 material filter → Tasks 1-2,4. F2 date filter → Tasks 1-2,4. F3 row delete → Tasks 3,5. Stacking/clear/empty-state → Task 4 + Task 6 steps. Out-of-scope items untouched (Correct menu, top-bar control, spot/mirror delete enforced by `ThreadDeleteMenu` gating).
- **Type consistency:** `MaterialOption` defined in Task 1, consumed in Tasks 2 & 4. `collectMaterialOptions` / `matchesMaterial` / `matchesDateRange` names identical across tasks. `useDeleteMaterialRequestCascade().mutateAsync({ id, siteId })` matches the existing `ThreadCorrectionMenu` usage. `canEdit = !is_mirror && hasEditPermission(userProfile?.role)` matches `MaterialThreadExpanded:284`, extended with `source === "material_request"`.
- **No placeholders:** every code step is complete; commands have expected output.
- **Counts stay global** (D4): `threadCounts(threads)` and the KPI strip are left untouched; only `filteredThreads` (the rendered list) narrows.
