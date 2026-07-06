-- ============================================================
-- Spaces register: allow PDF floor plans in the space-photos bucket.
--
-- Floor plans usually arrive as PDFs. The bucket was created (20260703120000)
-- restricted to raster images, so a PDF upload was rejected server-side even
-- when the client offered it. Add application/pdf to the allow-list. Purely
-- additive: existing image uploads are unaffected; the 10 MB size limit and
-- the can_access_site storage policies stay as-is.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types =
      ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
WHERE id = 'space-photos';
