-- Migration: import_misc_expense_batch RPC (atomic, revocable bulk insert of misc_expenses)
-- Purpose: Insert a whole CSV import as ONE transaction:
--          1. create the import_batches row (status='committed')
--          2. set-based insert of every misc_expenses row, tagged with import_batch_id,
--             each with a generated MISC-YYMMDD-NNN reference, payer_type='company_direct',
--             is_cleared=true, is_cancelled=false
--          3. write an audit_log entry (best-effort)
-- Returns {batch_id, inserted_count}. Any failure rolls back the entire batch.
--
-- Authorization (mirrors reverse_settlement): the caller is derived from auth.uid()
-- ONLY (never a client-supplied id). Must be role admin/office AND able to access the
-- target site. created_by is the resolved public.users.id (misc_expenses.created_by
-- FKs public.users, not auth.users).
--
-- Ref-code throughput: instead of N advisory-lock round-trips (the per-row
-- generate_misc_expense_reference), we take the SAME advisory lock ONCE, read the
-- current MAX(seq) once, then assign base + row_number() in a single INSERT...SELECT.
-- reference_number UNIQUE is the safety net; the held xact lock closes the
-- read-then-write race against concurrent single-row inserts.

CREATE OR REPLACE FUNCTION public.import_misc_expense_batch(
  p_site_id uuid,
  p_rows    jsonb,   -- [{date, amount, category_id, subcontract_id, description,
                     --   vendor_name, payment_mode, payer_source, payer_name, notes}]
  p_file    jsonb,   -- {file_name, original_csv_path, file_hash}
  p_summary jsonb
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_batch_id    uuid;
  v_caller_id   uuid;
  v_caller_role user_role;
  v_caller_name text;
  v_count       int := COALESCE(jsonb_array_length(p_rows), 0);
  v_lock_key    bigint;
  v_date_code   text := to_char(CURRENT_DATE, 'YYMMDD');
  v_base_seq    int;
BEGIN
  IF p_site_id IS NULL THEN
    RAISE EXCEPTION 'import_misc_expense_batch requires a site_id' USING ERRCODE = '22023';
  END IF;
  IF v_count = 0 THEN
    RAISE EXCEPTION 'import_misc_expense_batch: no rows supplied' USING ERRCODE = '22023';
  END IF;

  -- AUTHORIZATION — caller derived from auth.uid() only.
  SELECT id, role, name INTO v_caller_id, v_caller_role, v_caller_name
  FROM users WHERE auth_id = auth.uid();

  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized: no application user for the current session' USING ERRCODE = '42501';
  END IF;
  IF v_caller_role NOT IN ('admin', 'office') THEN
    RAISE EXCEPTION 'Not authorized: bulk import is admin/office only' USING ERRCODE = '42501';
  END IF;
  IF NOT can_access_site(p_site_id) THEN
    RAISE EXCEPTION 'Not authorized for this site' USING ERRCODE = '42501';
  END IF;

  -- 1. batch header
  INSERT INTO import_batches
    (site_id, target_table, status, file_name, original_csv_path, file_hash,
     total_count, inserted_count, summary, created_by, created_by_name)
  VALUES
    (p_site_id, 'misc_expenses', 'committed',
     p_file->>'file_name', p_file->>'original_csv_path', p_file->>'file_hash',
     v_count, v_count, p_summary, v_caller_id, v_caller_name)
  RETURNING id INTO v_batch_id;

  -- 2. reference-number base (single lock + single read; same key family as
  --    generate_misc_expense_reference so single-row inserts serialize with us)
  v_lock_key := ('x' || substr(md5(p_site_id::text || 'misc_expense'), 1, 15))::bit(64)::bigint;
  PERFORM pg_advisory_xact_lock(v_lock_key);

  SELECT COALESCE(MAX(
           CAST(SUBSTRING(reference_number FROM 'MISC-' || v_date_code || '-(\d+)') AS int)
         ), 0)
    INTO v_base_seq
    FROM misc_expenses
   WHERE site_id = p_site_id
     AND reference_number LIKE 'MISC-' || v_date_code || '-%';

  -- 3. set-based insert of all rows
  INSERT INTO misc_expenses (
    site_id, reference_number, date, amount, category_id, subcontract_id,
    description, vendor_name, payment_mode, payer_source, payer_name,
    payer_type, is_cleared, is_cancelled, import_batch_id, created_by, created_by_name)
  SELECT
    p_site_id,
    'MISC-' || v_date_code || '-' ||
      LPAD((v_base_seq + row_number() OVER (ORDER BY ord))::text, 3, '0'),
    (r->>'date')::date,
    (r->>'amount')::numeric,
    NULLIF(r->>'category_id', '')::uuid,
    NULLIF(r->>'subcontract_id', '')::uuid,
    NULLIF(r->>'description', ''),
    NULLIF(r->>'vendor_name', ''),
    COALESCE(NULLIF(r->>'payment_mode', ''), 'cash'),
    NULLIF(r->>'payer_source', ''),
    NULLIF(r->>'payer_name', ''),
    'company_direct', true, false, v_batch_id, v_caller_id, v_caller_name
  FROM jsonb_array_elements(p_rows) WITH ORDINALITY AS t(r, ord);

  -- 4. audit (best-effort: never let an audit hiccup roll back the import)
  BEGIN
    PERFORM create_audit_log(
      'import_batches', v_batch_id, 'create'::audit_action,
      NULL, p_summary, v_caller_id,
      format('Legacy misc-expense import: %s rows (%s)', v_count, p_file->>'file_name'));
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN jsonb_build_object('batch_id', v_batch_id, 'inserted_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.import_misc_expense_batch(uuid, jsonb, jsonb, jsonb)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.import_misc_expense_batch(uuid, jsonb, jsonb, jsonb) IS
  'Atomically imports a CSV batch of legacy misc_expenses: creates the import_batches row and inserts all expense rows (company_direct, cleared, tagged with import_batch_id) with batch-generated MISC references. Authorization (admin/office + site access) derived from auth.uid(). Returns {batch_id, inserted_count}.';
