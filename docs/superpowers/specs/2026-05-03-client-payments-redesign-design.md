# Site Client Payments — Redesign + Additional Works (Design Spec)

## Context

The user has been frustrated since the start of the app about where to track **client payments** for a site, and especially how to record **additional works** (variation orders) the client requests mid-project. Today:

- A `/site/client-payments` page exists but the user didn't know about it. Its UI is built on an older MUI Card pattern, doesn't match the salary-settlement design language they like, and offers no clear "where do I stand" rollup.
- The schema **has no model** for additional works / variation orders / change orders — confirmed gap.
- "Money left in our hand" (client received minus supervisor cost spent) is not surfaced anywhere.

**Outcome we want:** one page that answers, at a glance, "what does this client owe me, what have they paid, what additional work has been added, and what's left in my hand after paying supervisors?" Built using the same `MobileCollapsibleHero` + `KpiTile` + tabs + `InspectPane` design language as the salary-settlement page at [src/app/(main)/site/payments/payments-content.tsx](../../../src/app/(main)/site/payments/payments-content.tsx).

Scope decisions confirmed in brainstorming:
- **Phasing:** optional (Option B) — let user split base contract into phases if they want, otherwise treat as a single line item
- **Payment tagging:** hybrid (Option 3) — payments default to a general pot; user can optionally tag a payment to a specific phase or additional work
- **Supervisor cost:** lives elsewhere (settlements / subcontracts), but its rollup number surfaces on this page in the hero

---

## Page structure — `/site/client-payments`

Rebuild [src/app/(main)/site/client-payments/page.tsx](../../../src/app/(main)/site/client-payments/page.tsx). Shape mirrors [src/app/(main)/site/payments/payments-content.tsx](../../../src/app/(main)/site/payments/payments-content.tsx).

```
PageHeader: "Client Payments — <Site Name>"
│
MobileCollapsibleHero (Site Money Overview — see below)
│
Tabs (3, persisted in localStorage):
  1. Contract            — base contract + optional phases
  2. Additional Works    — variation orders (NEW)
  3. Payments Received   — all incoming payments, tagged or untagged
│
Tab content area (list/table per tab + add buttons)
  + InspectPane on row click (drill-down: history, edit, attach receipt)
```

---

## Site Money Overview hero

Six `KpiTile`s in a responsive grid (2 cols mobile → 3 tablet → 6 desktop), wrapped in `MobileCollapsibleHero`. Below tiles: a single-line collected-progress bar (color: <50% red, <80% orange, ≥80% green — same logic as salary settlement).

| # | Label | Variant | Source |
|---|---|---|---|
| 1 | BASE CONTRACT | neutral | `sites.project_contract_value` |
| 2 | ADDITIONAL WORKS | info | sum of `site_additional_works.confirmed_amount` where status ≠ `cancelled` |
| 3 | TOTAL CONTRACT | neutral (bold) | base + additional |
| 4 | CLIENT PAID | success | sum of `client_payments.amount` for site |
| 5 | REMAINING FROM CLIENT | warning | total − paid |
| 6 | NET IN HAND | success / error | client paid − supervisor cost spent on this site |

**Mobile collapsed state:** single-row strip shows REMAINING FROM CLIENT (the actionable number), tap to expand.

**Second placement:** condensed 3-tile version (Total Contract / Remaining / Net in Hand) on the site dashboard `/site` landing, so the engineer sees the picture without clicking in.

---

## Data model — Additional Works

**New table: `site_additional_works`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `site_id` | uuid FK → sites | |
| `title` | varchar(255) | e.g. "Extra balcony — east side" |
| `description` | text | full scope |
| `estimated_amount` | numeric(15,2) | what we quoted |
| `confirmed_amount` | numeric(15,2) nullable | client-agreed amount (null until confirmed) |
| `confirmation_date` | date nullable | when client agreed |
| `expected_payment_date` | date nullable | promised by client |
| `status` | enum | `quoted`, `confirmed`, `paid`, `cancelled` |
| `quote_document_url` | text nullable | written quote PDF/image |
| `client_approved_by` | varchar(255) nullable | free-text name of approver |
| `notes` | text nullable | |
| `created_by` | uuid FK | |
| `created_at`, `updated_at` | timestamps | |

**Status auto-derivation:**
- `quoted` — only `estimated_amount` filled
- `confirmed` — `confirmed_amount` + `confirmation_date` filled
- `paid` — sum of tagged payments ≥ `confirmed_amount` (auto, computed)
- `cancelled` — manual flag; row remains visible with strike-through (preserves history)

---

## Tagging payments to phases / extras (hybrid)

Add **two nullable columns** to existing `client_payments`:

| Column | Type | Notes |
|---|---|---|
| `tagged_additional_work_id` | uuid FK → `site_additional_works`, nullable | "this payment is for Extra #3" |
| `tagged_phase_id` | uuid FK → `payment_phases`, nullable | "this payment is for Phase 2 of base contract" |

Both nullable. **DB check constraint** ensures mutual exclusion (only one of the two can be set on any row). Untagged payments flow into the general "received" pot.

UI: small **"Apply to: [General / Base Phase X / Extra Y]"** dropdown on the Record Payment dialog. Defaults to General — never forces the user to tag.

---

## Supervisor cost source

In this app, "supervisor" = mesthri team leaders, paid through the subcontracts → settlements flow. No pre-computed rollup exists.

Add a SQL function in the same migration:

```sql
get_site_supervisor_cost(site_uuid) RETURNS numeric
-- sum of subcontract_payments.amount
-- where subcontract.site_id = site_uuid
-- and subcontract.contract_type = 'mesthri'
```

Wrapped in a React Query hook. Used to compute the `NET IN HAND` tile.

**v1 caveat:** if supervisors are also paid via daily attendance wages, the number is partial. Tile is labeled accordingly. Extension deferred.

---

## Files

**New:**
- `supabase/migrations/<timestamp>_site_additional_works.sql` — table + ALTERs + function + RLS + indexes
- [src/hooks/queries/useSiteAdditionalWorks.ts](../../../src/hooks/queries/useSiteAdditionalWorks.ts) — CRUD hooks
- [src/hooks/queries/useSiteFinancialSummary.ts](../../../src/hooks/queries/useSiteFinancialSummary.ts) — combined rollup hook (powers the hero)
- [src/components/client-payments/SiteMoneyOverviewHero.tsx](../../../src/components/client-payments/SiteMoneyOverviewHero.tsx) — the 6-tile hero
- [src/components/client-payments/AdditionalWorksTab.tsx](../../../src/components/client-payments/AdditionalWorksTab.tsx)
- [src/components/client-payments/AdditionalWorkDialog.tsx](../../../src/components/client-payments/AdditionalWorkDialog.tsx) — add/edit
- [src/components/client-payments/ContractTab.tsx](../../../src/components/client-payments/ContractTab.tsx) — base + phases
- [src/components/client-payments/PaymentsReceivedTab.tsx](../../../src/components/client-payments/PaymentsReceivedTab.tsx)

**Modified:**
- [src/types/site.types.ts](../../../src/types/site.types.ts) — add `SiteAdditionalWork` + status enum
- [src/types/database.types.ts](../../../src/types/database.types.ts) — regenerated from schema
- [src/hooks/queries/useClientPayments.ts](../../../src/hooks/queries/useClientPayments.ts) — accept tagging fields
- [src/app/(main)/site/client-payments/page.tsx](../../../src/app/(main)/site/client-payments/page.tsx) — major rewrite
- [src/components/client-payments/RecordPaymentDialog.tsx](../../../src/components/client-payments/RecordPaymentDialog.tsx) (or current equivalent) — add Apply-to dropdown
- [src/app/(main)/site/page.tsx](../../../src/app/(main)/site/page.tsx) — add condensed 3-tile rollup card

**Reused (no changes):**
- [src/components/payments/KpiTile.tsx](../../../src/components/payments/KpiTile.tsx)
- [src/components/payments/MobileCollapsibleHero.tsx](../../../src/components/payments/MobileCollapsibleHero.tsx)
- [src/components/common/InspectPane/InspectPane.tsx](../../../src/components/common/InspectPane/InspectPane.tsx)
- `useInspectPane` hook
- Theme colors and progress-bar pattern from salary-settlement page

---

## Verification

End-to-end via Playwright MCP after implementation (per CLAUDE.md "After UI Changes" rules):

1. Login via `/dev-login` → navigate to a site with existing payments → verify hero totals match expected math
2. Add an additional work as `quoted` (estimated only) → confirm tile #2 (Additional Works) does **not** include it (only confirmed counts)
3. Confirm the work (set confirmed amount + date) → tile #2 increases, status flips to `confirmed`
4. Record an untagged payment → tiles #4 (Client Paid) and #6 (Net in Hand) update
5. Record a payment **tagged to the additional work** for the full amount → work auto-flips to `paid`
6. Cancel an additional work → row strikes through, excluded from totals
7. Verify check constraint: try inserting a `client_payments` row with both tagged fields set → DB rejects
8. Mobile viewport: hero collapses to single row showing "Remaining from Client"
9. Browser console: zero hydration warnings, zero aria-hidden warnings (per CLAUDE.md HTML nesting + Autocomplete-in-Dialog rules)
10. Site dashboard: condensed 3-tile rollup renders and matches the full hero numbers

Database side:
- `npm run build` passes
- New migration applies cleanly via `npm run db:reset` locally before any production push
