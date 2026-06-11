-- Migration: set_batch_usage_brand RPC
--
-- Lets an authorized user correct ONLY the brand on a group-batch usage record.
--
-- WHY AN RPC (mirrors reassign_batch_usage, 20260601120000):
--   * The batch_usage_records UPDATE RLS policy is USING (can_access_site(usage_site_id))
--     with no separate WITH CHECK, so a site engineer assigned only to their own site
--     can hit RLS friction on sibling cluster rows. SECURITY DEFINER sidesteps that,
--     exactly as the insert/reassign RPCs do.
--   * Brand is REPORTING-ONLY here — settlement matches usage<->purchase on material_id,
--     never brand_id — so a brand change is financially inert and must remain editable
--     even when the row is settled / in a settlement. This function deliberately touches
--     ONLY brand_id (never quantity / usage_site_id / settlement_status), so it cannot
--     disturb any settlement, batch roll-up, or stock figure. No trigger recompute needed.
--
-- p_brand_id NULL is a valid value (clears the brand back to "Brand not set").

CREATE OR REPLACE FUNCTION set_batch_usage_brand(
  p_usage_id uuid,
  p_brand_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE batch_usage_records
     SET brand_id   = p_brand_id,
         updated_at = now()
   WHERE id = p_usage_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usage record % not found', p_usage_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_batch_usage_brand(uuid, uuid) TO authenticated;
