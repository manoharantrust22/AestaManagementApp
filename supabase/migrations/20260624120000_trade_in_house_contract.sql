-- Lazy, idempotent in-house DETAILED contract per (site, trade). The trade's own day-to-day
-- labour records attendance + settles wages against this contract — exactly like Civil's
-- "Civil — In-house". is_in_house=true exempts the contract_party_check (no team/laborer needed).
CREATE OR REPLACE FUNCTION public.ensure_trade_in_house_contract(
  p_site_id            uuid,
  p_trade_category_id  uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id    uuid;
  v_name  text;
BEGIN
  SELECT id INTO v_id
    FROM public.subcontracts
   WHERE site_id = p_site_id
     AND trade_category_id = p_trade_category_id
     AND is_in_house = true
   LIMIT 1;
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  SELECT name INTO v_name FROM public.labor_categories WHERE id = p_trade_category_id;
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Trade % not found', p_trade_category_id;
  END IF;

  INSERT INTO public.subcontracts (
    id, site_id, trade_category_id, contract_type, title,
    is_in_house, labor_tracking_mode, status, total_value, is_rate_based
  ) VALUES (
    gen_random_uuid(), p_site_id, p_trade_category_id, 'mesthri', v_name || ' — In-house',
    true, 'detailed', 'active', 0, false
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.ensure_trade_in_house_contract(uuid, uuid) IS
  'Idempotent: returns the {trade} in-house DETAILED contract for a site, creating it on first use. Drives per-trade attendance + salary.';

GRANT EXECUTE ON FUNCTION public.ensure_trade_in_house_contract(uuid, uuid) TO authenticated;
