-- Two guards made necessary by commission payouts now carrying contract_ref_kind/
-- contract_ref_id (20260716120200 + settlementService.payMesthriCommission).
--
-- Until this branch, contract_ref_* had exactly ONE writer — record_contract_laborer_payment,
-- which always writes payment_type='salary'. Readers were written against that assumption.
-- payMesthriCommission is now a second writer, with payment_type='commission'. Every reader
-- keyed on contract_ref_* therefore needs to say whether it means commission too.

-- ---------------------------------------------------------------------------
-- 1. v_subcontract_reconciliation must NOT count commission as money paid
--    toward a subcontract's quoted value.
--
-- Its settlements CTE (added by 20260715100100) is the only contract_ref reader with no
-- payment_type filter; that migration's own header scopes the contract_ref leg to
-- "per-laborer contract settlements", i.e. salary. Without this guard, paying a mesthri
-- ₹1,825 commission on a trade would add ₹1,825 to amount_paid_settlements, understate the
-- balance against the quoted amount, and skew ReconciliationStrip's health chip.
--
-- The sibling view v_task_work_profitability already filters payment_type='salary', so
-- leaving this unguarded would also make the two views disagree about what "paid on this
-- contract" means for the same money on the same page.
--
-- Decision (owner, 2026-07-15): commission is NOT part of the quoted scope. This preserves
-- pre-branch behaviour exactly — commission had no contract tag before, so it was never
-- counted here. Whether commission should count as contract cost is a separate product
-- question; if it ever changes, BOTH views move together, deliberately.
--
-- Only the settlements CTE's WHERE changes; everything else is the live definition verbatim.
CREATE OR REPLACE VIEW public.v_subcontract_reconciliation
WITH (security_invoker = true) AS
 WITH payments AS (
         SELECT subcontract_payments.contract_id AS subcontract_id,
            sum(subcontract_payments.amount) AS amount
           FROM subcontract_payments
          WHERE subcontract_payments.is_deleted = false
          GROUP BY subcontract_payments.contract_id
        ), settlements AS (
         SELECT COALESCE(sg.subcontract_id,
                CASE
                    WHEN sg.contract_ref_kind = 'subcontract'::text THEN sg.contract_ref_id
                    ELSE NULL::uuid
                END) AS subcontract_id,
            sum(sg.total_amount) AS amount
           FROM settlement_groups sg
          WHERE sg.is_cancelled = false
            AND sg.transferred_out_at IS NULL
            -- Commission is paid to the maistry for running the crew; it is not a payment
            -- against the subcontractor's quoted scope. COALESCE because payment_type is
            -- nullable and NULL <> 'commission' is NULL, which WHERE would drop — silently
            -- losing a real salary settlement from amount_paid.
            AND COALESCE(sg.payment_type, 'salary'::text) <> 'commission'::text
            AND (sg.subcontract_id IS NOT NULL OR sg.contract_ref_kind = 'subcontract'::text AND sg.contract_ref_id IS NOT NULL)
          GROUP BY (COALESCE(sg.subcontract_id,
                CASE
                    WHEN sg.contract_ref_kind = 'subcontract'::text THEN sg.contract_ref_id
                    ELSE NULL::uuid
                END))
        ), detailed_labor AS (
         SELECT daily_attendance.subcontract_id,
            sum(daily_attendance.daily_earnings) AS amount
           FROM daily_attendance
          WHERE daily_attendance.is_deleted = false AND daily_attendance.subcontract_id IS NOT NULL
          GROUP BY daily_attendance.subcontract_id
        ), headcount_labor AS (
         SELECT sha.subcontract_id,
            sum(sha.units * srr.daily_rate) AS amount
           FROM subcontract_headcount_attendance sha
             JOIN subcontract_role_rates srr ON srr.subcontract_id = sha.subcontract_id AND srr.role_id = sha.role_id
          GROUP BY sha.subcontract_id
        )
 SELECT sc.id AS subcontract_id,
    sc.site_id,
    sc.trade_category_id,
    sc.labor_tracking_mode,
    sc.total_value AS quoted_amount,
    COALESCE(p.amount, 0::numeric) + COALESCE(s.amount, 0::numeric) AS amount_paid,
    COALESCE(p.amount, 0::numeric) AS amount_paid_subcontract_payments,
    COALESCE(s.amount, 0::numeric) AS amount_paid_settlements,
    COALESCE(hl.amount, 0::numeric) AS implied_labor_value_headcount,
    COALESCE(dl.amount, 0::numeric) AS implied_labor_value_detailed
   FROM subcontracts sc
     LEFT JOIN payments p ON p.subcontract_id = sc.id
     LEFT JOIN settlements s ON s.subcontract_id = sc.id
     LEFT JOIN detailed_labor dl ON dl.subcontract_id = sc.id
     LEFT JOIN headcount_labor hl ON hl.subcontract_id = sc.id;

-- ---------------------------------------------------------------------------
-- 2. Restore the transferred_out_at guard on the contract-laborer paid lookup.
--
-- 20260708100200 patched this filter into get_contract_labor_ledger's paid CTE as part of
-- the standing "patch every salary reader with transferred_out_at IS NULL" invariant (a
-- settlement moved to a sibling site must stop counting here). Recreating the function in
-- 20260716120000 dropped that patch, and the extracted contract_laborer_paid never carried
-- it — so get_contract_labor_ledger_weekly inherited the gap too.
--
-- Unreachable today: transfer_settlements_to_site only moves rows that have labor_payments
-- rows, and record_contract_laborer_payment writes none, so no contract-tagged settlement
-- can currently be transferred. Restored anyway — it is defence-in-depth the repo enforces
-- everywhere else, and the day a contract settlement gains labor_payments, net_paid would
-- inflate and hide real debt with no test to catch it.
--
-- Fixing it HERE fixes both ledgers at once, which is why the base was shared.
CREATE OR REPLACE FUNCTION public.contract_laborer_paid(
  p_kind text,
  p_ref_id uuid
) RETURNS TABLE(
  laborer_id uuid,
  net_paid numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT sg.contract_laborer_id AS laborer_id,
         COALESCE(SUM(sg.total_amount), 0)::numeric AS net_paid
  FROM public.settlement_groups sg
  WHERE sg.contract_ref_kind = p_kind
    AND sg.contract_ref_id = p_ref_id
    AND sg.contract_laborer_id IS NOT NULL
    -- Commission is not own-wages. COALESCE because payment_type is nullable and
    -- NULL <> 'commission' is NULL, which WHERE drops — that would silently omit the
    -- row from net_paid and overstate what the engineer is told is still owed.
    AND COALESCE(sg.payment_type, 'salary') <> 'commission'
    -- A settlement transferred to a sibling site must stop counting as paid here.
    AND sg.transferred_out_at IS NULL
    AND sg.is_cancelled = false
    AND sg.is_archived = false
  GROUP BY sg.contract_laborer_id;
$function$;

COMMENT ON FUNCTION public.contract_laborer_paid(text, uuid) IS
  'Project-scoped ₹ settled per laborer on one contract. Excludes payment_type=commission (commission payouts carry a contract ref too, and counting one here would inflate the mesthri''s own-wages paid and hide real debt) and transferred-out settlements.';

GRANT EXECUTE ON FUNCTION public.contract_laborer_paid(text, uuid) TO authenticated, service_role;
