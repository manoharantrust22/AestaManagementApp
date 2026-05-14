-- Create rental-documents storage bucket for historical rental calculation sheet uploads.
-- The vendor_slip_url column on rental_orders stores the public URL after upload.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'rental-documents',
  'rental-documents',
  true,
  20971520,  -- 20 MB
  ARRAY[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO UPDATE
  SET public             = EXCLUDED.public,
      file_size_limit    = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "rental_documents_public_read" ON storage.objects;
CREATE POLICY "rental_documents_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'rental-documents');

DROP POLICY IF EXISTS "rental_documents_authenticated_insert" ON storage.objects;
CREATE POLICY "rental_documents_authenticated_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'rental-documents');

DROP POLICY IF EXISTS "rental_documents_authenticated_update" ON storage.objects;
CREATE POLICY "rental_documents_authenticated_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'rental-documents');

DROP POLICY IF EXISTS "rental_documents_authenticated_delete" ON storage.objects;
CREATE POLICY "rental_documents_authenticated_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'rental-documents');
