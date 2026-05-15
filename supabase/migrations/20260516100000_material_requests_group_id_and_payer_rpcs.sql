-- Cross-site visibility for group_stock material requests + payer-change RPCs.
--
-- Until now, material_requests had no site_group_id, so a request created on Site A
-- with purchase_type='group_stock' was invisible to Site B even though both share a group.
-- Mirrors the pattern already used on purchase_orders (20260514140000).
--
-- Also adds three RPCs that let users move the paying site at three lifecycle stages:
--   change_request_payer  : while still a material request
--   change_po_payer       : on a purchase order (cascades to linked expense)
--   change_expense_payer  : on a recorded material_purchase_expenses row
--
-- All RPCs are SECURITY DEFINER + validate caller-side access via can_access_site,
-- and require source + target sites to share the same site_group_id.

-- 1. Add site_group_id column + index
ALTER TABLE public.material_requests
  ADD COLUMN IF NOT EXISTS site_group_id UUID REFERENCES public.site_groups(id);

CREATE INDEX IF NOT EXISTS idx_material_requests_site_group_id
  ON public.material_requests(site_group_id) WHERE site_group_id IS NOT NULL;

-- 2. Backfill: any existing group_stock request gets its origin site's site_group_id
UPDATE public.material_requests mr
SET site_group_id = s.site_group_id
FROM public.sites s
WHERE mr.site_id = s.id
  AND mr.purchase_type = 'group_stock'
  AND mr.site_group_id IS NULL
  AND s.site_group_id IS NOT NULL;

-- 3. RPC: change_request_payer
-- Moves a material_requests row to a different site within the same group.
CREATE OR REPLACE FUNCTION public.change_request_payer(
  p_request_id UUID,
  p_new_site_id UUID
)
RETURNS public.material_requests
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old material_requests%ROWTYPE;
  v_new_site_group UUID;
  v_old_site_group UUID;
  v_updated material_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.material_requests WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material request % not found', p_request_id;
  END IF;

  IF v_old.status NOT IN ('draft','pending','approved') THEN
    RAISE EXCEPTION 'Cannot change payer on request in status %', v_old.status;
  END IF;

  IF NOT (public.can_access_site(v_old.site_id) AND public.can_access_site(p_new_site_id)) THEN
    RAISE EXCEPTION 'Caller lacks access to source or target site';
  END IF;

  SELECT site_group_id INTO v_old_site_group FROM public.sites WHERE id = v_old.site_id;
  SELECT site_group_id INTO v_new_site_group FROM public.sites WHERE id = p_new_site_id;

  IF v_old_site_group IS NULL OR v_new_site_group IS NULL OR v_old_site_group <> v_new_site_group THEN
    RAISE EXCEPTION 'Source and target sites must belong to the same site group';
  END IF;

  UPDATE public.material_requests
  SET site_id = p_new_site_id,
      site_group_id = v_new_site_group,
      updated_at = NOW()
  WHERE id = p_request_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

-- 4. RPC: change_po_payer
-- Moves a purchase_orders row to a different site in the same group.
-- Cascades to any linked material_purchase_expenses.paying_site_id.
CREATE OR REPLACE FUNCTION public.change_po_payer(
  p_po_id UUID,
  p_new_site_id UUID
)
RETURNS public.purchase_orders
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old purchase_orders%ROWTYPE;
  v_old_site_group UUID;
  v_new_site_group UUID;
  v_updated purchase_orders%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.purchase_orders WHERE id = p_po_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % not found', p_po_id;
  END IF;

  -- Allow change up through partial_delivered; once fully delivered, payer is settled
  IF v_old.status::text NOT IN ('draft','pending','approved','ordered','partial_delivered') THEN
    RAISE EXCEPTION 'Cannot change payer on PO in status %', v_old.status;
  END IF;

  IF NOT (public.can_access_site(v_old.site_id) AND public.can_access_site(p_new_site_id)) THEN
    RAISE EXCEPTION 'Caller lacks access to source or target site';
  END IF;

  SELECT site_group_id INTO v_old_site_group FROM public.sites WHERE id = v_old.site_id;
  SELECT site_group_id INTO v_new_site_group FROM public.sites WHERE id = p_new_site_id;

  IF v_old_site_group IS NULL OR v_new_site_group IS NULL OR v_old_site_group <> v_new_site_group THEN
    RAISE EXCEPTION 'Source and target sites must belong to the same site group';
  END IF;

  UPDATE public.purchase_orders
  SET site_id = p_new_site_id,
      site_group_id = v_new_site_group,
      updated_at = NOW()
  WHERE id = p_po_id
  RETURNING * INTO v_updated;

  -- Cascade to linked unpaid expenses (paying_site_id mirrors PO's paying site)
  UPDATE public.material_purchase_expenses
  SET paying_site_id = p_new_site_id,
      site_id = p_new_site_id,
      site_group_id = v_new_site_group,
      updated_at = NOW()
  WHERE local_purchase_id = p_po_id
    AND COALESCE(is_paid, FALSE) = FALSE;

  RETURN v_updated;
END;
$$;

-- 5. RPC: change_expense_payer
-- Re-attributes a material_purchase_expenses row to a different paying site in the same group.
-- For settled rows, requires p_force=true (caller acknowledges inter-site rebalancing).
CREATE OR REPLACE FUNCTION public.change_expense_payer(
  p_expense_id UUID,
  p_new_paying_site_id UUID,
  p_force BOOLEAN DEFAULT FALSE
)
RETURNS public.material_purchase_expenses
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_old material_purchase_expenses%ROWTYPE;
  v_old_site_group UUID;
  v_new_site_group UUID;
  v_updated material_purchase_expenses%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.material_purchase_expenses WHERE id = p_expense_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Material purchase expense % not found', p_expense_id;
  END IF;

  IF v_old.settlement_reference IS NOT NULL AND NOT p_force THEN
    RAISE EXCEPTION 'Expense % has settlement_reference=%; pass force=true to re-attribute',
      p_expense_id, v_old.settlement_reference;
  END IF;

  IF NOT (public.can_access_site(v_old.site_id) AND public.can_access_site(p_new_paying_site_id)) THEN
    RAISE EXCEPTION 'Caller lacks access to source or target site';
  END IF;

  SELECT site_group_id INTO v_old_site_group FROM public.sites WHERE id = v_old.site_id;
  SELECT site_group_id INTO v_new_site_group FROM public.sites WHERE id = p_new_paying_site_id;

  IF v_old_site_group IS NULL OR v_new_site_group IS NULL OR v_old_site_group <> v_new_site_group THEN
    RAISE EXCEPTION 'Source and target sites must belong to the same site group';
  END IF;

  UPDATE public.material_purchase_expenses
  SET paying_site_id = p_new_paying_site_id,
      site_id = p_new_paying_site_id,
      site_group_id = v_new_site_group,
      updated_at = NOW()
  WHERE id = p_expense_id
  RETURNING * INTO v_updated;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.change_request_payer(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_po_payer(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.change_expense_payer(UUID, UUID, BOOLEAN) TO anon, authenticated;
