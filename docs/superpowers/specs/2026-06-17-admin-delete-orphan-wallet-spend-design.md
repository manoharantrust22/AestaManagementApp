# Admin hard-delete for orphan wallet spends

**Date:** 2026-06-17
**Status:** Approved (brainstorming)

## Problem

The duplicate-reference bug in `createMiscExpense` recorded an engineer-wallet spend
*before* the misc-expense insert, so every failed attempt left an **orphan wallet
spend** — a `site_engineer_transactions` row of type `spend` with no linked
expense/settlement. These phantom debits inflate the engineer's wallet balance
(e.g. two ₹950 rows dragged Ajith's Srinivasan balance to −₹1,500 vs the true +₹400).

The existing reverse flow can't clear them: `reverse_wallet_spend` **refuses** a spend
whose `get_wallet_spend_source` returns `source_type='none'`, and the misc-list Cancel
only flags the expense. So there is no in-app way for an admin to remove an orphan spend.

## Scope (decided)

- **Orphans only.** A single admin action to remove a wallet spend that has **no linked
  record**. No changes to the misc-list Cancel, no general "delete any record" surface.
- **Hard-delete.** Physically remove the spend row and its allocation rows (not a
  soft-cancel). An `audit_log` breadcrumb is written first so a trace survives.
- **Admin only** (tighter than the reverse buttons, which also allow office/recorder),
  because hard-delete is irreversible.

## Design

### 1. RPC `delete_orphan_wallet_spend(p_spend_id uuid, p_reason text DEFAULT NULL)`
New migration. `SECURITY DEFINER`, `SET search_path = public`. Mirrors the safety model of
`reverse_wallet_spend`:
- Lock the row `FOR UPDATE`; require `transaction_type = 'spend'` (else RAISE).
- Resolve caller from `auth.uid()` → require `role = 'admin'` (else RAISE `42501`).
- **Orphan guard:** `get_wallet_spend_source(p_spend_id)->>'source_type'` must equal
  `'none'`; otherwise RAISE `22023` ("spend is linked to a <type> record — use the
  reverse/undo action instead"). (That helper returns `'salary'` whenever
  `settlement_group_id` is set, so `'none'` already implies no linked settlement.)
- Write an `audit_log` breadcrumb **before** deleting: `create_audit_log(
  'site_engineer_transactions', p_spend_id, 'delete', to_jsonb(spend_row), NULL,
  caller_id, reason)`, wrapped in a best-effort `EXCEPTION WHEN OTHERS` block.
- `DELETE FROM engineer_wallet_spend_allocations WHERE spend_id = p_spend_id;` then
  `DELETE FROM site_engineer_transactions WHERE id = p_spend_id;`.
- Return `jsonb_build_object('deleted_spend_id', …, 'deleted_allocations', n, 'amount', …,
  'user_id', …, 'site_id', …)`. `GRANT EXECUTE … TO authenticated`.

### 2. Service + hook
- `deleteOrphanWalletSpend(supabase, { spendId, reason })` in
  `src/lib/services/walletSpendReverseService.ts` — calls the RPC, returns the result.
- `useDeleteOrphanWalletSpend()` in `src/hooks/mutations/` — mirrors
  `useReverseWalletSpend`: `onSuccess` → `qc.invalidateQueries()` + `broadcastWalletChange()`.

### 3. UI — `src/components/wallet-v2/SpendDetailDialog.tsx`
- Show an admin-only red **"Delete spend"** button **only** when the spend is a true
  orphan: `row.transaction_type === 'spend'`, `!row.cancelled_at`, no `linkedGroupId`,
  `sourceType === 'none'`, and `role === 'admin'`.
- Clicking opens an inline confirm ("Permanently delete this ₹X spend? It has no linked
  expense and can't be recovered."). Confirm → mutation → close dialog.

## Out of scope / non-goals
- Misc-list Cancel behavior (unchanged).
- Reversing *linked* spends (already handled by `reverse_wallet_spend`).
- Hard-deleting deposits/returns or any non-spend row.

## Verification
- Unit test the service + hook wiring (mock `supabase.rpc`) and the button-eligibility
  predicate.
- DB: confirm the guard refuses a *linked* spend (read-only check that a known linked
  spend's `source_type != 'none'`).
- End-to-end on prod: delete the two real ₹950 orphans (`2c64aaee…`, `dfa332a2…`) via the
  RPC; confirm allocations gone, rows gone, and Ajith's Srinivasan balance returns to +₹400.
