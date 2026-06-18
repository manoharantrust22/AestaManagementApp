-- Admin hard-delete for ORPHAN wallet spends.
--
-- WHY: the duplicate-reference bug recorded a wallet spend before the misc-expense
-- insert, so failed attempts left orphan spends (site_engineer_transactions type
-- 'spend' with no linked expense/settlement) that inflate the engineer's balance.
-- reverse_wallet_spend can't clear them — it refuses spends whose
-- get_wallet_spend_source returns source_type='none'. This gives an admin a guarded
-- way to physically remove a true orphan (row + its allocation rows).
--
-- SAFETY: SECURITY DEFINER + auth.uid() (admin only — hard delete is irreversible),
-- and an orphan guard that RAISEs if the spend is linked to ANY source. An audit_log
-- breadcrumb is written before the delete so a trace survives the hard delete.

CREATE OR REPLACE FUNCTION public.delete_orphan_wallet_spend(
  p_spend_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_spend       site_engineer_transactions%ROWTYPE;
  v_caller_id   uuid;
  v_caller_name text;
  v_caller_role public.user_role;
  v_src_type    text;
  v_alloc_count int;
BEGIN
  -- Lock the row.
  SELECT * INTO v_spend FROM site_engineer_transactions WHERE id = p_spend_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet spend % not found', p_spend_id USING ERRCODE = 'P0002';
  END IF;
  IF v_spend.transaction_type <> 'spend' THEN
    RAISE EXCEPTION 'Only spend rows can be deleted (got %)', v_spend.transaction_type
      USING ERRCODE = '22023';
  END IF;

  -- Authorise: admin only.
  SELECT id, name, role INTO v_caller_id, v_caller_name, v_caller_role
    FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No user profile for the current user' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Not authorised: deleting an orphan wallet spend is admin-only'
      USING ERRCODE = '42501';
  END IF;

  -- Orphan guard: refuse anything still linked to a source. get_wallet_spend_source
  -- returns 'salary' when settlement_group_id is set, so 'none' implies fully unlinked.
  v_src_type := get_wallet_spend_source(p_spend_id)->>'source_type';
  IF v_src_type <> 'none' THEN
    RAISE EXCEPTION 'Spend % is linked to a % record — use the reverse/undo action, not delete',
      p_spend_id, v_src_type USING ERRCODE = '22023';
  END IF;

  -- Audit breadcrumb BEFORE the hard delete (best-effort; never block the cleanup).
  BEGIN
    PERFORM create_audit_log(
      'site_engineer_transactions', p_spend_id, 'delete'::audit_action,
      to_jsonb(v_spend), NULL, v_caller_id,
      COALESCE(p_reason, 'Hard-deleted orphan wallet spend (no linked record)'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Hard delete: allocations first (FK child), then the spend.
  DELETE FROM engineer_wallet_spend_allocations WHERE spend_id = p_spend_id;
  GET DIAGNOSTICS v_alloc_count = ROW_COUNT;
  DELETE FROM site_engineer_transactions WHERE id = p_spend_id;

  RETURN jsonb_build_object(
    'deleted_spend_id', p_spend_id,
    'deleted_allocations', v_alloc_count,
    'amount', v_spend.amount,
    'user_id', v_spend.user_id,
    'site_id', v_spend.site_id
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_orphan_wallet_spend(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.delete_orphan_wallet_spend(uuid, text) IS
  'Admin-only hard delete of an ORPHAN wallet spend (a site_engineer_transactions spend row with no linked source). RAISEs if linked (use reverse_wallet_spend) or if caller is not admin. Writes an audit_log breadcrumb, then deletes the allocation rows and the spend. Returns a summary.';
