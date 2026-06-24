-- Workforce Phase 2 — drag-and-drop re-parenting.
--
-- A single, reversible "move this node under that parent" operation. Unlike
-- promote_to_parent_contract (which MERGES several children's records onto a brand-new
-- parent and must conserve attendance earnings), a move only RE-POINTS one node's
-- `parent_subcontract_id`. Attendance / payments / settlements stay keyed to the node's
-- own subcontract_id, so nothing else is touched — no record migration, no conservation
-- guard. The node keeps its whole subtree (its children move with it implicitly).
--
-- Tier (Contract / Section / Task) is derived from depth in the parent chain, so a move
-- re-labels the node automatically (e.g. a Task dropped on a Contract becomes a Section).
--
-- Additive: two SECURITY DEFINER functions reusing the existing subcontract_reparent_log
-- journal (one row per move) so undo_move() can fully reverse it. No schema changes.

-- ---------------------------------------------------------------------------
-- move_subcontract_node: re-point one node's parent. Validates same site + trade,
-- and walks the ancestor chain to reject cycles (can't drop a node onto itself or
-- onto one of its own descendants). Returns the batch_id for undo.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.move_subcontract_node(
  p_node_id       uuid,
  p_new_parent_id uuid  -- NULL = make it a top-level Contract
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_node_site    uuid;
  v_node_trade   uuid;
  v_old_parent   uuid;
  v_parent_site  uuid;
  v_parent_trade uuid;
  v_cur          uuid;
  v_batch        uuid;
BEGIN
  -- Node must exist.
  SELECT site_id, trade_category_id, parent_subcontract_id
    INTO v_node_site, v_node_trade, v_old_parent
    FROM public.subcontracts
   WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Node % not found', p_node_id;
  END IF;

  -- No-op (already under this parent) — nothing to journal.
  IF v_old_parent IS NOT DISTINCT FROM p_new_parent_id THEN
    RETURN NULL;
  END IF;

  IF p_new_parent_id IS NOT NULL THEN
    -- Can't be its own parent.
    IF p_new_parent_id = p_node_id THEN
      RAISE EXCEPTION 'Cannot move a node under itself';
    END IF;

    -- New parent must exist and share the node's site + trade.
    SELECT site_id, trade_category_id
      INTO v_parent_site, v_parent_trade
      FROM public.subcontracts
     WHERE id = p_new_parent_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Target parent % not found', p_new_parent_id;
    END IF;
    IF v_parent_site IS DISTINCT FROM v_node_site THEN
      RAISE EXCEPTION 'Cannot move across sites';
    END IF;
    IF v_parent_trade IS DISTINCT FROM v_node_trade THEN
      RAISE EXCEPTION 'Cannot move across trades';
    END IF;

    -- Cycle guard: walk UP from the new parent; if we reach the node, the new parent
    -- is a descendant of the node — that would orphan the subtree into a loop.
    v_cur := p_new_parent_id;
    WHILE v_cur IS NOT NULL LOOP
      IF v_cur = p_node_id THEN
        RAISE EXCEPTION 'Cannot move a node under one of its own descendants';
      END IF;
      SELECT parent_subcontract_id INTO v_cur
        FROM public.subcontracts WHERE id = v_cur;
    END LOOP;
  END IF;

  -- Journal the single FK change, then apply it.
  v_batch := gen_random_uuid();
  INSERT INTO public.subcontract_reparent_log
    (batch_id, table_name, column_name, row_id, old_value, new_value)
  VALUES
    (v_batch, 'subcontracts', 'parent_subcontract_id', p_node_id, v_old_parent, p_new_parent_id);

  UPDATE public.subcontracts
     SET parent_subcontract_id = p_new_parent_id,
         updated_at = now()
   WHERE id = p_node_id;

  RETURN v_batch;
END;
$$;

COMMENT ON FUNCTION public.move_subcontract_node(uuid, uuid) IS
  'Re-point one subcontract node under a new parent (NULL = top-level). Validates same '
  'site + trade and rejects cycles. Journalled to subcontract_reparent_log so undo_move() '
  'can reverse it. Pure parent re-point — attendance/payments stay on the node.';

-- ---------------------------------------------------------------------------
-- undo_move: restore the node's previous parent from the journal. Unlike undo_reparent
-- it NEVER deletes a parent (a move never creates one).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_move(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT row_id, old_value
      FROM public.subcontract_reparent_log
     WHERE batch_id = p_batch_id
       AND table_name = 'subcontracts'
       AND column_name = 'parent_subcontract_id'
     ORDER BY id DESC
  LOOP
    UPDATE public.subcontracts
       SET parent_subcontract_id = r.old_value,
           updated_at = now()
     WHERE id = r.row_id;
  END LOOP;

  DELETE FROM public.subcontract_reparent_log WHERE batch_id = p_batch_id;
END;
$$;

COMMENT ON FUNCTION public.undo_move(uuid) IS
  'Reverse a move_subcontract_node() batch: restore the node''s previous parent_subcontract_id '
  'and delete the journal rows. Never deletes a parent.';

GRANT EXECUTE ON FUNCTION public.move_subcontract_node(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.undo_move(uuid) TO authenticated;
