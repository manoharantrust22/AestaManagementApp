-- Enrich v_all_expenses with material-purchase detail so the /site/expenses
-- table can show what a "Material Purchase" row actually is instead of the
-- bare "Material Purchase - Unknown" (which only meant vendor_name was blank).
--
-- Adds 4 columns, appended at the END of the view (CREATE OR REPLACE only
-- permits appending — existing column order/names are unchanged):
--   material_summary       text  -- "<name> [brand] (<qty> <unit>)", comma-joined per item
--   material_purchase_type text  -- 'own_site' | 'group_stock'
--   material_cluster_name  text  -- site_groups.name when group_stock
--   material_payer_source  text  -- raw settlement_payer_source (own/amma/client/trust/site/other)
--
-- All non-material UNION branches project NULL for the 4 new columns.
-- Re-emits the full definition from 20260524130000_v_all_expenses_final_split.sql;
-- the only changes are the 4 trailing columns per branch + the final SELECT.
-- Additive / non-destructive.

CREATE OR REPLACE VIEW v_all_expenses AS
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
      NULL::uuid AS contract_id, NULL::text AS subcontract_title, NULL::uuid AS site_payer_id,
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

COMMENT ON COLUMN v_all_expenses.payer_source_split IS
  'Canonical JSONB array [{"source":..., "amount":...}, ...] of the row''s payer-source breakdown. Resolution: (1) the row''s per-row split column when set — Phase 1 wired settlement_groups (sg.payer_source_split), Phase 2 wired misc_expenses (me.payer_source_split), Phase 3 wired rental_settlements + rental_advances, Phase 4 wires the remaining tea_shop_settlements (ts.payer_source_split) and material_purchase_expenses (mpe.payer_source_split); subcontract_payments has no per-row split column and stays on NULL; (2) else, for any row whose engineer_transaction_id points at a wallet spend, the Phase 4 fallback aggregates engineer_wallet_spend_allocations into the same array shape; (3) else NULL.';

COMMENT ON COLUMN v_all_expenses.material_summary IS
  'Material-purchase rows only: comma-joined "<material> [brand] (<qty> <unit>)" of the purchase line items; NULL for all other source types.';
COMMENT ON COLUMN v_all_expenses.material_purchase_type IS
  'Material-purchase rows only: ''own_site'' (direct on-site purchase) or ''group_stock'' (shared cluster pool); NULL otherwise.';
COMMENT ON COLUMN v_all_expenses.material_cluster_name IS
  'Material-purchase rows only: site_groups.name when the purchase is group_stock; NULL otherwise.';
COMMENT ON COLUMN v_all_expenses.material_payer_source IS
  'Material-purchase rows only: raw settlement_payer_source (own/amma/client/trust/site/other) — ''site'' marks an inter-site settlement split; NULL otherwise.';

GRANT SELECT ON v_all_expenses TO authenticated;
GRANT SELECT ON v_all_expenses TO service_role;
