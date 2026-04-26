# Salary Settlement UX Redesign — Design Spec

- **Date:** 2026-04-26
- **Scope:** Redesign `/site/payments`, surface settle-from-attendance flows, introduce a portable Inspect Pane pattern across `/site/payments`, `/site/expenses`, and `/site/attendance`. Bundles the deferred ScopeChip / Fullscreen / single-scroll rollout for `/site/payments` and `/site/expenses` from the prior spec.
- **Builds on:** `docs/superpowers/specs/2026-04-24-global-date-filter-ux-redesign-design.md` (uses the `ScopeChip` / `useDateRange` / Fullscreen / single-scroll pattern that was previously deferred for these two pages).
- **Out of scope:** mobile redesign of attendance itself, bulk-settlement actions (settling many dates at once), reports / export, settlement editing UX redesign (existing edit dialogs are reused as-is).

---

## 1. Problem statement

Three layered problems:

1. **`/site/payments` feels clumsy.** Redundant page-level + per-tab refresh buttons. Status and subcontract filters that nobody uses. Two tabs ("Daily & Market" / "Contract Weekly") that hide content. A bulky summary card. Pending settlements (the work the user is here to do) are buried under completed history.
2. **Settlement actions live on the wrong page.** Attendance is the source-of-truth for the data. Users naturally complete the day's attendance and then have to navigate to `/site/payments` to settle it. The two existing settlement dialogs (`DailySettlementDialog`, `WeeklySettlementDialog`) already live in `src/components/attendance/` — the bones are there, but they aren't surfaced from attendance row-level actions.
3. **Cross-page verify is the dominant pain.** Today, clicking a ref code on `/site/expenses` navigates to `/site/payments?highlight=...`, and clicking a ref on `/site/payments` would navigate to `/site/attendance` — both navigations are slow, lose scroll position, often fail to clearly highlight the right row, and make side-by-side comparison impossible. The user described wanting to *see settlement and attendance together* while deciding whether the settlement is correct.

## 2. Solution overview

Three concurrent moves, all part of one cohesive UX:

1. **Settle-from-Attendance is primary; `/site/payments` keeps fallback settle capability.** Surface the existing `DailySettlementDialog` and `WeeklySettlementDialog` from row-level CTAs on `/site/attendance`. The same dialogs remain reachable from row actions on `/site/payments` so a user noticing a missed day in the ledger can settle without bouncing to attendance.
2. **`/site/payments` becomes a premium ledger** — pending-first, single unified table, compact summary strip, ScopeChip + Fullscreen + single-scroll layout (matches attendance). Tabs, redundant refresh, unused filters, and the page-level `ScopePill` strip are deleted.
3. **Inspect Pane** — a portable right-side pane that mounts on all three pages. Click a settlement row (or a settlement ref code on expenses) and the pane opens in-place with the full attendance + settlement + audit context for that entity. No page navigation. Side-by-side verification *is* the default behaviour.

## 3. Settle-from-Attendance flow

### 3.1 Existing components — reused as-is

- `src/components/attendance/DailySettlementDialog.tsx`
- `src/components/attendance/WeeklySettlementDialog.tsx`

These dialogs already handle the settlement transactions end-to-end (call `processSettlement` / `processWeeklySettlement` services, write to `settlement_groups`, generate refs, link to expenses). No redesign of the dialogs themselves.

### 3.2 New entry points on `/site/attendance`

- **Per-day row.** When a date row has any pending money (daily salary unpaid OR market-laborer entries unpaid OR tea-shop unpaid), append a primary "₹ Settle ₹X" button at the right of the row. Click → opens `DailySettlementDialog` with that date's records prefilled.
- **Per-week strip.** Where the existing weekly view groups attendance by week (the `WeeklyPaymentStrip` / `WeekGroupRow` components), each contract laborer with pending weekly money gets a "Settle Week" button at the row level. Click → opens `WeeklySettlementDialog` with that laborer-week prefilled.
- **Settled day rows** display a small `📌 SS-0421` chip (settlement ref) next to the date label. Clicking the chip opens the Inspect Pane (see §5) — does not navigate.

### 3.3 New entry points on `/site/payments`

- **Pending row** in the new ledger gets a primary green "Settle ₹X" button (replaces the `⋯` menu for pending rows). Click → opens the same `DailySettlementDialog` or `WeeklySettlementDialog` based on row type.
- **Completed row** keeps the `⋯` menu with Edit / Cancel actions, plus an "Inspect" entry that opens the pane.

### 3.4 Post-settlement behaviour

After any successful settlement (from any entry point):

- Invalidate React Query caches for: attendance summary, payment summary, expenses summary on the affected site + date range.
- Refetch on the visible page so the row state updates without a full reload.
- If the settlement was triggered from inside the Inspect Pane (paying a pending row from the ledger), the pane updates its content in place — does not close.

## 4. `/site/payments` page redesign

### 4.1 Things removed

| Element | Reason |
|---|---|
| Page-level `<Tabs>` ("Daily & Market" / "Contract Weekly") | Replaced by single unified table with type filter chips. |
| Per-tab `Refresh` buttons (`DailyMarketPaymentsTab`, `ContractWeeklyPaymentsTab`) | Global refresh in MainLayout already exists. |
| `filterStatus` local state and Status `<Select>` | Replaced by Pending / Completed / All chip row. |
| `filterSubcontract` local state and Subcontract `<Select>` | Removed entirely (user reports unused). Re-introduce only if a user explicitly requests it. |
| `<ScopePill>` (the wide informational strip from the older pattern) | Replaced by `ScopeChip` in `PageHeader` title row (per global-date-filter spec). |
| Per-tab `useFullscreen` (the `tableContainerRef` fullscreen) | Replaced by page-level fullscreen toggle (matches attendance). |
| "Back to Expenses" `<Button>` (rendered when `?highlight=...`) | Inspect Pane removes the navigation that needed it. |
| `PaymentSummaryCards` component | Replaced by compact 4-KPI strip. |

### 4.2 Things added

A. **`PageHeader` with `ScopeChip` + Fullscreen icon.** Same shape as attendance — title "Salary Settlements", chip in the title row, Fullscreen icon in actions.

B. **Compact 4-KPI summary strip** below the header (single row, dividers between cells, no big card surrounding it):

| Order | Label | Value | Sub | Color |
|---|---|---|---|---|
| 1 | Pending | ₹ sum of pending | "N dates" | warning amber |
| 2 | Total Paid | ₹ sum of paid in scope | "N settled" | success green |
| 3 | Daily + Market | ₹ paid in scope, daily+market only | "N dates" | neutral |
| 4 | Weekly Contract | ₹ paid in scope, weekly only | "N records" | neutral |

KPIs respect the global `useDateRange()` scope. When `isAllTime`, the Pending KPI counts ALL pending across the site (not date-filtered) and is labeled accordingly.

C. **Pending banner** (amber-tinted strip below summary, only when pending count > 0):

> ⚠ N dates have unsettled attendance · ₹X pending  &nbsp;&nbsp; **[Settle in Attendance →]**

The button deep-links to `/site/attendance` with the most recent pending date scrolled into view (no auto-open of any modal — user just lands on attendance and uses the row-level Settle button).

D. **Filter chip row** (replaces the deleted Status / Subcontract selects):

```
[ ⏳ Pending (N) ]  [ ✓ Completed (N) ]  [ All ]    |    [ All Types ]  [ Daily+Market ]  [ Weekly Contract ]
```

- Status chips (Pending/Completed/All) are mutually exclusive. Default = "All".
- Type chips (All Types / Daily+Market / Weekly Contract) are mutually exclusive. Default = "All Types".
- Filter chips re-query the data; default sort still puts pending rows on top regardless of filter.

E. **Single unified `<DataTable>`** replaces both old tabs:

| Column | Source | Notes |
|---|---|---|
| Ref | `settlement_reference` | Chip, monospace, small. Empty for pending rows (show em-dash). |
| Date / Period | single date for daily+market; date range for weekly | Sortable. |
| Type | derived | Pill: `Daily+Mkt` (blue) or `Weekly` (amber). |
| For | derived | "12 lab + 3 mkt" for daily+market, "Murugan · 6d" for weekly. |
| Amount | total | Right-aligned, tabular nums, bold. |
| Status | derived | `Pending` (amber) or `Paid` (green). |
| Action | — | `Settle ₹X` button (green primary) when pending; `⋯` menu when completed. |

Row tinting: pending rows get a subtle amber-tinted background. Selected row (pane open) gets a left-border accent in primary blue.

F. **Single-scroll layout** (per global-date-filter spec §5a.1):

- `PageHeader`, summary strip, pending banner, filter chip row → `flexShrink: 0`.
- Table region → `{ flex: 1, minHeight: 0, overflow: 'auto' }`.
- Document body has no scrollbar at viewport heights ≥ 900px; only the table scrolls.

### 4.3 Sort behaviour

- Default: pending rows pinned to top (sorted most-recent first within pending), then completed rows sorted most-recent first below.
- Clicking any column header sorts within both groups (pending stays pinned).
- A "↕ Sort: Pending first" toggle in the filter row lets the user disable the pinning if desired (off by default).

### 4.4 Daily+Market merge in row representation

A "row" in the daily+market half of the ledger represents a *date*, not a settlement transaction. If a date had:

- 12 daily laborers paid ₹14,200 and 3 market laborers paid ₹3,800 and tea-shop ₹400 → **one row**: `21 Apr · Daily+Mkt · 12 lab + 3 mkt · ₹18,400`.
- The settlement *reference* on that row is the daily settlement's `settlement_reference`. If multiple settlements exist for the same date (rare — split payment across payers), show the row once with the *primary* ref and a small `+1 more` indicator that drills into the Inspect Pane.

A "row" in the weekly contract half represents a *laborer × week*. A weekly settlement for 4 contract laborers in week 16 shows as **4 rows** (one per laborer).

## 5. Inspect Pane

### 5.1 Component layout

- **New file:** `src/components/common/InspectPane/InspectPane.tsx` (shell — header, tabs, breakpoint logic).
- **New files:** `src/components/common/InspectPane/AttendanceTab.tsx`, `WorkUpdatesTab.tsx`, `SettlementTab.tsx`, `AuditTab.tsx`.
- **New hook:** `src/hooks/useInspectPane.ts` — manages `{ isOpen, isPinned, currentEntity, open(), close(), togglePin() }`. Page-scoped (one pane per page).

### 5.2 Open / close behaviour

| State | UI |
|---|---|
| Closed | No pane DOM rendered. Selected row (if any) keeps its highlight until user clicks elsewhere. |
| Open | Pane visible with content for `currentEntity`. Clicking a different row updates `currentEntity` (pane stays open if pinned; otherwise replaces content). |
| Pinned | Same as Open, but clicking the same row again does not close the pane (pin button toggle). Clicking ✕ or pressing `Esc` is the only way to close. |

- **Auto-open: never.** URL params (`?ref=X`) only highlight the matching row; user must click to open the pane. This applies whether the user lands on a page from a deep link, from the pending banner, or from the Inspect Pane's own ↗ Open button on another page.
- **Close:** ✕ button in pane header, or `Esc` key (only when no dialog/modal is layered above).

### 5.3 Breakpoint behaviour

| Viewport width | Pane behaviour |
|---|---|
| ≥ 1280px | **Overlay drawer** (per user choice — 2026-04-26). Pane floats above the right side of the table at 480px width. Background is NOT dimmed; the table stays visible and interactive underneath. Pane has a soft drop-shadow. |
| ≥ 600px and < 1280px | Same overlay drawer at 420px width. |
| < 600px (mobile) | Full-width slide-over. Background is dimmed; only one of {table, pane} interactive at a time. |

The user explicitly chose overlay (rather than push-the-table-narrower) because shrinking the table doesn't help — the table being scannable matters more than the pane being non-overlapping.

### 5.4 Pane header

| Element | Daily row | Weekly row |
|---|---|---|
| Title | `📅 21 Apr · Mon` | `👤 Murugan · Week 14–20 Apr` |
| Subtitle | `SS-0421 · Site: <site name>` | `WS-W16-01 · Site: <site name> · Mason` |
| Actions | `↗ Open` (navigate to attendance), `📌 Pin`, `✕ Close` | same |

### 5.5 Pane tabs

Four tabs in fixed order: **Attendance · Work Updates · Settlement · Audit**.

#### Attendance tab — daily-row shape

- Three small total tiles: Daily, Market, Tea Shop.
- Section "Daily Laborers (N)" — list of `{name · role · full/half · ₹amount}` rows.
- Section "Market Laborers (N)" — list of `{role · count · ₹amount}` rows.
- Both lists collapse to "… N more" after 4 entries with an expand affordance.

#### Attendance tab — weekly-row shape

- Three total tiles: Daily Salary, Contract, Total.
- Section "Per-day breakdown for <name> (N of 7 days)" — 7-cell grid (Mon–Sun) color-coded by attendance status (full / half / off / holiday) with per-day amount on each cell.
- Section "Salary breakdown" — math: `daily salary = N days × ₹rate`, `contract = formula`, `total = sum`.
- Section "Days didn't work this week" — answers the silent "why wasn't he paid for X day" question.

#### Work Updates tab

- Daily row: shows morning + evening updates for that date (notes, photos, who entered).
- Weekly row: groups updates by date for the days that laborer was present.
- Photos are thumbnails (56×56) — click opens the existing `PhotoFullscreenDialog` from `src/components/attendance/work-updates/`.

#### Settlement tab

- Read-only summary of the settlement transaction: payer, payment mode, channel, ref code, date paid, who recorded it.
- "Linked expense" row showing the ref code from `/site/expenses` (clickable — opens nothing, just informational, since user is already on the inspect pane).
- For pending entities: shows "Not yet settled" with a primary `Settle ₹X` button that opens the same dialog used elsewhere.

#### Audit tab

- Chronological list of audit events: created, edited, cancelled. Each event shows timestamp, actor, brief diff.
- Reuses existing audit data already stored on `settlement_groups` and related tables.

### 5.6 Data fetching

- Pane state is page-scoped React state (no Zustand / context).
- Tab content lazy-loads on tab activation (Attendance is the default open tab and pre-loads).
- Data is fetched via existing React Query hooks:
  - Attendance for date / week → `useAttendance` (existing).
  - Work updates → existing work-updates hook (`WorkUpdatesSection`'s data source).
  - Settlement details → existing settlement hooks.
  - Audit → new lightweight hook (`useSettlementAudit`) that reads settlement-history rows.
- Cache key includes `{ siteId, entityType ('daily-date' | 'weekly-laborer-week'), entityKey (date | laborerId+weekStart) }`.
- Stale-while-revalidate: cached content shows immediately; refresh runs in background.

### 5.7 Mounting on each page

| Page | Trigger that opens the pane | Default selected row on entry |
|---|---|---|
| `/site/payments` | Click any row in the new ledger table. | None (URL-pre-selected row is highlighted only). |
| `/site/expenses` | Click a settlement-related ref code chip (`SS-`, `DLY-`, `WS-`) in the data table. | None. |
| `/site/attendance` | Click the `📌 SS-0421` chip on a settled day row, or the equivalent chip on a settled week strip. | None. |

## 6. Cross-page rule

- **Ref-code clicks NEVER navigate to another page.** They open the Inspect Pane on the page the user is already on. This applies to the daily settlement chip on `/site/expenses`, the row click on `/site/payments`, and the settlement chip on `/site/attendance`.
- **The `↗ Open` button in the pane header is the explicit navigation escape hatch.** From `/site/payments`'s pane → opens `/site/attendance` with the relevant date or week pre-filtered. From `/site/expenses`'s pane → opens `/site/payments` with the row pre-highlighted. From `/site/attendance`'s pane → opens `/site/payments` with the row pre-highlighted.
- **The pending banner on `/site/payments`** is the single exception that does navigate — to `/site/attendance` — because the user is going there to do work (settle), not to look up context.

## 7. Files changed

| Path | Nature | Notes |
|---|---|---|
| `src/app/(main)/site/payments/payments-content.tsx` | Rewrite | Drop tabs, drop ScopePill, drop Back-to-Expenses button, drop summary card. New: ScopeChip + Fullscreen header, summary strip, pending banner, filter chips, unified DataTable, single-scroll layout. Mount Inspect Pane. |
| `src/components/payments/DailyMarketPaymentsTab.tsx` | Refactor → delete | Logic merges into a new `PaymentsLedger` component (or absorbed into `payments-content.tsx`). Drop refresh button, drop status filter, drop subcontract filter, drop per-tab fullscreen. |
| `src/components/payments/ContractWeeklyPaymentsTab.tsx` | Refactor → delete | Same as above. |
| `src/components/payments/PaymentSummaryCards.tsx` | Replace | New compact 4-KPI strip component (or inline into `payments-content.tsx`). |
| `src/components/common/InspectPane/InspectPane.tsx` | **New** | Shell — header, tabs, breakpoint switch (overlay vs full-width slide). |
| `src/components/common/InspectPane/AttendanceTab.tsx` | **New** | Daily-shape vs weekly-shape content. |
| `src/components/common/InspectPane/WorkUpdatesTab.tsx` | **New** | Notes + photos for date(s). |
| `src/components/common/InspectPane/SettlementTab.tsx` | **New** | Payer / mode / ref / history + Settle button when pending. |
| `src/components/common/InspectPane/AuditTab.tsx` | **New** | Audit log. |
| `src/hooks/useInspectPane.ts` | **New** | Page-scoped open / pinned / currentEntity state. |
| `src/hooks/useSettlementAudit.ts` | **New** | Lightweight audit fetch hook. |
| `supabase/migrations/<date>_add_payment_summary_rpc.sql` | **New** | Server-side aggregate matching `get_expense_summary`'s shape — returns `{ total, paid, pending, by_type }` per `{site_id, date_from, date_to}`. |
| `src/app/(main)/site/expenses/page.tsx` | Edit | (a) Adopt `ScopeChip` + Fullscreen + single-scroll (deferred from prior spec). (b) Replace ref-code `router.push(...)` calls (currently around lines 648–666) with `inspectPane.open({ ref })`. (c) Mount Inspect Pane. |
| `src/app/(main)/site/attendance/attendance-content.tsx` | Edit | (a) Add per-day "₹ Settle ₹X" button when pending money exists on the row. (b) Add per-week "Settle Week" button on weekly view's laborer rows. (c) Add `📌 SS-…` chip on settled day rows that opens the Inspect Pane. (d) Mount Inspect Pane. |
| `src/components/attendance/DailySettlementDialog.tsx` | Reuse, no change | Triggered from new entry points. |
| `src/components/attendance/WeeklySettlementDialog.tsx` | Reuse, no change | Triggered from new entry points. |
| `src/components/common/ScopeChip.tsx` | Reuse | From prior spec — already built or being built on the current branch. |

## 8. Non-functional requirements

- **Mobile (< 600px):** inspect pane is full-width slide-over with dim. Settle buttons remain tappable. KPI strip wraps to two rows. Pending banner is its own row above the table.
- **Keyboard:** `Esc` closes pane (precedence: dialog > pane > fullscreen). `Tab` cycles into the pane after the table when open. Arrow up/down moves row selection (pane updates if open). Pane controls (close, pin, ↗ Open) all keyboard-reachable.
- **Performance:**
  - Pane open → first paint ≤ 100ms (cached) or skeleton + ≤ 500ms data load.
  - Filter chip change → re-query in ≤ 300ms for the typical 200-row scope; uses existing 2,000-row table cap.
  - Pending KPI is computed server-side via a new `get_payment_summary` RPC modeled on the existing `get_expense_summary` (added in migration `20260424120000_add_expense_summary_rpc.sql`) — no client-side aggregation over all rows. Today the per-tab summaries on `/site/payments` are computed client-side; this redesign moves them to an RPC for the same accuracy guarantee that expenses already enjoys at All Time scope.
- **Accessibility:**
  - Pane is `role="complementary"` with `aria-label="Inspector for <ref>"`.
  - Status chips have `aria-pressed`.
  - Settle button is a real `<button>` with `aria-label="Settle <amount> for <date or laborer-week>"`.
  - Row click → pane open is keyboard-equivalent (Enter on the focused row).
- **Persistence:**
  - Pinned state is *not* persisted — opening the pane fresh starts unpinned each time.
  - Filter chip selection is *not* persisted in URL or localStorage (default Pending+Completed=All, Type=All Types on every page load).
  - Date range continues to be persisted via the existing `DateRangeProvider`.

## 9. Testing plan

Per `CLAUDE.md` UI-change workflow — Playwright MCP on `localhost:3000`, auto-login via `/dev-login`. All scenarios on a site that has both completed settlements and at least 2 pending dates and 1 pending weekly laborer.

**`/site/payments` ledger:**

1. **Default state**: page loads with no tabs, KPI strip visible, pending banner visible (count matches), pending rows pinned to top with green Settle buttons, completed rows below.
2. **Filter chip "Pending"**: only pending rows visible, KPI Pending tile unchanged.
3. **Filter chip "Completed"**: only completed rows visible, banner remains visible.
4. **Type chip "Weekly Contract"**: only weekly rows visible.
5. **Sort by Amount**: pending rows still pinned above completed rows.
6. **Pending banner click**: navigates to `/site/attendance` with the most recent pending date scrolled into view; no modal auto-opens.
7. **ScopeChip behaviour**: matches attendance behaviour from the prior spec.
8. **Fullscreen toggle**: hides app sidebar and top bar, ScopeChip remains visible inside fullscreen.
9. **Single-scroll**: at 1920×1080 the document body has no scrollbar — only the table region scrolls.

**Inspect Pane (on `/site/payments`):**

10. **Click a daily row → pane opens** with Attendance tab active, totals + laborer list rendered, header shows date + ref.
11. **Click a weekly row → pane opens** with 7-day strip + salary breakdown rendered.
12. **Click a different row → pane content updates** (in-place, pane stays open if pinned, replaces content if not pinned).
13. **Pin button**: clicking again does not close pane; ✕ closes; `Esc` closes.
14. **Tab switching** (Attendance → Work Updates → Settlement → Audit): each tab loads its content (skeleton then data), no console errors.
15. **Settle a pending row from the pane's Settlement tab**: opens the dialog, completes the settlement, pane content updates to show the new ref + paid status, ledger row moves out of the pending group.
16. **Pane on narrow viewport (1100px)**: opens as overlay drawer, table beneath stays interactive, no dim.
17. **Pane on mobile (390px)**: opens as full-width slide-over with dim.

**Cross-page Inspect Pane (on `/site/expenses`):**

18. **Click a `SS-`/`DLY-`/`WS-` ref code chip → Inspect Pane opens on the expenses page**, no navigation, URL unchanged.
19. **Pane content**: shows correct settlement + linked attendance.
20. **`↗ Open` button**: navigates to `/site/payments` with the row highlighted (no auto-open of pane).

**Cross-page Inspect Pane (on `/site/attendance`):**

21. **Settled day row** shows the `📌 SS-…` chip; click it → Inspect Pane opens on attendance.
22. **`↗ Open` button**: navigates to `/site/payments` with the row highlighted.

**Settle-from-Attendance:**

23. **Pending day row** on attendance shows "₹ Settle ₹X" button; click → `DailySettlementDialog` opens prefilled.
24. **Pending weekly laborer row** shows "Settle Week" button; click → `WeeklySettlementDialog` opens prefilled.
25. **After successful settle**: row updates from pending → settled state, ref chip appears, banner counts on `/site/payments` decrement on next visit.
26. **Console clean**: zero errors/warnings across all 25 scenarios. `playwright_close` at the end.

## 10. Risks & edge cases

| Risk | Mitigation |
|---|---|
| Removing the Daily / Contract Weekly tabs may disorient long-time users. | Pending banner + Type filter chips give immediate visual cues; a one-time toast on first visit ("Settlements are now in one ledger — use the chips above to filter by type") helps the transition. |
| 1280px breakpoint may be wrong — 1366px laptop has ~880px table behind a 480px overlay pane, may feel cramped. | Pane is overlay (not push), so the table doesn't shrink — width perception is preserved. If complaints, lower to 1024px or make pane width responsive. |
| Inspect Pane content fetch slow → feels worse than navigation. | Cache-first via React Query, prefetch on hover (50ms delay), skeleton loaders. Hard target ≤ 500ms; investigate if we hit it. |
| Per-day `₹ Settle` button on attendance row crowds the row on mobile. | Button collapses to icon-only (`₹`) at < 600px; full label returns on tap. |
| Multiple settlements on the same date (split payment across payers) breaks the "one row per date" model on the ledger. | Show one row with the primary ref and a `+N more` indicator inside the For column; click row → Inspect Pane shows all linked settlements. |
| `📌 SS-…` chip on attendance day rows competes for space with existing chips. | Place chip rightward, after attendance count chips; on mobile collapse to a small `💰` icon. |
| Inspect Pane open while user changes the global date range → currentEntity may fall outside scope. | Pane stays open with a small "Out of current scope" banner; user can close manually. Date range change does not auto-close the pane. |
| Settle from Inspect Pane while other rows are visible: the underlying ledger query may stale during the transaction. | React Query optimistic update on the affected row; re-fetch on dialog close. |
| `/site/expenses` ref-codes that don't have a matching settlement (e.g. `MISC-`, `TSS-`, `SCP-`) currently navigate to other pages. | Inspect Pane is registered only for settlement-prefix refs (`SS-`, `DLY-`, `WS-`). Other ref types keep their existing navigation behaviour. |

## 11. Explicitly out of scope

- Mobile redesign of the attendance page itself (still uses today's design + the new Settle buttons inline).
- Bulk settlement actions (settle multiple dates in one operation).
- Settlement-edit dialog redesigns — `DailySettlementEditDialog`, `ContractSettlementEditDialog`, etc., are reused as-is.
- Reports / CSV export of the ledger.
- Multi-laborer drill-down beyond what the daily Inspect Pane shows inline.
- Replacing the existing settlement service layer (`settlementService.ts`).
- Fiscal-period or quarterly KPIs on the summary strip.
- Push notifications for pending settlements (separate concern).

## 12. Success criteria

- `/site/payments` has no tabs, no redundant refresh, no unused filters, no `ScopePill` strip.
- Pending settlements are pinned to the top of the ledger with primary green "Settle ₹X" buttons.
- KPI strip is one compact row (Pending, Total Paid, Daily+Market, Weekly Contract).
- Pending banner appears above the table when pending count > 0 and links to attendance.
- `ScopeChip` + Fullscreen toggle + single-scroll layout match the attendance pattern.
- `/site/attendance` has row-level Settle buttons that open the existing settlement dialogs.
- Click any settlement-related ref code on `/site/expenses` → Inspect Pane opens in-place (no navigation).
- Click any row on `/site/payments` → Inspect Pane opens with correct daily-shape or weekly-shape Attendance tab.
- Click `📌 SS-…` chip on `/site/attendance` settled day → Inspect Pane opens.
- The `↗ Open` button is the only path that navigates between the three pages; pending banner is the only banner that navigates.
- All 26 Playwright scenarios in §9 pass cleanly with zero console errors.
