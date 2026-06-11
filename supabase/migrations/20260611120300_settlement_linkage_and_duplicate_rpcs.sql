-- Linkage + duplicate-detection read RPCs for the Spend details dialog.
--
-- get_settlement_linkage: given a wallet spend's settlement_group_id (preferred) or
-- the spend id (historical fallback for pre-link rows), return the settlement it
-- belongs to so the dialog can show "this debit paid SET-260604-002, salary, 3
-- laborers, recorded by X". Read-only, SECURITY DEFINER so office sees cross-site.
--
-- find_possible_duplicate_settlements: given a settlement group, return OTHER LIVE
-- groups that look like duplicates (same site + date + amount + laborer_count). This
-- is exactly the observed bug signature (same date/amount, sequential SET refs). The
-- dialog shows a "Possible duplicate" chip; reversal stays a manual, confirmed action.

CREATE OR REPLACE FUNCTION get_settlement_linkage(
  p_group_id uuid DEFAULT NULL,
  p_spend_id uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group settlement_groups%ROWTYPE;
BEGIN
  IF p_group_id IS NOT NULL THEN
    SELECT * INTO v_group FROM settlement_groups WHERE id = p_group_id;
  ELSIF p_spend_id IS NOT NULL THEN
    -- Historical fallback: rows created before the spend carried settlement_group_id.
    SELECT * INTO v_group
    FROM settlement_groups
    WHERE engineer_transaction_id = p_spend_id
    ORDER BY created_at DESC
    LIMIT 1;
  ELSE
    RETURN NULL;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object(
    'group_id', v_group.id,
    'settlement_reference', v_group.settlement_reference,
    'settlement_date', v_group.settlement_date,
    'actual_payment_date', v_group.actual_payment_date,
    'total_amount', v_group.total_amount,
    'payment_type', v_group.payment_type,
    'payment_channel', v_group.payment_channel,
    'laborer_count', v_group.laborer_count,
    'payer_source', v_group.payer_source,
    'payer_name', v_group.payer_name,
    'is_cancelled', v_group.is_cancelled,
    'created_by_name', v_group.created_by_name,
    'created_at', v_group.created_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION find_possible_duplicate_settlements(
  p_group_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group settlement_groups%ROWTYPE;
  v_dupes jsonb;
BEGIN
  IF p_group_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT * INTO v_group FROM settlement_groups WHERE id = p_group_id;
  IF NOT FOUND OR v_group.is_cancelled THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'group_id', sg.id,
      'settlement_reference', sg.settlement_reference,
      'settlement_date', sg.settlement_date,
      'total_amount', sg.total_amount,
      'laborer_count', sg.laborer_count,
      'created_by_name', sg.created_by_name,
      'created_at', sg.created_at
    )
    ORDER BY sg.settlement_reference
  ), '[]'::jsonb)
  INTO v_dupes
  FROM settlement_groups sg
  WHERE sg.id <> v_group.id
    AND sg.is_cancelled = false
    AND sg.site_id = v_group.site_id
    AND sg.settlement_date = v_group.settlement_date
    AND sg.total_amount = v_group.total_amount
    AND sg.laborer_count = v_group.laborer_count;

  RETURN v_dupes;
END;
$$;

GRANT EXECUTE ON FUNCTION get_settlement_linkage(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION get_settlement_linkage(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION find_possible_duplicate_settlements(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION find_possible_duplicate_settlements(uuid) TO service_role;

COMMENT ON FUNCTION get_settlement_linkage(uuid, uuid) IS
  'Read-only: resolves a wallet spend to its settlement_group (by group id, else by engineer_transaction_id fallback) and returns its summary for the Spend details dialog.';
COMMENT ON FUNCTION find_possible_duplicate_settlements(uuid) IS
  'Read-only: returns OTHER live settlement_groups matching this one on (site, date, total_amount, laborer_count) — the duplicate-spend signature. Powers the "Possible duplicate" warning chip.';
