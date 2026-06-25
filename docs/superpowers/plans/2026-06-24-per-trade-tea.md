# Per-trade Tea Splitting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let each trade control how it takes tea (Off / share in a Pool with a host trade / Own), split a pool's daily tea across its member trades by who actually worked (per group-site), attribute each trade's share to its in-house contract, and show the engineer the split before they save the bill — with today's behaviour preserved by default and zero data migration of meaning.

**Architecture:** Additive schema on `labor_categories` (`tea_mode`, `tea_pool_host_category_id`) + a pool-host tag on `tea_shop_entries`/`tea_shop_settlements`. A new `security_invoker` view `v_trade_tea_share(site_id, date, trade_category_id, amount)` computes the within-pool, per-trade split on top of the existing per-site allocation (which is left untouched). The Trade-Management page gains a tea control; the attendance Tea KPI shows a scoped trade's share; the tea-entry dialog shows a live split preview; settlement attribution writes per-trade `subcontract_id` rows pointing at each trade's in-house contract. Everything defaults to one common pool (host = Civil) so current numbers are byte-for-byte unchanged.

**Tech Stack:** Next.js 15 (app router), Supabase Postgres (SQL migrations via `mcp__supabase__apply_migration`), React Query (TanStack), MUI v7, Vitest + React Testing Library.

## Global Constraints

- **Civil safety:** with every trade at its default (`tea_mode='pool'`, host = Civil, existing entries untagged), per-site tea totals and the existing `recalculate_tea_shop_allocations_for_date()` / `tea_shop_entry_allocations` outputs MUST be byte-for-byte identical to today. Verify this explicitly.
- **No data migration of meaning:** existing `tea_shop_entries`/`tea_shop_settlements` rows keep `trade_pool_host_category_id = NULL` (= the common pool); the view resolves NULL → the company's default host. Do not rewrite existing rows' amounts.
- **Attribution, not deduction:** a trade's tea share is a cost against its *contract*, never a deduction from an individual labourer's wage. Σ(per-trade shares) MUST equal the pool's tea total for that (site, date) — money is conserved.
- **Schema before code (Move-to-Prod rule):** every migration here is applied to prod via `mcp__supabase__apply_migration` BEFORE the code referencing it ships. Migration files are committed in the same push as the code.
- **Views are `security_invoker = true`** (PG15 owner-privilege default leaks across companies + trips the `security_definer_view` advisor). Every new/replaced view sets it.
- **Tea-mode domain:** `text` column with `CHECK (tea_mode IN ('pool','own','off'))`, `NOT NULL DEFAULT 'pool'`. Do not introduce a Postgres enum type.
- **Env auto-commits + pushes pending work → it deploys.** Implementer subagents EDIT but DO NOT commit. The controller live-verifies on a clean dev build (`rm -rf .next` while the dev server is stopped, then `npm run dev:cloud`), then commits only when correct. Commit trailer: `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Default-host helper is the single source of truth** for "which trade hosts the common pool": `public.default_tea_pool_host(p_company_id uuid)`. Backfill, the view, and any RPC all call it. Never inline the Civil-lookup logic.

---

## File Structure

**Created:**
- `supabase/migrations/20260625100000_per_trade_tea_columns.sql` — the 3 columns + `default_tea_pool_host()` helper + backfill (Task A1).
- `supabase/migrations/20260625100100_v_trade_tea_share.sql` — the per-trade split view (Task A2).
- `src/lib/tea/teaPoolHost.ts` — pure helpers: pool membership + the default-host resolution mirrored client-side for the preview (Task C1).
- `src/lib/tea/teaSplitPreview.ts` — pure `computeTeaSplitPreview()` used by the entry dialog (Task C1).
- `src/lib/tea/__tests__/teaSplitPreview.test.ts` — unit tests for the split math (Task C1).
- `src/hooks/queries/useTradeTeaShare.ts` — React Query hook reading `v_trade_tea_share` (Task B3).
- `supabase/migrations/20260625100200_settle_trade_tea_shares.sql` — RPC that splits a pool tea settlement into per-trade `subcontract_id` rows (Task D1).
- `src/hooks/queries/useTradeTeaContractShares.ts` — hook reading per-trade tea attributed to a contract for the trade's settlement view (Task D2).

**Modified:**
- `src/hooks/queries/useLaborCategories.ts` — `tea_mode` + `tea_pool_host_category_id` on type/select/input/update (Task B1).
- `src/app/(main)/company/settings/trades/page.tsx` — the per-trade tea control (Task B2).
- `src/app/(main)/site/attendance/attendance-content.tsx` — scoped Tea KPI from the share view (Task B3).
- `src/components/tea-shop/TeaShopEntryDialog.tsx` — split-preview block + tag new entries with the pool host (Task C2).
- `src/types/database.types.ts` — regenerated after each migration (Tasks A1/A2/D1).

---

## Phase A — Data foundation (schema + view)

### Task A1: Migration — tea columns, default-host helper, backfill

**Files:**
- Create: `supabase/migrations/20260625100000_per_trade_tea_columns.sql`
- Modify (regenerate): `src/types/database.types.ts`

**Interfaces:**
- Produces: `labor_categories.tea_mode text`, `labor_categories.tea_pool_host_category_id uuid`, `tea_shop_entries.trade_pool_host_category_id uuid`, `tea_shop_settlements.trade_pool_host_category_id uuid`, and `public.default_tea_pool_host(p_company_id uuid) RETURNS uuid` (the per-company common-pool host).

- [ ] **Step 1: Write the migration SQL**

Create `supabase/migrations/20260625100000_per_trade_tea_columns.sql`:

```sql
-- Per-trade tea: mode + pool host on trades; pool-host tag on entries/settlements.

-- 1) Trade-level controls.
ALTER TABLE public.labor_categories
  ADD COLUMN IF NOT EXISTS tea_mode text NOT NULL DEFAULT 'pool'
    CHECK (tea_mode IN ('pool','own','off')),
  ADD COLUMN IF NOT EXISTS tea_pool_host_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE SET NULL;

-- 2) Pool-host tag on the money rows. NULL = legacy common pool (resolved to the
--    company default host by the view). New common-pool rows may also stay NULL.
ALTER TABLE public.tea_shop_entries
  ADD COLUMN IF NOT EXISTS trade_pool_host_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE SET NULL;
ALTER TABLE public.tea_shop_settlements
  ADD COLUMN IF NOT EXISTS trade_pool_host_category_id uuid NULL
    REFERENCES public.labor_categories(id) ON DELETE SET NULL;

-- 3) Single source of truth: the trade that hosts a company's common tea pool.
--    Civil if present, else the first active trade by display_order.
CREATE OR REPLACE FUNCTION public.default_tea_pool_host(p_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT id FROM public.labor_categories
   WHERE company_id = p_company_id
   ORDER BY (lower(name) = 'civil') DESC, is_active DESC, display_order ASC, name ASC
   LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.default_tea_pool_host(uuid) TO authenticated;

-- 4) Backfill the host pointer for 'pool' trades so membership matching is
--    non-null trade-side. Existing entries/settlements stay NULL (= common pool).
UPDATE public.labor_categories lc
   SET tea_pool_host_category_id = public.default_tea_pool_host(lc.company_id)
 WHERE lc.tea_mode = 'pool'
   AND lc.tea_pool_host_category_id IS NULL;

-- 'own' trades host themselves (singleton pool).
UPDATE public.labor_categories
   SET tea_pool_host_category_id = id
 WHERE tea_mode = 'own'
   AND tea_pool_host_category_id IS NULL;
```

- [ ] **Step 2: Apply the migration to prod**

Use `mcp__supabase__apply_migration` with `name: "per_trade_tea_columns"` and the SQL above.
Expected: success, no error.

- [ ] **Step 3: Verify columns + helper + backfill**

Run via `mcp__supabase__execute_sql`:

```sql
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='labor_categories'
   AND column_name IN ('tea_mode','tea_pool_host_category_id');           -- expect 2 rows
SELECT count(*) FILTER (WHERE tea_mode='pool' AND tea_pool_host_category_id IS NOT NULL) AS pooled,
       count(*) FILTER (WHERE tea_pool_host_category_id IS NULL) AS unhosted
  FROM public.labor_categories;                                          -- expect unhosted = off-trades only
SELECT public.default_tea_pool_host(company_id) AS host, count(*)
  FROM public.labor_categories GROUP BY 1;                               -- expect host = the Civil category id
```
Expected: the two new columns exist; every `pool`/`own` trade has a non-null host; `default_tea_pool_host` returns the Civil category id.

- [ ] **Step 4: Regenerate types**

Run `mcp__supabase__generate_typescript_types` and write the result to `src/types/database.types.ts`. Confirm `tea_mode` / `tea_pool_host_category_id` / `trade_pool_host_category_id` appear.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260625100000_per_trade_tea_columns.sql src/types/database.types.ts
git commit -m "feat(tea): add tea_mode + pool-host columns + default_tea_pool_host helper"
```

---

### Task A2: Migration — `v_trade_tea_share` per-trade split view

**Files:**
- Create: `supabase/migrations/20260625100100_v_trade_tea_share.sql`
- Modify (regenerate): `src/types/database.types.ts`

**Interfaces:**
- Consumes: the columns + `default_tea_pool_host()` from Task A1; existing `tea_shop_entries`, `tea_shop_entry_allocations`, `daily_attendance`, `laborers.category_id`, `market_laborer_attendance`, `labor_roles.category_id`, `sites.company_id`, `site_groups.company_id`.
- Produces: `public.v_trade_tea_share (site_id uuid, date date, trade_category_id uuid, amount numeric)` — one row per (site, date, participating trade); Σ amount over a (site, date) = that site/date's total tea.

- [ ] **Step 1: Write the view SQL**

Create `supabase/migrations/20260625100100_v_trade_tea_share.sql`:

```sql
-- Per-(site,date,trade) tea share. Sits ON TOP of the existing per-site
-- allocation; the per-site split (tea_shop_entry_allocations / single-site
-- entries) is unchanged. Splits each pool's per-site tea across the pool's
-- member trades by present day_units; off-trades get 0; money is conserved.
CREATE OR REPLACE VIEW public.v_trade_tea_share
WITH (security_invoker = true) AS
WITH
-- a) Tea landed at a (site, date), tagged to a pool host (NULL -> company default).
tea_at_site AS (
  -- single-site entries
  SELECT te.site_id,
         te.date,
         COALESCE(te.trade_pool_host_category_id,
                  public.default_tea_pool_host(s.company_id)) AS pool_host,
         COALESCE(te.total_amount, te.amount) AS amount
    FROM public.tea_shop_entries te
    JOIN public.sites s ON s.id = te.site_id
   WHERE te.is_group_entry = false
     AND te.site_id IS NOT NULL
  UNION ALL
  -- group entries: per-site allocated slice
  SELECT a.site_id,
         te.date,
         COALESCE(te.trade_pool_host_category_id,
                  public.default_tea_pool_host(s.company_id)) AS pool_host,
         a.allocated_amount AS amount
    FROM public.tea_shop_entry_allocations a
    JOIN public.tea_shop_entries te ON te.id = a.entry_id
    JOIN public.sites s ON s.id = a.site_id
   WHERE te.is_group_entry = true
),
pool_tea AS (
  SELECT site_id, date, pool_host, SUM(amount) AS pool_amount
    FROM tea_at_site
   GROUP BY site_id, date, pool_host
),
-- b) Present day_units per (site, date, trade) = named + market.
trade_units AS (
  SELECT da.site_id, da.date, l.category_id AS trade_category_id,
         SUM(COALESCE(da.day_units, 1))::numeric AS units
    FROM public.daily_attendance da
    JOIN public.laborers l ON l.id = da.laborer_id
   WHERE COALESCE(da.is_deleted, false) = false
     AND l.category_id IS NOT NULL
   GROUP BY da.site_id, da.date, l.category_id
  UNION ALL
  SELECT mla.site_id, mla.date, lr.category_id AS trade_category_id,
         SUM(COALESCE(mla.count, 0))::numeric AS units
    FROM public.market_laborer_attendance mla
    JOIN public.labor_roles lr ON lr.id = mla.role_id
   WHERE lr.category_id IS NOT NULL
   GROUP BY mla.site_id, mla.date, lr.category_id
),
trade_units_rolled AS (
  SELECT site_id, date, trade_category_id, SUM(units) AS units
    FROM trade_units
   GROUP BY site_id, date, trade_category_id
),
-- c) Member trades of each pool (non-off; host resolved like the entries').
member AS (
  SELECT lc.id AS trade_category_id,
         COALESCE(lc.tea_pool_host_category_id,
                  public.default_tea_pool_host(lc.company_id)) AS pool_host
    FROM public.labor_categories lc
   WHERE lc.tea_mode <> 'off'
),
-- d) Each member trade's present units within its pool, per (site, date).
member_units AS (
  SELECT pt.site_id, pt.date, pt.pool_host, pt.pool_amount,
         m.trade_category_id,
         COALESCE(tu.units, 0) AS units
    FROM pool_tea pt
    JOIN member m ON m.pool_host = pt.pool_host
    LEFT JOIN trade_units_rolled tu
           ON tu.site_id = pt.site_id AND tu.date = pt.date
          AND tu.trade_category_id = m.trade_category_id
),
pool_totals AS (
  SELECT site_id, date, pool_host, SUM(units) AS total_units
    FROM member_units
   GROUP BY site_id, date, pool_host
)
SELECT mu.site_id,
       mu.date,
       mu.trade_category_id,
       CASE
         WHEN pt.total_units > 0
           THEN ROUND(mu.pool_amount * (mu.units / pt.total_units))
         -- pool tea with no attributable attendance -> host bears it (no money lost)
         WHEN mu.trade_category_id = mu.pool_host THEN ROUND(mu.pool_amount)
         ELSE 0
       END AS amount
  FROM member_units mu
  JOIN pool_totals pt
    ON pt.site_id = mu.site_id AND pt.date = mu.date AND pt.pool_host = mu.pool_host
 WHERE mu.units > 0 OR (pt.total_units = 0 AND mu.trade_category_id = mu.pool_host);

GRANT SELECT ON public.v_trade_tea_share TO authenticated;
```

- [ ] **Step 2: Apply the migration to prod**

`mcp__supabase__apply_migration`, `name: "v_trade_tea_share"`, SQL above. Expected: success.

- [ ] **Step 3: Verify money is conserved + off-trade is zero**

Run via `mcp__supabase__execute_sql` (read-only — current data is all default common pool, so the per-trade split must sum back to each site/date's tea):

```sql
-- For a recent group-tea date, per-trade shares sum to the site's allocated tea.
WITH share AS (
  SELECT site_id, date, SUM(amount) AS trade_sum
    FROM public.v_trade_tea_share
   GROUP BY site_id, date
),
site_tea AS (
  SELECT a.site_id, te.date, SUM(a.allocated_amount) AS site_alloc
    FROM public.tea_shop_entry_allocations a
    JOIN public.tea_shop_entries te ON te.id = a.entry_id
   WHERE te.is_group_entry = true
   GROUP BY a.site_id, te.date
)
SELECT s.site_id, s.date, s.trade_sum, st.site_alloc,
       (s.trade_sum - st.site_alloc) AS diff
  FROM share s JOIN site_tea st USING (site_id, date)
 ORDER BY abs(s.trade_sum - st.site_alloc) DESC
 LIMIT 20;                         -- expect diff within ±1 (rounding) for all rows
```
Expected: `diff` is 0 (or ±1 from rounding) for every row — Civil-default config reproduces today's per-site tea.

- [ ] **Step 4: Regenerate types**

`mcp__supabase__generate_typescript_types` → write `src/types/database.types.ts`. Confirm `v_trade_tea_share` is present.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260625100100_v_trade_tea_share.sql src/types/database.types.ts
git commit -m "feat(tea): v_trade_tea_share per-trade split view (money-conserving)"
```

---

## Phase B — Trade control + scoped Tea KPI (read-only surfacing)

### Task B1: `useLaborCategories` — expose `tea_mode` + `tea_pool_host_category_id`

**Files:**
- Modify: `src/hooks/queries/useLaborCategories.ts:16-30` (type), `:64-71` (select), `:80-87` (input), `:117-125` (update payload)

**Interfaces:**
- Consumes: columns from Task A1.
- Produces: `LaborCategory.tea_mode: 'pool'|'own'|'off'`, `LaborCategory.tea_pool_host_category_id: string | null`; `LaborCategoryInput.tea_mode?`, `LaborCategoryInput.tea_pool_host_category_id?`; `useUpdateLaborCategory` accepts both.

- [ ] **Step 1: Extend the `LaborCategory` type**

In the `LaborCategory` interface (after `has_workspace`), add:

```typescript
  /** How this trade takes tea: shares a pool, runs its own, or none. */
  tea_mode: "pool" | "own" | "off";
  /** The trade that hosts this trade's pool (self for 'own'; Civil by default). */
  tea_pool_host_category_id: string | null;
```

- [ ] **Step 2: Add the columns to the select**

Change the `.select(...)` string (currently ends `..., company_id, has_workspace`) to:

```typescript
    "id, name, description, display_order, is_active, is_system_seed, company_id, has_workspace, tea_mode, tea_pool_host_category_id"
```

- [ ] **Step 3: Extend `LaborCategoryInput`**

Add to the interface:

```typescript
  /** Tea participation mode for this trade. */
  tea_mode?: "pool" | "own" | "off";
  /** Pool host trade id (used when tea_mode === 'pool'). */
  tea_pool_host_category_id?: string | null;
```

- [ ] **Step 4: Thread them into the update payload**

In `useUpdateLaborCategory`'s `mutationFn`, after the `has_workspace` line, add:

```typescript
    if (rest.tea_mode !== undefined) payload.tea_mode = rest.tea_mode;
    if (rest.tea_pool_host_category_id !== undefined)
      payload.tea_pool_host_category_id = rest.tea_pool_host_category_id;
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "useLaborCategories" || echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/queries/useLaborCategories.ts
git commit -m "feat(tea): surface tea_mode + tea_pool_host on labor categories"
```

---

### Task B2: Trade Management — per-trade tea control

**Files:**
- Modify: `src/app/(main)/company/settings/trades/page.tsx` (renderCard, ~`:254-267` Workspace block; handlers ~`:176-186`)

**Interfaces:**
- Consumes: `useLaborCategories` (Task B1), `useUpdateLaborCategory`, the list of categories for the host picker.
- Produces: UI to set a trade's `tea_mode` and (for `'pool'`) its `tea_pool_host_category_id`.

- [ ] **Step 1: Add the tea-mode handler**

Near `handleToggleWorkspace`, add:

```typescript
const handleTeaModeChange = async (
  c: LaborCategory,
  mode: "pool" | "own" | "off",
  hostId: string | null
) => {
  try {
    await updateC.mutateAsync({
      id: c.id,
      tea_mode: mode,
      // 'own' hosts itself; 'pool' uses the chosen host (default = current/self);
      // 'off' keeps whatever host was set (ignored while off).
      tea_pool_host_category_id:
        mode === "own" ? c.id : mode === "pool" ? hostId ?? c.tea_pool_host_category_id : c.tea_pool_host_category_id,
    });
  } catch (e) {
    setError((e as Error).message);
  }
};
```

- [ ] **Step 2: Render the tea control in `renderCard`**

After the Workspace `<Tooltip>...</Tooltip>` block, add a compact control (a `Select` for the mode + a host `Select` shown only for `'pool'`). Use the existing `categories` array (exclude `c` itself and `off` trades from host options):

```tsx
{/* Tea: how this trade takes part in the shared tea pool. */}
<Box sx={{ textAlign: "center", minWidth: 140 }}>
  <Typography variant="caption" sx={{ display: "block", color: "text.secondary", lineHeight: 1.1 }}>
    Tea
  </Typography>
  <Select
    size="small"
    value={c.tea_mode}
    onChange={(e) =>
      handleTeaModeChange(c, e.target.value as "pool" | "own" | "off", c.tea_pool_host_category_id)
    }
    sx={{ fontSize: 12 }}
  >
    <MenuItem value="pool">Share pool</MenuItem>
    <MenuItem value="own">Own tea</MenuItem>
    <MenuItem value="off">No tea</MenuItem>
  </Select>
  {c.tea_mode === "pool" && (
    <Select
      size="small"
      displayEmpty
      value={c.tea_pool_host_category_id ?? ""}
      onChange={(e) => handleTeaModeChange(c, "pool", (e.target.value as string) || null)}
      sx={{ fontSize: 12, mt: 0.5, display: "block" }}
    >
      {categories
        .filter((o) => o.tea_mode !== "off")
        .map((o) => (
          <MenuItem key={o.id} value={o.id}>
            with {o.name}
          </MenuItem>
        ))}
    </Select>
  )}
</Box>
```

Add `Select` + `MenuItem` to the MUI import at the top of the file if not already imported.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "settings/trades" || echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(main)/company/settings/trades/page.tsx"
git commit -m "feat(tea): per-trade tea control (share pool / own / off) in Trade Management"
```

---

### Task B3: Attendance — scoped Tea KPI from `v_trade_tea_share`

**Files:**
- Create: `src/hooks/queries/useTradeTeaShare.ts`
- Modify: `src/app/(main)/site/attendance/attendance-content.tsx` (the `scopedDateSummaries` `teaShop: null` at ~`:532`, and the `periodTotals` tea field)

**Interfaces:**
- Consumes: `v_trade_tea_share` (Task A2); the page's `tradeScope` memo (`{ contractId, tradeCategoryId, laborerIds }`, ~`:426-461`), `siteId`, and the active date window.
- Produces: `useTradeTeaShare({ siteId, tradeCategoryId, startDate, endDate })` → `Map<dateStr, number>` of the trade's tea share per date; the scoped Tea KPI uses it instead of 0.

- [ ] **Step 1: Write the failing test for the hook's select shape**

Create `src/hooks/queries/__tests__/useTradeTeaShare.test.ts` — test the pure reducer the hook uses (extract a `sumSharesByDate(rows)` exported from the hook file):

```typescript
import { describe, it, expect } from "vitest";
import { sumSharesByDate } from "../useTradeTeaShare";

describe("sumSharesByDate", () => {
  it("sums share amounts per date", () => {
    const rows = [
      { date: "2026-06-01", amount: 100 },
      { date: "2026-06-01", amount: 50 },
      { date: "2026-06-02", amount: 75 },
    ];
    const m = sumSharesByDate(rows);
    expect(m.get("2026-06-01")).toBe(150);
    expect(m.get("2026-06-02")).toBe(75);
  });
  it("is empty for no rows", () => {
    expect(sumSharesByDate([]).size).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/hooks/queries/__tests__/useTradeTeaShare.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the hook**

Create `src/hooks/queries/useTradeTeaShare.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

export interface TeaShareRow {
  date: string;
  amount: number;
}

export function sumSharesByDate(rows: TeaShareRow[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.date, (m.get(r.date) ?? 0) + Number(r.amount || 0));
  return m;
}

export function useTradeTeaShare(params: {
  siteId: string | undefined;
  tradeCategoryId: string | null | undefined;
  startDate: string;
  endDate: string;
}) {
  const { siteId, tradeCategoryId, startDate, endDate } = params;
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["trade-tea-share", siteId, tradeCategoryId, startDate, endDate],
    enabled: !!siteId && !!tradeCategoryId,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number>> => {
      const { data, error } = await supabase
        .from("v_trade_tea_share")
        .select("date, amount")
        .eq("site_id", siteId)
        .eq("trade_category_id", tradeCategoryId)
        .gte("date", startDate)
        .lte("date", endDate);
      if (error) throw error;
      return sumSharesByDate((data ?? []) as TeaShareRow[]);
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/hooks/queries/__tests__/useTradeTeaShare.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the scoped Tea KPI in `attendance-content.tsx`**

Call the hook (only meaningful when `tradeScope` is set — the hook is `enabled` only then):

```typescript
const teaShareByDate = useTradeTeaShare({
  siteId,
  tradeCategoryId: tradeScope?.tradeCategoryId,
  startDate: /* the page's window start, same var feeding the summary */,
  endDate: /* the page's window end */,
}).data;
```

Then in `scopedDateSummaries`, replace `teaShop: null` with the per-date share when scoped:

```typescript
teaShop: tradeScope ? (teaShareByDate?.get(s.date) ?? 0) : s.teaShop,
```

And in `periodTotals` (the scoped client path), include tea by summing `scopedDateSummaries[*].teaShop` (it already sums the other scoped fields — add `teaShop` to that reduction) so the Tea KPI shows the trade's pool share instead of 0.

IMPORTANT (Civil safety): when `tradeScope` is null, `scopedDateSummaries === dateSummaries` and `periodTotals` still uses the site-wide RPC exactly as today — the hook is disabled and unused.

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc --noEmit 2>&1 | grep -E "attendance-content|useTradeTeaShare" || echo OK` → `OK`
Run: `npx vitest run src/hooks/queries/__tests__/useTradeTeaShare.test.ts` → PASS

- [ ] **Step 7: Commit**

```bash
git add src/hooks/queries/useTradeTeaShare.ts src/hooks/queries/__tests__/useTradeTeaShare.test.ts "src/app/(main)/site/attendance/attendance-content.tsx"
git commit -m "feat(tea): scoped attendance Tea KPI shows the trade's pool share"
```

---

## Phase C — Entry-time split preview

### Task C1: Pure split-preview util + tests

**Files:**
- Create: `src/lib/tea/teaPoolHost.ts`, `src/lib/tea/teaSplitPreview.ts`, `src/lib/tea/__tests__/teaSplitPreview.test.ts`

**Interfaces:**
- Produces: `computeTeaSplitPreview(input) → { siteId, perTrade: { tradeCategoryId, tradeName, amount }[] }[]` — mirrors `v_trade_tea_share` math client-side from the dialog's known attendance, so preview == server result.

- [ ] **Step 1: Write the failing test**

Create `src/lib/tea/__tests__/teaSplitPreview.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeTeaSplitPreview } from "../teaSplitPreview";

const trades = [
  { id: "civil", name: "Civil", teaMode: "pool" as const, poolHost: "civil" },
  { id: "paint", name: "Painting", teaMode: "pool" as const, poolHost: "civil" },
  { id: "elec", name: "Electrical", teaMode: "off" as const, poolHost: "elec" },
];

describe("computeTeaSplitPreview", () => {
  it("splits a pool's tea by present units across member trades", () => {
    const out = computeTeaSplitPreview({
      defaultHost: "civil",
      trades,
      sites: [
        {
          siteId: "s1",
          poolHost: "civil",
          amount: 300,
          unitsByTrade: { civil: 2, paint: 1, elec: 5 }, // elec is off -> ignored
        },
      ],
    });
    const s1 = out.find((x) => x.siteId === "s1")!;
    const civil = s1.perTrade.find((p) => p.tradeCategoryId === "civil")!;
    const paint = s1.perTrade.find((p) => p.tradeCategoryId === "paint")!;
    expect(civil.amount).toBe(200);
    expect(paint.amount).toBe(100);
    expect(s1.perTrade.some((p) => p.tradeCategoryId === "elec")).toBe(false);
    expect(civil.amount + paint.amount).toBe(300); // conserved
  });
  it("gives the host the whole bill when no one worked", () => {
    const out = computeTeaSplitPreview({
      defaultHost: "civil",
      trades,
      sites: [{ siteId: "s1", poolHost: "civil", amount: 120, unitsByTrade: {} }],
    });
    const civil = out[0].perTrade.find((p) => p.tradeCategoryId === "civil")!;
    expect(civil.amount).toBe(120);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/lib/tea/__tests__/teaSplitPreview.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the helpers**

Create `src/lib/tea/teaPoolHost.ts`:

```typescript
export type TeaMode = "pool" | "own" | "off";

export interface TradeTea {
  id: string;
  name: string;
  teaMode: TeaMode;
  poolHost: string | null;
}

/** Resolved pool host for a trade (NULL -> company default). */
export function resolvePoolHost(t: TradeTea, defaultHost: string): string {
  if (t.teaMode === "own") return t.id;
  return t.poolHost ?? defaultHost;
}
```

Create `src/lib/tea/teaSplitPreview.ts`:

```typescript
import { resolvePoolHost, TradeTea } from "./teaPoolHost";

export interface SitePoolTea {
  siteId: string;
  /** Pool host this site's tea bill belongs to (NULL -> defaultHost). */
  poolHost: string | null;
  amount: number;
  /** Present day_units keyed by trade category id (named + market). */
  unitsByTrade: Record<string, number>;
}

export interface TeaSplitInput {
  defaultHost: string;
  trades: TradeTea[];
  sites: SitePoolTea[];
}

export interface TradeShare {
  tradeCategoryId: string;
  tradeName: string;
  amount: number;
}

export interface SiteSplit {
  siteId: string;
  perTrade: TradeShare[];
}

export function computeTeaSplitPreview(input: TeaSplitInput): SiteSplit[] {
  const { defaultHost, trades, sites } = input;
  const byId = new Map(trades.map((t) => [t.id, t]));
  return sites.map((site) => {
    const host = site.poolHost ?? defaultHost;
    const members = trades.filter((t) => t.teaMode !== "off" && resolvePoolHost(t, defaultHost) === host);
    const units = members.map((m) => ({ m, u: site.unitsByTrade[m.id] ?? 0 }));
    const total = units.reduce((a, x) => a + x.u, 0);
    let perTrade: TradeShare[];
    if (total > 0) {
      perTrade = units
        .filter((x) => x.u > 0)
        .map((x) => ({
          tradeCategoryId: x.m.id,
          tradeName: x.m.name,
          amount: Math.round(site.amount * (x.u / total)),
        }));
    } else {
      const hostTrade = byId.get(host);
      perTrade = hostTrade
        ? [{ tradeCategoryId: host, tradeName: hostTrade.name, amount: Math.round(site.amount) }]
        : [];
    }
    return { siteId: site.siteId, perTrade };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run src/lib/tea/__tests__/teaSplitPreview.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/tea/teaPoolHost.ts src/lib/tea/teaSplitPreview.ts src/lib/tea/__tests__/teaSplitPreview.test.ts
git commit -m "feat(tea): pure tea split-preview util (mirrors v_trade_tea_share math)"
```

---

### Task C2: Wire the split preview into the tea-entry dialog

**Files:**
- Modify: `src/components/tea-shop/TeaShopEntryDialog.tsx` (DialogActions ~`:748-759`; insert payload ~`:290-327`)

**Interfaces:**
- Consumes: `computeTeaSplitPreview` (Task C1), `useLaborCategories` (for trades + modes), and the per-site present-units the dialog already computes for allocation (the `total_day_units` / per-site day-unit figures it builds for multi-site / group entries).
- Produces: a read-only preview panel above the save button, and (on save) tags the new entry's `trade_pool_host_category_id` with the common-pool default host (own-trade entry flows handled later — common pool is the default path).

- [ ] **Step 1: Build the preview model in the component**

Inside `TeaShopEntryDialog`, derive trades from `useLaborCategories()` and the per-site present units the dialog already has, then:

```typescript
const teaTrades = (laborCategories ?? []).map((c) => ({
  id: c.id,
  name: c.name,
  teaMode: c.tea_mode,
  poolHost: c.tea_pool_host_category_id,
}));
const defaultHost = /* the company default host id; from a small useDefaultTeaPoolHost() or the Civil category id in laborCategories */;
const splitPreview = useMemo(
  () =>
    computeTeaSplitPreview({
      defaultHost,
      trades: teaTrades,
      sites: previewSites, // [{ siteId, poolHost: null, amount: <this site's tea>, unitsByTrade }]
    }),
  [defaultHost, teaTrades, previewSites]
);
```

`previewSites` is built from the same per-site amount + day-unit data the dialog already computes for the allocation (single site → one entry; multi-site/group → one per site). `unitsByTrade` is the present day_units per trade at that site for `date` — fetch via a small query on `daily_attendance`+`laborers.category_id` and `market_laborer_attendance`+`labor_roles.category_id` for the entry's `date`/site(s), or reuse any per-trade attendance already loaded.

- [ ] **Step 2: Render the preview panel**

Immediately above `<DialogActions>`, add:

```tsx
{simpleTotalCost > 0 && splitPreview.some((s) => s.perTrade.length > 0) && (
  <Box sx={{ px: 2, pb: 1 }}>
    <Alert severity="info" icon={false} sx={{ py: 0.5 }}>
      <Typography variant="caption" component="div" sx={{ fontWeight: 600, mb: 0.5 }}>
        This bill will be split across trades (added to each trade's contract):
      </Typography>
      {splitPreview.map((s) => (
        <Typography key={s.siteId} variant="caption" component="div">
          {siteNameById(s.siteId)}:{" "}
          {s.perTrade.map((p) => `${p.tradeName} ₹${p.amount.toLocaleString("en-IN")}`).join(" · ")}
        </Typography>
      ))}
    </Alert>
  </Box>
)}
```

- [ ] **Step 3: Tag the entry with the pool host on save**

In the `entryData` payload (~`:290-327`), add:

```typescript
  trade_pool_host_category_id: null, // common pool; resolved to the company default host by the view
```

(Leaving NULL keeps existing semantics; the view resolves it. Own-trade dedicated entries are a later enhancement and are not created from this common-pool dialog.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "TeaShopEntryDialog" || echo OK`
Expected: `OK`.

- [ ] **Step 5: Commit**

```bash
git add src/components/tea-shop/TeaShopEntryDialog.tsx
git commit -m "feat(tea): live per-trade split preview in the tea-entry dialog"
```

---

## Phase D — Contract attribution + settlement (financial; ships last)

### Task D1: RPC — split a pool tea settlement into per-trade contract rows

**Files:**
- Create: `supabase/migrations/20260625100200_settle_trade_tea_shares.sql`
- Create: `src/hooks/queries/useTradeTeaContractShares.ts` (Task D2 consumes it; created here as the read hook)
- Modify (regenerate): `src/types/database.types.ts`

**Interfaces:**
- Consumes: `v_trade_tea_share` (A2), `ensure_trade_in_house_contract` (existing), `tea_shop_settlements.subcontract_id` + `tea_shop_settlements.trade_pool_host_category_id` (A1).
- Produces: `public.attribute_tea_settlement_to_trades(p_settlement_id uuid) RETURNS void` — for a settled pool tea period, writes/links each member trade's share to its in-house contract via `subcontract_id`, idempotently. Money conserved: Σ trade shares over the period = the settlement's `entries_total`.

- [ ] **Step 1: Write the RPC SQL**

Create `supabase/migrations/20260625100200_settle_trade_tea_shares.sql`:

```sql
-- Attribute a tea settlement's cost to each participating trade's in-house
-- contract, by summing v_trade_tea_share over the settlement's period+scope.
-- Idempotent: re-running replaces this settlement's trade rows.
CREATE TABLE IF NOT EXISTS public.tea_settlement_trade_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id uuid NOT NULL REFERENCES public.tea_shop_settlements(id) ON DELETE CASCADE,
  trade_category_id uuid NOT NULL REFERENCES public.labor_categories(id),
  subcontract_id uuid NOT NULL REFERENCES public.subcontracts(id),
  site_id uuid NOT NULL REFERENCES public.sites(id),
  amount numeric NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (settlement_id, trade_category_id, site_id)
);
ALTER TABLE public.tea_settlement_trade_shares ENABLE ROW LEVEL SECURITY;
-- read for authenticated; writes only via the SECURITY DEFINER RPC below.
DROP POLICY IF EXISTS tea_settlement_trade_shares_read ON public.tea_settlement_trade_shares;
CREATE POLICY tea_settlement_trade_shares_read ON public.tea_settlement_trade_shares
  FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.attribute_tea_settlement_to_trades(p_settlement_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start date;
  v_end   date;
  v_site  uuid;
  v_group uuid;
  r RECORD;
  v_contract uuid;
BEGIN
  SELECT period_start, period_end, site_id, site_group_id
    INTO v_start, v_end, v_site, v_group
    FROM public.tea_shop_settlements WHERE id = p_settlement_id;
  IF v_start IS NULL THEN
    RAISE EXCEPTION 'Settlement % not found', p_settlement_id;
  END IF;

  -- clear prior attribution for this settlement (idempotent)
  DELETE FROM public.tea_settlement_trade_shares WHERE settlement_id = p_settlement_id;

  FOR r IN
    SELECT ts.site_id, ts.trade_category_id, SUM(ts.amount) AS amount
      FROM public.v_trade_tea_share ts
      JOIN public.sites s ON s.id = ts.site_id
     WHERE ts.date BETWEEN v_start AND v_end
       AND ( (v_site IS NOT NULL AND ts.site_id = v_site)
          OR (v_group IS NOT NULL AND s.site_group_id = v_group) )
     GROUP BY ts.site_id, ts.trade_category_id
     HAVING SUM(ts.amount) <> 0
  LOOP
    v_contract := public.ensure_trade_in_house_contract(r.site_id, r.trade_category_id);
    INSERT INTO public.tea_settlement_trade_shares
      (settlement_id, trade_category_id, subcontract_id, site_id, amount)
    VALUES (p_settlement_id, r.trade_category_id, v_contract, r.site_id, r.amount);
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.attribute_tea_settlement_to_trades(uuid) TO authenticated;
```

- [ ] **Step 2: Apply the migration to prod**

`mcp__supabase__apply_migration`, `name: "settle_trade_tea_shares"`, SQL above. Expected: success.

- [ ] **Step 3: Verify conservation on a real settled period (read-only, then clean up)**

Pick one existing settled tea period; call the RPC, check Σ shares = `entries_total`, then delete the test rows:

```sql
-- dry attribution for one settlement, then verify + clean
SELECT public.attribute_tea_settlement_to_trades('<a real settlement id>');
SELECT s.entries_total,
       (SELECT COALESCE(SUM(amount),0) FROM public.tea_settlement_trade_shares WHERE settlement_id = s.id) AS attributed
  FROM public.tea_shop_settlements s WHERE s.id = '<same id>';   -- expect attributed ≈ entries_total (±rounding)
DELETE FROM public.tea_settlement_trade_shares WHERE settlement_id = '<same id>';  -- clean up the test
```
Expected: `attributed` within ±(number of site/trade rows) of `entries_total` from per-row rounding; clean-up removes the test rows. **Get the controller's confirmation before running against a production settlement**, per CLAUDE.md write-confirmation rule.

- [ ] **Step 4: Regenerate types + write the read hook**

`mcp__supabase__generate_typescript_types` → `src/types/database.types.ts`. Then create `src/hooks/queries/useTradeTeaContractShares.ts`:

```typescript
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";

/** Per-trade tea attributed to a given in-house contract (for the trade's settlement view). */
export function useTradeTeaContractShares(subcontractId: string | null | undefined) {
  const supabase: any = createClient();
  return useQuery({
    queryKey: ["trade-tea-contract-shares", subcontractId],
    enabled: !!subcontractId,
    staleTime: 60_000,
    queryFn: async (): Promise<number> => {
      const { data, error } = await supabase
        .from("tea_settlement_trade_shares")
        .select("amount")
        .eq("subcontract_id", subcontractId);
      if (error) throw error;
      return (data ?? []).reduce((a: number, r: any) => a + Number(r.amount || 0), 0);
    },
  });
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "useTradeTeaContractShares" || echo OK`
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20260625100200_settle_trade_tea_shares.sql src/hooks/queries/useTradeTeaContractShares.ts src/types/database.types.ts
git commit -m "feat(tea): attribute pool tea settlement to per-trade in-house contracts (RPC + read hook)"
```

---

### Task D2: Call attribution on settlement + surface per-trade tea on the contract

**Files:**
- Modify: the tea-settlement mutation (in `src/hooks/queries/useCombinedTeaShop.ts` or the settlement create path used by the tea-shop page) to call `attribute_tea_settlement_to_trades` after a successful settlement insert.
- Modify: the trade settlement/contract view (where a scoped trade's costs are shown on `/site/payments` or the workforce contract pane) to include `useTradeTeaContractShares` as a "Tea" line.

**Interfaces:**
- Consumes: `attribute_tea_settlement_to_trades` (D1), `useTradeTeaContractShares` (D1).
- Produces: settled pool tea automatically flows into each member trade's contract; the trade's settlement view shows its attributed tea total.

- [ ] **Step 1: Call attribution after a settlement is recorded**

In the tea-settlement create mutation's `onSuccess` (or immediately after the settlement insert returns its `id`), call:

```typescript
await supabase.rpc("attribute_tea_settlement_to_trades", { p_settlement_id: settlementId });
```

Then invalidate `["trade-tea-contract-shares"]` and the existing tea settlement keys. Guard with try/catch so a failed attribution doesn't roll back a recorded payment (log + surface a non-blocking warning; attribution is re-runnable).

- [ ] **Step 2: Show the attributed tea on the trade's contract view**

Where a scoped trade's settlement summary renders (the contract/salary summary that already scopes to `selectedSubcontractId` on `/site/payments`), add a "Tea (attributed)" line:

```tsx
const teaAttributed = useTradeTeaContractShares(selectedSubcontractId).data ?? 0;
// render: Tea (attributed): ₹{teaAttributed.toLocaleString("en-IN")}
```

Only render the line when `selectedSubcontractId` is set (a scoped trade) and `teaAttributed > 0`, so Civil/site-wide views are unchanged.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit 2>&1 | grep -E "useCombinedTeaShop|payments-content" || echo OK`
Expected: `OK`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(tea): run tea-settlement trade attribution + show attributed tea on the trade contract"
```

---

## Live verification (controller, before/after the phase commits)

Per CLAUDE.md "After UI Changes". On a clean dev build (`npm run dev:cloud`, fresh `.next`):

1. **Civil unchanged (must hold):** `/site/tea-shop` and `/site/attendance` (Civil/site view) show the same tea totals as before this work. The conservation queries in A2/D1 already proved the data; confirm the UI matches.
2. **Trade Management:** `/company/settings/trades` — set Painting → Own, Electrical → No tea; reload, the selections persist.
3. **Entry preview:** open the tea-entry dialog, enter a bill on a day with mixed Civil+Painting attendance; the preview shows the split (Civil ₹A · Painting ₹B per site) and conserves the total.
4. **Scoped Tea KPI:** open Painting's workspace on `/site/attendance` (`?contractId=` its in-house contract); the Tea KPI shows Painting's share (not 0, not Civil's full total). Civil's view still shows the full site tea.
5. **Attribution (financial — with explicit confirmation):** record a pool tea settlement; confirm each trade's in-house contract shows its attributed tea, and Σ = the settlement total. Reverse any test settlement.
6. **Console:** zero errors/warnings across all the above.

Revert any non-default test writes (trade modes, test settlements) after verifying, leaving prod at its defaults unless the owner wants Painting/Electrical set for real.

## Self-review notes (coverage check vs spec)

- Spec decisions 1–5 (modes, pool/host, own, off, default-preserves-today) → A1 (columns + backfill) + B2 (control) + A2 (view membership: `tea_mode<>'off'`, host resolution, own=self).
- Decision 6 (attribution lands on the trade's contract via `tea_shop_settlements.subcontract_id`) → D1 (`ensure_trade_in_house_contract` + `tea_settlement_trade_shares.subcontract_id`) + D2 (surface).
- Decision 7 (split by present headcount per trade per group-site) → A2 view (`trade_units` named+market by `category_id`, per `site_id`+`date`) and C1 mirror.
- Decision 8 (entry-time split note) → C1 (`computeTeaSplitPreview`) + C2 (preview panel).
- Risk/Non-goals (no wage deduction; vendor total unchanged; conservation) → Global Constraints + A2/D1 conservation verification queries.
```
