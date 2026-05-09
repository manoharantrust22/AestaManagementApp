-- AI-Assisted Catalog Ingestion — ingest_warranty_attach
-- Split from 20260509100200_ai_ingest_commit_rpc.sql so the local supabase
-- CLI's SQL splitter doesn't fold the 4 RPCs into one prepared statement.

-- =====================================================================
-- Main RPC 3: ingest_warranty_attach
-- =====================================================================
CREATE OR REPLACE FUNCTION public.ingest_warranty_attach(
  p_purchase_id UUID,
  p_warranty JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_months INTEGER;
  v_start_date DATE;
  v_serials JSONB;
  v_notes TEXT;
  v_doc_url TEXT;
  v_existing_purchase_date DATE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF p_purchase_id IS NULL THEN
    RAISE EXCEPTION 'purchase_id is required';
  END IF;

  v_months := NULLIF(p_warranty->>'warranty_months', '')::INTEGER;
  v_start_date := NULLIF(p_warranty->>'warranty_start_date', '')::DATE;
  v_serials := p_warranty->'warranty_serial_numbers';
  v_notes := NULLIF(TRIM(COALESCE(p_warranty->>'warranty_notes', '')), '');
  v_doc_url := NULLIF(TRIM(COALESCE(p_warranty->>'warranty_doc_url', '')), '');

  IF v_months IS NULL OR v_months <= 0 THEN
    RAISE EXCEPTION 'warranty_months must be > 0';
  END IF;

  -- Default warranty_start_date to purchase_date if missing
  IF v_start_date IS NULL THEN
    SELECT purchase_date INTO v_existing_purchase_date
    FROM material_purchase_expenses
    WHERE id = p_purchase_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Purchase % not found or not accessible', p_purchase_id;
    END IF;
    v_start_date := v_existing_purchase_date;
  END IF;

  UPDATE material_purchase_expenses
  SET warranty_months = v_months,
      warranty_start_date = v_start_date,
      warranty_serial_numbers = v_serials,
      warranty_notes = v_notes,
      warranty_doc_url = v_doc_url,
      updated_at = NOW()
  WHERE id = p_purchase_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase % not found or not accessible', p_purchase_id;
  END IF;

  RETURN jsonb_build_object(
    'purchase_id', p_purchase_id,
    'warranty_months', v_months,
    'warranty_start_date', v_start_date,
    'warranty_expiry', v_start_date + (v_months || ' months')::INTERVAL
  );
END;
$$;
