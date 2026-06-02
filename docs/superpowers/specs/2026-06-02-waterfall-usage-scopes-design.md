# Waterfall Log-usage — scopes, readable batches, prior usage

## Context
The `WaterfallUsageDialog` (shipped 2026-06-02, `origin/main` `…ea14b41`) opens material-scoped and waterfalls a total across all of a material's group batches oldest→newest. Live feedback surfaced four gaps:
1. No way to log against **only the one batch** the user clicked — it always spans the whole material.
2. Batch rows lead with the cryptic `MAT-260314-DDD5` ref code, which means nothing to users.
3. **Prior usage isn't visible** — rows show "1 cft left" but not "2 used / 3 total" or who logged it.
4. No way to restrict the waterfall to **batches purchased in a date window**.

All four are refinements to the single component `src/components/materials/WaterfallUsageDialog.tsx` (plus a one-line default-scope hint from each of its two call sites). No new RPC: `record_batch_usage_waterfall` already accepts 1‑to‑N allocations, so a single batch is a 1-row waterfall.

## Decisions (confirmed with user)
- Default scope opening from a **Hub thread = This batch**; from an **Inventory material card = All material**.
- "Log the site's total usage" == the **All material** waterfall (no separate bulk-materials feature).
- Date filter works on each batch's **purchase date**; out-of-range batches are **hidden**.

## Design

### 1. Scope control (segmented toggle at top)
`scope: "batch" | "all" | "range"` drives which candidate batches are in play; the rows/cost machinery below is unchanged.
- **This batch** — candidates filtered to `preselectedBatchRefCode`. Single quantity input, **no** total field / reconciler. Empty state ("this batch is fully used — switch to All") when its remaining is 0.
- **All [material]** — every batch, oldest→newest (current behaviour).
- **By date range** — `<DateRangePicker standalone>` (`src/components/common/DateRangePicker.tsx`, reuses presets This week/month/custom); candidates filtered to `purchase_date ∈ [start,end]`; waterfall fills only the shown batches.
- Total box + "Allocated X / Y" reconciler render only for `all`/`range`. Changing scope resets the allocation (candidate signature changes → rows rebuild).
- New prop `defaultScope?: "batch" | "all"` (default `"all"`). Hub passes `"batch"`; Inventory passes `"all"`.

### 2. Readable batch rows
`BatchRowState` gains `vendorName`, `used`, `original`.
- Headline: **`Bought {purchaseDate} · {vendorName}`**; ref code demoted to a faint monospace tag.
- Sub-line: **`{used} used / {original} total · {remaining} left`**.
- Keep the existing self-use / "Owes {payer}" chip, fill bar, and `Use` input.

### 3. "Previously logged" (free — data already fetched)
`useGroupBatchUsageRecords` already returns every usage record for the group. Group them by `batch_ref_code` (+ material/brand) and render a collapsible per-row line: `{usage_date} · {usage_site name} · {qty}`. Collapsed by default.

## Out of scope (YAGNI)
Bulk multi-material entry; editing prior usage from this dialog (that stays in the existing edit/delete flow); own-stock (still group-only).

## Verification
- `npm run build` + tsc clean.
- Playwright on `/site/materials/hub`: Hub thread → opens **This batch**; toggle **All** → waterfall; toggle **By date range** → only in-range batches; rows show vendor+date + used/total; expand "previously logged". Inventory card → opens **All material**.
- Submit still calls `record_batch_usage_waterfall` (1 alloc in batch mode); atomicity unchanged.
