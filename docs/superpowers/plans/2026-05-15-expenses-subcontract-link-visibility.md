# Expenses — Subcontract Link Visibility & Inline Linking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On All Site Expenses, show subcontract link state per row, let the user filter to only unlinked rows, and allow inline linking of unlinked Miscellaneous expenses.

**Architecture:** Pure additive change to `page.v2.tsx` (a single combined Trade/Subcontract column + Trade-select sentinel `__unlinked__` + URL sync) plus one new `UnlinkedLinkPopper.tsx` component that wraps an existing service-layer function (`updateMiscExpense`). No DB migrations.

**Tech Stack:** Next.js 15 + React + MUI v7 + Supabase + existing `miscExpenseService.updateMiscExpense`.

**Spec:** `docs/superpowers/specs/2026-05-15-expenses-subcontract-link-visibility-design.md`

**Pre-implementation findings (locked in during plan-writing):**
- `misc_expenses.subcontract_id` exists — inline link **is** supported for `source_type === "misc_expense"`.
- `material_purchases` has **no** `subcontract_id` or `contract_id` column — inline link is **NOT** supported for Material/Machinery in v1. Their chip is read-only.
- All other source types (settlement, subcontract_payment, etc.) are also read-only in v1; user must use the overflow-menu Edit action.
- `tradeFilter` is currently *not* URL-synced. This plan adds URL sync as `?trade=<value>`.

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/app/(main)/site/expenses/page.v2.tsx` | Modify | Build `contractToSubcontract` map, render combined Trade/Subcontract cell, extend Trade select + filter logic + URL sync for `__unlinked__`, host popper anchor state |
| `src/components/expenses/UnlinkedLinkPopper.tsx` | Create | Self-contained popper with subcontract autocomplete + Cancel/Link buttons; calls `updateMiscExpense` and reports result to parent |
| `src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx` | Create | Vitest + RTL — Link button disabled until a subcontract is chosen; success path calls `onLinked`; error path renders an Alert |

No type changes (`ExpenseRow.contract_id` is already nullable; `Trade.contracts[].title` already exists).

---

## Task 1: Add `contractToSubcontract` map + extend Trade filter + URL sync

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx`

### Step 1.1: Add the `contractToSubcontract` map

- [ ] **Add a new `useMemo` directly after the existing `contractToTrade` memo (around line 307).**

```tsx
// contract_id → subcontract title map
const contractToSubcontract = useMemo(() => {
  const map = new Map<string, { title: string }>();
  for (const t of siteTrades ?? []) {
    for (const c of t.contracts) map.set(c.id, { title: c.title });
  }
  return map;
}, [siteTrades]);
```

### Step 1.2: Extend the trade filter to support the `__unlinked__` sentinel

- [ ] **Replace the `tradeFilter !== "all"` block in `filteredRows` (around line 334) with:**

```tsx
if (tradeFilter !== "all") {
  if (tradeFilter === "__unlinked__") {
    rows = rows.filter((r) => !r.contract_id);
  } else if (tradeFilter === "__site_wide__") {
    rows = rows.filter((r) => !r.contract_id || !contractToTrade.has(r.contract_id));
  } else {
    rows = rows.filter((r) => {
      if (!r.contract_id) return false;
      return contractToTrade.get(r.contract_id)?.id === tradeFilter;
    });
  }
}
```

### Step 1.3: Initialize `tradeFilter` from the URL

- [ ] **Replace the existing `const [tradeFilter, setTradeFilter] = useState<string>("all");` (line 194) with:**

```tsx
const [tradeFilter, setTradeFilter] = useState<string>(
  () => searchParams.get("trade") ?? "all",
);
```

### Step 1.4: Sync `tradeFilter` back to the URL

- [ ] **In the existing URL-sync `useEffect` (line 205–214), add a `trade` param write and include `tradeFilter` in the dependency array.**

```tsx
useEffect(() => {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (group !== "all") params.set("group", group);
  if (activeTypes.length > 0) params.set("types", activeTypes.join(","));
  if (status !== "all") params.set("status", status);
  if (sitePayerId) params.set("payer", sitePayerId);
  if (tradeFilter !== "all") params.set("trade", tradeFilter);
  const qs = params.toString();
  router.replace(`/site/expenses${qs ? `?${qs}` : ""}`, { scroll: false });
}, [search, group, activeTypes, status, sitePayerId, tradeFilter, router]);
```

### Step 1.5: Add the `Unlinked` option to the Trade Select

- [ ] **Inside the Trade `<Select>` (around line 732), insert a new `<MenuItem value="__unlinked__">Unlinked</MenuItem>` directly after `<MenuItem value="all">All trades</MenuItem>` and before the `siteTrades?.map(...)` loop:**

```tsx
<MenuItem value="all">All trades</MenuItem>
<MenuItem value="__unlinked__">Unlinked</MenuItem>
{siteTrades?.map((t) => (
  <MenuItem key={t.category.id} value={t.category.id}>{t.category.name}</MenuItem>
))}
<MenuItem value="__site_wide__">Site-wide</MenuItem>
```

### Step 1.6: Type-check

- [ ] **Run:** `npx tsc --noEmit --skipLibCheck 2>&1 | grep "page.v2.tsx" || echo "OK"`

  Expected: `OK` (no errors in the file we just changed).

### Step 1.7: Commit

```bash
git add "src/app/(main)/site/expenses/page.v2.tsx"
git commit -m "feat(expenses): add Unlinked filter option + tradeFilter URL sync"
```

---

## Task 2: Replace the Trade column with a combined Trade / Subcontract cell

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx`

### Step 2.1: Update the table header

- [ ] **In the header cells array (around line 844), replace `"Trade"` with `"Trade / Subcontract"`:**

```tsx
{["Date", "Ref", "Vendor / Description", "Trade / Subcontract", "Kind", "Status", "Amount", ""].map((h) => (
```

### Step 2.2: Replace the Trade table cell with the combined cell

- [ ] **Replace the `{/* Trade */}` `<TableCell>` block (lines ~957–967) with this combined cell.** The replacement reads `contractToSubcontract` (introduced in Task 1) and renders an `Unlinked` chip when `contract_id` is null. The chip is non-interactive for now — Task 4 makes it clickable.

```tsx
{/* Trade / Subcontract */}
<TableCell sx={{ py: dense ? 0.5 : 1, maxWidth: 200 }}>
  {tradeInfo ? (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main", flexShrink: 0 }} />
      <Typography variant="caption" noWrap>{tradeInfo.name}</Typography>
    </Box>
  ) : (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "grey.400", flexShrink: 0 }} />
      <Typography variant="caption" color="text.disabled">—</Typography>
    </Box>
  )}
  {!dense && (
    row.contract_id && contractToSubcontract.has(row.contract_id) ? (
      <Typography
        variant="caption"
        color="text.secondary"
        noWrap
        display="block"
        sx={{ fontSize: 11, mt: 0.25, ml: 1.5 }}
      >
        {contractToSubcontract.get(row.contract_id)!.title}
      </Typography>
    ) : (
      <Box sx={{ mt: 0.25, ml: 1.5 }}>
        <Chip
          label="Unlinked"
          size="small"
          color="warning"
          variant="outlined"
          sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
        />
      </Box>
    )
  )}
</TableCell>
```

### Step 2.3: Type-check

- [ ] **Run:** `npx tsc --noEmit --skipLibCheck 2>&1 | grep "page.v2.tsx" || echo "OK"`

  Expected: `OK`.

### Step 2.4: Commit

```bash
git add "src/app/(main)/site/expenses/page.v2.tsx"
git commit -m "feat(expenses): combined Trade/Subcontract column with Unlinked chip"
```

---

## Task 3: Create `UnlinkedLinkPopper` component (TDD)

**Files:**
- Create: `src/components/expenses/UnlinkedLinkPopper.tsx`
- Create: `src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx`

### Step 3.1: Write the failing test

- [ ] **Create `src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx`:**

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { UnlinkedLinkPopper } from "../UnlinkedLinkPopper";
import type { Trade } from "@/types/trade.types";

// Mock the service call
vi.mock("@/lib/services/miscExpenseService", () => ({
  updateMiscExpense: vi.fn(),
}));
import { updateMiscExpense } from "@/lib/services/miscExpenseService";

// Stub the supabase client factory used by the component
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({}),
}));

const SAMPLE_TRADES: Trade[] = [
  {
    category: { id: "cat-civil", name: "Civil", isSystemSeed: true } as any,
    contracts: [
      {
        id: "con-1", siteId: "s1", tradeCategoryId: "cat-civil", title: "Plumbing — Block A",
        laborTrackingMode: "daily" as any, isInHouse: false, contractType: "mesthri",
        status: "active" as any, totalValue: 0, mesthriOrSpecialistName: null, createdAt: "",
      },
    ],
  },
];

describe("UnlinkedLinkPopper", () => {
  beforeEach(() => {
    vi.mocked(updateMiscExpense).mockReset();
  });

  it("disables Link button until a subcontract is chosen", () => {
    render(
      <UnlinkedLinkPopper
        open
        anchorEl={document.body}
        miscExpenseId="me-1"
        siteTrades={SAMPLE_TRADES}
        userId="u1"
        userName="User One"
        onClose={() => {}}
        onLinked={() => {}}
      />,
    );
    const linkBtn = screen.getByRole("button", { name: /^link$/i });
    expect(linkBtn).toBeDisabled();
  });

  it("calls updateMiscExpense and onLinked on success", async () => {
    vi.mocked(updateMiscExpense).mockResolvedValueOnce({ success: true, expenseId: "me-1" } as any);
    const onLinked = vi.fn();
    render(
      <UnlinkedLinkPopper
        open
        anchorEl={document.body}
        miscExpenseId="me-1"
        siteTrades={SAMPLE_TRADES}
        userId="u1"
        userName="User One"
        onClose={() => {}}
        onLinked={onLinked}
      />,
    );

    // Open the autocomplete and pick the only option
    const input = screen.getByRole("combobox");
    fireEvent.mouseDown(input);
    fireEvent.click(await screen.findByText(/Plumbing — Block A/));

    const linkBtn = screen.getByRole("button", { name: /^link$/i });
    expect(linkBtn).not.toBeDisabled();
    fireEvent.click(linkBtn);

    await waitFor(() => {
      expect(updateMiscExpense).toHaveBeenCalledWith(
        expect.anything(),
        "me-1",
        { subcontract_id: "con-1" },
        "u1",
        "User One",
      );
      expect(onLinked).toHaveBeenCalled();
    });
  });

  it("shows an error Alert when the service returns failure", async () => {
    vi.mocked(updateMiscExpense).mockResolvedValueOnce({ success: false, error: "boom" } as any);
    render(
      <UnlinkedLinkPopper
        open
        anchorEl={document.body}
        miscExpenseId="me-1"
        siteTrades={SAMPLE_TRADES}
        userId="u1"
        userName="User One"
        onClose={() => {}}
        onLinked={() => {}}
      />,
    );
    const input = screen.getByRole("combobox");
    fireEvent.mouseDown(input);
    fireEvent.click(await screen.findByText(/Plumbing — Block A/));
    fireEvent.click(screen.getByRole("button", { name: /^link$/i }));

    expect(await screen.findByText(/boom/)).toBeInTheDocument();
  });
});
```

### Step 3.2: Run the test to verify it fails

- [ ] **Run:** `npx vitest run src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx`

  Expected: FAIL — module `../UnlinkedLinkPopper` not found.

### Step 3.3: Create the component to make the tests pass

- [ ] **Create `src/components/expenses/UnlinkedLinkPopper.tsx`:**

```tsx
"use client";

import React, { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  ClickAwayListener,
  Paper,
  Popper,
  TextField,
  Typography,
} from "@mui/material";
import { createClient } from "@/lib/supabase/client";
import { updateMiscExpense } from "@/lib/services/miscExpenseService";
import type { Trade } from "@/types/trade.types";

interface Option {
  id: string;
  title: string;
  tradeName: string;
}

export interface UnlinkedLinkPopperProps {
  open: boolean;
  anchorEl: HTMLElement | null;
  miscExpenseId: string;
  siteTrades: Trade[];
  userId: string;
  userName: string;
  onClose: () => void;
  onLinked: () => void;
}

export function UnlinkedLinkPopper({
  open,
  anchorEl,
  miscExpenseId,
  siteTrades,
  userId,
  userName,
  onClose,
  onLinked,
}: UnlinkedLinkPopperProps) {
  const [selected, setSelected] = useState<Option | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    for (const t of siteTrades) {
      for (const c of t.contracts) {
        out.push({ id: c.id, title: c.title, tradeName: t.category.name });
      }
    }
    return out;
  }, [siteTrades]);

  async function handleLink() {
    if (!selected) return;
    setSubmitting(true);
    setError(null);
    const supabase = createClient();
    const res = await updateMiscExpense(
      supabase,
      miscExpenseId,
      { subcontract_id: selected.id },
      userId,
      userName,
    );
    setSubmitting(false);
    if (res.success) {
      onLinked();
    } else {
      setError(res.error || "Failed to link subcontract");
    }
  }

  return (
    <Popper open={open} anchorEl={anchorEl} placement="bottom-start" sx={{ zIndex: 1400 }}>
      <ClickAwayListener onClickAway={onClose}>
        <Paper elevation={6} sx={{ p: 2, width: 320, borderRadius: 2 }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" textTransform="uppercase" sx={{ letterSpacing: 0.5 }}>
            Link to subcontract
          </Typography>
          <Autocomplete<Option>
            sx={{ mt: 1 }}
            size="small"
            options={options}
            value={selected}
            onChange={(_, v) => setSelected(v)}
            groupBy={(o) => o.tradeName}
            getOptionLabel={(o) => o.title}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            renderInput={(params) => <TextField {...params} placeholder="Choose subcontract…" />}
            slotProps={{ popper: { disablePortal: false } }}
          />
          {error && <Alert severity="error" sx={{ mt: 1 }}>{error}</Alert>}
          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1, mt: 1.5 }}>
            <Button size="small" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button size="small" variant="contained" onClick={handleLink} disabled={!selected || submitting}>
              {submitting ? "Linking…" : "Link"}
            </Button>
          </Box>
        </Paper>
      </ClickAwayListener>
    </Popper>
  );
}
```

### Step 3.4: Run the tests to verify they pass

- [ ] **Run:** `npx vitest run src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx`

  Expected: PASS (3 tests passing).

### Step 3.5: Commit

```bash
git add src/components/expenses/UnlinkedLinkPopper.tsx src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx
git commit -m "feat(expenses): UnlinkedLinkPopper — inline subcontract picker for misc expenses"
```

---

## Task 4: Wire the chip to the popper for Miscellaneous rows

**Files:**
- Modify: `src/app/(main)/site/expenses/page.v2.tsx`

### Step 4.1: Add popper anchor + active-row state

- [ ] **Just below the `tableRef` declaration (around line 202), add:**

```tsx
const [linkAnchor, setLinkAnchor] = useState<{ el: HTMLElement; row: ExpenseRow } | null>(null);
```

### Step 4.2: Import the popper component

- [ ] **Add the import next to the existing expense-component imports near the top of the file:**

```tsx
import { UnlinkedLinkPopper } from "@/components/expenses/UnlinkedLinkPopper";
```

### Step 4.3: Make the Unlinked chip clickable for misc-expense rows; add tooltip for read-only rows

- [ ] **Replace the chip-only block from Task 2 (the `<Chip label="Unlinked" ... />`) with a conditional rendering:**

```tsx
<Box sx={{ mt: 0.25, ml: 1.5 }}>
  {row.source_type === "misc_expense" ? (
    <Chip
      label="Unlinked"
      size="small"
      color="warning"
      variant="outlined"
      onClick={(e) => setLinkAnchor({ el: e.currentTarget, row })}
      sx={{ height: 18, fontSize: 10, cursor: "pointer", "& .MuiChip-label": { px: 0.75 } }}
    />
  ) : (
    <Tooltip title="Use Edit to link">
      <Chip
        label="Unlinked"
        size="small"
        color="warning"
        variant="outlined"
        sx={{ height: 18, fontSize: 10, "& .MuiChip-label": { px: 0.75 } }}
      />
    </Tooltip>
  )}
</Box>
```

Make sure `Tooltip` is in the MUI import list at the top of the file — add it if missing.

### Step 4.4: Render the popper near the other portal-style components

- [ ] **Find the end of the main JSX (just before the closing fragment / outermost wrapper close, after the InspectPane/RentalExpenseInspectPane components are rendered). Add:**

```tsx
{linkAnchor && (
  <UnlinkedLinkPopper
    open
    anchorEl={linkAnchor.el}
    miscExpenseId={linkAnchor.row.source_id}
    siteTrades={siteTrades ?? []}
    userId={userProfile?.id || ""}
    userName={userProfile?.name || ""}
    onClose={() => setLinkAnchor(null)}
    onLinked={async () => {
      setLinkAnchor(null);
      await refetch();
    }}
  />
)}
```

### Step 4.5: Type-check

- [ ] **Run:** `npx tsc --noEmit --skipLibCheck 2>&1 | grep -E "(page.v2.tsx|UnlinkedLinkPopper)" || echo "OK"`

  Expected: `OK`.

### Step 4.6: Re-run the popper tests to confirm nothing regressed

- [ ] **Run:** `npx vitest run src/components/expenses/__tests__/UnlinkedLinkPopper.test.tsx`

  Expected: PASS (3 tests).

### Step 4.7: Commit

```bash
git add "src/app/(main)/site/expenses/page.v2.tsx"
git commit -m "feat(expenses): clickable Unlinked chip opens link popper for misc expenses"
```

---

## Task 5: Production build verification

**Files:** none

### Step 5.1: Run the production build

- [ ] **Run:** `npm run build`

  Expected: build succeeds. New errors (if any) from these changes show up under `src/app/(main)/site/expenses/page.v2.tsx` or `src/components/expenses/UnlinkedLinkPopper.tsx`. Pre-existing errors in test files (`ScopePill.test.tsx`, `InventoryCardGrid.test.tsx`, `BrandVariantMatrix.test.tsx`) are unrelated and can be ignored.

### Step 5.2: (Optional) Visual verification

- [ ] **Manual check by the user** at `http://localhost:3000/site/expenses` (FF already enabled in `.env.local`). Verify:
  - New column header reads **Trade / Subcontract**.
  - Rows with a `contract_id` show a subcontract title under the trade name.
  - Rows without a `contract_id` show an orange **Unlinked** chip.
  - The Trade filter has a new **Unlinked** option; selecting it filters to only unlinked rows; the URL gets `?trade=__unlinked__`.
  - Reloading with `?trade=__unlinked__` restores the filter.
  - For a Miscellaneous unlinked row: clicking the **Unlinked** chip opens a popper, picking a subcontract and clicking **Link** updates the row.
  - For a non-Miscellaneous unlinked row (e.g. a salary row): hovering the chip shows the tooltip *"Use Edit to link"* and clicking does nothing.

### Step 5.3: Final commit (if anything was touched during verification)

- [ ] Skip if no changes; otherwise commit fixes individually with descriptive messages.

---

## Notes for the implementer

- The `source_type === "misc_expense"` check is the **only** gate for inline linking. Do NOT widen this in v1, even if other tables look similar — `material_purchases` was specifically confirmed to lack `subcontract_id`.
- `linkAnchor.row.source_id` (not `linkAnchor.row.id`) is what gets passed to `updateMiscExpense`, because the unified `id` from `v_all_expenses` is **not** the primary key of `misc_expenses`.
- The `slotProps={{ popper: { disablePortal: false } }}` line on the autocomplete is required (project rule from CLAUDE.md — Autocomplete inside floating UI needs portal rendering to avoid aria-hidden focus warnings).
- The popper uses `ClickAwayListener` so clicking outside closes it. If the autocomplete dropdown is also a portal, that's fine — `ClickAwayListener` ignores clicks inside Popper-rendered children of the same React tree.

---

## Self-Review (already run during plan-writing — fixed inline)

- Spec coverage: ✓ each of the three design sections maps to Task 1+2, Task 3+4. Read-only-chip case (non-misc rows) is Task 4.3.
- Placeholder scan: no TBDs.
- Type consistency: `miscExpenseId`, `source_id`, `subcontract_id` are consistent across the popper, the service call, and the wiring.
- Scope: one plan, one feature, one PR's worth of work.
