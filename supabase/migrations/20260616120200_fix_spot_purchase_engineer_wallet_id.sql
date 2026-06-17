-- Fix latent spot-purchase wallet bug: record_spot_purchase passed auth.uid()
-- (the AUTH user id) as p_engineer_id / p_recorded_by_user_id to
-- atomic_record_wallet_spend. But site_engineer_transactions.user_id references
-- public.users(id), and auth_id <> id for every user, so a real spot purchase
-- would either fail the FK insert or write a wallet spend keyed to the wrong id
-- — invisible on /site/my-wallet (which queries by public.users.id).
--
-- 0 spot rows exist today, so this is a latent fix bundled with the engineer
-- wallet hardening. Only change vs the live definition: resolve
-- v_engineer_public_id := (SELECT id FROM users WHERE auth_id = auth.uid()) and
-- pass it as p_engineer_id and p_recorded_by_user_id. created_by on the expense
-- row stays auth.uid() (that column references auth.users).

CREATE OR REPLACE FUNCTION public.record_spot_purchase(payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_site_id           uuid;
  v_site_group_id     uuid;
  v_vendor_id         uuid;
  v_batch_id          uuid;
  v_ref_code          text;
  v_alloc_mode        text;
  v_total             numeric;
  v_payment_mode      text;
  v_wallet_payment    text;
  v_item              jsonb;
  v_material_id       uuid;
  v_qty               numeric;
  v_rate              numeric;
  v_unit              text;
  v_inv_id            uuid;
  v_alloc             jsonb;
  v_engineer_tx_id    uuid;
  v_engineer_public_id uuid;
  v_attempts          int := 0;
BEGIN
  v_site_id    := (payload->>'site_id')::uuid;
  v_alloc_mode := COALESCE(payload->>'allocation_mode', 'own_site');
  v_total      := (payload->>'total_amount')::numeric;
  v_payment_mode := COALESCE(payload->>'payment_mode', 'cash');

  IF v_site_id IS NULL THEN
    RAISE EXCEPTION 'site_id is required';
  END IF;
  IF v_total IS NULL OR v_total <= 0 THEN
    RAISE EXCEPTION 'total_amount must be > 0';
  END IF;

  -- Resolve the engineer's PUBLIC user id (site_engineer_transactions.user_id
  -- references public.users(id), NOT auth.users). auth.uid() is the auth id.
  SELECT id INTO v_engineer_public_id FROM users WHERE auth_id = auth.uid();
  IF v_engineer_public_id IS NULL THEN
    RAISE EXCEPTION 'No public user profile for the current auth user; cannot debit the wallet';
  END IF;

  IF v_alloc_mode = 'group' THEN
    SELECT site_group_id INTO v_site_group_id FROM sites WHERE id = v_site_id;
    IF v_site_group_id IS NULL THEN
      RAISE EXCEPTION 'site is not in a group; cannot allocate as group';
    END IF;
  END IF;

  IF (payload->'vendor') ? 'id' AND (payload->'vendor'->>'id') IS NOT NULL THEN
    v_vendor_id := (payload->'vendor'->>'id')::uuid;
  ELSE
    INSERT INTO vendors (name, vendor_type, is_draft, created_by, created_at)
    VALUES (
      COALESCE(payload->'vendor'->>'name', 'Unknown Shop'),
      'individual'::vendor_type,
      true,
      auth.uid(),
      now()
    )
    RETURNING id INTO v_vendor_id;
  END IF;

  LOOP
    v_ref_code := 'SPOT-' || to_char(now(), 'YYMMDD') || '-' ||
                  upper(substr(md5(random()::text || v_site_id::text || clock_timestamp()::text), 1, 5));
    IF NOT EXISTS (SELECT 1 FROM material_purchase_expenses WHERE ref_code = v_ref_code) THEN
      EXIT;
    END IF;
    v_attempts := v_attempts + 1;
    IF v_attempts > 50 THEN
      RAISE EXCEPTION 'Could not generate unique spot purchase ref_code after 50 attempts';
    END IF;
  END LOOP;

  INSERT INTO material_purchase_expenses (
    site_id, ref_code, purchase_type, vendor_id, vendor_name, purchase_date,
    total_amount, payment_mode, payment_screenshot_url, bill_url,
    is_paid, paid_date, status, payment_channel, site_group_id,
    notes, created_by
  ) VALUES (
    v_site_id, v_ref_code, 'spot', v_vendor_id,
    payload->'vendor'->>'name',
    COALESCE((payload->>'purchase_date')::date, CURRENT_DATE),
    v_total, v_payment_mode,
    payload->>'payment_screenshot_url',
    payload->>'bill_url',
    true, CURRENT_DATE, 'completed', 'engineer_wallet',
    v_site_group_id,
    payload->>'notes',
    auth.uid()
  ) RETURNING id INTO v_batch_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(payload->'items') LOOP
    v_qty  := (v_item->>'qty')::numeric;
    v_rate := (v_item->>'rate')::numeric;

    IF v_qty IS NULL OR v_qty <= 0 THEN
      RAISE EXCEPTION 'item qty must be > 0';
    END IF;
    IF v_rate IS NULL OR v_rate < 0 THEN
      RAISE EXCEPTION 'item rate must be >= 0';
    END IF;

    IF v_item ? 'material_id' AND (v_item->>'material_id') IS NOT NULL THEN
      v_material_id := (v_item->>'material_id')::uuid;
    ELSE
      v_unit := COALESCE(v_item->'new_material'->>'unit', 'piece');
      BEGIN
        PERFORM v_unit::material_unit;
      EXCEPTION WHEN others THEN
        v_unit := 'piece';
      END;

      INSERT INTO materials (
        name, category_id, unit, is_draft, created_by, created_at
      ) VALUES (
        v_item->'new_material'->>'name',
        NULLIF(v_item->'new_material'->>'category_id', '')::uuid,
        v_unit::material_unit,
        true,
        auth.uid(),
        now()
      )
      RETURNING id INTO v_material_id;
    END IF;

    INSERT INTO material_purchase_expense_items (
      purchase_expense_id, material_id, quantity, unit_price
    ) VALUES (
      v_batch_id, v_material_id, v_qty, v_rate
    );

    PERFORM record_price_entry(
      v_vendor_id,
      v_material_id,
      NULL,
      v_rate,
      false,
      NULL,
      NULL,
      NULL,
      NULL,
      'spot_purchase',
      v_ref_code,
      v_qty,
      NULL,
      auth.uid(),
      NULL
    );

    SELECT id INTO v_inv_id
      FROM stock_inventory
     WHERE site_id = v_site_id AND material_id = v_material_id AND brand_id IS NULL
     LIMIT 1;

    IF v_inv_id IS NULL THEN
      INSERT INTO stock_inventory (
        site_id, material_id, current_qty, avg_unit_cost, last_received_date
      ) VALUES (
        v_site_id, v_material_id, v_qty, v_rate, CURRENT_DATE
      )
      RETURNING id INTO v_inv_id;
    ELSE
      UPDATE stock_inventory
         SET current_qty = current_qty + v_qty,
             avg_unit_cost = CASE
               WHEN current_qty + v_qty > 0
                 THEN ((current_qty * COALESCE(avg_unit_cost, 0)) + (v_qty * v_rate))
                      / (current_qty + v_qty)
               ELSE v_rate
             END,
             last_received_date = CURRENT_DATE,
             updated_at = now()
       WHERE id = v_inv_id;
    END IF;

    INSERT INTO stock_transactions (
      site_id, inventory_id, transaction_type, transaction_date,
      quantity, unit_cost, total_cost,
      reference_type, reference_id, created_by
    ) VALUES (
      v_site_id, v_inv_id, 'purchase'::stock_transaction_type, CURRENT_DATE,
      v_qty, v_rate, v_qty * v_rate,
      'spot_purchase', v_batch_id, auth.uid()
    );
  END LOOP;

  v_wallet_payment := CASE
    WHEN v_payment_mode IN ('cash', 'upi', 'bank_transfer') THEN v_payment_mode
    ELSE 'cash'
  END;

  v_engineer_tx_id := atomic_record_wallet_spend(
    v_engineer_public_id,
    v_site_id,
    v_total,
    CURRENT_DATE,
    v_wallet_payment,
    payload->>'payment_screenshot_url',
    'Spot purchase ' || v_ref_code,
    COALESCE(payload->>'recorded_by_name', ''),
    v_engineer_public_id,
    'Spot purchase ' || v_ref_code
  );

  UPDATE material_purchase_expenses
     SET engineer_transaction_id = v_engineer_tx_id
   WHERE id = v_batch_id;

  IF v_alloc_mode = 'group' AND payload ? 'provisional_split' THEN
    DECLARE
      v_split_sum numeric;
    BEGIN
      SELECT COALESCE(SUM((value->>'percentage')::numeric), 0)
        INTO v_split_sum
        FROM jsonb_array_elements(payload->'provisional_split');
      IF v_split_sum > 0 AND abs(v_split_sum - 100) > 0.01 THEN
        RAISE EXCEPTION 'provisional_split must sum to 100 (got %)', v_split_sum;
      END IF;
    END;

    FOR v_alloc IN SELECT * FROM jsonb_array_elements(payload->'provisional_split') LOOP
      INSERT INTO spot_purchase_allocations (
        batch_id, site_id, percentage, is_final
      ) VALUES (
        v_batch_id,
        (v_alloc->>'site_id')::uuid,
        (v_alloc->>'percentage')::numeric,
        false
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'batch_id', v_batch_id,
    'ref_code', v_ref_code,
    'vendor_id', v_vendor_id,
    'engineer_transaction_id', v_engineer_tx_id
  );
END $function$;
