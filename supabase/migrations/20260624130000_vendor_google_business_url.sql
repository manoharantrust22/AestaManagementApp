-- Add a Google Business / Maps listing link to vendors.
-- Stored exactly as pasted (short share link, full maps URL, or g.co link) — no parsing.
-- Nullable, no default: existing vendors stay NULL and behave exactly as before.
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS google_business_url text;
COMMENT ON COLUMN vendors.google_business_url IS 'Google Business / Maps listing URL (share link or full maps URL), stored as pasted.';
