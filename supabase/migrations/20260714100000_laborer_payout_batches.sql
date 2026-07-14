-- Weekly Payout Console — batch header table + settlement_groups provenance link.
--
-- One laborer_payout_batches row = one hand-to-hand weekly payment to one company
-- laborer, recorded on the cross-site payout console. The payment fans out into N
-- site-scoped settlement_groups (one per site × bucket); each child group carries
-- payout_batch_id so every downstream reader (salary waterfall SET-detail, contract
-- payment history, /site/expenses) can show "via Weekly Payout".
--
-- Writes happen ONLY through the SECURITY DEFINER RPCs (pay_laborer_weekly_payout /
-- reverse_laborer_payout — 20260714100300); RLS grants read to authenticated.

CREATE TABLE public.laborer_payout_batches (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid REFERENCES public.companies(id),
  laborer_id       uuid NOT NULL REFERENCES public.laborers(id),
  week_start       date NOT NULL,
  week_end         date NOT NULL,
  payment_date     date NOT NULL,          -- actual hand-over date (backdatable)
  total_amount     numeric(12,2) NOT NULL DEFAULT 0,
  payment_mode     text,
  notes            text,
  proof_urls       text[],
  buckets_result   jsonb,                  -- receipt snapshot [{site_id, kind, ref_kind, ref_id, settlement_group_id, settlement_reference, requested, recorded}]
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  idempotency_key  uuid UNIQUE,
  is_reversed      boolean NOT NULL DEFAULT false,
  reversed_at      timestamptz,
  reversed_by      text,
  reversal_reason  text
);

CREATE INDEX idx_laborer_payout_batches_laborer_week
  ON public.laborer_payout_batches (laborer_id, week_start);

ALTER TABLE public.settlement_groups
  ADD COLUMN payout_batch_id uuid REFERENCES public.laborer_payout_batches(id);

CREATE INDEX idx_settlement_groups_payout_batch
  ON public.settlement_groups (payout_batch_id)
  WHERE payout_batch_id IS NOT NULL;

ALTER TABLE public.laborer_payout_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY laborer_payout_batches_select ON public.laborer_payout_batches
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.laborer_payout_batches TO authenticated;
GRANT ALL ON public.laborer_payout_batches TO service_role;
