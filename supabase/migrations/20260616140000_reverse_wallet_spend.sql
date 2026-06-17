-- Reverse / delete a non-salary wallet spend with cascade to its source.
--
-- WHY: only salary/contract settlements could be reversed (reverse_settlement).
-- Material/misc/rental/tea wallet spends were one-way linked with no way to
-- remove a wrong entry from My Wallet or push the correction to the source.
-- Models reverse_settlement: SECURITY DEFINER, auth via auth.uid() (admin/office
-- or the spend's recorder), advisory lock, idempotent, soft-cancel (audit kept).
--
-- Two modes:
--   'undo'        — source returns to pre-settlement state (re-settleable / voided)
--   'company_paid'— source stays paid but is reclassified to company/direct
-- In both the wallet spend is soft-cancelled (balance restores; views filter cancelled_at).
--
-- Rental 'undo' is intentionally NOT supported yet (rental tables lack a soft-cancel
-- column and excluding them needs surgery on the large v_all_expenses view); rental
-- 'company_paid' is supported. Salary spends are rejected (use reverse_settlement).

-- ---------------------------------------------------------------------------
-- Resolve which source a wallet spend was created from.
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

  RETURN jsonb_build_object('source_type','none','source_id',null,'is_settled',false);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_wallet_spend_source(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Reverse the spend + cascade to the source.
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

  -- Idempotent: already cancelled → no-op.
  IF v_spend.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('already_cancelled', true, 'spend_id', p_spend_id);
  END IF;

  -- Authorise from the request JWT: admin/office, or the recorder of this spend.
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
    RAISE EXCEPTION 'This spend has no linked material/misc/rental/tea record to cascade to'
      USING ERRCODE = '22023';
  END IF;

  -- Cascade to the source per type + mode.
  IF v_type = 'material' THEN
    IF p_mode = 'undo' THEN
      UPDATE material_purchase_expenses
         SET is_paid = false, paid_date = NULL, amount_paid = NULL,
             settlement_reference = NULL, settlement_date = NULL,
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
  END IF;

  -- Soft-cancel the wallet spend (balance + allocations filter cancelled_at IS NULL).
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
returns the source to pre-settlement state (material unpaid / misc+tea cancelled),
mode=company_paid keeps it paid but reclassifies to company/direct. Rental undo
unsupported (company_paid only). Auth: admin/office or recorder via auth.uid().';
