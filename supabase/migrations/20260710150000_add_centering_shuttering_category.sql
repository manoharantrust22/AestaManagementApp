-- Adds "Centering & Shuttering Materials" category: reusable formwork/scaffolding
-- support material (e.g. coconut wood shuttering/centering planks, scaffolding
-- poles) that is not installed into the building. Purchased with site money like
-- any material, but may be reused across sites and eventually discarded/sold as
-- scrap. Lightweight categorization only — no stock/quantity tracking, no
-- inter-site transfer, no equipment-style lifecycle.

INSERT INTO material_categories (name, code, description, display_order, icon, is_active)
VALUES (
  'Centering & Shuttering Materials',
  'CTR',
  'Reusable formwork and scaffolding support material (e.g. coconut wood shuttering/centering planks, scaffolding poles) that is not installed into the building. Purchased with site money like any material, but may be reused across sites and eventually discarded or sold as scrap.',
  101,
  NULL,
  true
)
ON CONFLICT (code) DO NOTHING;
