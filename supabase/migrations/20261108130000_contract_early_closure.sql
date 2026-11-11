-- "End contract early": a contractor walks off site before finishing (e.g. Jithin's Civil
-- contract). Until now the only options were a bare status flip:
--   • completed  → untrue; sections kept showing "₹X left" and "Remaining to pay".
--   • cancelled  → useSiteTrades drops cancelled rows, so every rupee already paid fell
--                  into "Site-wide / Unlinked" expenses.
--
-- Owner decisions (2026-11-08):
--   1. Money already paid STAYS on the contract (true history; expenses keep it under the trade).
--   2. The unpaid balance is written off — final value = what was actually paid, nothing owed.
--   3. Unfinished sections are HANDED OVER to the trade's in-house contract so the daily-labour
--      crew finishing the job is tracked against the remaining scope.
--
-- Additive only: new nullable columns, two RPCs, one attendance trigger, and a narrower
-- lookup in ensure_trade_in_house_contract.

-- ---------------------------------------------------------------------------
-- 1. Closure columns
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS closure_type text
    CHECK (closure_type IS NULL OR closure_type IN ('completed', 'ended_early')),
  ADD COLUMN IF NOT EXISTS closure_reason text,
  ADD COLUMN IF NOT EXISTS closure_note text,
  ADD COLUMN IF NOT EXISTS closed_at timestamptz,
  ADD COLUMN IF NOT EXISTS closed_by uuid,
  ADD COLUMN IF NOT EXISTS original_total_value numeric,
  ADD COLUMN IF NOT EXISTS pre_closure_status public.contract_status,
  ADD COLUMN IF NOT EXISTS handed_over_to_subcontract_id uuid
    REFERENCES public.subcontracts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS closure_meta jsonb;

COMMENT ON COLUMN public.subcontracts.closure_type IS
  'NULL = open. ended_early = contractor left / terminated before finishing (see end_subcontract_early).';
COMMENT ON COLUMN public.subcontracts.original_total_value IS
  'total_value before an early-closure write-off; restored by reopen_subcontract.';
COMMENT ON COLUMN public.subcontracts.handed_over_to_subcontract_id IS
  'On an ended-early section: the in-house section created to carry its unfinished scope.';
COMMENT ON COLUMN public.subcontracts.closure_meta IS
  'Root of an ended-early contract only: {written_off, handed_over_total, in_house_id, handovers:[{from,to,amount}]}.';

-- ---------------------------------------------------------------------------
-- 2. ensure_trade_in_house_contract must return the TOP-LEVEL in-house contract.
--    Handed-over sections are themselves is_in_house=true children; without this filter
--    the LIMIT 1 could return a section instead of the contract.
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
     AND parent_subcontract_id IS NULL
   ORDER BY (status IN ('active', 'on_hold', 'draft')) DESC, created_at
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

-- ---------------------------------------------------------------------------
-- 3. end_subcontract_early
--
-- For the root contract and every non-cancelled descendant (bottom-up):
--   new_total = own paid (v_subcontract_reconciliation.amount_paid) + Σ children's new_total
-- so at every level value == paid and "Remaining to pay" becomes 0. Children that were
-- already `completed` keep their value (that work was genuinely finished).
-- Fixed-price task_work_packages are separate deals (often another crew) and are untouched.
--
-- p_handover_ids: direct children of the root whose unfinished scope moves to In-house.
-- The root's own id means "the remainder recorded directly on the contract".
CREATE OR REPLACE FUNCTION public.end_subcontract_early(
  p_contract_id   uuid,
  p_end_date      date,
  p_reason        text,
  p_note          text DEFAULT NULL,
  p_handover_ids  uuid[] DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_root          public.subcontracts%ROWTYPE;
  v_trade_name    text;
  v_in_house_id   uuid;
  v_new           jsonb := '{}'::jsonb;
  r               record;
  v_child_sum     numeric;
  v_new_total     numeric;
  v_amount        numeric;
  v_new_id        uuid;
  v_handovers     jsonb := '[]'::jsonb;
  v_handed_total  numeric := 0;
  v_written_off   numeric;
  v_old_root      numeric;
  v_own_old       numeric;
  v_own_paid      numeric;
  v_nodes         jsonb;
BEGIN
  IF p_end_date IS NULL THEN
    RAISE EXCEPTION 'End date is required';
  END IF;

  SELECT * INTO v_root FROM public.subcontracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contract % not found', p_contract_id;
  END IF;
  IF v_root.parent_subcontract_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only a top-level contract can be ended early';
  END IF;
  IF v_root.is_in_house THEN
    RAISE EXCEPTION 'An in-house contract cannot be ended early';
  END IF;
  IF v_root.status NOT IN ('active', 'on_hold') THEN
    RAISE EXCEPTION 'Only an active or on-hold contract can be ended early (status is %)', v_root.status;
  END IF;
  IF v_root.trade_category_id IS NULL THEN
    RAISE EXCEPTION 'Contract has no trade; set its trade before ending it';
  END IF;

  -- Snapshot the subtree (non-cancelled) with each node's own paid.
  WITH RECURSIVE tree AS (
    SELECT sc.id, sc.parent_subcontract_id AS parent_id, 0 AS depth
      FROM public.subcontracts sc WHERE sc.id = p_contract_id
    UNION ALL
    SELECT c.id, c.parent_subcontract_id, t.depth + 1
      FROM public.subcontracts c
      JOIN tree t ON c.parent_subcontract_id = t.id
     WHERE c.status <> 'cancelled'
  )
  SELECT jsonb_agg(jsonb_build_object(
           'id', t.id, 'parent_id', t.parent_id, 'depth', t.depth,
           'status', sc.status::text, 'title', sc.title,
           'old_total', COALESCE(sc.total_value, 0),
           'own_paid', COALESCE(rec.amount_paid, 0)))
    INTO v_nodes
    FROM tree t
    JOIN public.subcontracts sc ON sc.id = t.id
    LEFT JOIN public.v_subcontract_reconciliation rec ON rec.subcontract_id = t.id;

  -- Bottom-up new totals.
  FOR r IN SELECT * FROM jsonb_to_recordset(v_nodes) AS x(id uuid, parent_id uuid, depth int, status text, title text, old_total numeric, own_paid numeric) ORDER BY depth DESC LOOP
    SELECT COALESCE(SUM((v_new ->> n.id::text)::numeric), 0) INTO v_child_sum
      FROM jsonb_to_recordset(v_nodes) AS n(id uuid, parent_id uuid, depth int, status text, title text, old_total numeric, own_paid numeric) WHERE n.parent_id = r.id AND n.id <> r.id;
    IF r.status = 'completed' AND r.id <> p_contract_id THEN
      v_new_total := r.old_total;          -- finished work keeps its value
    ELSE
      v_new_total := r.own_paid + v_child_sum;
    END IF;
    v_new := v_new || jsonb_build_object(r.id::text, v_new_total);
  END LOOP;

  -- Hand over unfinished scope to the trade's in-house contract.
  IF COALESCE(array_length(p_handover_ids, 1), 0) > 0 THEN
    v_in_house_id := public.ensure_trade_in_house_contract(v_root.site_id, v_root.trade_category_id);
    UPDATE public.subcontracts
       SET status = 'active', closure_type = NULL, actual_end_date = NULL
     WHERE id = v_in_house_id AND status <> 'active';

    FOR r IN
      SELECT n.* FROM jsonb_to_recordset(v_nodes) AS n(id uuid, parent_id uuid, depth int, status text, title text, old_total numeric, own_paid numeric)
       WHERE n.id = ANY (p_handover_ids)
         AND (n.depth = 1 OR n.id = p_contract_id)
       ORDER BY n.depth DESC, n.title
    LOOP
      IF r.id = p_contract_id THEN
        -- Remainder recorded directly on the contract (not inside any section).
        SELECT r.old_total - COALESCE(SUM(n.old_total), 0) INTO v_own_old
          FROM jsonb_to_recordset(v_nodes) AS n(id uuid, parent_id uuid, depth int, status text, title text, old_total numeric, own_paid numeric) WHERE n.parent_id = p_contract_id AND n.depth = 1;
        v_amount := GREATEST(0, GREATEST(0, v_own_old) - r.own_paid);
      ELSIF r.status = 'completed' THEN
        v_amount := 0;
      ELSE
        v_amount := GREATEST(0, r.old_total - (v_new ->> r.id::text)::numeric);
      END IF;
      CONTINUE WHEN v_amount <= 0;

      INSERT INTO public.subcontracts (
        id, site_id, trade_category_id, parent_subcontract_id, stage_id,
        contract_type, title, description, scope_of_work,
        is_in_house, labor_tracking_mode, status, total_value, is_rate_based,
        start_date, notes
      )
      SELECT gen_random_uuid(), sc.site_id, sc.trade_category_id, v_in_house_id, sc.stage_id,
             'mesthri',
             CASE WHEN r.id = p_contract_id THEN 'Remaining work from ' || sc.title ELSE sc.title END,
             sc.description, sc.scope_of_work,
             true, 'detailed', 'active', v_amount, false,
             p_end_date + 1,
             'Handed over from "' || v_root.title || '" when it ended early on '
               || to_char(p_end_date, 'DD Mon YYYY') || '.'
        FROM public.subcontracts sc WHERE sc.id = r.id
      RETURNING id INTO v_new_id;

      UPDATE public.subcontracts SET handed_over_to_subcontract_id = v_new_id WHERE id = r.id;
      v_handed_total := v_handed_total + v_amount;
      v_handovers := v_handovers || jsonb_build_array(jsonb_build_object(
        'from', r.id, 'to', v_new_id, 'title', r.title, 'amount', v_amount));
    END LOOP;

    -- Keep the in-house contract's own leftover unchanged (its total includes its sections).
    IF v_handed_total > 0 THEN
      UPDATE public.subcontracts
         SET total_value = COALESCE(total_value, 0) + v_handed_total
       WHERE id = v_in_house_id;
    END IF;
  END IF;

  -- Freeze every node at what was paid.
  UPDATE public.subcontracts sc
     SET original_total_value = sc.total_value,
         total_value          = (v_new ->> sc.id::text)::numeric,
         pre_closure_status   = sc.status,
         status               = 'completed',
         closure_type         = 'ended_early',
         closure_reason       = p_reason,
         closure_note         = p_note,
         actual_end_date      = p_end_date,
         closed_at            = now(),
         closed_by            = auth.uid()
    FROM jsonb_to_recordset(v_nodes) AS n(id uuid, parent_id uuid, depth int, status text, title text, old_total numeric, own_paid numeric)
   WHERE sc.id = n.id
     AND (n.status <> 'completed' OR n.id = p_contract_id);

  v_old_root := v_root.total_value;
  v_written_off := GREATEST(0, COALESCE(v_old_root, 0) - (v_new ->> p_contract_id::text)::numeric);

  UPDATE public.subcontracts
     SET closure_meta = jsonb_build_object(
           'written_off', v_written_off,
           'handed_over_total', v_handed_total,
           'in_house_id', v_in_house_id,
           'handovers', v_handovers)
   WHERE id = p_contract_id;

  RETURN jsonb_build_object(
    'contract_id', p_contract_id,
    'final_value', (v_new ->> p_contract_id::text)::numeric,
    'written_off', v_written_off,
    'handed_over_total', v_handed_total,
    'in_house_id', v_in_house_id,
    'handovers', v_handovers);
END;
$$;

COMMENT ON FUNCTION public.end_subcontract_early(uuid, date, text, text, uuid[]) IS
  'Close a contract whose contractor left before finishing: freeze value at amount paid (balance written off), keep payments as history, hand unfinished sections to the trade in-house contract.';

GRANT EXECUTE ON FUNCTION public.end_subcontract_early(uuid, date, text, text, uuid[]) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. reopen_subcontract — exact reverse, refused once a handed-over section has activity.
CREATE OR REPLACE FUNCTION public.reopen_subcontract(p_contract_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_root  public.subcontracts%ROWTYPE;
  h       jsonb;
  v_to    uuid;
  v_total numeric := 0;
BEGIN
  SELECT * INTO v_root FROM public.subcontracts WHERE id = p_contract_id FOR UPDATE;
  IF NOT FOUND OR v_root.closure_type IS DISTINCT FROM 'ended_early' OR v_root.parent_subcontract_id IS NOT NULL THEN
    RAISE EXCEPTION 'This contract was not ended early';
  END IF;

  FOR h IN SELECT * FROM jsonb_array_elements(COALESCE(v_root.closure_meta -> 'handovers', '[]'::jsonb)) LOOP
    v_to := (h ->> 'to')::uuid;
    CONTINUE WHEN NOT EXISTS (SELECT 1 FROM public.subcontracts WHERE id = v_to);
    IF EXISTS (SELECT 1 FROM public.daily_attendance WHERE subcontract_id = v_to AND is_deleted = false)
       OR EXISTS (SELECT 1 FROM public.market_laborer_attendance WHERE subcontract_id = v_to)
       OR EXISTS (SELECT 1 FROM public.settlement_groups
                   WHERE (subcontract_id = v_to OR (contract_ref_kind = 'subcontract' AND contract_ref_id = v_to))
                     AND is_cancelled = false)
       OR EXISTS (SELECT 1 FROM public.subcontract_payments WHERE contract_id = v_to AND is_deleted = false)
       OR EXISTS (SELECT 1 FROM public.task_work_packages WHERE parent_subcontract_id = v_to)
       OR EXISTS (SELECT 1 FROM public.subcontracts WHERE parent_subcontract_id = v_to) THEN
      RAISE EXCEPTION 'Cannot reopen: the handed-over in-house section "%" already has work or payments logged', h ->> 'title';
    END IF;
  END LOOP;

  FOR h IN SELECT * FROM jsonb_array_elements(COALESCE(v_root.closure_meta -> 'handovers', '[]'::jsonb)) LOOP
    v_to := (h ->> 'to')::uuid;
    DELETE FROM public.subcontracts WHERE id = v_to;
    IF FOUND THEN
      v_total := v_total + COALESCE((h ->> 'amount')::numeric, 0);
    END IF;
  END LOOP;

  IF v_total > 0 AND (v_root.closure_meta ->> 'in_house_id') IS NOT NULL THEN
    UPDATE public.subcontracts
       SET total_value = GREATEST(0, COALESCE(total_value, 0) - v_total)
     WHERE id = (v_root.closure_meta ->> 'in_house_id')::uuid;
  END IF;

  WITH RECURSIVE tree AS (
    SELECT id FROM public.subcontracts WHERE id = p_contract_id
    UNION ALL
    SELECT c.id FROM public.subcontracts c JOIN tree t ON c.parent_subcontract_id = t.id
  )
  UPDATE public.subcontracts sc
     SET total_value                   = COALESCE(sc.original_total_value, sc.total_value),
         status                        = COALESCE(sc.pre_closure_status, 'active'),
         actual_end_date               = NULL,
         closure_type                  = NULL,
         closure_reason                = NULL,
         closure_note                  = NULL,
         closed_at                     = NULL,
         closed_by                     = NULL,
         original_total_value          = NULL,
         pre_closure_status            = NULL,
         handed_over_to_subcontract_id = NULL,
         closure_meta                  = NULL
    FROM tree
   WHERE sc.id = tree.id AND sc.closure_type = 'ended_early';
END;
$$;

GRANT EXECUTE ON FUNCTION public.reopen_subcontract(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Attendance dated AFTER an early end can't be tagged to the ended contract.
--    The tag is cleared (not rejected) so a whole-day save never fails: the day becomes
--    ordinary site/trade daily labour — which is exactly what that work now is.
--    Settlements are NOT guarded: the contractor's crew may legitimately be paid for
--    pre-end days after the end date.
CREATE OR REPLACE FUNCTION public.untag_attendance_from_ended_contract()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.subcontract_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.subcontract_id IS DISTINCT FROM OLD.subcontract_id OR NEW.date IS DISTINCT FROM OLD.date)
     AND EXISTS (
       SELECT 1 FROM public.subcontracts sc
        WHERE sc.id = NEW.subcontract_id
          AND sc.closure_type = 'ended_early'
          AND sc.actual_end_date IS NOT NULL
          AND NEW.date > sc.actual_end_date)
  THEN
    NEW.subcontract_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_untag_ended_contract ON public.daily_attendance;
CREATE TRIGGER trg_untag_ended_contract
  BEFORE INSERT OR UPDATE OF subcontract_id, date ON public.daily_attendance
  FOR EACH ROW EXECUTE FUNCTION public.untag_attendance_from_ended_contract();

DROP TRIGGER IF EXISTS trg_untag_ended_contract ON public.market_laborer_attendance;
CREATE TRIGGER trg_untag_ended_contract
  BEFORE INSERT OR UPDATE OF subcontract_id, date ON public.market_laborer_attendance
  FOR EACH ROW EXECUTE FUNCTION public.untag_attendance_from_ended_contract();
