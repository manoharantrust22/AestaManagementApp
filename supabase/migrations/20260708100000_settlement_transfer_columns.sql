-- Inter-site salary/mesthri settlement transfer — foundation schema.
--
-- Lets an over-paid salary settlement (e.g. a mesthri overpaid on a site whose
-- civil work is finished) be MOVED to a sibling site in the same site_group.
-- Modelled as double-entry so nothing looks "missing":
--   * the ORIGIN settlement is kept (read-only trace) and stamped so it drops
--     out of every money reader (expenses, excess, ledger, summary);
--   * a DESTINATION twin settlement is created on the other site, funded by a
--     user-chosen payer source, appearing in that site's All-Expenses.
-- The move is reversible.  All writes happen through SECURITY DEFINER RPCs
-- (see 20260708100100); these columns/table just hold the state + audit trail.

-- ---------------------------------------------------------------------------
-- 1. Header table: one row per transfer operation (rich metadata + reversal).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.settlement_transfers (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site_group_id       uuid NOT NULL REFERENCES public.site_groups(id),
  from_site_id        uuid NOT NULL REFERENCES public.sites(id),
  to_site_id          uuid NOT NULL REFERENCES public.sites(id),
  mode                text NOT NULL CHECK (mode IN ('rows','amount')),
  target_amount       numeric(12,2),                 -- amount mode: requested rupees
  moved_amount        numeric(12,2) NOT NULL DEFAULT 0, -- what actually moved (sum of twins)
  dest_subcontract_id uuid REFERENCES public.subcontracts(id), -- NULL = unlinked (still contract salary)
  payer_source        text,                          -- chosen from DEST site's payer_sources
  payer_name          text,
  payer_source_split  jsonb,
  reason              text,
  -- Snapshot of the origin labor_payments state we mutated, so reversal is
  -- lossless: [{ "id": uuid, "amount": numeric, "is_archived": bool }, ...]
  origin_lp_snapshot  jsonb NOT NULL DEFAULT '[]'::jsonb,
  transferred_by      uuid REFERENCES public.users(id),
  transferred_by_name text,
  idempotency_key     uuid UNIQUE,
  is_reversed         boolean NOT NULL DEFAULT false,
  reversed_at         timestamptz,
  reversed_by         uuid REFERENCES public.users(id),
  reversal_reason     text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settlement_transfers_distinct_sites CHECK (from_site_id <> to_site_id)
);

COMMENT ON TABLE public.settlement_transfers IS
  'Header for an inter-site salary settlement move (origin drops out, destination twin created). See transfer_settlements_to_site().';

-- ---------------------------------------------------------------------------
-- 2. Denormalized flag + linkage columns on settlement_groups.
--    `transferred_out_at IS NULL` is the universal "still counts here" predicate
--    injected into every money reader.
-- ---------------------------------------------------------------------------
ALTER TABLE public.settlement_groups
  ADD COLUMN IF NOT EXISTS transferred_out_at          timestamptz,
  ADD COLUMN IF NOT EXISTS transfer_id                 uuid REFERENCES public.settlement_transfers(id),
  ADD COLUMN IF NOT EXISTS transfer_role               text CHECK (transfer_role IN ('origin','destination')),
  ADD COLUMN IF NOT EXISTS transfer_to_site_id         uuid REFERENCES public.sites(id),
  ADD COLUMN IF NOT EXISTS transfer_from_site_id       uuid REFERENCES public.sites(id),
  ADD COLUMN IF NOT EXISTS transfer_from_settlement_id uuid REFERENCES public.settlement_groups(id),
  ADD COLUMN IF NOT EXISTS transfer_original_total     numeric(12,2);

COMMENT ON COLUMN public.settlement_groups.transferred_out_at IS
  'When set, this ORIGIN settlement was fully moved to another site; excluded from all expense/salary readers but kept as a read-only trace.';
COMMENT ON COLUMN public.settlement_groups.transfer_original_total IS
  'On a PARTIALLY-moved origin row: the total_amount before the split (reversal restores it).';

CREATE INDEX IF NOT EXISTS idx_settlement_groups_transferred_out
  ON public.settlement_groups (site_id) WHERE transferred_out_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_settlement_groups_transfer_id
  ON public.settlement_groups (transfer_id) WHERE transfer_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. RLS: either end of the transfer may read the audit row. Writes are
--    SECURITY DEFINER RPC-only (no write policy → denied for normal clients).
-- ---------------------------------------------------------------------------
ALTER TABLE public.settlement_transfers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS settlement_transfers_select ON public.settlement_transfers;
CREATE POLICY settlement_transfers_select ON public.settlement_transfers
  FOR SELECT USING (
    public.can_access_site(from_site_id) OR public.can_access_site(to_site_id)
  );

GRANT SELECT ON public.settlement_transfers TO authenticated;
