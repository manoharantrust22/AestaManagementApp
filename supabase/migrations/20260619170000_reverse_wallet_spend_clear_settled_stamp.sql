-- Reverse a wallet spend ('undo') must also clear the material settled stamp.
--
-- WHY: reverse_wallet_spend(p_mode='undo') for a material reset is_paid/paid_date/
-- amount_paid/settlement_reference/settlement_date/payment_channel/engineer_transaction_id,
-- but left settled_at/settled_by intact. The mpe_stamp_settled trigger only
-- stamps WHO/WHEN on a false->true transition WHEN settled_at IS NULL, so after a
-- reverse -> re-settle the "Settled by … on …" kept showing the FIRST (reversed)
-- settlement. Clearing settled_at/settled_by here lets the next settle re-stamp.
--
-- ADDITIVE: only nulls two audit columns on a material row already being reset to
-- unpaid. Every other source-type branch (misc/tea/rental/company_paid) is
-- byte-for-byte the live definition. Full body re-declared because CREATE OR
-- REPLACE requires it.

CREATE OR REPLACE FUNCTION public.reverse_wallet_spend(p_spend_id uuid, p_mode text, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
    RAISE EXCEPTION 'This spend has no linked material/misc/rental/tea record to cascade to'
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
