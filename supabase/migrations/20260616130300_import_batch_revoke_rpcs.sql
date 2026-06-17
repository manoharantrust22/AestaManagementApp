-- Migration: revert / restore / purge RPCs for import_batches
-- The "undo" backend for bulk imports. All three:
--   * derive the caller from auth.uid() only (no client-supplied identity)
--   * lock the batch row FOR UPDATE
--   * are idempotent (status-guarded)
--   * write a best-effort audit_log entry
--
-- revert  : soft-cancel every misc_expenses row in the batch (is_cancelled=true) ->
--           rows vanish from Miscellaneous, v_all_expenses, and subcontract rollups.
-- restore : reverse a revert (is_cancelled=false), status back to 'committed'.
-- purge   : HARD delete every misc_expenses row in the batch (admin/office only).
--           The batch row is kept as a tombstone (status='purged').

-- ---------------------------------------------------------------------------
-- revert_import_batch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.revert_import_batch(
  p_batch_id uuid,
  p_reason   text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch       import_batches%ROWTYPE;
  v_caller_id   uuid;
  v_caller_role user_role;
  v_caller_name text;
  v_affected    int := 0;
  v_reconciled  boolean := false;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'revert_import_batch requires a batch id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch FROM import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_caller_role IN ('admin', 'office') OR v_caller_id = v_batch.created_by) THEN
    RAISE EXCEPTION 'Not authorized to revert this batch (recorder or office/admin only)' USING ERRCODE = '42501';
  END IF;

  SELECT legacy_status = 'reconciled' INTO v_reconciled FROM sites WHERE id = v_batch.site_id;

  -- Idempotent guards.
  IF v_batch.status = 'purged' THEN
    RAISE EXCEPTION 'Import batch % was purged and cannot be reverted', p_batch_id USING ERRCODE = '22023';
  END IF;
  IF v_batch.status = 'reverted' THEN
    RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'reverted',
                              'affected', 0, 'idempotent', true, 'site_reconciled', v_reconciled);
  END IF;

  UPDATE misc_expenses
     SET is_cancelled = true,
         cancelled_at = now(),
         cancelled_by_user_id = v_caller_id,
         cancellation_reason = COALESCE(p_reason, 'Bulk import reverted'),
         updated_at = now()
   WHERE import_batch_id = p_batch_id
     AND is_cancelled = false;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  UPDATE import_batches
     SET status = 'reverted',
         reverted_by = v_caller_id,
         reverted_at = now(),
         revert_reason = p_reason
   WHERE id = p_batch_id;

  BEGIN
    PERFORM create_audit_log(
      'import_batches', p_batch_id, 'soft_delete'::audit_action,
      jsonb_build_object('status', v_batch.status),
      jsonb_build_object('status', 'reverted', 'reason', p_reason),
      v_caller_id, format('Reverted import batch: %s rows hidden', v_affected));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'reverted',
                            'affected', v_affected, 'idempotent', false,
                            'site_reconciled', v_reconciled);
END;
$$;

-- ---------------------------------------------------------------------------
-- restore_import_batch
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.restore_import_batch(
  p_batch_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch       import_batches%ROWTYPE;
  v_caller_id   uuid;
  v_caller_role user_role;
  v_caller_name text;
  v_affected    int := 0;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'restore_import_batch requires a batch id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch FROM import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_caller_role IN ('admin', 'office') OR v_caller_id = v_batch.created_by) THEN
    RAISE EXCEPTION 'Not authorized to restore this batch (recorder or office/admin only)' USING ERRCODE = '42501';
  END IF;

  IF v_batch.status = 'purged' THEN
    RAISE EXCEPTION 'Import batch % was purged and cannot be restored', p_batch_id USING ERRCODE = '22023';
  END IF;
  IF v_batch.status = 'committed' THEN
    RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'committed',
                              'affected', 0, 'idempotent', true);
  END IF;

  -- Un-cancel the batch's rows. Legacy-import rows are company_direct and are only
  -- cancelled via revert_import_batch, so restoring every cancelled row in the batch
  -- is the inverse of revert in practice.
  UPDATE misc_expenses
     SET is_cancelled = false,
         cancelled_at = NULL,
         cancelled_by_user_id = NULL,
         cancellation_reason = NULL,
         updated_at = now()
   WHERE import_batch_id = p_batch_id
     AND is_cancelled = true;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  UPDATE import_batches
     SET status = 'committed',
         reverted_by = NULL,
         reverted_at = NULL,
         revert_reason = NULL
   WHERE id = p_batch_id;

  BEGIN
    PERFORM create_audit_log(
      'import_batches', p_batch_id, 'restore'::audit_action,
      jsonb_build_object('status', v_batch.status),
      jsonb_build_object('status', 'committed'),
      v_caller_id, format('Restored import batch: %s rows', v_affected));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'committed',
                            'affected', v_affected, 'idempotent', false);
END;
$$;

-- ---------------------------------------------------------------------------
-- purge_import_batch (HARD delete; admin/office only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_import_batch(
  p_batch_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch       import_batches%ROWTYPE;
  v_caller_id   uuid;
  v_caller_role user_role;
  v_affected    int := 0;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'purge_import_batch requires a batch id' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_batch FROM import_batches WHERE id = p_batch_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Import batch % not found', p_batch_id USING ERRCODE = 'P0002';
  END IF;

  SELECT id, role INTO v_caller_id, v_caller_role
  FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  -- Stricter than revert: permanent deletion is admin/office only (never plain creator).
  IF v_caller_role NOT IN ('admin', 'office') THEN
    RAISE EXCEPTION 'Not authorized: purge is admin/office only' USING ERRCODE = '42501';
  END IF;

  IF v_batch.status = 'purged' THEN
    RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'purged',
                              'affected', 0, 'idempotent', true);
  END IF;

  DELETE FROM misc_expenses WHERE import_batch_id = p_batch_id;
  GET DIAGNOSTICS v_affected = ROW_COUNT;

  UPDATE import_batches
     SET status = 'purged',
         reverted_by = v_caller_id,
         reverted_at = now(),
         revert_reason = COALESCE(revert_reason, 'Permanently purged')
   WHERE id = p_batch_id;

  BEGIN
    PERFORM create_audit_log(
      'import_batches', p_batch_id, 'delete'::audit_action,
      to_jsonb(v_batch), jsonb_build_object('status', 'purged'),
      v_caller_id, format('Purged import batch: %s rows hard-deleted', v_affected));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('batch_id', p_batch_id, 'status', 'purged',
                            'affected', v_affected, 'idempotent', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.revert_import_batch(uuid, text)  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_import_batch(uuid)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_import_batch(uuid)          TO authenticated, service_role;

COMMENT ON FUNCTION public.revert_import_batch(uuid, text) IS
  'Soft-revokes a bulk import: sets is_cancelled=true on every misc_expenses row in the batch (hiding them everywhere) and marks the batch reverted. Idempotent. Auth (recorder or admin/office) from auth.uid(). Returns affected count + site_reconciled.';
