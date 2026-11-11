-- Migration: review_flags (procurement Phase 0)
-- Purpose: One generic review queue (maker/checker). Anyone may make a change or
--          raise a flag; admin/office approve, reject or mark it fixed.
--          See docs/analysis/procurement-gap-analysis.md sections 5.2 (item 10) and 8.
--
-- Also:
--   * Seeds one 'paid_above_billed' flag per material purchase where amount_paid
--     exceeds total_amount (24 rows in prod on 2026-11-08). Paid must be <= billed.
--   * Adds a trigger that raises the same flag for any NEW violation instead of
--     blocking the save (site work must never stop because of the app). A hard
--     CHECK (amount_paid <= total_amount) follows in a later migration, once the
--     open flags are resolved.
--
-- Additive only. No anon grants.

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.review_flags (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       uuid NULL REFERENCES public.companies(id),  -- multi-tenancy ready; nullable for now
  site_id          uuid NULL REFERENCES public.sites(id) ON DELETE CASCADE,
  entity_type      text NOT NULL
                     CHECK (entity_type IN ('purchase_document', 'purchase_expense', 'vendor', 'material', 'payment')),
  entity_id        uuid NOT NULL,
  reason           text NOT NULL
                     CHECK (reason IN ('vendor_name_added', 'paid_above_billed', 'low_confidence_extraction',
                                       'possible_duplicate', 'unmatched_line', 'data_correction', 'other')),
  details          jsonb NOT NULL DEFAULT '{}'::jsonb,
  status           text NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open', 'approved', 'rejected', 'fixed')),
  source_action_id uuid NULL,  -- assistant_actions.id when the flagged change came from the assistant
  raised_by        uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,  -- NULL = raised by the system
  resolved_by      uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  resolved_at      timestamptz NULL,
  resolution_note  text NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.review_flags IS
  'Generic review queue. Anyone may raise a flag; admin/office resolve it. Doubles as an audit trail of corrections.';

CREATE INDEX IF NOT EXISTS idx_review_flags_status ON public.review_flags (status, entity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_review_flags_entity ON public.review_flags (entity_type, entity_id);

-- At most one OPEN flag per entity and reason (keeps the seed and trigger idempotent).
CREATE UNIQUE INDEX IF NOT EXISTS uq_review_flags_open
  ON public.review_flags (entity_type, entity_id, reason)
  WHERE status = 'open';

-- ============================================================
-- 2. RLS
-- ============================================================
ALTER TABLE public.review_flags ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_flags FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.review_flags TO authenticated;
GRANT ALL ON public.review_flags TO service_role;

DROP POLICY IF EXISTS review_flags_select ON public.review_flags;
CREATE POLICY review_flags_select ON public.review_flags
  FOR SELECT TO authenticated
  USING (site_id IS NULL OR public.can_access_site(site_id));

DROP POLICY IF EXISTS review_flags_insert ON public.review_flags;
CREATE POLICY review_flags_insert ON public.review_flags
  FOR INSERT TO authenticated
  WITH CHECK (
    status = 'open'
    AND raised_by = public.get_current_user_id()
    AND (site_id IS NULL OR public.can_access_site(site_id))
  );

DROP POLICY IF EXISTS review_flags_resolve ON public.review_flags;
CREATE POLICY review_flags_resolve ON public.review_flags
  FOR UPDATE TO authenticated
  USING (public.is_admin_or_office())
  WITH CHECK (public.is_admin_or_office());

-- ============================================================
-- 3. Trigger: flag (do not block) paid above billed
-- ============================================================
CREATE OR REPLACE FUNCTION public.flag_paid_above_billed()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  IF NEW.amount_paid IS NOT NULL AND NEW.amount_paid > NEW.total_amount THEN
    INSERT INTO public.review_flags (company_id, site_id, entity_type, entity_id, reason, details, raised_by)
    VALUES (
      (SELECT id FROM public.companies ORDER BY created_at LIMIT 1),
      NEW.site_id,
      'purchase_expense',
      NEW.id,
      'paid_above_billed',
      jsonb_build_object(
        'ref_code', NEW.ref_code,
        'total_amount', NEW.total_amount,
        'amount_paid', NEW.amount_paid,
        'excess', NEW.amount_paid - NEW.total_amount
      ),
      NULL
    )
    ON CONFLICT (entity_type, entity_id, reason) WHERE status = 'open'
    DO UPDATE SET details = EXCLUDED.details;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_flag_paid_above_billed ON public.material_purchase_expenses;
CREATE TRIGGER trg_flag_paid_above_billed
  AFTER INSERT OR UPDATE OF amount_paid, total_amount ON public.material_purchase_expenses
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_paid_above_billed();

-- ============================================================
-- 4. Seed flags for existing violations
-- ============================================================
INSERT INTO public.review_flags (company_id, site_id, entity_type, entity_id, reason, details, raised_by)
SELECT
  (SELECT id FROM public.companies ORDER BY created_at LIMIT 1),
  mpe.site_id,
  'purchase_expense',
  mpe.id,
  'paid_above_billed',
  jsonb_build_object(
    'ref_code', mpe.ref_code,
    'total_amount', mpe.total_amount,
    'amount_paid', mpe.amount_paid,
    'excess', mpe.amount_paid - mpe.total_amount,
    'seeded', true
  ),
  NULL
FROM public.material_purchase_expenses mpe
WHERE mpe.amount_paid IS NOT NULL
  AND mpe.amount_paid > mpe.total_amount
ON CONFLICT (entity_type, entity_id, reason) WHERE status = 'open' DO NOTHING;
