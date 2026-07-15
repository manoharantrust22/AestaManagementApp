-- Per-material declaration: does a vendor's price depend on brand? on variant?
--
-- Why: the vendor quote form let you save "Vijaya Plywoods, Rs.75/sqft" with no
-- brand and no variant — 185 of 242 live quotes have no brand. But for sand and
-- cement brand genuinely does not matter, so a blanket "brand is required" is
-- wrong. The distinction is per-material, not per-category: within Wood & Timber,
-- Teak wood encodes size in its BRANDS (Palagai 4", Log ...) and has no active
-- variants, while Plywood needs both brand and thickness. Only a per-material
-- declaration can express that.
--
-- Mirrors the existing per-material boolean precedent, materials.sold_in_packs
-- (20260625154050_material_packs.sql).
--
-- Keep the defaults table below in sync with
-- src/lib/material-price-scoping-defaults.ts (MaterialDialog seeds new materials
-- from it). Rollback: the columns can simply be left in place — nothing reads
-- them once the app code is reverted.

ALTER TABLE materials
  ADD COLUMN IF NOT EXISTS price_varies_by_brand   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_varies_by_variant boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN materials.price_varies_by_brand IS
  'Parent materials only. When true, a vendor quote must name the brand it prices.';
COMMENT ON COLUMN materials.price_varies_by_variant IS
  'Parent materials only. When true, a vendor quote must be bound to a variant (vendor_inventory.material_id points at the variant row).';

-- Base: declare from the category. Parents only — the flags are a property of
-- the parent; variants inherit nothing and must resolve via parent_id.
WITH defaults(code, by_brand, by_variant) AS (
  VALUES
    ('CEM',      TRUE,  FALSE),  -- Ramco vs Dalmia matters; all 50kg bags
    ('CEM-PPC',  TRUE,  FALSE),
    ('CEM-OPC53',TRUE,  FALSE),
    ('STL',      TRUE,  TRUE ),  -- 8mm vs 20mm
    ('STL-TMT',  TRUE,  TRUE ),
    ('STL-WIRE', TRUE,  FALSE),
    ('AGG',      FALSE, FALSE),  -- sand is sand
    ('AGG-MSAND',FALSE, FALSE),
    ('AGG-PSAND',FALSE, FALSE),
    ('AGG-BM20', FALSE, FALSE),
    ('BRK',      FALSE, FALSE),  -- local kilns
    ('BRK-RED',  FALSE, FALSE),
    ('BRK-CMT',  FALSE, FALSE),
    ('BRK-AAC',  FALSE, FALSE),
    ('PLB',      TRUE,  TRUE ),  -- diameter
    ('ELC',      TRUE,  TRUE ),  -- gauge
    ('WOD',      TRUE,  FALSE),  -- teak: brands encode size, no active variants
    ('WOD-PLY',  TRUE,  TRUE ),  -- the bug this migration exists for
    ('TIL',      TRUE,  TRUE ),  -- size
    ('PNT',      TRUE,  FALSE),  -- can size is a PACK, not a variant
    ('HRD',      FALSE, FALSE),
    ('GLS',      FALSE, TRUE ),  -- cut to size
    ('WPF',      TRUE,  FALSE),
    ('MSC',      FALSE, FALSE),
    ('CTR',      FALSE, FALSE),
    ('PMP',      TRUE,  TRUE ),  -- HP
    ('PMP-SUB',  TRUE,  TRUE ),
    ('PMP-PNL',  TRUE,  FALSE)   -- panels are branded; not sized
)
UPDATE materials m
SET price_varies_by_brand   = d.by_brand,
    price_varies_by_variant = d.by_variant
FROM defaults d
JOIN material_categories mc ON mc.code = d.code
WHERE m.category_id = mc.id
  AND m.parent_id IS NULL;

-- Escalate from observed evidence. May flip false -> true, never true -> false:
-- a material that already has active variants demonstrably varies by variant.
-- Evidence alone would be insufficient as a base — Plywood has ZERO variants
-- today, which is precisely the bug (nobody could add one with the right fields).
UPDATE materials m
SET price_varies_by_variant = TRUE
WHERE m.parent_id IS NULL
  AND m.price_varies_by_variant = FALSE
  AND EXISTS (
    SELECT 1 FROM materials v
    WHERE v.parent_id = m.id AND v.is_active = TRUE
  );
