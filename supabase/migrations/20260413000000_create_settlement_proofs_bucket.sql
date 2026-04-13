-- Migration: Create settlement-proofs storage bucket
-- Purpose: Store payment proof screenshots for tea shop settlements, attendance settlements,
--          misc expenses, and other payment proofs across the app.
--
-- Note: Multiple components reference 'settlement-proofs' bucket:
--   - TeaShopSettlementDialog, GroupTeaShopSettlementDialog
--   - DailySettlementDialog, WeeklySettlementDialog
--   - UnifiedSettlementDialog, SettlementFormDialog
--   - MiscExpenseDialog

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'settlement-proofs',
  'settlement-proofs',
  false,  -- Not public, requires authentication
  10485760,  -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload files
CREATE POLICY "Authenticated users can upload settlement proof files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'settlement-proofs');

-- Allow authenticated users to view settlement proof files
CREATE POLICY "Authenticated users can view settlement proof files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'settlement-proofs');

-- Allow authenticated users to update settlement proof files
CREATE POLICY "Authenticated users can update settlement proof files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'settlement-proofs');

-- Allow authenticated users to delete settlement proof files
CREATE POLICY "Authenticated users can delete settlement proof files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'settlement-proofs');
