-- v_subcontract_reconciliation: count contract-ref-linked settlements + skip transferred rows.
--
-- Two gaps in the settlements CTE (unchanged since 20260502120000):
--  1. Per-laborer contract settlements written by record_contract_laborer_payment
--     link via contract_ref_kind='subcontract' / contract_ref_id with
--     subcontract_id = NULL — they were counted nowhere.
--  2. This view missed the transferred_out_at IS NULL filter every other salary
--     reader received in 20260708100200, so a settlement moved to a sibling site
--     still counted as paid on the origin contract.
--
-- The COALESCE keys each group by exactly one subcontract, so a row that ever
-- carries BOTH link columns is still counted once (subcontract_id wins).
-- The subcontract_id leg keeps its existing is_archived behavior on purpose —
-- only the two changes above are intended here.
--
-- Body otherwise identical to 20260502120000_add_trade_dimension.sql:122-165.

CREATE OR REPLACE VIEW public.v_subcontract_reconciliation AS
WITH payments AS (
    SELECT subcontract_payments.contract_id AS subcontract_id,
        sum(subcontract_payments.amount) AS amount
       FROM subcontract_payments
      WHERE subcontract_payments.is_deleted = false
      GROUP BY subcontract_payments.contract_id
), settlements AS (
    SELECT COALESCE(sg.subcontract_id,
               CASE WHEN sg.contract_ref_kind = 'subcontract' THEN sg.contract_ref_id END) AS subcontract_id,
        sum(sg.total_amount) AS amount
       FROM settlement_groups sg
      WHERE sg.is_cancelled = false
        AND sg.transferred_out_at IS NULL
        AND (sg.subcontract_id IS NOT NULL
             OR (sg.contract_ref_kind = 'subcontract' AND sg.contract_ref_id IS NOT NULL))
      GROUP BY 1
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

-- Re-assert the invoker mode set in 20260502130100 (CREATE OR REPLACE keeps
-- reloptions, but be explicit so this file stands alone).
ALTER VIEW public.v_subcontract_reconciliation SET (security_invoker = true);

COMMENT ON VIEW public.v_subcontract_reconciliation IS
  'Per-subcontract quoted vs paid. amount_paid = subcontract_payments (is_deleted=false) + settlement_groups linked via subcontract_id OR contract_ref_kind=subcontract (not cancelled, not transferred out). Does NOT roll children into parents.';
