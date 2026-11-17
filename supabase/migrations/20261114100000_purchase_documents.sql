-- Migration: purchase_documents (procurement Phase 1, Bill Inbox capture)
-- Purpose: A bill (or estimate, transport slip, receipt) exists as soon as its
--          photo is uploaded, before anyone has read or typed anything. The
--          purchase row is created later, when someone confirms the reading.
--          See docs/analysis/procurement-gap-analysis.md sections 5.2 (item 1),
--          6 (non-blocking capture) and 8 (P1).
--
-- Also:
--   * Raises the purchase-documents bucket limit from 15 MB to 30 MB. Three of
--     the twelve sample bills are 15.3 to 16.3 MB and would be rejected.
--   * When a pending vendor name is filled in, raises a 'vendor_name_added'
--     review flag (anyone may fill it; admin/office check it).
--
-- Additive only. No anon grants. company_id is nullable now (multi-tenancy later).

-- ============================================================
-- 1. Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.purchase_documents (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          uuid NULL REFERENCES public.companies(id),
  site_id             uuid NULL REFERENCES public.sites(id) ON DELETE CASCADE,

  doc_kind            text NOT NULL DEFAULT 'unknown'
                        CHECK (doc_kind IN ('unknown', 'tax_invoice', 'cash_bill', 'estimate', 'quotation',
                                            'transport_slip', 'payment_receipt', 'other')),

  -- Files. storage_path is the untouched original; preview_path a compressed copy for the UI and the reader.
  storage_bucket      text NOT NULL DEFAULT 'purchase-documents',
  storage_path        text NOT NULL,
  preview_path        text NULL,
  file_sha256         text NOT NULL CHECK (file_sha256 ~ '^[0-9a-f]{64}$'),
  mime_type           text NULL,
  size_bytes          bigint NULL,
  original_filename   text NULL,

  status              text NOT NULL DEFAULT 'uploaded'
                        CHECK (status IN ('uploaded', 'extracting', 'needs_review', 'confirmed',
                                          'rejected', 'failed')),

  -- Reading (AI extraction). extraction holds the full JSON the reader returned.
  extraction          jsonb NULL,
  extraction_model    text NULL,
  extraction_error    text NULL,
  extract_attempts    integer NOT NULL DEFAULT 0,
  extracted_at        timestamptz NULL,
  confidence          numeric(4, 3) NULL CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),

  -- Header values, copied out of the extraction so lists and duplicate checks can query them.
  vendor_id           uuid NULL REFERENCES public.vendors(id) ON DELETE SET NULL,
  vendor_name         text NULL,
  vendor_gstin        text NULL,
  vendor_name_pending boolean NOT NULL DEFAULT false,  -- unknown shop: someone must fill the name later
  invoice_no          text NULL,
  invoice_date        date NULL,
  total_amount        numeric(14, 2) NULL,

  duplicate_of_id     uuid NULL REFERENCES public.purchase_documents(id) ON DELETE SET NULL,
  related_document_id uuid NULL REFERENCES public.purchase_documents(id) ON DELETE SET NULL,  -- transport slip -> material bill
  purchase_expense_id uuid NULL REFERENCES public.material_purchase_expenses(id) ON DELETE SET NULL,

  notes               text NULL,
  captured_at         timestamptz NOT NULL DEFAULT now(),  -- when the photo was taken on the phone (may be before upload)
  uploaded_by         uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_by        uuid NULL REFERENCES public.users(id) ON DELETE SET NULL,
  confirmed_at        timestamptz NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.purchase_documents IS
  'Bill Inbox: one row per uploaded bill/estimate/slip/receipt. Exists before it is read; links to the purchase once confirmed.';

-- The same file can only be in the inbox once (unless the earlier copy was rejected).
CREATE UNIQUE INDEX IF NOT EXISTS uq_purchase_documents_sha256
  ON public.purchase_documents (file_sha256)
  WHERE status <> 'rejected';

CREATE INDEX IF NOT EXISTS idx_purchase_documents_site_status
  ON public.purchase_documents (site_id, status, captured_at DESC);
-- Semantic duplicate lookup (a re-scan of the same bill has a different hash).
CREATE INDEX IF NOT EXISTS idx_purchase_documents_invoice
  ON public.purchase_documents (lower(invoice_no), invoice_date)
  WHERE invoice_no IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchase_documents_expense
  ON public.purchase_documents (purchase_expense_id)
  WHERE purchase_expense_id IS NOT NULL;

-- ============================================================
-- 2. updated_at + vendor-name review flag
-- ============================================================
CREATE OR REPLACE FUNCTION public.purchase_documents_before_update()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();

  -- Anyone may fill in a pending shop name; every such fill is checked by admin/office.
  -- A fresh reading (extraction changes) that finds the name is not a person's edit.
  IF OLD.vendor_name_pending
     AND NEW.extraction IS NOT DISTINCT FROM OLD.extraction
     AND NULLIF(TRIM(COALESCE(NEW.vendor_name, '')), '') IS NOT NULL
     AND NEW.vendor_name IS DISTINCT FROM OLD.vendor_name THEN
    NEW.vendor_name_pending := false;
    INSERT INTO public.review_flags (company_id, site_id, entity_type, entity_id, reason, details, raised_by)
    VALUES (
      NEW.company_id,
      NEW.site_id,
      'purchase_document',
      NEW.id,
      'vendor_name_added',
      jsonb_build_object(
        'vendor_name', NEW.vendor_name,
        'vendor_id', NEW.vendor_id,
        'invoice_no', NEW.invoice_no,
        'total_amount', NEW.total_amount
      ),
      public.get_current_user_id()
    )
    ON CONFLICT (entity_type, entity_id, reason) WHERE status = 'open'
    DO UPDATE SET details = EXCLUDED.details;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_documents_before_update ON public.purchase_documents;
CREATE TRIGGER trg_purchase_documents_before_update
  BEFORE UPDATE ON public.purchase_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_documents_before_update();

-- Fill company_id with the single existing company until multi-tenancy lands.
CREATE OR REPLACE FUNCTION public.purchase_documents_before_insert()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS NULL THEN
    NEW.company_id := (SELECT id FROM public.companies ORDER BY created_at LIMIT 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_purchase_documents_before_insert ON public.purchase_documents;
CREATE TRIGGER trg_purchase_documents_before_insert
  BEFORE INSERT ON public.purchase_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.purchase_documents_before_insert();

-- ============================================================
-- 3. RLS: anyone with access to the site may capture, read and complete a bill;
--    only admin/office may delete one.
-- ============================================================
ALTER TABLE public.purchase_documents ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.purchase_documents FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_documents TO authenticated;
GRANT ALL ON public.purchase_documents TO service_role;

DROP POLICY IF EXISTS purchase_documents_select ON public.purchase_documents;
CREATE POLICY purchase_documents_select ON public.purchase_documents
  FOR SELECT TO authenticated
  USING (site_id IS NULL OR public.can_access_site(site_id));

DROP POLICY IF EXISTS purchase_documents_insert ON public.purchase_documents;
CREATE POLICY purchase_documents_insert ON public.purchase_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = public.get_current_user_id()
    AND (site_id IS NULL OR public.can_access_site(site_id))
  );

DROP POLICY IF EXISTS purchase_documents_update ON public.purchase_documents;
CREATE POLICY purchase_documents_update ON public.purchase_documents
  FOR UPDATE TO authenticated
  USING (site_id IS NULL OR public.can_access_site(site_id))
  WITH CHECK (site_id IS NULL OR public.can_access_site(site_id));

DROP POLICY IF EXISTS purchase_documents_delete ON public.purchase_documents;
CREATE POLICY purchase_documents_delete ON public.purchase_documents
  FOR DELETE TO authenticated
  USING (public.is_admin_or_office());

-- ============================================================
-- 4. Bucket: accept full-size phone photos (originals are kept as-is)
-- ============================================================
UPDATE storage.buckets
SET file_size_limit = 31457280  -- 30 MB
WHERE id = 'purchase-documents'
  AND (file_size_limit IS NULL OR file_size_limit < 31457280);
