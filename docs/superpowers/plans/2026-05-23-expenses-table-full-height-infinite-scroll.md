# All Site Expenses — Full-Height Table, Infinite Scroll, Date Sort & Ref-Click Routing Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix four UX problems on `/site/expenses` (V2): the bottom gap, the 200-row first-load, the missing date sort, and the ref-click handler that opens the wrong detail pane for material/rental/unknown ref prefixes.

**Architecture:** All changes are client-side in the V2 expenses page and its data hook, plus one small addition to the material-settlements page (read `?highlight=<ref>` and auto-open its existing inspect drawer). No DB / migration / type-regen changes. The ref-click logic is extracted to a pure helper so it's unit-testable.

**Tech Stack:** Next.js 15 App Router, MUI v7, React Query, TypeScript, Vitest + React Testing Library.

**Spec:** [docs/superpowers/specs/2026-05-23-expenses-table-full-height-infinite-scroll-design.md](docs/superpowers/specs/2026-05-23-expenses-table-full-height-infinite-scroll-design.md)

---

## Files touched

- **Modify** [src/hooks/queries/useExpensesData.ts](src/hooks/queries/useExpensesData.ts) — lower limits, add `sortDir` arg
- **Create** `src/app/(main)/site/expenses/refActions.ts` — pure routing helper
- **Create** `src/app/(main)/site/expenses/refActions.test.ts` — unit tests for the helper
- **Modify** [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx) — layout, infinite scroll, sort header, footer totals, wire helper, snackbar
- **Modify** [src/app/(main)/site/material-settlements/page.tsx](src/app/(main)/site/material-settlements/page.tsx) — read `?highlight=<ref>`, auto-open drawer

---

## Task 1: Data hook — lower limits + add `sortDir` param

**Files:**
- Modify: [src/hooks/queries/useExpensesData.ts](src/hooks/queries/useExpensesData.ts)

- [ ] **Step 1: Lower the page-size constants**

Open `src/hooks/queries/useExpensesData.ts`. Find lines 107–109:

```ts
const INITIAL_RESULT_LIMIT = 200;
export const MAX_RESULT_LIMIT = 2000;
export const LOAD_MORE_STEP = 200;
```

Replace with:

```ts
const INITIAL_RESULT_LIMIT = 50;
export const MAX_RESULT_LIMIT = 2000;
export const LOAD_MORE_STEP = 50;
```

- [ ] **Step 2: Add `sortDir` to the `Args` interface**

Find the `interface Args` block (around lines 111–126). Add the field:

```ts
interface Args {
  siteId: string | null | undefined;
  dateFrom: string | null;
  dateTo: string | null;
  isAllTime: boolean;
  group: ExpenseGroup;
  expenseTypes: string[] | null;
  status: ExpenseStatus;
  sitePayerId: string | null;
  /**
   * Sort direction for the `date` column. Defaults to descending (newest
   * first), which preserves the previous query behaviour.
   */
  sortDir: "desc" | "asc";
}
```

- [ ] **Step 3: Destructure `sortDir` and use it in `.order()`**

In `useExpensesData`, find the destructure (around line 136):

```ts
const { siteId, dateFrom, dateTo, isAllTime, group, expenseTypes, status, sitePayerId } = args;
```

Replace with:

```ts
const { siteId, dateFrom, dateTo, isAllTime, group, expenseTypes, status, sitePayerId, sortDir } = args;
```

Find the `.order("date", { ascending: false })` call inside `fetch` (around line 163) and change it to:

```ts
.order("date", { ascending: sortDir === "asc" });
```

- [ ] **Step 4: Add `sortDir` to the limit-reset effect deps and the fetch callback deps**

Find the effect that resets `loadedLimit` (around lines 145–147):

```ts
useEffect(() => {
  setLoadedLimit(INITIAL_RESULT_LIMIT);
}, [siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId]);
```

Add `sortDir`:

```ts
useEffect(() => {
  setLoadedLimit(INITIAL_RESULT_LIMIT);
}, [siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId, sortDir]);
```

Find the `useCallback` deps for `fetch` (around line 253):

```ts
}, [supabase, siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId, loadedLimit]);
```

Add `sortDir`:

```ts
}, [supabase, siteId, dateFrom, dateTo, isAllTime, group, expenseTypesKey, status, sitePayerId, sortDir, loadedLimit]);
```

- [ ] **Step 5: Run typecheck to confirm the only break is the caller**

Run: `npm run lint`
Expected: ESLint passes (it doesn't typecheck deeply). Then:

Run: `npx tsc --noEmit`
Expected: ONE error pointing to `src/app/(main)/site/expenses/page.v2.tsx` — `Property 'sortDir' is missing in type ...`. (Caller is updated in Task 5.)

- [ ] **Step 6: Commit**

```bash
git add src/hooks/queries/useExpensesData.ts
git commit -m "feat(expenses): lower page size to 50 + add sortDir arg to useExpensesData"
```

---

## Task 2: Extract `resolveRefAction` pure helper (TDD)

**Files:**
- Create: `src/app/(main)/site/expenses/refActions.ts`
- Create: `src/app/(main)/site/expenses/refActions.test.ts`

This task isolates the ref-click routing logic into a pure function with a discriminated-union return type so it can be unit-tested. The impure caller (Task 5) executes the returned action.

- [ ] **Step 1: Write the failing test file**

Create `src/app/(main)/site/expenses/refActions.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { resolveRefAction } from "./refActions";
import type { ExpenseRow } from "@/hooks/queries/useExpensesData";

function baseRow(over: Partial<ExpenseRow>): ExpenseRow {
  return {
    id: "row-1",
    site_id: "site-1",
    date: "2026-03-11",
    recorded_date: "2026-03-11",
    amount: 100,
    description: null,
    category_id: null,
    category_name: null,
    module: "general",
    expense_type: "Material",
    is_cleared: true,
    cleared_date: null,
    contract_id: null,
    subcontract_title: null,
    site_payer_id: null,
    payer_name: null,
    payment_mode: "cash",
    vendor_name: null,
    receipt_url: null,
    paid_by: null,
    entered_by: null,
    entered_by_user_id: null,
    settlement_reference: null,
    settlement_group_id: null,
    engineer_transaction_id: null,
    source_type: "expense",
    source_id: "src-1",
    created_at: "2026-03-11T10:00:00Z",
    is_deleted: false,
    ...over,
  };
}

describe("resolveRefAction", () => {
  it("returns 'unknown' when ref is missing", () => {
    const action = resolveRefAction(baseRow({ settlement_reference: null }));
    expect(action.kind).toBe("unknown");
  });

  it("routes material_purchase to the material-settlements highlight URL", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "material_purchase",
        settlement_reference: "SELF-260311-85A2",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/material-settlements?highlight=SELF-260311-85A2",
    });
  });

  it("routes SELF- prefix to material-settlements even when source_type is missing", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "expense",
        settlement_reference: "SELF-260311-85A2",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/material-settlements?highlight=SELF-260311-85A2",
    });
  });

  it("routes rental_settlement to the rental-pane action with source_id", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "rental_settlement",
        source_id: "order-42",
        settlement_reference: "RSET-260112-001",
      }),
    );
    expect(action).toEqual({ kind: "rental-pane", orderId: "order-42" });
  });

  it("routes misc_expense to the miscellaneous page", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "misc_expense",
        settlement_reference: "MISC-260112-003",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/expenses/miscellaneous?highlight=MISC-260112-003",
    });
  });

  it("routes tea_shop_settlement to the tea-shop page", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "tea_shop_settlement",
        settlement_reference: "TSS-260311-NY9",
      }),
    );
    expect(action).toEqual({
      kind: "navigate",
      url: "/site/tea-shop?highlight=TSS-260311-NY9",
    });
  });

  it("routes subcontract_payment to the subcontracts page", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "subcontract_payment",
        settlement_reference: "SCP-260311-001",
      }),
    );
    expect(action).toEqual({ kind: "navigate", url: "/site/subcontracts" });
  });

  it("routes salary settlement DLY- to the daily-pane action", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "DLY-260313-005",
        date: "2026-03-13",
      }),
    );
    expect(action).toEqual({
      kind: "daily-pane",
      date: "2026-03-13",
      ref: "DLY-260313-005",
    });
  });

  it("routes salary settlement SET- to the daily-pane action", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "SET-260313-005",
        date: "2026-03-13",
      }),
    );
    expect(action.kind).toBe("daily-pane");
  });

  it("routes WS- with full context to the weekly-pane action", () => {
    const row = baseRow({
      source_type: "settlement",
      settlement_reference: "WS-260313-001",
    });
    (row as any).contract_laborer_id = "lab-1";
    (row as any).week_start = "2026-03-09";
    (row as any).week_end = "2026-03-15";

    const action = resolveRefAction(row);
    expect(action).toEqual({
      kind: "weekly-pane",
      laborerId: "lab-1",
      weekStart: "2026-03-09",
      weekEnd: "2026-03-15",
      ref: "WS-260313-001",
    });
  });

  it("falls back to weekly-fallback-nav when WS- row lacks laborer/week fields", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "settlement",
        settlement_reference: "WS-260313-001",
      }),
    );
    expect(action).toEqual({
      kind: "weekly-fallback-nav",
      url: "/site/payments?tab=contract&highlight=WS-260313-001",
    });
  });

  it("routes a regular manual-entry expense to edit-dialog", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "expense",
        settlement_reference: "EXP-XYZ",
      }),
    );
    expect(action).toEqual({ kind: "edit-dialog" });
  });

  it("returns 'unknown' for an unrecognized ref+source_type combination", () => {
    const action = resolveRefAction(
      baseRow({
        source_type: "expense",
        settlement_reference: "WEIRD-PREFIX-001",
      }),
    );
    expect(action.kind).toBe("edit-dialog");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails (no module)**

Run: `npx vitest run src/app/(main)/site/expenses/refActions.test.ts`
Expected: FAIL — "Cannot find module './refActions'".

- [ ] **Step 3: Write the helper**

Create `src/app/(main)/site/expenses/refActions.ts`:

```ts
import type { ExpenseRow } from "@/hooks/queries/useExpensesData";

export type RefAction =
  | { kind: "navigate"; url: string }
  | { kind: "rental-pane"; orderId: string }
  | { kind: "daily-pane"; date: string; ref: string }
  | {
      kind: "weekly-pane";
      laborerId: string;
      weekStart: string;
      weekEnd: string;
      ref: string;
    }
  | { kind: "weekly-fallback-nav"; url: string }
  | { kind: "edit-dialog" }
  | { kind: "unknown" };

function matRefUrl(ref: string): string {
  return `/site/material-settlements?highlight=${encodeURIComponent(ref)}`;
}
function miscUrl(ref: string): string {
  return `/site/expenses/miscellaneous?highlight=${encodeURIComponent(ref)}`;
}
function teaShopUrl(ref: string): string {
  return `/site/tea-shop?highlight=${encodeURIComponent(ref)}`;
}
function weeklyFallbackUrl(ref: string): string {
  return `/site/payments?tab=contract&highlight=${encodeURIComponent(ref)}`;
}

function resolveWeekly(row: ExpenseRow, ref: string): RefAction {
  const lid = (row as unknown as { contract_laborer_id?: string }).contract_laborer_id;
  const ws = (row as unknown as { week_start?: string }).week_start;
  const we = (row as unknown as { week_end?: string }).week_end;
  if (lid && ws && we) {
    return { kind: "weekly-pane", laborerId: lid, weekStart: ws, weekEnd: we, ref };
  }
  return { kind: "weekly-fallback-nav", url: weeklyFallbackUrl(ref) };
}

export function resolveRefAction(row: ExpenseRow): RefAction {
  const ref = row.settlement_reference;
  if (!ref) return { kind: "unknown" };

  // Source-type-first routing — authoritative.
  switch (row.source_type) {
    case "material_purchase":
      return { kind: "navigate", url: matRefUrl(ref) };
    case "rental_settlement":
      if (row.source_id) return { kind: "rental-pane", orderId: row.source_id };
      break;
    case "misc_expense":
      return { kind: "navigate", url: miscUrl(ref) };
    case "tea_shop_settlement":
      return { kind: "navigate", url: teaShopUrl(ref) };
    case "subcontract_payment":
      return { kind: "navigate", url: "/site/subcontracts" };
    case "settlement":
      if (ref.startsWith("WS-")) return resolveWeekly(row, ref);
      return { kind: "daily-pane", date: row.date, ref };
    case "expense":
      // Manual entries: open the row's edit dialog (full row context).
      // Prefix backups below catch the case where a manual row's ref still
      // looks like a settlement code (e.g. it was carried over from import).
      break;
  }

  // Prefix-based backup — covers source_type drift or rows the switch didn't
  // resolve (e.g. rental_settlement missing source_id, manual expense rows
  // bearing a settlement-style ref).
  if (ref.startsWith("MISC-")) return { kind: "navigate", url: miscUrl(ref) };
  if (ref.startsWith("TSS-")) return { kind: "navigate", url: teaShopUrl(ref) };
  if (ref.startsWith("SCP-")) return { kind: "navigate", url: "/site/subcontracts" };
  if (ref.startsWith("SELF-")) return { kind: "navigate", url: matRefUrl(ref) };
  if (ref.startsWith("RSET-") && row.source_id) {
    return { kind: "rental-pane", orderId: row.source_id };
  }
  if (ref.startsWith("WS-")) return resolveWeekly(row, ref);
  if (
    ref.startsWith("DLY-") ||
    ref.startsWith("SS-") ||
    ref.startsWith("SET-")
  ) {
    return { kind: "daily-pane", date: row.date, ref };
  }

  // For source_type='expense' rows we already broke out of the switch; route
  // those to the edit dialog so the user sees the full row form.
  if (row.source_type === "expense") return { kind: "edit-dialog" };

  return { kind: "unknown" };
}
```

- [ ] **Step 4: Run the tests to verify all pass**

Run: `npx vitest run src/app/(main)/site/expenses/refActions.test.ts`
Expected: All 13 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/site/expenses/refActions.ts src/app/(main)/site/expenses/refActions.test.ts
git commit -m "feat(expenses): extract resolveRefAction pure helper with source-type-first routing"
```

---

## Task 3: Material settlements page — honour `?highlight=<ref>`

**Files:**
- Modify: [src/app/(main)/site/material-settlements/page.tsx](src/app/(main)/site/material-settlements/page.tsx)

The page already has `inspectItem` / `inspectOpen` state ([page.tsx:122-123](src/app/(main)/site/material-settlements/page.tsx#L122-L123)) and `handleInspect` ([page.tsx:245-248](src/app/(main)/site/material-settlements/page.tsx#L245-L248)). We add a `useSearchParams` read + an effect that auto-opens the drawer for the matching ref once data is loaded.

- [ ] **Step 1: Import `useSearchParams`**

Find the existing import:

```ts
import { useRouter } from "next/navigation";
```

Replace with:

```ts
import { useRouter, useSearchParams } from "next/navigation";
```

- [ ] **Step 2: Wire `useSearchParams` and the highlight effect**

Inside `MaterialSettlementsPage`, find the line:

```ts
const router = useRouter();
```

Just below it, add:

```ts
const router = useRouter();
const searchParams = useSearchParams();
const highlightRef = searchParams.get("highlight");
```

- [ ] **Step 3: Add the auto-open effect**

Locate `allItems` (the `SettlementItem[]` memo around line 149) and the `handleInspect` callback (line 245). Add this effect **after** the `handleInspect` definition:

```ts
// Auto-open the inspect drawer when arriving via ?highlight=<ref>.
// Fires once per highlight value after the items list has data; missing refs
// (cancelled rows, wrong scope) silently no-op so the page still loads.
useEffect(() => {
  if (!highlightRef) return;
  if (isLoading) return;
  if (allItems.length === 0) return;
  const match = allItems.find((item) => {
    // SettlementItem is either a material expense or an advance PO. Only
    // material expenses have settlement_reference today; PO rows don't.
    return (
      (item as { settlement_reference?: string | null }).settlement_reference ===
      highlightRef
    );
  });
  if (match) {
    setInspectItem(match);
    setInspectOpen(true);
  }
  // Clear the param either way so the back button / a manual close doesn't
  // re-trigger this on the next render.
  const params = new URLSearchParams(searchParams.toString());
  params.delete("highlight");
  const qs = params.toString();
  router.replace(`/site/material-settlements${qs ? `?${qs}` : ""}`, {
    scroll: false,
  });
}, [highlightRef, isLoading, allItems, router, searchParams]);
```

- [ ] **Step 4: Typecheck and run the project's tests**

Run: `npx tsc --noEmit`
Expected: Same single error as Task 1 (still the unresolved `sortDir` in page.v2.tsx); no new errors.

Run: `npx vitest run src/app/(main)/site/expenses/refActions.test.ts`
Expected: All tests still PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/(main)/site/material-settlements/page.tsx
git commit -m "feat(material-settlements): auto-open inspect drawer via ?highlight=<ref>"
```

---

## Task 4: Wire `sortDir` state through `page.v2.tsx`

**Files:**
- Modify: [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx)

- [ ] **Step 1: Add the sortDir state**

Locate the filter-state block in `ExpensesPageV2` (around lines 178–194 where `search`, `group`, `activeTypes`, etc. are declared). After the `tradeFilter` line (around line 196–198), add:

```ts
const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");
```

- [ ] **Step 2: Pass `sortDir` to `useExpensesData`**

Find the `useExpensesData(...)` call (around line 287):

```ts
const { expenses, summary, isLoading, loadedLimit, resultLimitHit, canLoadMore, loadMore, refetch } =
  useExpensesData({
    siteId: selectedSite?.id ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    isAllTime,
    group,
    expenseTypes: activeTypes.length > 0 ? activeTypes : null,
    status,
    sitePayerId,
  });
```

Add `sortDir`:

```ts
const { expenses, summary, isLoading, loadedLimit, resultLimitHit, canLoadMore, loadMore, refetch } =
  useExpensesData({
    siteId: selectedSite?.id ?? null,
    dateFrom: dateFrom ?? null,
    dateTo: dateTo ?? null,
    isAllTime,
    group,
    expenseTypes: activeTypes.length > 0 ? activeTypes : null,
    status,
    sitePayerId,
    sortDir,
  });
```

- [ ] **Step 3: Wrap the Date header cell in `TableSortLabel`**

Locate the `<TableHead>` block around line 850–871. The current header cells are rendered from a string array — we need a more explicit header for the Date column. Replace the whole `<TableHead>...</TableHead>` block:

```tsx
<TableHead>
  <TableRow>
    <TableCell
      sortDirection={sortDir}
      sx={{
        fontWeight: 700,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.5,
        color: "text.secondary",
        bgcolor: "background.paper",
        py: dense ? 0.75 : 1,
        whiteSpace: "nowrap",
      }}
    >
      <TableSortLabel
        active
        direction={sortDir}
        onClick={() =>
          setSortDir((d) => (d === "desc" ? "asc" : "desc"))
        }
      >
        Date
      </TableSortLabel>
    </TableCell>
    {["Ref", "Vendor / Description", "Trade / Subcontract", "Kind", "Status", "Amount", ""].map((h) => (
      <TableCell
        key={h}
        align={h === "Amount" ? "right" : "left"}
        sx={{
          fontWeight: 700,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: 0.5,
          color: "text.secondary",
          bgcolor: "background.paper",
          py: dense ? 0.75 : 1,
          whiteSpace: "nowrap",
        }}
      >
        {h}
      </TableCell>
    ))}
  </TableRow>
</TableHead>
```

- [ ] **Step 4: Import `TableSortLabel`**

Find the MUI import block at the top (around lines 4–43). Locate the line:

```ts
  TableHead,
```

Add `TableSortLabel` to the imports — for example, just below `TableHead`:

```ts
  TableHead,
  TableSortLabel,
```

- [ ] **Step 5: Run typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. (Task 1's caller mismatch is now resolved.)

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): sortable Date header (DB-side, applies across all rows)"
```

---

## Task 5: Wire `resolveRefAction` + snackbar into `page.v2.tsx`

**Files:**
- Modify: [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx)

- [ ] **Step 1: Import the helper and `Snackbar`**

Add to the MUI import block:

```ts
  Snackbar,
```

(Place alphabetically near `Skeleton` or `Switch`.)

Below the existing local imports (after the `UnlinkedLinkPopper` import block, around line 95–96), add:

```ts
import { resolveRefAction } from "./refActions";
```

- [ ] **Step 2: Add snackbar state**

In `ExpensesPageV2`, near the other `useState` declarations (around lines 200–205, after `isFullscreen`), add:

```ts
const [refSnackbar, setRefSnackbar] = useState<string | null>(null);
```

- [ ] **Step 3: Replace `handleRefClick` body**

Find the existing `handleRefClick` (around lines 606–627). Replace it entirely with:

```tsx
const handleRefClick = useCallback(
  (row: ExpenseRow) => {
    if (!selectedSite) return;
    const action = resolveRefAction(row);
    switch (action.kind) {
      case "navigate":
        router.push(action.url);
        return;
      case "rental-pane":
        setRentalPaneOrderId(action.orderId);
        return;
      case "daily-pane":
        pane.open({
          kind: "daily-date",
          siteId: selectedSite.id,
          date: action.date,
          settlementRef: action.ref,
        });
        return;
      case "weekly-pane":
        pane.open({
          kind: "weekly-week",
          siteId: selectedSite.id,
          laborerId: action.laborerId,
          weekStart: action.weekStart,
          weekEnd: action.weekEnd,
          settlementRef: action.ref,
        });
        return;
      case "weekly-fallback-nav":
        router.push(action.url);
        return;
      case "edit-dialog":
        handleOpenDialog(row);
        return;
      case "unknown":
        setRefSnackbar(
          "No detail view available for this expense type yet.",
        );
        return;
    }
  },
  [pane, router, selectedSite],
);
```

Note: `handleOpenDialog` is declared **above** `handleRefClick` in the file (around line 454, well before 606). It's a plain function (not `useCallback`), so ESLint's `react-hooks/exhaustive-deps` rule won't flag it. The closure capture is safe. If ESLint does complain on your branch:

```ts
}, [pane, router, selectedSite, handleOpenDialog]);
```

- [ ] **Step 4: Render the snackbar**

Locate the very end of the JSX `return` in `ExpensesPageV2` (around line 1473). The order today is: `<RentalExpenseInspectPane />`, then the `{linkAnchor && (<UnlinkedLinkPopper ... />)}` conditional, then the final `</Box>`. Add the snackbar **after the `{linkAnchor && ...}` block, just before the closing `</Box>`**:

```tsx
<Snackbar
  open={refSnackbar !== null}
  autoHideDuration={4000}
  onClose={() => setRefSnackbar(null)}
  message={refSnackbar}
  anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
/>
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "fix(expenses): route ref clicks by source_type — material/rental/expense get correct pane"
```

---

## Task 6: Layout — single-scroll + sticky toolbar

**Files:**
- Modify: [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx)

- [ ] **Step 1: Remove the inner table scroll**

Find the `<TableContainer>` opening (around line 849):

```tsx
<TableContainer sx={{ maxHeight: "calc(100vh - 420px)", minHeight: 200 }}>
```

Replace with:

```tsx
<TableContainer sx={{ overflow: "visible" }}>
```

(`overflow: visible` ensures sticky elements pinned to the outer scroll container behave correctly — `TableContainer`'s default `overflow: auto` would otherwise create a new scrolling block.)

- [ ] **Step 2: Make Toolbar row 1 sticky**

Find the first toolbar `<Box>` (the one starting around line 685 with `display: "flex", flexWrap: "wrap"`). Add `position: "sticky", top: 0, zIndex: 3, bgcolor: "background.paper"` to its `sx`:

```tsx
<Box
  sx={{
    display: "flex",
    flexWrap: "wrap",
    gap: 1,
    p: 1.5,
    borderBottom: 1,
    borderColor: "divider",
    alignItems: "center",
    position: "sticky",
    top: 0,
    zIndex: 3,
    bgcolor: "background.paper",
  }}
>
```

- [ ] **Step 3: Make Toolbar row 2 sticky underneath row 1**

Find the second toolbar `<Box>` (the count/groupBy row, around line 783). Add sticky props with a top offset equal to row-1 height. Row 1 uses `p: 1.5` (12px top + 12px bottom = 24px) plus a single-line content height (~32px) → ~56px on desktop. On wrap (mobile / narrow), it gets taller — using `position: "sticky"; top: 56` is good enough on desktop; we accept that on narrow widths row 2 may overlap row 1 slightly when row 1 wraps. (Out of scope to compute dynamically.)

Update its `sx`:

```tsx
<Box
  sx={{
    display: "flex",
    alignItems: "center",
    gap: 1,
    px: 1.5,
    py: 0.75,
    borderBottom: 1,
    borderColor: "divider",
    bgcolor: "action.hover",
    position: "sticky",
    top: 56,
    zIndex: 2,
  }}
>
```

- [ ] **Step 4: Push the TableHead sticky offset below the toolbars**

Find the `<TableHead>` block (the one you edited in Task 4, lines around 851). The header cells use `bgcolor: "background.paper"` but `<TableHead stickyHeader>` (via the `<Table stickyHeader>` prop on parent) defaults to `top: 0`. With our new sticky toolbars above, we need to push the head down.

In the Date `<TableCell>` and the loop'd `<TableCell key={h}>`, change `bgcolor: "background.paper"` to include explicit sticky positioning:

For the Date cell sx, add:

```ts
position: "sticky",
top: 88,
zIndex: 1,
```

For the loop'd cells in `.map`, add the same three properties to their sx.

Result for the Date cell:
```tsx
<TableCell
  sortDirection={sortDir}
  sx={{
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "text.secondary",
    bgcolor: "background.paper",
    py: dense ? 0.75 : 1,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 88,
    zIndex: 1,
  }}
>
```

And the loop'd cell:
```tsx
<TableCell
  key={h}
  align={h === "Amount" ? "right" : "left"}
  sx={{
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    color: "text.secondary",
    bgcolor: "background.paper",
    py: dense ? 0.75 : 1,
    whiteSpace: "nowrap",
    position: "sticky",
    top: 88,
    zIndex: 1,
  }}
>
```

- [ ] **Step 5: Make the Paper card stretch to fill remaining height**

Find the table's `<Paper>` (the one wrapping the toolbars + table, around line 683):

```tsx
<Paper ref={tableRef} variant="outlined" sx={{ borderRadius: 2, overflow: "hidden", mb: 4 }}>
```

Replace with:

```tsx
<Paper
  ref={tableRef}
  variant="outlined"
  sx={{
    borderRadius: 2,
    overflow: "hidden",
    mb: 4,
    display: "flex",
    flexDirection: "column",
    // Grow to fill remaining viewport when nothing else is below it
    minHeight: "calc(100vh - 220px)",
  }}
>
```

(`220px` ≈ PageHeader + padding; gives a comfortable initial viewport on desktop without computing it dynamically.)

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): single-scroll layout with sticky toolbar + grow-to-fit table"
```

---

## Task 7: Sticky footer with scope-derived totals

**Files:**
- Modify: [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx)

This task does two things at once because they touch the same JSX block: convert the `<TableFooter>` into a sticky-bottom `<Box>` outside the `<Table>`, and switch totals to use `summary.breakdown`.

- [ ] **Step 1: Add scope-derived totals memo**

Find the `laborTotal` / `buildingTotal` / `filteredTotal` memos (around lines 361–369):

```ts
const laborTotal = useMemo(
  () => filteredRows.filter((r) => LABOR_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
  [filteredRows],
);
const buildingTotal = useMemo(
  () => filteredRows.filter((r) => BUILDING_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
  [filteredRows],
);
const filteredTotal = laborTotal + buildingTotal;
```

Replace with:

```ts
// Loaded-slice totals — accurate only when no DB pagination is in effect AND
// client filters narrow what we display. Used as the "Filtered" line when
// search/trade/sub-kind is active.
const filteredLaborTotal = useMemo(
  () => filteredRows.filter((r) => LABOR_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
  [filteredRows],
);
const filteredBuildingTotal = useMemo(
  () => filteredRows.filter((r) => BUILDING_SET.has(r.expense_type)).reduce((s, r) => s + r.amount, 0),
  [filteredRows],
);
const filteredTotal = filteredLaborTotal + filteredBuildingTotal;

// Scope-wide totals derived from the get_expense_summary RPC's per-type
// breakdown. These are correct regardless of how many rows are currently
// loaded into the table. Used as the primary "Total" line.
const scopeLaborTotal = useMemo(() => {
  const b = summary?.breakdown ?? {};
  return LABOR_TYPES.reduce((s, t) => s + (b[t]?.amount ?? 0), 0);
}, [summary]);
const scopeBuildingTotal = useMemo(() => {
  const b = summary?.breakdown ?? {};
  return BUILDING_TYPES.reduce((s, t) => s + (b[t]?.amount ?? 0), 0);
}, [summary]);
const scopeTotal = summary?.total ?? scopeLaborTotal + scopeBuildingTotal;

// "Client-side filter is active" = the filters that don't go to the DB.
// `group`, `status`, `sitePayerId`, `activeTypes` go to the DB so `summary`
// already excludes them (NB: actually summary is scope-wide today; see spec
// §4). The footer reads as "scope total" matching the KPI cards.
const hasClientFilter =
  search.trim() !== "" || tradeFilter !== "all" || subKindFilter !== "all";
```

- [ ] **Step 2: Replace the `<TableFooter>` block**

Find the entire `<TableFooter>...</TableFooter>` block (around lines 1085–1115). Replace with `null` (so the Table renders no footer) AND add a sticky `<Box>` after the closing `</Table>` tag.

Locate the `</TableContainer>` (around line 1117). Find the lines just before it:

```tsx
          </TableFooter>
        </Table>
      </TableContainer>
    </Paper>
```

Replace with:

```tsx
        </Table>
      </TableContainer>

      {/* Sticky totals bar — pinned to viewport bottom, stays in view as the
          user scrolls through rows. Two-line format when a client-side
          filter is active (search/trade/sub-kind), single-line otherwise. */}
      <Box
        sx={{
          position: "sticky",
          bottom: 0,
          zIndex: 4,
          bgcolor: "background.paper",
          borderTop: 2,
          borderColor: "divider",
          px: 1.5,
          py: 1,
          display: "flex",
          alignItems: "center",
          gap: 2,
        }}
      >
        <Box sx={{ display: "flex", gap: 2, alignItems: "center", flex: 1 }}>
          <Typography variant="caption" color="text.secondary">
            Labor{" "}
            <Box component="span" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCompact(scopeLaborTotal)}
            </Box>
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Building{" "}
            <Box component="span" fontWeight={700} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
              {formatCompact(scopeBuildingTotal)}
            </Box>
          </Typography>
        </Box>

        <Box sx={{ textAlign: "right" }}>
          {hasClientFilter && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", lineHeight: 1.2 }}>
              Filtered (loaded):{" "}
              <Box component="span" fontWeight={600} color="text.primary" sx={{ fontVariantNumeric: "tabular-nums" }}>
                {formatINR(filteredTotal)}
              </Box>{" "}
              · {filteredRows.length} rows
            </Typography>
          )}
          <Typography variant="caption" color="text.secondary" textTransform="uppercase" letterSpacing={0.5}>
            Total
          </Typography>
          <Typography variant="subtitle1" fontWeight={700} sx={{ fontVariantNumeric: "tabular-nums", letterSpacing: -0.2, lineHeight: 1.2 }}>
            {formatINR(scopeTotal)}
          </Typography>
        </Box>
      </Box>
    </Paper>
```

- [ ] **Step 3: Remove the now-unused `TableFooter` import**

The MUI import block (top of file, around lines 30–34) has:

```ts
  TableFooter,
```

Delete that line.

- [ ] **Step 4: Remove the now-unused `hasFilter` reference** (only if it was solely used by the old footer; otherwise leave it)

Search the file for `hasFilter` — it's still used in the toolbar's "Clear filters" button and the inline "Filtered total" / "Total" caption label removed in this task. The "Clear filters" usage remains. No action needed; just verify with grep.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. If "TableFooter is declared but never used" — make sure it's removed from the import.

- [ ] **Step 6: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "fix(expenses): footer totals scope-wide + sticky-bottom layout"
```

---

## Task 8: Infinite scroll via IntersectionObserver

**Files:**
- Modify: [src/app/(main)/site/expenses/page.v2.tsx](src/app/(main)/site/expenses/page.v2.tsx)

- [ ] **Step 1: Add a sentinel ref and observer effect**

Near the existing `tableRef`/`linkAnchor` state (around lines 206–207), add:

```ts
const sentinelRef = useRef<HTMLTableRowElement | null>(null);
```

- [ ] **Step 2: Wire up the observer**

After the data-hook call block (after the `useExpensesData(...)` destructure around line 296), add:

```ts
// Auto-load more rows when the sentinel near the bottom of the table comes
// into view. The `!isLoading` guard ensures only one fetch is in flight at a
// time; the limit-reset effect inside the data hook resets when scope/sort
// changes, so this fires fresh on each new context.
useEffect(() => {
  const target = sentinelRef.current;
  if (!target) return;
  if (!canLoadMore) return;
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && canLoadMore && !isLoading) {
        loadMore();
      }
    },
    { rootMargin: "200px" }, // start fetching a little before user reaches the bottom
  );
  observer.observe(target);
  return () => observer.disconnect();
}, [canLoadMore, isLoading, loadMore, expenses.length]);
```

(`expenses.length` in deps so the observer rebinds after each load — the sentinel's position in the DOM moves down as new rows append.)

- [ ] **Step 3: Replace the "Load more" Alert with an inline tail row**

Find the `{resultLimitHit && (` Alert block (around lines 831–846) inside the `<Paper>`. Remove it entirely — the inline tail row in the next step replaces it for the common case. We keep a separate MAX-ceiling Alert below for the safety case.

After removing the Alert, the code immediately above `<TableContainer>` should go straight from the toolbar `</Box>` to `<TableContainer>`.

- [ ] **Step 4: Add the sentinel + tail row to the `<TableBody>`**

The existing `<TableBody>` contains a single ternary expression (skeleton / empty-state / `tableItems.map`). We need the sentinel and tail rows to render as **siblings** to that expression, regardless of which branch fired. Locate the closing `)}` of the ternary (around line 1081) — it sits just before `</TableBody>`. The current structure is:

```tsx
<TableBody>
  {isLoading && filteredRows.length === 0 ? (
    /* skeletons */
  ) : tableItems.length === 0 ? (
    /* empty state */
  ) : (
    tableItems.map((item, idx) => { ... })
  )}
</TableBody>
```

Insert two more JSX children inside `<TableBody>`, immediately after the closing `)}` of the ternary and before `</TableBody>`:

```tsx
<TableBody>
  {isLoading && filteredRows.length === 0 ? (
    /* skeletons - unchanged */
  ) : tableItems.length === 0 ? (
    /* empty state - unchanged */
  ) : (
    tableItems.map((item, idx) => { ... })
  )}

  {/* Sentinel: when this row scrolls into view, auto-load the next page */}
  {canLoadMore && !isLoading && expenses.length > 0 && (
    <TableRow ref={sentinelRef} sx={{ height: 1 }}>
      <TableCell colSpan={8} sx={{ p: 0, border: 0 }} />
    </TableRow>
  )}

  {/* Tail status row: loading spinner or end-of-results message */}
  {expenses.length > 0 && (isLoading || !canLoadMore) && (
    <TableRow>
      <TableCell colSpan={8} align="center" sx={{ py: 1.5, color: "text.disabled", fontSize: 12 }}>
        {isLoading
          ? "Loading more…"
          : `End of results · ${expenses.length} of ${summary?.totalCount ?? expenses.length} loaded`}
      </TableCell>
    </TableRow>
  )}
</TableBody>
```

Two JSX expressions inside `<TableBody>` is valid React — they render as separate sibling rows.

- [ ] **Step 5: Re-add a single MAX_RESULT_LIMIT safety Alert above the table**

After the toolbar `</Box>` row 2 and before the `<TableContainer>`, add (this fires only when the user has burned through the entire 2000-row cap):

```tsx
{!canLoadMore && expenses.length >= MAX_RESULT_LIMIT && (
  <Alert severity="warning" variant="outlined" sx={{ mx: 1.5, mt: 1 }}>
    Loaded the maximum {MAX_RESULT_LIMIT.toLocaleString("en-IN")} rows for
    this view. Narrow the date range to see older entries.
  </Alert>
)}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors. If TypeScript complains that `TableRow` ref type doesn't accept `HTMLTableRowElement`, cast it: `useRef<HTMLTableRowElement | null>(null)` — already specified above, but if MUI's component types are stricter you may need `useRef<HTMLDivElement | null>(null)` and use a `<Box>` sentinel instead of `<TableRow>`. If issue, swap to a `<Box>` wrapped in a `<TableRow>` with a `ref` on a child `<TableCell>` instead.

- [ ] **Step 7: Commit**

```bash
git add src/app/(main)/site/expenses/page.v2.tsx
git commit -m "feat(expenses): auto-load on scroll via IntersectionObserver sentinel"
```

---

## Task 9: Manual + Playwright verification

**Files:**
- No edits — verification only.

- [ ] **Step 1: Start dev server**

Run: `npm run dev:cloud`

Wait for "Ready in Xms" output. Default URL: http://localhost:3000

- [ ] **Step 2: Auto-login + navigate**

Using Playwright MCP, navigate to: `http://localhost:3000/dev-login`

Wait for redirect away from `/dev-login` (login complete).

Navigate to: `http://localhost:3000/site/expenses`

Make sure the Srinivasan site is selected in the site picker.

- [ ] **Step 3: Verify visual layout**

Take a screenshot. Confirm:
- Only ~50 rows render initially (count via the "X records" toolbar text, or count visible rows).
- KPI cards, Money breakdown, Trade cards visible at top.
- Scrolling the page hides KPIs but the **toolbar stays sticky** under the page header.
- Below the bottom of the rows, the totals bar is pinned to viewport bottom.
- No gap between the last row and the totals bar.

If the layout is off (e.g. table doesn't grow to fill), capture the screenshot and check the Paper's `minHeight` — adjust the `220px` offset in Task 6 Step 5.

- [ ] **Step 4: Verify infinite scroll**

Scroll down through the rows. After ~45 rows, the sentinel intersects and the next 50 rows auto-fetch — observe "Loading more…" appearing briefly, then more rows below. Confirm the "X records" toolbar count updates.

Keep scrolling until all rows loaded; confirm "End of results · 334 of 334 loaded" appears at the bottom.

- [ ] **Step 5: Verify Date sort**

Click the "Date" header. Confirm:
- Sort arrow rotates.
- Table refetches (rows reorder oldest-first).
- `loadedLimit` resets to 50.

Click again — newest-first restored.

- [ ] **Step 6: Verify footer totals**

With no filters applied:
- Footer "Total" should match the KPI card "Total Expenses" value (e.g. ₹10,02,425).

Type into the search box (e.g. "vendor name"):
- Footer shows two lines: "Filtered (loaded): ₹X · N rows" caption AND "Total ₹10,02,425" (scope unchanged).

Clear search.

- [ ] **Step 7: Verify ref-click routing**

Test each ref type:

| Click | Expected |
|-------|----------|
| A `SELF-` row | Lands on `/site/material-settlements` with the inspect drawer pre-opened for that ref. |
| An `RSET-` row | `RentalExpenseInspectPane` opens in-place. |
| A `DLY-`/`SET-`/`SS-` row | `InspectPane` opens with daily attendance/settlement detail (existing). |
| A `WS-` row | Weekly InspectPane opens. |
| A `MISC-` row | Navigates to `/site/expenses/miscellaneous?highlight=...`. |
| A `TSS-` row | Navigates to `/site/tea-shop?highlight=...`. |
| A `SCP-` row | Navigates to `/site/subcontracts`. |

No console errors on any click.

- [ ] **Step 8: Check console**

Open browser devtools console. Confirm: no red errors, no React hydration warnings, no unhandled promise rejections.

- [ ] **Step 9: Final build + test pass**

Stop the dev server. Run:

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

Expected:
- `npm run lint` — passes.
- `tsc --noEmit` — passes.
- `npm run test` — passes (including the new `refActions.test.ts`).
- `npm run build` — passes.

If any fail, fix and re-run. Do NOT commit a broken build.

- [ ] **Step 10: Close the browser tab opened via Playwright**

(per CLAUDE.md "Close the browser" rule).

- [ ] **Step 11: Commit verification screenshots (optional)**

If you've taken Playwright screenshots showing the new layout, commit them:

```bash
git add *.png
git commit -m "test(expenses): verification screenshots for full-height layout"
```

Otherwise skip this step.

---

## Notes for the executing agent

- The data hook `useExpensesData` is **only used by `page.v2.tsx`** today (verify via `grep -r useExpensesData src/`). The V1 page (`page.tsx`) doesn't use it. So changing the hook's signature is safe.
- The `SettlementInspectDrawer` on the material-settlements page expects a `SettlementItem`; the matching `find()` in Task 3 uses `settlement_reference` on the spread expense, which is the same field the v_all_expenses view exposes. If runtime testing reveals the field isn't on `SettlementItem` (e.g. it's nested), inspect `src/components/materials/settlements/settlementClassifiers.ts` and adjust.
- For Task 8's sentinel: if MUI table refs cause type pain, fall back to a `<Box ref={sentinelRef} sx={{ height: 1 }} />` outside the `<Table>` but inside the `<Paper>`, just after `</TableContainer>`. The observer doesn't care whether the sentinel is in a row — only its viewport intersection.
- The `formatCompact` and `formatINR` helpers in Task 7 already exist in `page.v2.tsx` (lines 127–136). Do not re-define them.
