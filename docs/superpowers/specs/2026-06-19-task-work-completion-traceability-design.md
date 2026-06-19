# Task Work — Completion Flow & Expense Traceability

**Date:** 2026-06-19
**Status:** Approved (design); pending spec review
**Area:** `/site/task-work` (detail drawer) and `/site/expenses` (V1)

## Problem

On `/site/task-work`, a package's payments already post to site expenses and roll up
into one consolidated row per package on `/site/expenses` (live in prod, V1). But the
user could not *tell* this was happening, and the "Mark as completed" button felt like
it should be the thing that "books" the expense.

The actual gaps are **traceability and completion UX**, not the expense posting itself:

1. No visible link between a task's payments and their record in site expenses — the user
   wants reassurance ("an expense ID") that each settlement is on the books.
2. No way to jump from the task to that expense on `/site/expenses`.
3. The consolidated expense row reads `Task Work — Varun — House Interior plastering`;
   the user wants the **task title** to lead so it is instantly recognizable.
4. "Mark as completed" fires instantly with no confirmation, and the button states around
   it are confusing.
5. Inside the task, the user wants to see **all settlements with their IDs**.

## Non-goals (explicitly out of scope)

- **No change to how the expense is posted.** Task-work payments already appear in
  `v_all_expenses` (`source_type = 'task_work_payment'`), summed and consolidated. The
  books are correct and **paid-driven** (the expense equals the sum of payments, never the
  agreed price), so nothing here double-counts.
- **No change to the expense category.** It stays `module = labor`, `expense_type =
  'Task Work'`, `category_name = 'Contract Payment'`. (The user confirmed "it already
  works" for category.)
- **No profitability recompute on waiver.** `company_saving` keeps using the agreed price
  (`total_value`); a waived balance is display/audit only. Recomputing saving against the
  bargained-down final price is a possible future enhancement, not part of this work.
- **V2 expenses page (`page.v2.tsx`).** The redesign flag `NEXT_PUBLIC_FF_EXPENSES_REDESIGN`
  is **not set in production**, so V1 is live. We target V1. V2 parity is deferred until/if
  the flag flips.

## Design

### 1. Per-settlement reference ID — `TW-260618-001 · #6`

Each payment is identified by the **package reference** (`task_work_packages.package_number`,
e.g. `TW-260618-001`) plus a **chronological line number** (oldest payment = `#1`).

- A single shared pure helper computes the numbering so the **same `#n` appears in both**
  the task drawer and the `/site/expenses` expand panel, and they line up exactly.
- Numbering is over **non-deleted** payments ordered by `payment_date` ascending (ties
  broken by `created_at`, then `id`, for determinism). Soft-deleted payments are excluded,
  so visible numbers stay contiguous.
- Computed at render time — **no new DB column** for the id.

**Helper (new):** `src/lib/taskWork/paymentRef.ts`

```ts
// Returns a Map<paymentId, lineNumber> numbered chronologically (oldest = 1).
export function taskPaymentLineNumbers(
  payments: { id: string; payment_date: string; created_at?: string }[]
): Map<string, number>;

// "TW-260618-001 · #6"
export function formatTaskPaymentRef(packageNumber: string, lineNumber: number): string;
```

Both call sites build the map from their own copy of the payment list:
- Task drawer: from `useTaskWorkPayments(pkg.id)`.
- Expenses consolidation: from the consolidated row's `__taskChildren` (their `source_id`
  is the payment id, `date` is the payment date).

### 2. Task drawer — Payments tab (`TaskWorkPaymentsPanel.tsx`)

- **Assurance chip** at the top of the Payments tab, shown when ≥1 payment exists:
  `✓ On record in Site Expenses · TW-260618-001 →`. Clicking routes to
  `/site/expenses?ref=<package_number>`.
- Each settlement row shows its `· #n` id next to the amount (small caption / monospace).

### 3. `/site/expenses` (V1, `page.tsx` + `taskWorkExpenseConsolidation.tsx`)

- **Consolidated row label** (in `consolidateTaskWorkRows`):
  - `description` = the **task title** (e.g. `House Interior plastering`) — drop the
    `Task Work — {maistry} —` prefix.
  - `vendor_name` = the **maistry name** (`Varun`).
  - The existing `expense_type = 'Task Work'` chip already conveys "what it is".
- **Expand panel** (`TaskWorkExpenseDetail`): add an **`#n` id column** (leftmost) using the
  shared helper.
- **Deep-link filter:** the page reads a `ref` query param (`useSearchParams`). When present,
  it seeds the existing `settlement_reference` column filter with that value and highlights
  the matching consolidated row (reuse the row-highlight styling already in the table). This
  is what the assurance chip targets.

### 4. Completion flow (`TaskWorkDetailDrawer.tsx`)

Replace the instant `setStatus("completed")` with a **confirmation dialog**. New component:
`TaskWorkCompleteDialog.tsx`.

**Button layout while Active:**
- If `balanceDue > 0`: primary CTA is **"Record final settlement (₹X)"**; **"Mark as
  completed"** is secondary (outlined/text) — no two competing primary buttons.
- If `balanceDue === 0`: **"Mark as completed"** is the primary CTA.

**Dialog behavior:**
- **Balance = 0:** "Mark *{title}* as completed?" → [Complete] / [Cancel].
- **Balance due (e.g. ₹8,000):** a **reason is required** (free text). The user picks what the
  unpaid balance means:
  1. **Settle it first** — closes this dialog and opens the existing final-settlement payment
     dialog. (After paying the balance, balance becomes 0 and they can complete plainly.)
  2. **Complete — balance waived** — bargained down / scope reduced. Records the reason and
     sets `balance_waived = true`. The ₹8,000 stops showing as owed.
  3. **Complete — still owed** — will pay later. Records the reason; `balance_waived = false`;
     balance stays visible as payable.

On confirm (paths 2 & 3), the package update sends:
`{ status: 'completed', actual_end_date (if unset), completion_reason, balance_waived }`.

**After completion — completed state replaces the action buttons:**
- A success banner: `✓ Completed on {actual_end_date} · ₹{paid} paid`
  - If completed with a balance: append `· {waived? "waived" : "unpaid"} ₹{balance}` and show
    `reason: {completion_reason}`.
- **Reopen** demoted to a small text link (not a large button). No "Mark as completed" button
  reappears.

**Reversibility:** Reopen sets `{ status: 'active', balance_waived: false, completion_reason:
null }` (and leaves `actual_end_date` for history, matching current behaviour). Nothing in
this flow is destructive; the expense rows are untouched throughout.

**Balance display with waiver:** where the drawer shows `balanceDue` (red), a waived balance
on a completed package renders as `Waived ₹8,000` (muted), and the effective payable is
treated as 0 in the drawer. The profitability view is unchanged (see non-goals).

### 5. Data changes — one migration

`task_work_packages` gains:
- `completion_reason text` — why the package was completed (esp. with an unsettled balance).
- `balance_waived boolean NOT NULL DEFAULT false` — true = the remaining balance is
  intentionally not owed.

Additive, nullable/defaulted, no backfill needed. `v_all_expenses` is **not** touched.

## Components & files

| File | Change |
|------|--------|
| `supabase/migrations/<ts>_task_work_completion_fields.sql` | **new** — add `completion_reason`, `balance_waived` |
| `src/lib/taskWork/paymentRef.ts` | **new** — shared `#n` numbering + ref formatter (pure) |
| `src/lib/taskWork/paymentRef.test.ts` | **new** — unit tests for numbering/formatting |
| `src/types/taskWork.types.ts` | add the two fields to `TaskWorkPackage` (row) **and** `TaskWorkPackageInput` (so the typed `.update()` accepts them) |
| `src/components/task-work/TaskWorkCompleteDialog.tsx` | **new** — confirmation + reason + owed/waived |
| `src/components/task-work/TaskWorkDetailDrawer.tsx` | wire the dialog; completed banner; demote Reopen; button hierarchy |
| `src/components/task-work/TaskWorkPaymentsPanel.tsx` | assurance chip + per-row `#n` |
| `src/components/expenses/taskWorkExpenseConsolidation.tsx` | title-led label; `#n` column; use shared helper |
| `src/app/(main)/site/expenses/page.tsx` | read `?ref=`, seed `settlement_reference` filter + highlight |
| `src/hooks/queries/useTaskWorkPackages.ts` | no logic change — `useUpdateTaskWorkPackage` already does `.update(data)` with `Partial<TaskWorkPackageInput>`, so it passes the new fields through once they are on the type |

## Testing

- **Unit (Vitest):** `taskPaymentLineNumbers` — chronological numbering, tie-breaking,
  soft-deleted excluded; `formatTaskPaymentRef` output. Extend
  `taskWorkExpenseConsolidation.test.tsx` for the title-led label and that child `#n` values
  match the helper.
- **Manual (Playwright, prod-cloud dev):** record payments → open task → see assurance chip +
  `#n`; click chip → `/site/expenses` filtered + highlighted on the right row; expand row →
  `#n` matches; Mark as completed with balance → reason required, waive vs owed both work;
  banner shows; Reopen restores; complete with zero balance → plain confirm.

## Risks / edge cases

- **`#n` drift on delete:** numbers renumber if an earlier payment is hard-deleted. Payments
  are soft-deleted (`is_deleted`) and excluded, so the visible sequence stays contiguous;
  acceptable for a display aid (accepted by the user over a stable opaque code).
- **`?ref=` filter:** must seed the existing `settlement_reference` column filter without
  fighting the table's own filter state; verify it survives the consolidation pass.
