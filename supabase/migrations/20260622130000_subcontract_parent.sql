-- Workforce: real PARENT contract (floors become optional children).
--
-- Until now a contractor's floor contracts (e.g. Jithin's Ground / 1st / 2nd Floor) were only
-- *visually* grouped in the workspace — there was no single record the owner could name, edit, or
-- link expenses to. This migration adds a real self-referencing parent on `subcontracts` plus a
-- transactional, REVERSIBLE "promote a contractor's contracts into one parent" operation.
--
-- Additive: one nullable self-FK column + one audit table + two SECURITY DEFINER functions.
-- No drops, no narrowing. The promote function only RE-POINTS foreign keys (a pure data move) and
-- snapshots the parent's value — it never changes any amount; an in-function assertion guards that
-- attendance earnings are conserved, and every change is journalled so `undo_reparent` can reverse it.

-- ---------------------------------------------------------------------------
-- 1) The parent link. NULL = top-level contract (every row today).
-- ---------------------------------------------------------------------------
ALTER TABLE public.subcontracts
  ADD COLUMN IF NOT EXISTS parent_subcontract_id uuid
    REFERENCES public.subcontracts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subcontracts_parent
  ON public.subcontracts (parent_subcontract_id);

COMMENT ON COLUMN public.subcontracts.parent_subcontract_id IS
  'Self-reference: when set, this contract is a child (e.g. a floor) of a combined parent contract. NULL = a top-level contract. Set by promote_to_parent_contract().';

-- ---------------------------------------------------------------------------
-- 2) The undo journal. One row per re-pointed FK, grouped by batch_id.
--    Locked down (RLS on, no policies) — only the SECURITY DEFINER functions touch it.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subcontract_reparent_log (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id     uuid NOT NULL,
  table_name   text NOT NULL,
  column_name  text NOT NULL,
  row_id       uuid NOT NULL,
  old_value    uuid,
  new_value    uuid,
  moved_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subcontract_reparent_log_batch
  ON public.subcontract_reparent_log (batch_id);

COMMENT ON TABLE public.subcontract_reparent_log IS
  'Audit/undo journal for promote_to_parent_contract(): each row records a single FK re-point (table, column, row, old->new). Replayed in reverse by undo_reparent(batch_id).';

ALTER TABLE public.subcontract_reparent_log ENABLE ROW LEVEL SECURITY;
-- No policies: client roles get no direct access; the definer functions below run as owner.

-- ---------------------------------------------------------------------------
-- 3) promote_to_parent_contract: create a named parent, re-parent the children,
--    and (optionally) move every existing record from the children to the parent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_to_parent_contract(
  p_site_id           uuid,
  p_trade_category_id uuid,
  p_parent_title      text,
  p_child_ids         uuid[],
  p_move_records      boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  -- Record/structure tables to move (table, fk column). The per-contract RATE-coupled
  -- tables (role_rates / headcount_attendance / mid_entries) are intentionally NOT moved —
  -- they describe a child's own tracking config and can't be safely merged; we abort instead.
  v_move_set text[][] := ARRAY[
    ARRAY['daily_attendance','subcontract_id'],
    ARRAY['market_laborer_attendance','subcontract_id'],
    ARRAY['labor_payments','subcontract_id'],
    ARRAY['settlement_groups','subcontract_id'],
    ARRAY['subcontract_payments','contract_id'],
    ARRAY['misc_expenses','subcontract_id'],
    ARRAY['expenses','contract_id'],
    ARRAY['material_purchase_expenses','subcontract_id'],
    ARRAY['rental_settlements','subcontract_id'],
    ARRAY['rental_advances','subcontract_id'],
    ARRAY['tea_shop_settlements','subcontract_id'],
    ARRAY['tea_shop_group_settlements','subcontract_id'],
    ARRAY['task_work_packages','parent_subcontract_id'],
    ARRAY['subcontract_scopes','contract_id'],
    ARRAY['subcontract_milestones','contract_id'],
    ARRAY['subcontract_sections','contract_id'],
    ARRAY['subcontract_estimate_lines','subcontract_id'],
    ARRAY['subcontract_work_updates','subcontract_id']
  ];
  v_pair       text[];
  v_parent_id  uuid;
  v_batch_id   uuid := gen_random_uuid();
  v_team       uuid;
  v_laborer    uuid;
  v_in_house   boolean;
  v_value      numeric;
  v_n          int;
  v_n_team     int;  -- children carrying a team_id
  v_dt_team    int;  -- distinct non-null team_ids
  v_n_lab      int;  -- children carrying a laborer_id
  v_dt_lab     int;  -- distinct non-null laborer_ids
  v_coupled    int;
  v_att_before numeric;
  v_att_after  numeric;
BEGIN
  IF p_child_ids IS NULL OR array_length(p_child_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'promote_to_parent_contract: no child contracts supplied';
  END IF;

  -- Validate the children all belong to this site + trade.
  IF EXISTS (
    SELECT 1 FROM subcontracts s
    WHERE s.id = ANY(p_child_ids)
      AND (s.site_id IS DISTINCT FROM p_site_id
        OR s.trade_category_id IS DISTINCT FROM p_trade_category_id)
  ) THEN
    RAISE EXCEPTION 'promote_to_parent_contract: a child contract is not on site % / trade %',
      p_site_id, p_trade_category_id;
  END IF;

  -- A child must not already be parented, and a parent must not appear in its own children.
  IF EXISTS (SELECT 1 FROM subcontracts WHERE id = ANY(p_child_ids) AND parent_subcontract_id IS NOT NULL) THEN
    RAISE EXCEPTION 'promote_to_parent_contract: one or more children are already under a parent';
  END IF;

  -- Refuse rate-coupled children (headcount/mid tracking) — their config can't be auto-merged.
  SELECT count(*) INTO v_coupled FROM (
    SELECT 1 FROM subcontract_role_rates          WHERE subcontract_id = ANY(p_child_ids)
    UNION ALL SELECT 1 FROM subcontract_headcount_attendance WHERE subcontract_id = ANY(p_child_ids)
    UNION ALL SELECT 1 FROM subcontract_mid_entries         WHERE subcontract_id = ANY(p_child_ids)
  ) q;
  IF v_coupled > 0 THEN
    RAISE EXCEPTION 'promote_to_parent_contract: a child uses headcount/mid rate tracking; merge those manually first';
  END IF;

  -- Derive the parent's single contracting party from the children, using the same
  -- priority as the workspace grouping: team › laborer › in-house. (uuid has no max()
  -- aggregate, so pull the lone distinct value via array_agg(...)[1].) A mesthri floor
  -- may ALSO carry a per-floor in-charge laborer_id — that does not break team grouping.
  SELECT count(*),
         count(*) FILTER (WHERE team_id IS NOT NULL),
         count(DISTINCT team_id)    FILTER (WHERE team_id IS NOT NULL),
         count(*) FILTER (WHERE laborer_id IS NOT NULL),
         count(DISTINCT laborer_id) FILTER (WHERE laborer_id IS NOT NULL),
         (array_agg(DISTINCT team_id)    FILTER (WHERE team_id IS NOT NULL))[1],
         (array_agg(DISTINCT laborer_id) FILTER (WHERE laborer_id IS NOT NULL))[1],
         bool_and(is_in_house),
         COALESCE(sum(total_value), 0)
    INTO v_n, v_n_team, v_dt_team, v_n_lab, v_dt_lab, v_team, v_laborer, v_in_house, v_value
    FROM subcontracts WHERE id = ANY(p_child_ids);

  -- Create the parent. total_value = snapshot sum of children (the agreed combined value).
  IF v_dt_team = 1 AND v_n_team = v_n THEN
    INSERT INTO subcontracts (site_id, trade_category_id, title, contract_type, team_id,
                              labor_tracking_mode, is_in_house, status, total_value, is_rate_based)
    VALUES (p_site_id, p_trade_category_id, p_parent_title, 'mesthri', v_team,
            'detailed', false, 'active', v_value, false)
    RETURNING id INTO v_parent_id;
  ELSIF v_dt_lab = 1 AND v_n_lab = v_n AND v_n_team = 0 THEN
    INSERT INTO subcontracts (site_id, trade_category_id, title, contract_type, laborer_id,
                              labor_tracking_mode, is_in_house, status, total_value, is_rate_based)
    VALUES (p_site_id, p_trade_category_id, p_parent_title, 'specialist', v_laborer,
            'detailed', false, 'active', v_value, false)
    RETURNING id INTO v_parent_id;
  ELSIF v_in_house THEN
    INSERT INTO subcontracts (site_id, trade_category_id, title, contract_type,
                              labor_tracking_mode, is_in_house, status, total_value, is_rate_based)
    VALUES (p_site_id, p_trade_category_id, p_parent_title, 'mesthri',
            'detailed', true, 'active', v_value, false)
    RETURNING id INTO v_parent_id;
  ELSE
    RAISE EXCEPTION 'promote_to_parent_contract: children do not share a single contractor (team/laborer/in-house)';
  END IF;

  -- Re-parent the children (they remain as optional "floor" tags under the parent).
  UPDATE subcontracts SET parent_subcontract_id = v_parent_id, updated_at = now()
   WHERE id = ANY(p_child_ids);

  IF p_move_records THEN
    -- Conservation guard: attendance earnings before (child set) must equal after (parent).
    SELECT COALESCE(sum(daily_earnings), 0) INTO v_att_before
      FROM daily_attendance WHERE subcontract_id = ANY(p_child_ids) AND is_deleted = false;

    FOREACH v_pair SLICE 1 IN ARRAY v_move_set LOOP
      -- Journal every affected row (old child id -> parent id) for undo.
      EXECUTE format(
        'INSERT INTO subcontract_reparent_log(batch_id, table_name, column_name, row_id, old_value, new_value)
         SELECT $1, %L, %L, t.id, t.%I, $2 FROM %I t WHERE t.%I = ANY($3)',
        v_pair[1], v_pair[2], v_pair[2], v_pair[1], v_pair[2])
      USING v_batch_id, v_parent_id, p_child_ids;
      -- Move the FK.
      EXECUTE format('UPDATE %I SET %I = $1 WHERE %I = ANY($2)', v_pair[1], v_pair[2], v_pair[2])
      USING v_parent_id, p_child_ids;
    END LOOP;

    SELECT COALESCE(sum(daily_earnings), 0) INTO v_att_after
      FROM daily_attendance WHERE subcontract_id = v_parent_id AND is_deleted = false;

    IF v_att_before IS DISTINCT FROM v_att_after THEN
      RAISE EXCEPTION 'promote_to_parent_contract: attendance earnings not conserved (% -> %)',
        v_att_before, v_att_after;
    END IF;
  END IF;

  RETURN v_parent_id;
END;
$function$;

COMMENT ON FUNCTION public.promote_to_parent_contract(uuid, uuid, text, uuid[], boolean) IS
  'Creates a named parent contract over the given children (same site+trade, single contractor), re-parents them, and optionally re-points all their records onto the parent. Reversible via undo_reparent(batch). Aborts on rate-coupled (headcount/mid) children.';

-- ---------------------------------------------------------------------------
-- 4) undo_reparent: reverse one batch (restore FKs, un-parent + delete the parent).
--    p_batch_id is the most recent batch for the parent; we find the parent via the journal.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_reparent(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  rec        record;
  v_parent   uuid;
BEGIN
  -- All journal rows of a batch carry the same parent in new_value (uuid has no max()).
  SELECT (array_agg(DISTINCT new_value) FILTER (WHERE new_value IS NOT NULL))[1]
    INTO v_parent FROM subcontract_reparent_log WHERE batch_id = p_batch_id;

  -- Replay FK moves in reverse: restore each row's original child id.
  FOR rec IN
    SELECT table_name, column_name, row_id, old_value
    FROM subcontract_reparent_log WHERE batch_id = p_batch_id ORDER BY id DESC
  LOOP
    EXECUTE format('UPDATE %I SET %I = $1 WHERE id = $2', rec.table_name, rec.column_name)
    USING rec.old_value, rec.row_id;
  END LOOP;

  -- Un-parent the children, then drop the (now empty) parent contract.
  IF v_parent IS NOT NULL THEN
    UPDATE subcontracts SET parent_subcontract_id = NULL, updated_at = now()
     WHERE parent_subcontract_id = v_parent;
    DELETE FROM subcontracts WHERE id = v_parent;
  END IF;

  DELETE FROM subcontract_reparent_log WHERE batch_id = p_batch_id;
END;
$function$;

COMMENT ON FUNCTION public.undo_reparent(uuid) IS
  'Fully reverses a promote_to_parent_contract() batch: restores every re-pointed FK to its original child, un-parents the children, and deletes the now-empty parent contract.';

-- Client (authenticated) may call promote; undo is also exposed for the in-app safety action.
GRANT EXECUTE ON FUNCTION public.promote_to_parent_contract(uuid, uuid, text, uuid[], boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_reparent(uuid) TO authenticated;
