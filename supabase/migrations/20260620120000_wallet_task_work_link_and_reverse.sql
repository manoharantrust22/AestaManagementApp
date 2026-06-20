-- Make engineer-wallet TASK-WORK spends first-class in the wallet: linked (not
-- badged "Not linked") and reversible from the wallet spend-detail dialog.
--
-- WHY: a task-work payment paid from the engineer wallet records a real
-- site_engineer_transactions spend (linked via task_work_payments.engineer_transaction_id),
-- but three helpers never knew about task_work_payments:
--   * list_unlinked_wallet_spends → flagged every task-work spend as an orphan
--     ("Not linked" red badge), implying a phantom debit.
--   * get_wallet_spend_source → returned source_type='none', so the spend looked
--     un-reversible (no Undo / Paid-by-company).
--   * reverse_wallet_spend → had no cascade to task_work_payments.
-- This adds the task_work branch to all three. Bodies are copied from the LIVE
-- definitions (NOT an old migration file) per the stale-base invariant, then the
-- task_work branch is layered in.

-- ---------------------------------------------------------------------------
-- 1. list_unlinked_wallet_spends — exclude task-work-linked spends.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_unlinked_wallet_spends(
  p_user_ids uuid[],
  p_site_id  uuid DEFAULT NULL
)
RETURNS SETOF site_engineer_transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT t.*
  FROM site_engineer_transactions t
  WHERE t.user_id = ANY(p_user_ids)
    AND t.transaction_type = 'spend'
    AND t.cancelled_at IS NULL
    AND (p_site_id IS NULL OR t.site_id = p_site_id)
    AND t.settlement_group_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM material_purchase_expenses x WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM misc_expenses x          WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM rental_advances x        WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM rental_settlements x     WHERE x.engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM tea_shop_settlements x   WHERE x.site_engineer_transaction_id = t.id)
    AND NOT EXISTS (SELECT 1 FROM task_work_payments x     WHERE x.engineer_transaction_id = t.id AND x.is_deleted = false)
  ORDER BY t.transaction_date DESC, t.id DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.list_unlinked_wallet_spends(uuid[], uuid) TO authenticated;

COMMENT ON FUNCTION public.list_unlinked_wallet_spends(uuid[], uuid) IS
  'Read-only: returns wallet SPEND rows for the given engineer ids (optionally one site) that are not linked to any salary/material/misc/rental/tea/task-work source — i.e. orphan/phantom debits. Powers the "Not linked" badge and the "show only unlinked" ledger filter.';

-- ---------------------------------------------------------------------------
-- 2. get_wallet_spend_source — recognise task-work as a source.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_wallet_spend_source(p_spend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sg uuid;
  v_id uuid;
  v_paid boolean;
BEGIN
  SELECT settlement_group_id INTO v_sg FROM site_engineer_transactions WHERE id = p_spend_id;
  IF v_sg IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','salary','source_id',v_sg,'is_settled',true);
  END IF;

  SELECT id, is_paid INTO v_id, v_paid
    FROM material_purchase_expenses WHERE engineer_transaction_id = p_spend_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','material','source_id',v_id,'is_settled',COALESCE(v_paid,false));
  END IF;

  SELECT id INTO v_id FROM misc_expenses WHERE engineer_transaction_id = p_spend_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','misc','source_id',v_id,'is_settled',true);
  END IF;

  SELECT id INTO v_id FROM rental_advances WHERE engineer_transaction_id = p_spend_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','rental','source_id',v_id,'is_settled',true,'rental_kind','advance');
  END IF;

  SELECT id INTO v_id FROM rental_settlements WHERE engineer_transaction_id = p_spend_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','rental','source_id',v_id,'is_settled',true,'rental_kind','settlement');
  END IF;

  SELECT id INTO v_id FROM tea_shop_settlements WHERE site_engineer_transaction_id = p_spend_id LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','tea','source_id',v_id,'is_settled',true);
  END IF;

  -- Task-work payment (advance / part / final / retention) paid from the wallet.
  SELECT id INTO v_id FROM task_work_payments
    WHERE engineer_transaction_id = p_spend_id AND is_deleted = false LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN jsonb_build_object('source_type','task_work','source_id',v_id,'is_settled',true);
  END IF;

  RETURN jsonb_build_object('source_type','none','source_id',null,'is_settled',false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_wallet_spend_source(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. reverse_wallet_spend — cascade a task-work reverse.
--    undo         → soft-delete the payment (package balance reopens)
--    company_paid → keep the payment, reclassify it to company/direct
--    The generic tail still soft-cancels the wallet spend (restores balance).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reverse_wallet_spend(
  p_spend_id uuid,
  p_mode text,            -- 'undo' | 'company_paid'
  p_reason text DEFAULT NULL
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
  v_src         jsonb;
  v_type        text;
  v_src_id      uuid;
  v_rental_kind text;
BEGIN
  IF p_mode NOT IN ('undo','company_paid') THEN
    RAISE EXCEPTION 'Invalid mode % (expected undo or company_paid)', p_mode USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_spend FROM site_engineer_transactions WHERE id = p_spend_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet spend % not found', p_spend_id USING ERRCODE = 'P0002';
  END IF;
  IF v_spend.transaction_type <> 'spend' THEN
    RAISE EXCEPTION 'Only spend rows can be reversed (got %)', v_spend.transaction_type USING ERRCODE = '22023';
  END IF;

  IF v_spend.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_cancelled', true, 'spend_id', p_spend_id);
  END IF;

  SELECT id, name, role INTO v_caller_id, v_caller_name, v_caller_role
    FROM users WHERE auth_id = auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'No user profile for the current user' USING ERRCODE = '42501';
  END IF;
  IF NOT (v_caller_role IN ('admin','office') OR v_spend.recorded_by_user_id = v_caller_id) THEN
    RAISE EXCEPTION 'Not authorised to reverse this wallet spend' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(v_spend.user_id::text || ':' || COALESCE(v_spend.site_id::text, ''))
  );

  v_src        := get_wallet_spend_source(p_spend_id);
  v_type       := v_src->>'source_type';
  v_src_id     := NULLIF(v_src->>'source_id','')::uuid;
  v_rental_kind:= v_src->>'rental_kind';

  IF v_type = 'salary' THEN
    RAISE EXCEPTION 'Salary/contract settlement — use the settlement reverse, not the wallet reverse'
      USING ERRCODE = '22023';
  END IF;
  IF v_type = 'none' OR v_src_id IS NULL THEN
    RAISE EXCEPTION 'This spend has no linked material/misc/rental/tea/task-work record to cascade to'
      USING ERRCODE = '22023';
  END IF;

  IF v_type = 'material' THEN
    IF p_mode = 'undo' THEN
      UPDATE material_purchase_expenses
         SET is_paid = false, paid_date = NULL, amount_paid = NULL,
             settlement_reference = NULL, settlement_date = NULL,
             settled_at = NULL, settled_by = NULL,
             payment_channel = 'direct', engineer_transaction_id = NULL, updated_at = now()
       WHERE id = v_src_id;
    ELSE
      UPDATE material_purchase_expenses
         SET payment_channel = 'direct', engineer_transaction_id = NULL, updated_at = now()
       WHERE id = v_src_id;
    END IF;

  ELSIF v_type = 'misc' THEN
    IF p_mode = 'undo' THEN
      UPDATE misc_expenses
         SET is_cancelled = true, cancelled_at = now(), cancelled_by_user_id = v_caller_id,
             cancellation_reason = COALESCE(p_reason, 'Wallet spend reversed'),
             engineer_transaction_id = NULL
       WHERE id = v_src_id;
    ELSE
      UPDATE misc_expenses
         SET payer_type = 'company_direct', payment_channel = 'direct', engineer_transaction_id = NULL
       WHERE id = v_src_id;
    END IF;

  ELSIF v_type = 'tea' THEN
    IF p_mode = 'undo' THEN
      UPDATE tea_shop_settlements
         SET is_cancelled = true, site_engineer_transaction_id = NULL
       WHERE id = v_src_id;
    ELSE
      UPDATE tea_shop_settlements
         SET payment_channel = 'direct', site_engineer_transaction_id = NULL
       WHERE id = v_src_id;
    END IF;

  ELSIF v_type = 'rental' THEN
    IF p_mode = 'undo' THEN
      RAISE EXCEPTION 'Rental "undo" is not supported yet — use "Paid by company", or reverse on the rentals page'
        USING ERRCODE = '0A000';
    END IF;
    IF v_rental_kind = 'advance' THEN
      UPDATE rental_advances
         SET payment_channel = 'direct', engineer_transaction_id = NULL WHERE id = v_src_id;
    ELSE
      UPDATE rental_settlements
         SET payment_channel = 'direct', engineer_transaction_id = NULL WHERE id = v_src_id;
    END IF;

  ELSIF v_type = 'task_work' THEN
    IF p_mode = 'undo' THEN
      -- Same effect as deleting the payment from the Task Work → Payments tab:
      -- the package's paid total drops and the balance reopens.
      UPDATE task_work_payments
         SET is_deleted = true, engineer_transaction_id = NULL
       WHERE id = v_src_id;
    ELSE
      -- Keep the payment on record but no longer wallet-funded.
      UPDATE task_work_payments
         SET payment_channel = 'direct', engineer_transaction_id = NULL
       WHERE id = v_src_id;
    END IF;
  END IF;

  UPDATE site_engineer_transactions
     SET cancelled_at = now(), cancelled_by = v_caller_name, cancelled_by_user_id = v_caller_id,
         cancellation_reason = COALESCE(
           p_reason,
           CASE WHEN p_mode = 'undo' THEN 'Settlement undone from wallet'
                ELSE 'Reclassified as company-paid' END)
   WHERE id = p_spend_id;

  RETURN jsonb_build_object(
    'spend_id', p_spend_id, 'source_type', v_type, 'source_id', v_src_id,
    'mode', p_mode, 'cancelled', true
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reverse_wallet_spend(uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.reverse_wallet_spend(uuid, text, text) IS
'Soft-cancels a non-salary wallet spend and cascades to its source: mode=undo
returns the source to pre-settlement state (material unpaid / misc+tea cancelled /
task-work payment soft-deleted), mode=company_paid keeps it paid but reclassifies
to company/direct. Rental undo unsupported (company_paid only). Auth: admin/office
or recorder via auth.uid().';
