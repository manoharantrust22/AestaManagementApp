# Material Usage Ledger — Design Spec
_Date: 2026-06-02_

## Context

Site supervisors and engineers currently have no in-app way to answer "how much cement / bricks / M-sand has been used on this project so far?" They rely on manual records, and there is no archive of usage to cross-check against. This feature adds a dedicated **Usage Ledger** page that aggregates all material consumption (from both own-stock daily usage and shared group-batch usage) into a readable, filterable summary — by material type and by construction section/phase. A company-level view lets admins compare across all active sites.

---

## Goals

- Show total qty used + landed cost per material type for a site
- Allow filtering by date range and toggling between "By Material" and "By Section" views
- Add section/phase tagging to the Log Usage workflow (optional, with a nudge)
- Provide a company-wide rollup with scope options: All Sites / Site Group / Individual Site

---

## Data Model Changes (1 migration)

### 1. Add `section_id` to `batch_usage_records`

```sql
ALTER TABLE batch_usage_records
  ADD COLUMN section_id UUID REFERENCES building_sections(id);
```

No backfill. Historical rows remain `NULL` and appear as "Untagged" in the ledger.

### 2. New view `v_material_usage_ledger`

Unifies both usage sources into a single flat, queryable table:

```sql
CREATE OR REPLACE VIEW v_material_usage_ledger AS
  -- Shared/group batch usage
  SELECT
    bur.id,
    bur.usage_site_id        AS site_id,
    s.site_group_id,
    bur.material_id,
    bur.brand_id,
    bur.section_id,
    bur.quantity,
    bur.unit,
    bur.unit_cost,
    bur.total_cost,
    bur.usage_date,
    bur.work_description,
    'batch'::text            AS source
  FROM batch_usage_records bur
  JOIN sites s ON s.id = bur.usage_site_id

  UNION ALL

  -- Own-stock daily usage
  SELECT
    dmu.id,
    dmu.site_id,
    s.site_group_id,
    dmu.material_id,
    dmu.brand_id,
    dmu.section_id,
    dmu.quantity,
    dmu.unit,
    dmu.unit_cost,
    (dmu.quantity * dmu.unit_cost) AS total_cost,
    dmu.usage_date,
    dmu.work_description,
    'own'::text              AS source
  FROM daily_material_usage dmu
  JOIN sites s ON s.id = dmu.site_id;
```

RLS: inherits from the underlying tables (no new policies needed).

> **Implementation note:** Verify that `daily_material_usage` has `unit_cost` and `brand_id` columns before writing the migration (the batch path has these; the own-stock path needs confirming). If `unit_cost` is absent, derive it from `stock_transactions` or default to `0`.

---

## Log Usage Dialog Changes

**File:** `src/components/material-hub/WaterfallUsageDialog.tsx`

Add an optional **Section** dropdown field:
- Placed below the existing "Work description" text field
- Populated from `building_sections` for the current site (use the existing `useBuildingSections` hook or equivalent)
- If left empty, show an inline amber helper text: _"No section selected — this entry won't appear in section breakdowns of the Usage Ledger"_
- No hard validation block — user can save without selecting

**RPC change:** `record_batch_usage_waterfall` gains an optional `p_section_id UUID DEFAULT NULL` parameter, written to `batch_usage_records.section_id`.

---

## New Hook

**File:** `src/hooks/queries/useMaterialUsageLedger.ts`

```ts
useMaterialUsageLedger(filters: {
  site_id?: string
  site_group_id?: string
  from_date?: string   // ISO date
  to_date?: string
})
```

- Queries `v_material_usage_ledger` via Supabase `.select()` with the provided filters
- Returns flat rows; grouping into the By Material / By Section tree is done client-side
- Uses `wrapQueryFn` + 25 s timeout (matches other hooks in this codebase)
- Exports two derived selectors: `groupByMaterial(rows)` and `groupBySection(rows)` — pure functions that produce the expandable tree structure

---

## New Pages

### Site: `/site/materials/usage-ledger`

**File:** `src/app/(main)/site/materials/usage-ledger/page.tsx`

- 4th nav item under Material-V2 (alongside Hub · Inventory · Inter-site)
- Scope fixed to `useSelectedSite()`
- **KPI strip** (4 tiles): Total Material Cost · Distinct Materials · Entries (with amber untagged count) · Sections Covered (x / total)
- **Top bar:** By Material / By Section toggle + `DateRangePicker` (standalone + compact props) + material search input
- **Table:** expandable rows
  - By Material: material name → expand → section rows (Footing, Structure, …, Untagged)
  - By Section: phase name → expand → material rows
  - Columns: Material/Section · Unit · Qty Used · Avg Unit Cost (weighted: `SUM(total_cost)/SUM(qty)`) · Total Cost
  - Rows with any untagged entries show a small amber `"N untagged"` chip inline

### Company: `/company/materials/usage`

**File:** `src/app/(main)/company/materials/usage/page.tsx`

- New nav item under Company → Materials
- **Scope selector** (top of page, 3 options):
  - **All Sites** — company-wide rollup; KPI strip gains a per-site cost bar
  - **By Site Group** — cluster picker (dropdown of site groups)
  - **Individual Site** — site picker (dropdown)
- Same toggle + date filter + expandable table as the site page
- Uses `useMaterialUsageLedger` with appropriate `site_id` / `site_group_id` filter based on scope selection

---

## Key Files to Modify / Create

| Action | File |
|--------|------|
| New migration (single file: column + view + RPC) | `supabase/migrations/20260602130000_material_usage_ledger.sql` |
| New hook | `src/hooks/queries/useMaterialUsageLedger.ts` |
| Modify dialog | `src/components/material-hub/WaterfallUsageDialog.tsx` |
| New site page | `src/app/(main)/site/materials/usage-ledger/page.tsx` |
| New company page | `src/app/(main)/company/materials/usage/page.tsx` |
| Nav wiring (site) | `src/components/navigation/` — add Usage Ledger under Material-V2 |
| Nav wiring (company) | `src/components/navigation/` — add Material Usage under Company |

---

## Verification

1. **Migration**: Apply to local DB → confirm `batch_usage_records` has `section_id` + `v_material_usage_ledger` returns rows from both sources
2. **Dialog**: Log usage with section → `batch_usage_records.section_id` is set. Log without → amber nudge appears, row saves with `section_id = NULL`
3. **Site ledger**: Navigate to `/site/materials/usage-ledger` → By Material shows aggregated rows; expand → section breakdown. Switch to By Section → phases as top rows. Date filter changes row count. Untagged KPI count matches NULL rows
4. **Company page**: Scope selector switches between All / Group / Site → data changes. All Sites KPI shows per-site cost breakdown
5. **Build**: `npm run build` passes with no TypeScript errors