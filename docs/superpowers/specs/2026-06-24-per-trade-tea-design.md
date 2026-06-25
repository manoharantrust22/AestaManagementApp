# Per-trade tea splitting — design spec

_2026-06-24 · Phase 3, slice 2 (per-trade tea). Slice 1 (attendance+salary) + 1b (presentation) shipped; slice 3 (holidays) later._

## Context / problem

"Workspace-per-trade" gives each trade its own attendance + salary surface (slices 1/1b). Tea was
explicitly **excluded** from per-trade scoping because tea has **no trade dimension** today:

- Tea is tracked **per SITE** (`tea_shop_entries`: site_id / site_group_id, amounts, `is_group_entry`).
- A group bill is split across **sites** by each site's total `day_units` via the SQL trigger
  `recalculate_tea_shop_allocations_for_date()` (`supabase/migrations/20260105110000_attendance_tea_shop_auto_recalc.sql`)
  → `tea_shop_entry_allocations`. No trade is involved.
- `tea_shop_entries.percentage_split` (daily/contract/market) is **stored but never applied** — purely documentary.
- Per-date tea on the attendance page (`dateSummaries.teaShop`) = the site's entries + its allocated share
  of group entries. Site-level (`attendance-content.tsx`, `src/lib/data/attendance.ts`).

Owner's need (from real-life): when trades work together, the daily tea is split among the **labourers
who worked**, and each trade can control how it takes part — some trades don't take tea (electricians),
some share with another trade ("Civil provides for Painting"), some want their own separate tea.

## Decisions (approved in brainstorming)

1. **Per-trade tea mode** (set in Trade Management): **Off** / **Pool (with a host)** / **Own**.
2. **Pool** = a host trade + every trade that shares with that host. The pool has **one bill +
   settlement**, and the pool's daily tea is **split across its member trades by their present-labour
   share** (day_units). Each member trade bears **its own portion**, attributed to its workspace; they
   are billed/settled together. (Sharing is to a **specific** host, not a blanket common pool.)
3. **Own** = the trade is its own pool host — its own tea entries + settlement, separate.
4. **Off** = the trade takes no tea; ₹0 (e.g. Electrical). A trade not working a day → ₹0 automatically.
5. **Default preserves today**: every trade defaults to the **legacy common pool (host = Civil)** so the
   current one-site-tea behaviour is unchanged with **no data migration**; the owner then sets trades to
   Own / Off / share-with-X.
6. **Attribution lands on the trade's CONTRACT.** Each trade's tea share is recorded as a cost
   **against that trade's in-house contract** (Painting's tea reduced from the Painting contract,
   Civil's from Civil's) — via `tea_shop_settlements.subcontract_id` (which already exists) pointing at
   the trade's in-house detailed contract. So tea flows into the trade's contract economics/settlement,
   not just a display KPI. It is **not** deducted from individual labourer wages (it isn't today).
7. **Split basis:** the tea cost auto-splits by the **number of people working on each trade, per
   group-site** (day_units of present labourers per trade per site). So it follows attendance exactly.
8. **Entry-time clarity (required):** when the site engineer enters a tea bill, the dialog shows a
   **clear note/preview of the split** — e.g. "This ₹X → Civil ₹A, Painting ₹B (Site 1) … and will be
   added to each trade's contract" — so they see exactly where the cost lands before saving.

## Architecture

### a. Schema (additive)
- `labor_categories.tea_mode` enum `('pool','own','off')` NOT NULL DEFAULT `'pool'`.
- `labor_categories.tea_pool_host_category_id` uuid NULL, FK → `labor_categories(id)`. For `'pool'`
  trades = the host they share with (default = the site's Civil category id, backfilled). For `'own'`
  trades = self. For `'off'` = ignored. (A **pool** = host + all trades whose host = that host and
  mode ≠ off.)
- `tea_shop_entries.trade_pool_host_category_id` uuid NULL — the pool host a tea bill belongs to. NULL =
  the legacy common (Civil) pool. `'own'` trades' entries carry their own id. Same nullable column on
  `tea_shop_settlements` for per-pool settlement grouping.
- Backfill: existing entries/settlements → NULL (= Civil common pool), which is what they effectively are.

### b. Allocation — per-(site, date, trade) tea share (new SQL view/function)
`v_trade_tea_share(site_id, date, trade_category_id, amount)`:
- For a pool's daily tea total (sum of that pool's `tea_shop_entries`/allocations for the site+date),
  split across the pool's **member trades** by `Σ day_units of that trade's present labourers ÷ Σ day_units
  of all the pool's present, non-off labourers`. Labourer→trade via `laborers.category_id`; market via
  `labor_roles.category_id`. **Off** trades contribute 0 and receive 0.
- The existing `recalculate_tea_shop_allocations_for_date()` site/group split is **unchanged** for the
  cross-site allocation; this view adds the **within-pool, per-trade** attribution on top.

### c. Contract attribution + settlement
- Each trade's per-(site,date) tea share resolves to that trade's **in-house detailed contract** (via
  `ensure_trade_in_house_contract`, slice 1). Tea settlements for a pool are split into per-trade
  amounts and recorded against each member trade's contract through the existing
  `tea_shop_settlements.subcontract_id` (and surfaced in the trade's settlement/expense views). The
  vendor bill total is unchanged — Σ per-trade shares = the pool's tea total.

### d. Entry-time split preview (required)
- The tea-entry dialog (`src/components/tea-shop/TeaShopEntryDialog.tsx`) computes + shows the live
  **per-trade × per-site split** from current attendance before save ("₹X → Civil ₹A, Painting ₹B
  (Site 1) …; added to each trade's contract"), respecting Off/Own/Pool modes. The split it previews is
  the same one `v_trade_tea_share` produces server-side, so preview == result.

### e. Surfacing
- **Trade Management** (`company/settings/trades/page.tsx`): a per-trade tea control — Off / Pool(→ host
  picker) / Own (like the existing Workspace toggle pattern). Guarded sensibly (changing a trade with
  tea data warns, never deletes).
- **Attendance page** (slice 1b): when scoped to a trade, the **Tea KPI** (currently excluded → 0) shows
  **that trade's pool share** from `v_trade_tea_share`. Plain Civil/site view unchanged.
- **Tea-shop page** (`/site/tea-shop`): per-pool / per-trade breakdown; `'own'` trades record + settle
  their own tea scoped to them.

## Key files / seams
- New migration: `…_per_trade_tea.sql` (the 3 columns + `v_trade_tea_share` + backfill).
- `recalculate_tea_shop_allocations_for_date()` — only touched if the **site** allocation must exclude
  `off` trades' day_units (decide during planning; the per-trade view is the primary deliverable).
- `src/hooks/queries/useLaborCategories.ts` + `company/settings/trades/page.tsx` — tea-mode control.
- `src/app/(main)/site/attendance/attendance-content.tsx` — per-trade Tea KPI from the share view.
- `src/components/tea-shop/*`, `useCombinedTeaShop.ts` — `'own'` trade tea + per-pool display.

## Risk + mitigation
- **Don't disturb current tea.** Default mode `'pool'` + host = Civil + NULL-tagged existing entries =
  today's behaviour exactly; verify the site/group tea numbers are unchanged for an all-default config.
- **Financial.** The per-trade share is **attribution**, not a wage deduction; the vendor bill total is
  unchanged (the split sums back to the pool total). Verify Σ per-trade shares = pool tea total.

## Non-goals (this slice)
- No tea deducted from individual labourer wages.
- No new tea **vendor** accounts per trade (a pool reuses the site's tea shop vendor).
- Holidays per trade (slice 3); the payments secondary-tab scoping (separate follow-up).

## Verification
- Unit: `v_trade_tea_share` math (split sums to the pool total; off-trade = 0; absent-trade = 0).
- Read-only data check: with all trades default ('pool', host Civil), per-site tea totals match today.
- Live (reversible, non-Civil): set Painting → Own and Electrical → Off; enter a tea bill; confirm
  Painting's workspace shows its share, Electrical shows 0, Civil unchanged; reverse the test writes.
