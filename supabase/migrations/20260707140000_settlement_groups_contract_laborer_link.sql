-- Link a settlement_group to ONE contract laborer so a rupee payment (full, partial, or
-- already-paid) can be attributed without needing whole is_paid attendance-days.
ALTER TABLE public.settlement_groups
  ADD COLUMN IF NOT EXISTS contract_ref_kind text
    CHECK (contract_ref_kind IN ('task_work','subcontract')),
  ADD COLUMN IF NOT EXISTS contract_ref_id uuid,
  ADD COLUMN IF NOT EXISTS contract_laborer_id uuid;

CREATE INDEX IF NOT EXISTS idx_settlement_groups_contract_laborer
  ON public.settlement_groups (contract_ref_kind, contract_ref_id, contract_laborer_id)
  WHERE contract_ref_kind IS NOT NULL;
