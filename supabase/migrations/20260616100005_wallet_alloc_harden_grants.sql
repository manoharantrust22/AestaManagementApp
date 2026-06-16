-- Security hardening: the FIFO allocation internals must NOT be directly
-- callable by clients. They are invoked only by the SECURITY DEFINER RPCs
-- (atomic_record_wallet_spend / atomic_record_wallet_deposit) and the
-- rebuild/sync triggers, all of which run as the function owner — so revoking
-- EXECUTE from public/authenticated does not break the legitimate flow.
--
-- Why it matters: allocate_spend_fifo APPENDS allocation rows; if an
-- authenticated user could call it directly on a spend that already has
-- allocations, it would double-allocate and corrupt source attribution.
-- rebuild_wallet_allocations could likewise be invoked for arbitrary engineers.
--
-- Client-callable RPCs keep their grants: atomic_record_wallet_spend,
-- atomic_record_wallet_deposit (recordSpend/recordDeposit), and
-- sync_misc_expense_source (createMiscExpense) — the last only re-derives a
-- misc row's source from its own allocations (idempotent, no injection).

REVOKE EXECUTE ON FUNCTION _wallet_deposit_units(uuid, uuid)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION allocate_spend_fifo(uuid)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION heal_pending_allocations(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION rebuild_wallet_allocations(uuid, uuid)  FROM PUBLIC, anon, authenticated;
