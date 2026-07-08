-- ============================================================================
-- Route trade money through the workspace — data migration + journal + undo.
--
-- When a trade's workspace is on and a contract is attendance-tracked ('detailed'),
-- money must flow through Salary Settlements (settlement_groups + labor_payments),
-- NOT the contract page (subcontract_payments). This migration MOVES existing
-- contract-page lump payments into the workspace for detailed contracts, reversibly.
--
-- Net effect: PAID OUT is conserved — each payment's rupees move from the "Sections"
-- bucket (subcontract_payments) to the "Workspace" bucket (settlement_groups). The
-- original subcontract_payments row is soft-deleted (is_deleted=true), a settlement
-- group + a contract-flagged labor_payment are created, and every move is journalled
-- for a clean undo. Mirrors the reversible pattern of promote_to_parent_contract.
--
-- NOTE (deliberate): migrated labor_payments are NOT week-allocated (no
-- payment_week_allocations, attendance.is_paid untouched). This keeps totals exact and
-- undo clean; the money shows as an unallocated salary credit against the contract.
-- ============================================================================

-- 1) Journal — one row per moved payment ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.contract_payment_migration_log (
  id                       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_id                 uuid NOT NULL,
  site_id                  uuid NOT NULL,
  subcontract_id           uuid NOT NULL,
  source_payment_id        uuid NOT NULL,      -- subcontract_payments.id (now soft-deleted)
  new_settlement_group_id  uuid NOT NULL,
  new_labor_payment_id     uuid NOT NULL,
  amount                   numeric(12,2) NOT NULL,
  migrated_at              timestamptz NOT NULL DEFAULT now(),
  undone_at                timestamptz          -- set on undo; row kept for audit
);

CREATE INDEX IF NOT EXISTS idx_cpml_batch ON public.contract_payment_migration_log (batch_id);
CREATE INDEX IF NOT EXISTS idx_cpml_sc ON public.contract_payment_migration_log (subcontract_id);
CREATE INDEX IF NOT EXISTS idx_cpml_sg_live
  ON public.contract_payment_migration_log (new_settlement_group_id) WHERE undone_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cpml_lp_live
  ON public.contract_payment_migration_log (new_labor_payment_id) WHERE undone_at IS NULL;
-- Guard: a live (not-undone) source payment can appear at most once → no double-migrate.
CREATE UNIQUE INDEX IF NOT EXISTS uq_cpml_source_live
  ON public.contract_payment_migration_log (source_payment_id) WHERE undone_at IS NULL;

ALTER TABLE public.contract_payment_migration_log ENABLE ROW LEVEL SECURITY;
-- No policies: the log is written/read only by the SECURITY DEFINER functions below.

COMMENT ON TABLE public.contract_payment_migration_log IS
  'Audit + undo journal for migrate_contract_payments_to_workspace: one row per subcontract_payments row moved into a settlement_group. undone_at set when reversed.';

-- 2) Move one contract's payments into the workspace ------------------------------------
CREATE OR REPLACE FUNCTION public.migrate_contract_payments_to_workspace(
  p_subcontract_id uuid,
  p_batch_id       uuid DEFAULT NULL   -- wrapper passes one shared batch across contracts
) RETURNS uuid                          -- the batch_id
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_batch   uuid := COALESCE(p_batch_id, gen_random_uuid());
  sc        record;
  sp        record;
  v_lab     uuid;
  v_sg      uuid;
  v_ref     text;
  v_lp      uuid;
  v_before  numeric;
  v_moved   numeric;
  v_mode    text;
  v_type    text;
  v_channel text;
BEGIN
  SELECT s.id, s.site_id, s.laborer_id, s.team_id, s.labor_tracking_mode
  INTO sc FROM subcontracts s WHERE s.id = p_subcontract_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'migrate: subcontract % not found', p_subcontract_id;
  END IF;

  -- Only attendance-tracked contracts route to the workspace (decision: detailed-only).
  IF sc.labor_tracking_mode IS DISTINCT FROM 'detailed' THEN
    RAISE EXCEPTION 'migrate: contract % is not detailed (mode=%); only attendance contracts route to the workspace',
      p_subcontract_id, sc.labor_tracking_mode;
  END IF;

  -- Resolve the payee laborer. Required so labor_payments.is_under_contract=true, which is
  -- what classifies the settlement into the "Company Settlement" tab (useSettlementsList).
  v_lab := sc.laborer_id;
  IF v_lab IS NULL AND sc.team_id IS NOT NULL THEN
    SELECT t.leader_laborer_id INTO v_lab FROM teams t WHERE t.id = sc.team_id;
  END IF;
  IF v_lab IS NULL AND sc.team_id IS NOT NULL THEN
    SELECT l.id INTO v_lab FROM laborers l WHERE l.team_id = sc.team_id ORDER BY l.created_at NULLS LAST LIMIT 1;
  END IF;
  IF v_lab IS NULL THEN
    RAISE EXCEPTION 'migrate: contract % has no laborer/mesthri to attribute payments to — assign one first', p_subcontract_id;
  END IF;

  SELECT COALESCE(sum(amount), 0) INTO v_before
  FROM subcontract_payments WHERE contract_id = p_subcontract_id AND is_deleted = false;

  FOR sp IN
    SELECT * FROM subcontract_payments
    WHERE contract_id = p_subcontract_id AND is_deleted = false
    ORDER BY payment_date, created_at
  LOOP
    -- Map onto the tighter workspace check constraints.
    v_mode := CASE sp.payment_mode::text
                WHEN 'cash' THEN 'cash'
                WHEN 'upi' THEN 'upi'
                WHEN 'bank_transfer' THEN 'bank_transfer'
                WHEN 'cheque' THEN 'bank_transfer'
                ELSE 'cash' END;                                    -- 'other' → cash
    v_type := CASE sp.payment_type::text
                WHEN 'weekly_advance' THEN 'advance'
                ELSE 'salary' END;                                  -- part/milestone/final → salary
    v_channel := CASE WHEN sp.site_engineer_transaction_id IS NOT NULL
                      THEN 'engineer_wallet' ELSE 'direct' END;

    -- 1) settlement_group via the atomic RPC (reference generation + advisory lock + retry).
    --    Carries over the pre-existing engineer_transaction_id — NO new wallet debit.
    SELECT csg.id, csg.settlement_reference INTO v_sg, v_ref
    FROM public.create_settlement_group(
      p_site_id                 => sc.site_id,
      p_settlement_date         => sp.payment_date,
      p_total_amount            => sp.amount,
      p_laborer_count           => 1,
      p_payment_channel         => v_channel,
      p_payment_mode            => v_mode,
      p_payer_source            => sp.payer_source,
      p_payer_name              => sp.payer_name,
      p_proof_url               => sp.receipt_url,
      p_notes                   => NULLIF(btrim(
                                     COALESCE(sp.comments, '') ||
                                     ' [migrated from contract payment ' || sp.id::text || ']'
                                   ), ''),
      p_subcontract_id          => p_subcontract_id,
      p_engineer_transaction_id => sp.site_engineer_transaction_id,
      p_created_by              => sp.recorded_by_user_id,
      p_created_by_name         => COALESCE(sp.recorded_by, 'migration'),
      p_payment_type            => v_type,
      p_actual_payment_date     => sp.payment_date
    ) AS csg;

    -- 2) labor_payments (is_under_contract=true → lands in the Company Settlement tab).
    INSERT INTO labor_payments (
      laborer_id, site_id, subcontract_id, amount, payment_date, payment_for_date,
      actual_payment_date, payment_mode, payment_channel, payment_type, is_under_contract,
      settlement_group_id, site_engineer_transaction_id, proof_url,
      paid_by, paid_by_user_id, recorded_by, recorded_by_user_id, notes, payment_reference, is_archived
    ) VALUES (
      v_lab, sc.site_id, p_subcontract_id, sp.amount, sp.payment_date, sp.payment_date,
      sp.payment_date, v_mode, v_channel, v_type, true,
      v_sg, sp.site_engineer_transaction_id, sp.receipt_url,
      COALESCE(sp.recorded_by, 'migration'), sp.recorded_by_user_id,
      COALESCE(sp.recorded_by, 'migration'), sp.recorded_by_user_id,
      'migrated from ' || v_ref, sp.reference_number, false
    ) RETURNING id INTO v_lp;

    -- 3) soft-delete the original contract-page payment.
    UPDATE subcontract_payments SET is_deleted = true WHERE id = sp.id;

    -- 4) journal the move.
    INSERT INTO contract_payment_migration_log (
      batch_id, site_id, subcontract_id, source_payment_id,
      new_settlement_group_id, new_labor_payment_id, amount
    ) VALUES (v_batch, sc.site_id, p_subcontract_id, sp.id, v_sg, v_lp, sp.amount);
  END LOOP;

  -- Conservation guard: money moved must equal money that was on the contract page.
  SELECT COALESCE(sum(amount), 0) INTO v_moved
  FROM contract_payment_migration_log
  WHERE batch_id = v_batch AND subcontract_id = p_subcontract_id AND undone_at IS NULL;

  IF v_moved IS DISTINCT FROM v_before THEN
    RAISE EXCEPTION 'migrate: amount not conserved for % (moved % vs expected %)',
      p_subcontract_id, v_moved, v_before;
  END IF;

  RETURN v_batch;
END;
$function$;

-- 3) Move every detailed contract of a site+trade (one shared batch) --------------------
CREATE OR REPLACE FUNCTION public.migrate_trade_contract_payments_to_workspace(
  p_site_id uuid, p_trade_category_id uuid
) RETURNS uuid                          -- batch_id, or NULL if nothing moved
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_batch uuid := gen_random_uuid();
  r record;
  v_any boolean := false;
BEGIN
  FOR r IN
    SELECT s.id
    FROM subcontracts s
    WHERE s.site_id = p_site_id
      AND s.trade_category_id = p_trade_category_id
      AND s.labor_tracking_mode = 'detailed'
      AND EXISTS (
        SELECT 1 FROM subcontract_payments sp
        WHERE sp.contract_id = s.id AND sp.is_deleted = false
      )
  LOOP
    PERFORM public.migrate_contract_payments_to_workspace(r.id, v_batch);
    v_any := true;
  END LOOP;
  RETURN CASE WHEN v_any THEN v_batch ELSE NULL END;
END;
$function$;

-- 4) Preview what a site+trade migration would move (drives the toggle confirm dialog) --
CREATE OR REPLACE FUNCTION public.preview_trade_contract_payments_migration(
  p_site_id uuid, p_trade_category_id uuid
) RETURNS TABLE(contract_count int, payment_count int, total_amount numeric, blocker_reason text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE
  v_missing text;
BEGIN
  SELECT count(DISTINCT s.id)::int, count(sp.id)::int, COALESCE(sum(sp.amount), 0)
  INTO contract_count, payment_count, total_amount
  FROM subcontracts s
  JOIN subcontract_payments sp ON sp.contract_id = s.id AND sp.is_deleted = false
  WHERE s.site_id = p_site_id
    AND s.trade_category_id = p_trade_category_id
    AND s.labor_tracking_mode = 'detailed';

  -- Blocker: detailed contracts with payments but no resolvable payee laborer.
  SELECT string_agg(DISTINCT s.title, ', ')
  INTO v_missing
  FROM subcontracts s
  WHERE s.site_id = p_site_id
    AND s.trade_category_id = p_trade_category_id
    AND s.labor_tracking_mode = 'detailed'
    AND EXISTS (SELECT 1 FROM subcontract_payments sp WHERE sp.contract_id = s.id AND sp.is_deleted = false)
    AND s.laborer_id IS NULL
    AND (s.team_id IS NULL OR NOT EXISTS (
      SELECT 1 FROM teams t WHERE t.id = s.team_id AND t.leader_laborer_id IS NOT NULL))
    AND (s.team_id IS NULL OR NOT EXISTS (SELECT 1 FROM laborers l WHERE l.team_id = s.team_id));

  blocker_reason := CASE WHEN COALESCE(v_missing, '') <> ''
                         THEN 'Assign a laborer/mesthri to: ' || v_missing ELSE NULL END;
  RETURN NEXT;
END;
$function$;

-- 5) Undo a migration batch ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_contract_payments_migration(p_batch_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $function$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT * FROM contract_payment_migration_log
    WHERE batch_id = p_batch_id AND undone_at IS NULL
  LOOP
    -- Created rows were never week-allocated, so a hard delete is clean. The carried-over
    -- engineer_transaction_id points to a PRE-EXISTING wallet spend — never touch it.
    DELETE FROM labor_payments WHERE id = r.new_labor_payment_id;
    DELETE FROM settlement_groups WHERE id = r.new_settlement_group_id;
    UPDATE subcontract_payments SET is_deleted = false WHERE id = r.source_payment_id;
    UPDATE contract_payment_migration_log SET undone_at = now() WHERE id = r.id;
  END LOOP;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.migrate_contract_payments_to_workspace(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.migrate_trade_contract_payments_to_workspace(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_trade_contract_payments_migration(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_contract_payments_migration(uuid) TO authenticated, service_role;
