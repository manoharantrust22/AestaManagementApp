-- Named, cloud-backed Estimate Basket drafts.
-- Lets a user save the current calculator basket and resume it later
-- (cross-device, survives cache clear). Scoped to the user; not shared.
--
-- `items` is a JSONB array of EstimateItem objects matching the in-memory
-- shape used by EstimateBasketContext (see src/contexts/EstimateBasketContext.tsx).
-- Treated as opaque payload here — denormalising loses the convenience that
-- makes the basket a basket.

CREATE TABLE IF NOT EXISTS public.estimate_basket_drafts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text NOT NULL CHECK (length(trim(name)) > 0),
  items       jsonb NOT NULL DEFAULT '[]'::jsonb,
  item_count  integer NOT NULL DEFAULT 0,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS estimate_basket_drafts_user_updated_idx
  ON public.estimate_basket_drafts (user_id, updated_at DESC);

-- updated_at maintainer
CREATE OR REPLACE FUNCTION public.tg_estimate_basket_drafts_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS estimate_basket_drafts_touch ON public.estimate_basket_drafts;
CREATE TRIGGER estimate_basket_drafts_touch
  BEFORE UPDATE ON public.estimate_basket_drafts
  FOR EACH ROW EXECUTE FUNCTION public.tg_estimate_basket_drafts_touch();

ALTER TABLE public.estimate_basket_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users manage their own basket drafts"
  ON public.estimate_basket_drafts;
CREATE POLICY "users manage their own basket drafts"
  ON public.estimate_basket_drafts
  FOR ALL
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.estimate_basket_drafts IS
  'User-saved calculator basket drafts. `items` mirrors EstimateBasketContext.EstimateItem[].';
