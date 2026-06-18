-- Surface Task Work payments in v_all_expenses.
--
-- Re-emits the full definition from 20260607120100_v_all_expenses_material_subcontract.sql
-- VERBATIM and adds ONE new UNION ALL branch (task_work_payments) inside the base
-- CTE. Task-work advances/settlements now appear on /site/expenses, and when a
-- package is linked to a parent subcontract (parent_subcontract_id) the payment
-- rolls into that subcontract's spend via calculateSubcontractTotals() (which
-- reads v_all_expenses by contract_id). Unlinked packages emit contract_id = NULL
-- and are ignored by contract aggregations but still counted in site totals.
--
-- DROP + recreate (not CREATE OR REPLACE): the live view's `amount` column carries
-- a numeric(12,2) typmod and CREATE OR REPLACE cannot change a column's resolved
-- type (Postgres 42P16). The whole statement runs in one transaction, so a parse
-- failure rolls the DROP back and leaves the old view intact. Nothing depends on
-- v_all_expenses (verified via pg_depend); the grants below restore access.
DROP VIEW IF EXISTS v_all_expenses;

CREATE VIEW v_all_expenses AS
WITH base AS (
   SELECT e.id,
      e.site_id,
      e.date,
      e.date AS recorded_date,
      e.amount,
      e.description,
      e.category_id,
      ec.name AS category_name,
      e.module::text AS module,
          CASE e.module
              WHEN 'material'::expense_module THEN 'Material'::character varying
              WHEN 'machinery'::expense_module THEN COALESCE(ec.name, 'Machinery'::character varying)
              WHEN 'general'::expense_module THEN 'General'::character varying
              ELSE COALESCE(ec.name, 'Other'::character varying)
          END::text AS expense_type,
      e.is_cleared,
      e.cleared_date,
      e.contract_id,
      sc.title AS subcontract_title,
      e.site_payer_id,
      sp.name AS payer_name,
      e.payment_mode::text AS payment_mode,
      e.vendor_name,
      e.receipt_url,
      e.paid_by,
      e.entered_by,
      e.entered_by_user_id,
      NULL::text AS settlement_reference,
      NULL::uuid AS settlement_group_id,
      e.engineer_transaction_id,
      'expense'::text AS source_type,
      e.id AS source_id,
      e.created_at,
      e.is_deleted,
      NULL::jsonb AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       LEFT JOIN subcontracts sc ON e.contract_id = sc.id
       LEFT JOIN site_payers sp ON e.site_payer_id = sp.id
    WHERE e.is_deleted = false AND e.module <> 'labor'::expense_module
  UNION ALL
   SELECT sg.id, sg.site_id, sg.settlement_date AS date,
      COALESCE(sg.actual_payment_date, sg.created_at::date) AS recorded_date,
      sg.total_amount AS amount,
      CASE WHEN sg.notes IS NOT NULL AND sg.notes <> ''::text
           THEN (('Salary settlement ('::text || sg.laborer_count) || ' laborers) - '::text) || sg.notes
           ELSE ('Salary settlement ('::text || sg.laborer_count) || ' laborers)'::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Salary Settlement'::text LIMIT 1) AS category_id,
      'Salary Settlement'::character varying AS category_name, 'labor'::text AS module, 'Daily Salary'::text AS expense_type,
      CASE WHEN sg.payment_channel = 'direct'::text THEN true WHEN sg.engineer_transaction_id IS NOT NULL THEN true ELSE false END AS is_cleared,
      CASE WHEN sg.payment_channel = 'direct'::text THEN sg.settlement_date
           WHEN sg.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = sg.engineer_transaction_id)
           ELSE NULL::date END AS cleared_date,
      sg.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN sg.payer_source IS NULL THEN 'Own Money'::text
           WHEN sg.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN sg.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN sg.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN sg.payer_source = 'other_site_money'::text THEN COALESCE(sg.payer_name, 'Other Site'::text)
           WHEN sg.payer_source = 'custom'::text THEN COALESCE(sg.payer_name, 'Other'::text)
           ELSE COALESCE(sg.payer_name, 'Own Money'::text) END AS payer_name,
      sg.payment_mode, NULL::text AS vendor_name, sg.proof_url AS receipt_url,
      sg.created_by AS paid_by, sg.created_by_name AS entered_by, sg.created_by AS entered_by_user_id,
      sg.settlement_reference, sg.id AS settlement_group_id, sg.engineer_transaction_id,
      'settlement'::text AS source_type, sg.id AS source_id, sg.created_at, sg.is_cancelled AS is_deleted,
      sg.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM settlement_groups sg
       LEFT JOIN subcontracts sc ON sg.subcontract_id = sc.id
    WHERE sg.is_cancelled = false AND sg.is_archived = false
      AND COALESCE(sg.payment_type, 'salary'::text) = 'salary'::text
      AND NOT (EXISTS (SELECT 1 FROM labor_payments lp WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true))
      AND ((EXISTS (SELECT 1 FROM daily_attendance da WHERE da.settlement_group_id = sg.id AND da.is_archived = false))
        OR (EXISTS (SELECT 1 FROM market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id)))
  UNION ALL
   SELECT sg.id, sg.site_id, sg.settlement_date AS date,
      COALESCE(sg.actual_payment_date, sg.created_at::date) AS recorded_date,
      sg.total_amount AS amount,
      CASE WHEN sg.notes IS NOT NULL AND sg.notes <> ''::text
           THEN (('Salary settlement ('::text || sg.laborer_count) || ' laborers) - '::text) || sg.notes
           ELSE ('Salary settlement ('::text || sg.laborer_count) || ' laborers)'::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Salary Settlement'::text LIMIT 1) AS category_id,
      'Salary Settlement'::character varying AS category_name, 'labor'::text AS module, 'Contract Salary'::text AS expense_type,
      CASE WHEN sg.payment_channel = 'direct'::text THEN true WHEN sg.engineer_transaction_id IS NOT NULL THEN true ELSE false END AS is_cleared,
      CASE WHEN sg.payment_channel = 'direct'::text THEN sg.settlement_date
           WHEN sg.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = sg.engineer_transaction_id)
           ELSE NULL::date END AS cleared_date,
      sg.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN sg.payer_source IS NULL THEN 'Own Money'::text
           WHEN sg.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN sg.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN sg.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN sg.payer_source = 'other_site_money'::text THEN COALESCE(sg.payer_name, 'Other Site'::text)
           WHEN sg.payer_source = 'custom'::text THEN COALESCE(sg.payer_name, 'Other'::text)
           ELSE COALESCE(sg.payer_name, 'Own Money'::text) END AS payer_name,
      sg.payment_mode, NULL::text AS vendor_name, sg.proof_url AS receipt_url,
      sg.created_by AS paid_by, sg.created_by_name AS entered_by, sg.created_by AS entered_by_user_id,
      sg.settlement_reference, sg.id AS settlement_group_id, sg.engineer_transaction_id,
      'settlement'::text AS source_type, sg.id AS source_id, sg.created_at, sg.is_cancelled AS is_deleted,
      sg.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM settlement_groups sg
       LEFT JOIN subcontracts sc ON sg.subcontract_id = sc.id
    WHERE sg.is_cancelled = false
      AND (EXISTS (SELECT 1 FROM labor_payments lp WHERE lp.settlement_group_id = sg.id AND lp.is_under_contract = true))
  UNION ALL
   SELECT sg.id, sg.site_id, sg.settlement_date AS date,
      COALESCE(sg.actual_payment_date, sg.created_at::date) AS recorded_date,
      sg.total_amount AS amount,
      CASE WHEN sg.notes IS NOT NULL AND sg.notes <> ''::text
           THEN (('Advance payment ('::text || sg.laborer_count) || ' laborers) - '::text) || sg.notes
           ELSE ('Advance payment ('::text || sg.laborer_count) || ' laborers)'::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Salary Settlement'::text LIMIT 1) AS category_id,
      'Salary Settlement'::character varying AS category_name, 'labor'::text AS module, 'Advance'::text AS expense_type,
      CASE WHEN sg.payment_channel = 'direct'::text THEN true WHEN sg.engineer_transaction_id IS NOT NULL THEN true ELSE false END AS is_cleared,
      CASE WHEN sg.payment_channel = 'direct'::text THEN sg.settlement_date
           WHEN sg.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = sg.engineer_transaction_id)
           ELSE NULL::date END AS cleared_date,
      sg.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN sg.payer_source IS NULL THEN 'Own Money'::text
           WHEN sg.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN sg.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN sg.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN sg.payer_source = 'other_site_money'::text THEN COALESCE(sg.payer_name, 'Other Site'::text)
           WHEN sg.payer_source = 'custom'::text THEN COALESCE(sg.payer_name, 'Other'::text)
           ELSE COALESCE(sg.payer_name, 'Own Money'::text) END AS payer_name,
      sg.payment_mode, NULL::text AS vendor_name, sg.proof_url AS receipt_url,
      sg.created_by AS paid_by, sg.created_by_name AS entered_by, sg.created_by AS entered_by_user_id,
      sg.settlement_reference, sg.id AS settlement_group_id, sg.engineer_transaction_id,
      'settlement'::text AS source_type, sg.id AS source_id, sg.created_at, sg.is_cancelled AS is_deleted,
      sg.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM settlement_groups sg
       LEFT JOIN subcontracts sc ON sg.subcontract_id = sc.id
    WHERE sg.is_cancelled = false AND sg.payment_type = 'advance'::text
  UNION ALL
   SELECT sg.id, sg.site_id, sg.settlement_date AS date,
      COALESCE(sg.actual_payment_date, sg.created_at::date) AS recorded_date,
      sg.total_amount AS amount,
      CASE WHEN sg.notes IS NOT NULL AND sg.notes <> ''::text
           THEN (('Excess payment ('::text || sg.laborer_count) || ' laborers) - '::text) || sg.notes
           ELSE ('Excess payment ('::text || sg.laborer_count) || ' laborers)'::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Salary Settlement'::text LIMIT 1) AS category_id,
      'Salary Settlement'::character varying AS category_name, 'labor'::text AS module, 'Excess'::text AS expense_type,
      CASE WHEN sg.payment_channel = 'direct'::text THEN true WHEN sg.engineer_transaction_id IS NOT NULL THEN true ELSE false END AS is_cleared,
      CASE WHEN sg.payment_channel = 'direct'::text THEN sg.settlement_date
           WHEN sg.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = sg.engineer_transaction_id)
           ELSE NULL::date END AS cleared_date,
      sg.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN sg.payer_source IS NULL THEN 'Own Money'::text
           WHEN sg.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN sg.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN sg.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN sg.payer_source = 'other_site_money'::text THEN COALESCE(sg.payer_name, 'Other Site'::text)
           WHEN sg.payer_source = 'custom'::text THEN COALESCE(sg.payer_name, 'Other'::text)
           ELSE COALESCE(sg.payer_name, 'Own Money'::text) END AS payer_name,
      sg.payment_mode, NULL::text AS vendor_name, sg.proof_url AS receipt_url,
      sg.created_by AS paid_by, sg.created_by_name AS entered_by, sg.created_by AS entered_by_user_id,
      sg.settlement_reference, sg.id AS settlement_group_id, sg.engineer_transaction_id,
      'settlement'::text AS source_type, sg.id AS source_id, sg.created_at, sg.is_cancelled AS is_deleted,
      sg.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM settlement_groups sg
       LEFT JOIN subcontracts sc ON sg.subcontract_id = sc.id
    WHERE sg.is_cancelled = false AND sg.is_archived = false AND sg.payment_type = 'excess'::text
  UNION ALL
   SELECT sg.id, sg.site_id, sg.settlement_date AS date,
      COALESCE(sg.actual_payment_date, sg.created_at::date) AS recorded_date,
      sg.total_amount AS amount,
      CASE WHEN sg.notes IS NOT NULL AND sg.notes <> ''::text
           THEN (('Unlinked salary ('::text || sg.laborer_count) || ' laborers) - '::text) || sg.notes
           ELSE ('Unlinked salary ('::text || sg.laborer_count) || ' laborers)'::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Salary Settlement'::text LIMIT 1) AS category_id,
      'Salary Settlement'::character varying AS category_name, 'labor'::text AS module, 'Unlinked Salary'::text AS expense_type,
      CASE WHEN sg.payment_channel = 'direct'::text THEN true WHEN sg.engineer_transaction_id IS NOT NULL THEN true ELSE false END AS is_cleared,
      CASE WHEN sg.payment_channel = 'direct'::text THEN sg.settlement_date
           WHEN sg.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = sg.engineer_transaction_id)
           ELSE NULL::date END AS cleared_date,
      sg.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN sg.payer_source IS NULL THEN 'Own Money'::text
           WHEN sg.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN sg.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN sg.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN sg.payer_source = 'other_site_money'::text THEN COALESCE(sg.payer_name, 'Other Site'::text)
           WHEN sg.payer_source = 'custom'::text THEN COALESCE(sg.payer_name, 'Other'::text)
           ELSE COALESCE(sg.payer_name, 'Own Money'::text) END AS payer_name,
      sg.payment_mode, NULL::text AS vendor_name, sg.proof_url AS receipt_url,
      sg.created_by AS paid_by, sg.created_by_name AS entered_by, sg.created_by AS entered_by_user_id,
      sg.settlement_reference, sg.id AS settlement_group_id, sg.engineer_transaction_id,
      'settlement'::text AS source_type, sg.id AS source_id, sg.created_at, sg.is_cancelled AS is_deleted,
      sg.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM settlement_groups sg
       LEFT JOIN subcontracts sc ON sg.subcontract_id = sc.id
    WHERE sg.is_cancelled = false AND sg.is_archived = false
      AND COALESCE(sg.payment_type, 'salary'::text) = 'salary'::text
      AND NOT (EXISTS (SELECT 1 FROM labor_payments lp WHERE lp.settlement_group_id = sg.id))
      AND NOT (EXISTS (SELECT 1 FROM daily_attendance da WHERE da.settlement_group_id = sg.id))
      AND NOT (EXISTS (SELECT 1 FROM market_laborer_attendance ma WHERE ma.settlement_group_id = sg.id))
  UNION ALL
   SELECT ts.id, tsa.site_id, ts.payment_date AS date, ts.payment_date AS recorded_date,
      ts.amount_paid AS amount,
      CASE WHEN ts.notes IS NOT NULL AND ts.notes <> ''::text
           THEN (('Tea Shop - '::text || tsa.shop_name::text) || ' - '::text) || ts.notes
           ELSE 'Tea Shop - '::text || tsa.shop_name::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Tea & Snacks'::text LIMIT 1) AS category_id,
      'Tea & Snacks'::character varying AS category_name, 'general'::text AS module, 'Tea & Snacks'::text AS expense_type,
      true AS is_cleared,
      CASE WHEN ts.payer_type::text = 'company_direct'::text THEN ts.payment_date
           WHEN ts.site_engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = ts.site_engineer_transaction_id)
           ELSE ts.payment_date END AS cleared_date,
      ts.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE ts.payer_type WHEN 'company_direct'::text THEN 'Company Direct'::character varying
           WHEN 'site_engineer'::text THEN COALESCE((SELECT users.name FROM users WHERE users.id = ts.site_engineer_id), 'Site Engineer'::character varying)
           ELSE ts.payer_type END AS payer_name,
      ts.payment_mode, tsa.shop_name AS vendor_name, NULL::text AS receipt_url,
      ts.recorded_by_user_id AS paid_by, ts.recorded_by AS entered_by, ts.recorded_by_user_id AS entered_by_user_id,
      ts.settlement_reference, NULL::uuid AS settlement_group_id, ts.site_engineer_transaction_id AS engineer_transaction_id,
      'tea_shop_settlement'::text AS source_type, ts.id AS source_id, ts.created_at,
      COALESCE(ts.is_cancelled, false) AS is_deleted,
      ts.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM tea_shop_settlements ts
       JOIN tea_shop_accounts tsa ON ts.tea_shop_id = tsa.id
       LEFT JOIN subcontracts sc ON ts.subcontract_id = sc.id
    WHERE COALESCE(ts.is_cancelled, false) = false
  UNION ALL
   SELECT me.id, me.site_id, me.date, me.date AS recorded_date, me.amount,
      CASE WHEN me.notes IS NOT NULL AND me.notes <> ''::text THEN
              CASE WHEN me.vendor_name IS NOT NULL THEN (('Misc - '::text || me.vendor_name) || ' - '::text) || me.notes
                   ELSE 'Misc - '::text || me.notes END
           WHEN me.vendor_name IS NOT NULL THEN 'Misc - '::text || me.vendor_name
           ELSE COALESCE(me.description, 'Miscellaneous Expense'::text) END AS description,
      me.category_id, COALESCE(ec.name, 'Miscellaneous'::character varying) AS category_name, 'miscellaneous'::text AS module,
      CASE WHEN ec.name::text = 'Daily Labor Settlement'::text THEN 'Daily Salary'::text
           WHEN ec.name::text = 'Contract Labor Settlement'::text THEN 'Contract Salary'::text
           WHEN ec.name::text = 'Material Settlement'::text THEN 'Material'::text
           WHEN ec.name::text = 'Material Purchasing'::text THEN 'Material'::text
           WHEN ec.name::text = 'Material Expenses'::text THEN 'Material'::text
           WHEN ec.name::text = 'Rental Settlement'::text THEN 'Machinery'::text
           WHEN ec.name::text = 'Tea & Snacks Settlement'::text THEN 'Tea & Snacks'::text
           WHEN ec.name::text = 'General Expense'::text THEN 'General'::text
           ELSE 'Miscellaneous'::text END AS expense_type,
      true AS is_cleared,
      CASE WHEN me.payer_type = 'company_direct'::text THEN me.date
           WHEN me.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = me.engineer_transaction_id)
           ELSE me.date END AS cleared_date,
      me.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN me.payer_type = 'site_engineer'::text THEN COALESCE((SELECT users.name FROM users WHERE users.id = me.site_engineer_id), 'Site Engineer'::character varying)::text
           WHEN me.payer_source IS NULL THEN 'Own Money'::text
           WHEN me.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN me.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN me.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN me.payer_source = 'trust_account'::text THEN 'Trust Account'::text
           WHEN me.payer_source = 'other_site_money'::text THEN COALESCE(me.payer_name, 'Other Site'::text)
           WHEN me.payer_source = 'custom'::text THEN COALESCE(me.payer_name, 'Other'::text)
           ELSE 'Own Money'::text END AS payer_name,
      me.payment_mode, me.vendor_name, me.proof_url AS receipt_url,
      me.created_by AS paid_by, me.created_by_name AS entered_by, me.created_by AS entered_by_user_id,
      me.reference_number AS settlement_reference, NULL::uuid AS settlement_group_id, me.engineer_transaction_id,
      'misc_expense'::text AS source_type, me.id AS source_id, me.created_at, me.is_cancelled AS is_deleted,
      me.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM misc_expenses me
       LEFT JOIN expense_categories ec ON me.category_id = ec.id
       LEFT JOIN subcontracts sc ON me.subcontract_id = sc.id
    WHERE me.is_cancelled = false
  UNION ALL
   SELECT sp.id, sc.site_id, sp.payment_date AS date, sp.created_at::date AS recorded_date, sp.amount,
      CASE WHEN sp.comments IS NOT NULL AND sp.comments <> ''::text
           THEN (('Contract Payment - '::text || sc.title::text) || ' - '::text) || sp.comments
           ELSE 'Contract Payment - '::text || sc.title::text END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Contract Payment'::text LIMIT 1) AS category_id,
      'Contract Payment'::character varying AS category_name, 'labor'::text AS module, 'Direct Payment'::text AS expense_type,
      true AS is_cleared,
      CASE WHEN sp.payment_channel = ANY (ARRAY['company_direct_online'::text, 'mesthri_at_office'::text]) THEN sp.payment_date
           WHEN sp.site_engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = sp.site_engineer_transaction_id)
           ELSE sp.payment_date END AS cleared_date,
      sp.contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN sp.payment_channel = 'company_direct_online'::text THEN 'Company Direct'::text
           WHEN sp.payment_channel = 'mesthri_at_office'::text THEN 'Office'::text
           WHEN sp.payment_channel = 'via_site_engineer'::text THEN COALESCE((SELECT users.name FROM users WHERE users.id = sp.paid_by_user_id), 'Site Engineer'::character varying)::text
           ELSE 'Company'::text END AS payer_name,
      sp.payment_mode::text AS payment_mode, NULL::text AS vendor_name, sp.receipt_url,
      sp.paid_by_user_id AS paid_by, sp.recorded_by AS entered_by, sp.recorded_by_user_id AS entered_by_user_id,
      COALESCE(sp.reference_number, ((('SCP-'::text || to_char(sp.payment_date::timestamp with time zone, 'YYMMDD'::text)) || '-'::text) || "left"(sp.id::text, 4))::character varying) AS settlement_reference,
      NULL::uuid AS settlement_group_id, sp.site_engineer_transaction_id AS engineer_transaction_id,
      'subcontract_payment'::text AS source_type, sp.id AS source_id, sp.created_at,
      COALESCE(sp.is_deleted, false) AS is_deleted,
      NULL::jsonb AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM subcontract_payments sp
       JOIN subcontracts sc ON sp.contract_id = sc.id
    WHERE COALESCE(sp.is_deleted, false) = false
  UNION ALL
   SELECT mpe.id, mpe.site_id, COALESCE(mpe.settlement_date, mpe.purchase_date) AS date,
      mpe.purchase_date AS recorded_date,
      COALESCE(mpe.amount_paid, mpe.total_amount) AS amount,
      CASE WHEN mpe.notes IS NOT NULL AND mpe.notes <> ''::text
           THEN (('Material Purchase - '::text || COALESCE(mpe.vendor_name, 'Unknown'::text)) || ' - '::text) || mpe.notes
           ELSE 'Material Purchase - '::text || COALESCE(mpe.vendor_name, 'Unknown'::text) END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Material Purchase'::text LIMIT 1) AS category_id,
      'Material Purchase'::character varying AS category_name, 'material'::text AS module, 'Material'::text AS expense_type,
      COALESCE(mpe.is_paid, false) AS is_cleared, mpe.paid_date AS cleared_date,
      mpe.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN mpe.settlement_payer_source IS NULL THEN 'Own Money'::text
           WHEN mpe.settlement_payer_source = 'own'::text THEN 'Own Money'::text
           WHEN mpe.settlement_payer_source = 'amma'::text THEN 'Amma Money'::text
           WHEN mpe.settlement_payer_source = 'client'::text THEN 'Client Money'::text
           WHEN mpe.settlement_payer_source = 'trust'::text THEN 'Trust Account'::text
           WHEN mpe.settlement_payer_source = 'site'::text THEN COALESCE(mpe.settlement_payer_name, 'Other Site'::text)
           WHEN mpe.settlement_payer_source = 'other'::text THEN COALESCE(mpe.settlement_payer_name, 'Other'::text)
           ELSE 'Own Money'::text END AS payer_name,
      mpe.payment_mode, mpe.vendor_name, mpe.bill_url AS receipt_url,
      mpe.created_by AS paid_by, NULL::text AS entered_by, mpe.created_by AS entered_by_user_id,
      mpe.ref_code AS settlement_reference, NULL::uuid AS settlement_group_id, mpe.engineer_transaction_id,
      'material_purchase'::text AS source_type, mpe.id AS source_id, mpe.created_at, false AS is_deleted,
      mpe.payer_source_split AS row_payer_source_split,
      (SELECT string_agg(
          COALESCE(m.name, 'Material'::text)
          || COALESCE(' ' || NULLIF(b.brand_name, ''::text), ''::text)
          || ' (' || trim(to_char(i.quantity, 'FM999999990.###'::text))
          || COALESCE(' ' || m.unit, ''::text) || ')',
          ', '::text ORDER BY i.id)
        FROM material_purchase_expense_items i
          LEFT JOIN materials m ON i.material_id = m.id
          LEFT JOIN material_brands b ON i.brand_id = b.id
        WHERE i.purchase_expense_id = mpe.id) AS material_summary,
      mpe.purchase_type AS material_purchase_type,
      (SELECT site_groups.name FROM site_groups WHERE site_groups.id = mpe.site_group_id) AS material_cluster_name,
      mpe.settlement_payer_source AS material_payer_source
     FROM material_purchase_expenses mpe
       LEFT JOIN subcontracts sc ON sc.id = mpe.subcontract_id
    WHERE (mpe.is_paid = true OR mpe.settlement_date IS NOT NULL)
      AND (mpe.purchase_type IS DISTINCT FROM 'group_stock'::text OR mpe.settlement_reference IS NOT NULL)
  UNION ALL
   SELECT rs.id, ro.site_id, rs.settlement_date AS date, rs.created_at::date AS recorded_date,
      COALESCE(rs.negotiated_final_amount, rs.balance_amount + COALESCE(rs.total_advance_paid, 0::numeric)) AS amount,
      CASE WHEN rs.notes IS NOT NULL AND rs.notes <> ''::text
           THEN (('Rental - '::text || COALESCE(v.shop_name, v.name)) || ' - '::text) || rs.notes
           ELSE 'Rental - '::text || COALESCE(v.shop_name, v.name) END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Rental'::text AND expense_categories.module = 'machinery'::expense_module LIMIT 1) AS category_id,
      'Rental'::character varying AS category_name, 'machinery'::text AS module, 'Machinery'::text AS expense_type,
      true AS is_cleared,
      CASE WHEN rs.payment_channel = 'direct'::text THEN rs.settlement_date
           WHEN rs.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = rs.engineer_transaction_id)
           ELSE rs.settlement_date END AS cleared_date,
      rs.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN rs.payer_source IS NULL THEN 'Own Money'::text
           WHEN rs.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN rs.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN rs.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN rs.payer_source = 'other_site_money'::text THEN COALESCE(rs.payer_name, 'Other Site'::text)
           WHEN rs.payer_source = 'custom'::text THEN COALESCE(rs.payer_name, 'Other'::text)
           ELSE COALESCE(rs.payer_name, 'Own Money'::text) END AS payer_name,
      rs.payment_mode, COALESCE(v.shop_name, v.name) AS vendor_name, rs.final_receipt_url AS receipt_url,
      rs.settled_by AS paid_by, rs.settled_by_name AS entered_by, rs.settled_by AS entered_by_user_id,
      rs.settlement_reference, rs.settlement_group_id, rs.engineer_transaction_id,
      'rental_settlement'::text AS source_type, rs.id AS source_id, rs.created_at, false AS is_deleted,
      rs.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM rental_settlements rs
       JOIN rental_orders ro ON rs.rental_order_id = ro.id
       JOIN vendors v ON ro.vendor_id = v.id
       LEFT JOIN subcontracts sc ON rs.subcontract_id = sc.id
  UNION ALL
   SELECT ra.id, ro.site_id, ra.advance_date AS date, ra.created_at::date AS recorded_date, ra.amount,
      CASE WHEN ra.notes IS NOT NULL AND ra.notes <> ''::text
           THEN (('Rental Advance - '::text || COALESCE(v.shop_name, v.name)) || ' - '::text) || ra.notes
           ELSE 'Rental Advance - '::text || COALESCE(v.shop_name, v.name) END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Rental'::text AND expense_categories.module = 'machinery'::expense_module LIMIT 1) AS category_id,
      'Rental'::character varying AS category_name, 'machinery'::text AS module, 'Machinery'::text AS expense_type,
      true AS is_cleared, ra.advance_date AS cleared_date,
      ra.subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN ra.payer_source IS NULL THEN 'Own Money'::text
           WHEN ra.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN ra.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN ra.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN ra.payer_source = 'other_site_money'::text THEN COALESCE(ra.payer_name, 'Other Site'::text)
           WHEN ra.payer_source = 'custom'::text THEN COALESCE(ra.payer_name, 'Other'::text)
           ELSE COALESCE(ra.payer_name, 'Own Money'::text) END AS payer_name,
      ra.payment_mode, COALESCE(v.shop_name, v.name) AS vendor_name, ra.proof_url AS receipt_url,
      ra.created_by AS paid_by, NULL::text AS entered_by, ra.created_by AS entered_by_user_id,
      ro.rental_order_number || '/ADV'::text AS settlement_reference, NULL::uuid AS settlement_group_id, ra.engineer_transaction_id,
      'rental_advance'::text AS source_type, ra.id AS source_id, ra.created_at, false AS is_deleted,
      ra.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM rental_advances ra
       JOIN rental_orders ro ON ra.rental_order_id = ro.id
       JOIN vendors v ON ro.vendor_id = v.id
       LEFT JOIN subcontracts sc ON ra.subcontract_id = sc.id
  UNION ALL
   -- Task Work payments (advances + settlements). contract_id = the OPTIONAL
   -- parent subcontract, so a linked package rolls into that subcontract's spend;
   -- unlinked packages emit NULL contract_id and only count in site totals.
   SELECT twp.id, twp.site_id, twp.payment_date AS date, twp.created_at::date AS recorded_date, twp.amount,
      CASE WHEN twp.payment_type = 'final_settlement'::text THEN 'Task Work (settlement) - '::text || p.title
           WHEN twp.payment_type = 'retention_release'::text THEN 'Task Work (retention) - '::text || p.title
           WHEN twp.payment_type = 'part_payment'::text THEN 'Task Work (part) - '::text || p.title
           ELSE 'Task Work (advance) - '::text || p.title END AS description,
      (SELECT expense_categories.id FROM expense_categories WHERE expense_categories.name::text = 'Contract Payment'::text LIMIT 1) AS category_id,
      'Contract Payment'::character varying AS category_name, 'labor'::text AS module, 'Task Work'::text AS expense_type,
      true AS is_cleared,
      CASE WHEN twp.payment_channel = 'direct'::text THEN twp.payment_date
           WHEN twp.engineer_transaction_id IS NOT NULL THEN (SELECT site_engineer_transactions.transaction_date FROM site_engineer_transactions WHERE site_engineer_transactions.id = twp.engineer_transaction_id)
           ELSE twp.payment_date END AS cleared_date,
      p.parent_subcontract_id AS contract_id, sc.title AS subcontract_title, NULL::uuid AS site_payer_id,
      CASE WHEN twp.payer_source IS NULL THEN 'Own Money'::text
           WHEN twp.payer_source = 'own_money'::text THEN 'Own Money'::text
           WHEN twp.payer_source = 'amma_money'::text THEN 'Amma Money'::text
           WHEN twp.payer_source = 'client_money'::text THEN 'Client Money'::text
           WHEN twp.payer_source = 'trust_account'::text THEN 'Trust Account'::text
           WHEN twp.payer_source = 'other_site_money'::text THEN COALESCE(twp.payer_name, 'Other Site'::text)
           WHEN twp.payer_source = 'custom'::text THEN COALESCE(twp.payer_name, 'Other'::text)
           ELSE 'Own Money'::text END AS payer_name,
      twp.payment_mode::text AS payment_mode, NULL::text AS vendor_name, twp.proof_url AS receipt_url,
      twp.created_by AS paid_by, twp.created_by_name AS entered_by, twp.created_by AS entered_by_user_id,
      twp.reference_number AS settlement_reference, NULL::uuid AS settlement_group_id, twp.engineer_transaction_id,
      'task_work_payment'::text AS source_type, twp.id AS source_id, twp.created_at, twp.is_deleted,
      twp.payer_source_split AS row_payer_source_split,
      NULL::text AS material_summary, NULL::text AS material_purchase_type,
      NULL::text AS material_cluster_name, NULL::text AS material_payer_source
     FROM task_work_payments twp
       JOIN task_work_packages p ON p.id = twp.package_id
       LEFT JOIN subcontracts sc ON sc.id = p.parent_subcontract_id
    WHERE twp.is_deleted = false
)
SELECT
  base.id,
  base.site_id,
  base.date,
  base.recorded_date,
  base.amount,
  base.description,
  base.category_id,
  base.category_name,
  base.module,
  base.expense_type,
  base.is_cleared,
  base.cleared_date,
  base.contract_id,
  base.subcontract_title,
  base.site_payer_id,
  base.payer_name,
  base.payment_mode,
  base.vendor_name,
  base.receipt_url,
  base.paid_by,
  base.entered_by,
  base.entered_by_user_id,
  base.settlement_reference,
  base.settlement_group_id,
  base.engineer_transaction_id,
  base.source_type,
  base.source_id,
  base.created_at,
  base.is_deleted,
  COALESCE(
    base.row_payer_source_split,
    (
      SELECT jsonb_agg(jsonb_build_object('source', g.payer_source, 'amount', g.total) ORDER BY g.payer_source)
      FROM (
        SELECT a.payer_source, SUM(a.amount)::numeric AS total
        FROM engineer_wallet_spend_allocations a
        WHERE a.spend_id = base.engineer_transaction_id
        GROUP BY a.payer_source
      ) g
    )
  ) AS payer_source_split,
  base.material_summary,
  base.material_purchase_type,
  base.material_cluster_name,
  base.material_payer_source
FROM base;

COMMENT ON COLUMN v_all_expenses.contract_id IS
  'Subcontract the row is linked to (NULL = unlinked). Material-purchase rows expose material_purchase_expenses.subcontract_id; task_work_payment rows expose task_work_packages.parent_subcontract_id, so linked task work rolls into a subcontract''s spend via calculateSubcontractTotals().';

GRANT SELECT ON v_all_expenses TO authenticated;
GRANT SELECT ON v_all_expenses TO service_role;
