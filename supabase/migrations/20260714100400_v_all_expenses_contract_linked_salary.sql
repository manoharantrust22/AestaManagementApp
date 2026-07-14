-- /site/expenses (v_all_expenses): classify per-laborer CONTRACT settlements properly.
--
-- Direct-pay contract payments (settlement_groups with contract_ref_kind /
-- contract_ref_id / contract_laborer_id — 20260707140000) have no labor_payments
-- and no attendance links, so they fall through to the 'Unlinked Salary' branch and
-- show as "Unlinked salary (1 laborers)". This migration:
--   1. adds `sg.contract_ref_kind IS NULL` to the 'Unlinked Salary' branch, and
--   2. adds a new disjoint branch for contract-linked groups -> expense_type
--      'Contract Salary', description "Contract wages - <laborer> - <contract>",
--      contract_id resolving to the subcontract (task-work rolls up through
--      parent_subcontract_id, mirroring the task_work_payments branch).
--
-- Branch disjointness (the (id, expense_type) row key stays unique — deeb8a8):
--   * lp 'Contract Salary' branch requires EXISTS labor_payments is_under_contract;
--     the new branch requires NOT EXISTS the same -> disjoint.
--   * 'Unlinked Salary' now requires contract_ref_kind IS NULL -> disjoint.
--
-- Implemented as a surgical patch over the LIVE view body (pg_get_viewdef +
-- CREATE OR REPLACE), the 20260619190100 / 20260708100200 technique — the live
-- body contains transfer predicates that exist in no single migration file.
-- RAISES if either patch fails to match (no silent no-op).

DO $$
DECLARE
  v_def    text;
  v_new    text;
  v_branch text;
BEGIN
  v_def := pg_get_viewdef('public.v_all_expenses'::regclass, true);

  -- 1) 'Unlinked Salary' branch: exclude contract-linked groups. Its unique anchor
  --    is the NOT(EXISTS market_laborer_attendance) tail (the Daily Salary branch
  --    uses a positive EXISTS, so this NOT-form appears exactly once).
  v_new := regexp_replace(
    v_def,
    'NOT \(EXISTS \( SELECT 1\s+FROM market_laborer_attendance ma\s+WHERE ma\.settlement_group_id = sg\.id\)\)',
    'NOT (EXISTS (SELECT 1 FROM market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id)) AND sg.contract_ref_kind IS NULL'
  );

  IF v_new = v_def THEN
    RAISE EXCEPTION 'v_all_expenses patch 1 (Unlinked Salary contract_ref guard) did not match — aborting.';
  END IF;

  -- 2) New contract-linked branch, inserted before the tea-shop branch (its
  --    "UNION ALL SELECT ts.id," opener is unique in the body).
  v_branch := $br$ UNION ALL
         SELECT sg.id,
            sg.site_id,
            sg.settlement_date AS date,
            COALESCE(sg.actual_payment_date, sg.created_at::date) AS recorded_date,
            sg.total_amount AS amount,
            (('Contract wages - '::text || COALESCE(lab.name, 'Laborer'::text))
              || COALESCE(' - '::text || COALESCE(twp_ref.title, sc.title)::text, ''::text))
              || CASE WHEN sg.notes IS NOT NULL AND sg.notes <> ''::text THEN ' - '::text || sg.notes ELSE ''::text END AS description,
            ( SELECT expense_categories.id
                   FROM expense_categories
                  WHERE expense_categories.name::text = 'Salary Settlement'::text
                 LIMIT 1) AS category_id,
            'Salary Settlement'::character varying AS category_name,
            'labor'::text AS module,
            'Contract Salary'::text AS expense_type,
                CASE
                    WHEN sg.payment_channel = 'direct'::text THEN true
                    WHEN sg.engineer_transaction_id IS NOT NULL THEN true
                    ELSE false
                END AS is_cleared,
                CASE
                    WHEN sg.payment_channel = 'direct'::text THEN sg.settlement_date
                    WHEN sg.engineer_transaction_id IS NOT NULL THEN ( SELECT site_engineer_transactions.transaction_date
                       FROM site_engineer_transactions
                      WHERE site_engineer_transactions.id = sg.engineer_transaction_id)
                    ELSE NULL::date
                END AS cleared_date,
            COALESCE(
                CASE WHEN sg.contract_ref_kind = 'subcontract'::text THEN sg.contract_ref_id ELSE NULL::uuid END,
                twp_ref.parent_subcontract_id,
                sg.subcontract_id) AS contract_id,
            sc.title AS subcontract_title,
            NULL::uuid AS site_payer_id,
                CASE
                    WHEN sg.payer_source IS NULL THEN 'Own Money'::text
                    WHEN sg.payer_source = 'own_money'::text THEN 'Own Money'::text
                    WHEN sg.payer_source = 'amma_money'::text THEN 'Amma Money'::text
                    WHEN sg.payer_source = 'client_money'::text THEN 'Client Money'::text
                    WHEN sg.payer_source = 'other_site_money'::text THEN COALESCE(sg.payer_name, 'Other Site'::text)
                    WHEN sg.payer_source = 'custom'::text THEN COALESCE(sg.payer_name, 'Other'::text)
                    ELSE COALESCE(sg.payer_name, 'Own Money'::text)
                END AS payer_name,
            sg.payment_mode,
            NULL::text AS vendor_name,
            sg.proof_url AS receipt_url,
            sg.created_by AS paid_by,
            sg.created_by_name AS entered_by,
            sg.created_by AS entered_by_user_id,
            sg.settlement_reference,
            sg.id AS settlement_group_id,
            sg.engineer_transaction_id,
            'settlement'::text AS source_type,
            sg.id AS source_id,
            sg.created_at,
            sg.is_cancelled AS is_deleted,
            sg.payer_source_split AS row_payer_source_split,
            NULL::text AS material_summary,
            NULL::text AS material_purchase_type,
            NULL::text AS material_cluster_name,
            NULL::text AS material_payer_source
           FROM settlement_groups sg
             LEFT JOIN laborers lab ON lab.id = sg.contract_laborer_id
             LEFT JOIN task_work_packages twp_ref ON sg.contract_ref_kind = 'task_work'::text AND twp_ref.id = sg.contract_ref_id
             LEFT JOIN subcontracts sc ON sc.id = COALESCE(
                CASE WHEN sg.contract_ref_kind = 'subcontract'::text THEN sg.contract_ref_id ELSE NULL::uuid END,
                twp_ref.parent_subcontract_id)
          WHERE sg.transferred_out_at IS NULL AND sg.is_cancelled = false AND sg.is_archived = false
            AND COALESCE(sg.payment_type, 'salary'::text) = 'salary'::text
            AND sg.contract_ref_kind IS NOT NULL
            AND NOT (EXISTS ( SELECT 1
                   FROM labor_payments lp
                  WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true))
        UNION ALL
         SELECT ts.id,$br$;

  v_new := regexp_replace(
    v_new,
    'UNION ALL\s+SELECT ts\.id,',
    v_branch
  );

  IF position('Contract wages - ' in v_new) = 0 THEN
    RAISE EXCEPTION 'v_all_expenses patch 2 (contract-linked branch) did not match — aborting.';
  END IF;

  EXECUTE 'CREATE OR REPLACE VIEW public.v_all_expenses AS ' || v_new;
END $$;
