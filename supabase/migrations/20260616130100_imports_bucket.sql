-- Migration: Create the 'imports' storage bucket for raw bulk-upload CSV retention
-- Purpose: Keep the original uploaded CSV for each import batch (audit / re-download).
--          Files are stored at '<site_id>/<batch-uuid>.csv'.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'imports',
  'imports',
  false,  -- private, authenticated access only
  20971520,  -- 20MB limit (plenty for thousands of expense rows)
  ARRAY['text/csv', 'application/vnd.ms-excel', 'text/plain']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated users can upload import files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can view import files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update import files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete import files" ON storage.objects;

CREATE POLICY "Authenticated users can upload import files"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'imports');

CREATE POLICY "Authenticated users can view import files"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'imports');

CREATE POLICY "Authenticated users can update import files"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'imports');

CREATE POLICY "Authenticated users can delete import files"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'imports');
