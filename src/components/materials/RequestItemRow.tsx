"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  TableRow,
  TableCell,
  Checkbox,
  Box,
  Typography,
  TextField,
  Autocomplete,
  InputAdornment,
  Tooltip,
  CircularProgress,
  IconButton,
  Collapse,
  MenuItem,
} from "@mui/material";
import { Warning as WarningIcon, ShowChart as ShowChartIcon } from "@mui/icons-material";
import MiniPriceChart from "./MiniPriceChart";
import { useVendorMaterialBrands, useVendorMaterialPrice } from "@/hooks/queries/useVendorInventory";
import { useBrandVariantLinkedBrandNames, useBrandVariantLinks } from "@/hooks/queries/useMaterials";
import { useMaterialPacks } from "@/hooks/queries/useMaterialPacks";
import { activePacks, representativePack, packUnitPrice } from "@/lib/materials/packs";
import type { RequestItemForConversion, MaterialBrand } from "@/types/material.types";
import { formatCurrency } from "@/lib/formatters";

interface RequestItemRowProps {
  item: RequestItemForConversion;
  vendorId: string | undefined;
  onToggle: () => void;
  onQuantityChange: (value: string) => void;
  onPriceChange: (value: string) => void;
  onTaxRateChange: (value: string) => void;
  onVariantChange: (variantId: string | null, variantName: string | null) => void;
  onBrandChange: (brandId: string | null, brandName: string | null) => void;
  onPricingModeChange: (value: "per_piece" | "per_kg") => void;
  onPackChange?: (packId: string | null, packCount: number | null) => void;
  showPricingModeColumn: boolean; // Whether to show the pricing mode column (for table alignment)
  priceIncludesGst?: boolean; // Whether the unit price input is in GST-inclusive mode
}

export default function RequestItemRow({
  item,
  vendorId,
  onToggle,
  onQuantityChange,
  onPriceChange,
  onTaxRateChange,
  onVariantChange,
  onBrandChange,
  onPricingModeChange,
  onPackChange,
  showPricingModeColumn,
  priceIncludesGst = false,
}: RequestItemRowProps) {
  const isDisabled = item.remaining_qty <= 0;
  // Weight-based materials (TMT rods): ordered in pieces, priced per kg.
  const isWeightBased = !!item.weight_per_unit;
  const [showChart, setShowChart] = useState(false);
  const hasAutoFilled = useRef(false);
  const [localPrice, setLocalPrice] = useState<string>("");
  const [isPriceFocused, setIsPriceFocused] = useState(false);

  // Get the effective material ID for brand lookup
  // If variant is selected, use variant's material_id, otherwise use the parent
  const effectiveMaterialId = item.selected_variant_id || item.material_id;

  // Fetch brands for the vendor + material combination
  const { data: vendorBrands = [], isLoading: isLoadingBrands } = useVendorMaterialBrands(
    vendorId,
    effectiveMaterialId
  );

  // When ordering a variant material, filter brands to those linked to that variant.
  // item.selected_variant_id is set when user has selected a specific grade/variant.
  const { data: linkedBrandNames } = useBrandVariantLinkedBrandNames(
    item.selected_variant_id ?? undefined
  );

  // Fetch brand-variant links to resolve variant-level images for the brand dropdown.
  // material_brands are keyed to the PARENT material, not the variant — always use material_id.
  const { data: brandLinks = [] } = useBrandVariantLinks(
    item.material_id ?? undefined
  );

  // Get unique brand names from vendor inventory
  const uniqueBrandNames = useMemo(() => {
    if (!vendorBrands || vendorBrands.length === 0) return [];
    const brandNames = new Set<string>();
    vendorBrands.forEach((b: any) => {
      if (b.brand_name) brandNames.add(b.brand_name);
    });
    const allNames = Array.from(brandNames).sort();
    // null means "no variant selected" or "no links yet" → show all brands
    if (!linkedBrandNames) return allNames;
    return allNames.filter((name) => linkedBrandNames.includes(name));
  }, [vendorBrands, linkedBrandNames]);

  // Build brand option objects with resolved images for the dropdown
  // Priority: link.image_url → brand.image_url (material image not available on this view model)
  const brandOptions = useMemo(() => {
    return uniqueBrandNames.map((name) => {
      const vendorBrand = vendorBrands.find((b: any) => b.brand_name === name);
      const brandEntry = brandLinks.find((b) => b.brand_name === name);
      const linkEntry = brandEntry?.material_brand_variant_links?.find(
        (l) => l.variant_id === item.selected_variant_id
      );
      const imageUrl =
        linkEntry?.image_url ?? vendorBrand?.image_url ?? brandEntry?.image_url ?? null;
      return { name, imageUrl };
    });
  }, [uniqueBrandNames, vendorBrands, brandLinks, item.selected_variant_id]);

  // Get brand variants for the selected brand name
  const brandVariantsForSelectedBrand = useMemo(() => {
    if (!item.selected_brand_name || !vendorBrands) return [];
    return vendorBrands.filter((b: any) => b.brand_name === item.selected_brand_name);
  }, [item.selected_brand_name, vendorBrands]);

  // Fetch price for the selected vendor + material + brand combination
  const { data: priceData, isLoading: isLoadingPrice } = useVendorMaterialPrice(
    vendorId,
    effectiveMaterialId,
    item.selected_brand_id
  );

  // Reset the once-per-mount auto-fill latch whenever the vendor/brand/variant
  // changes so the suggestion seed and the catalog auto-fill below can re-run
  // for the new combination. Without this the row would freeze at its first
  // auto-filled price even after the office user swaps vendors.
  // Declared first so it runs before the seed/catalog effects on a vendor swap.
  useEffect(() => {
    hasAutoFilled.current = false;
  }, [vendorId, effectiveMaterialId, item.selected_brand_id]);

  // If the row carries a calculator-time suggestion AND the dialog's chosen
  // vendor matches, seed unit_price from the suggestion before the catalog
  // auto-fill can run. This is what makes the office user's PO approval dialog
  // arrive with the engineer's basket pricing already populated.
  useEffect(() => {
    if (!item.selected) return;
    if (hasAutoFilled.current) return;
    if (
      item.suggested_vendor_id &&
      vendorId === item.suggested_vendor_id &&
      item.suggested_unit_price != null &&
      item.suggested_unit_price > 0 &&
      item.unit_price === 0
    ) {
      hasAutoFilled.current = true;
      onPriceChange(item.suggested_unit_price.toString());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, item.selected, item.suggested_vendor_id, item.suggested_unit_price]);

  // Auto-fill price, GST rate, and pricing mode when price data is available (once)
  useEffect(() => {
    if (priceData && item.selected && !hasAutoFilled.current) {
      hasAutoFilled.current = true;
      if (priceData.price && item.unit_price === 0) {
        onPriceChange(priceData.price.toString());
      }
      if (priceData.gst_rate && item.tax_rate === 0) {
        onTaxRateChange(priceData.gst_rate.toString());
      }
      // TMT/weight-based materials are always priced per kg — lock the mode
      // regardless of the vendor's stored default.
      if (item.weight_per_unit && item.pricing_mode !== "per_kg") {
        onPricingModeChange("per_kg");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceData, item.selected]);

  // ── Pack-priced variants (paint/putty/etc. sold in fixed cans) ──────────
  // Fetch the EFFECTIVE (variant) material's can sizes. The generic parent has
  // none, so this stays empty until the office picks a variant that is sold in
  // packs — then we let them order in whole cans and enter the per-can rate,
  // while unit_price is kept per-base-unit so all downstream money math (PO
  // total, delivery, stock, settlement) is unchanged.
  const { data: packsData = [] } = useMaterialPacks(effectiveMaterialId);
  const packOptions = useMemo(() => activePacks(packsData), [packsData]);
  const showPackUi = packOptions.length > 0 && !isWeightBased;
  const activePack = useMemo(() => {
    if (packOptions.length === 0) return null;
    return packOptions.find((p) => p.id === item.pack_id) ?? representativePack(packOptions);
  }, [packOptions, item.pack_id]);
  const packContents = activePack?.contents_qty || 0;
  const cans = packContents ? Math.round((item.quantity_to_order || 0) / packContents) : 0;

  const [localPackPrice, setLocalPackPrice] = useState<string>("");
  const [isPackPriceFocused, setIsPackPriceFocused] = useState(false);

  // Seed pack_id/pack_count once per effective material so the PO line carries
  // the can + count even if the office never touches the field, and normalise
  // the ordered quantity to a whole number of cans.
  const packSeededRef = useRef(false);
  useEffect(() => {
    packSeededRef.current = false;
  }, [effectiveMaterialId]);
  useEffect(() => {
    if (!showPackUi || !activePack || !item.selected || packSeededRef.current) return;
    packSeededRef.current = true;
    const contents = activePack.contents_qty || 1;
    const seededCans = Math.max(1, Math.round((item.quantity_to_order || 0) / contents));
    if (item.pack_id !== activePack.id || item.pack_count !== seededCans) {
      onPackChange?.(activePack.id, seededCans);
    }
    const base = seededCans * contents;
    if (base !== item.quantity_to_order) onQuantityChange(String(base));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showPackUi, activePack, item.selected, effectiveMaterialId]);

  // Fallback: if the chosen vendor has no quote for this variant but the can
  // carries a reference price, seed it. The vendor quote auto-fill above wins.
  useEffect(() => {
    if (!item.selected || hasAutoFilled.current || isLoadingPrice) return;
    if (priceData?.price) return;
    if (!showPackUi || activePack?.price == null || item.unit_price !== 0) return;
    hasAutoFilled.current = true;
    const perUnit = packUnitPrice(activePack);
    if (perUnit) onPriceChange(String(perUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoadingPrice, priceData, showPackUi, activePack, item.selected]);

  // Keep the per-can field in sync with unit_price (per-base-unit) when idle.
  const perCanFromUnit = packContents && item.unit_price ? item.unit_price * packContents : 0;
  useEffect(() => {
    if (!isPackPriceFocused) {
      setLocalPackPrice(perCanFromUnit ? String(Number(perCanFromUnit.toFixed(2))) : "");
    }
  }, [perCanFromUnit, isPackPriceFocused]);

  const handleCansChange = (value: string) => {
    if (!activePack) return;
    const contents = activePack.contents_qty || 1;
    const maxCans = Math.max(0, Math.floor(item.remaining_qty / contents));
    const raw = Math.floor(parseFloat(value) || 0);
    const cansVal = Math.min(Math.max(0, raw), maxCans || raw);
    onQuantityChange(String(cansVal * contents));
    onPackChange?.(activePack.id, cansVal);
  };
  const handlePackSelect = (packId: string) => {
    const pack = packOptions.find((p) => p.id === packId);
    if (!pack) return;
    const contents = pack.contents_qty || 1;
    const maxCans = Math.max(0, Math.floor(item.remaining_qty / contents));
    const cansVal = Math.min(Math.max(1, cans || 1), maxCans || (cans || 1));
    onQuantityChange(String(cansVal * contents));
    onPackChange?.(pack.id, cansVal);
  };
  const handlePackPriceChange = (value: string) => {
    setLocalPackPrice(value);
    const perCan = parseFloat(value) || 0;
    const contents = activePack?.contents_qty || 1;
    onPriceChange(String(perCan / contents));
  };

  // Handle brand name selection
  const handleBrandNameChange = (brandName: string | null) => {
    if (!brandName) {
      onBrandChange(null, null);
      return;
    }

    // Find the brand record(s) for this brand name
    const brandsWithName = vendorBrands.filter((b: any) => b.brand_name === brandName);

    if (brandsWithName.length === 1) {
      // Single brand - auto-select it
      const brand = brandsWithName[0];
      onBrandChange(brand.id, brand.brand_name);
    } else if (brandsWithName.length > 1) {
      // Multiple variants - just set the brand name, user will select variant
      onBrandChange(null, brandName);
    }
  };

  // Handle brand variant selection
  const handleBrandVariantChange = (brand: MaterialBrand | null) => {
    if (!brand) {
      // Keep the brand name but clear the specific brand_id
      onBrandChange(null, item.selected_brand_name || null);
      return;
    }
    onBrandChange(brand.id, brand.brand_name);
  };

  // Calculate converted price (per-piece if per-kg selected, and vice versa)
  const convertedPrice = useMemo(() => {
    const price = item.unit_price || 0;
    if (price <= 0 || !item.standard_piece_weight) return null;

    if (item.pricing_mode === "per_kg") {
      // User entered per-kg price, show per-piece equivalent
      return {
        value: price * item.standard_piece_weight,
        label: `~₹${(price * item.standard_piece_weight).toFixed(2)}/pc`,
      };
    } else {
      // User entered per-piece price, show per-kg equivalent
      return {
        value: price / item.standard_piece_weight,
        label: `~₹${(price / item.standard_piece_weight).toFixed(2)}/kg`,
      };
    }
  }, [item.unit_price, item.pricing_mode, item.standard_piece_weight]);

  // Calculate price including GST
  const priceIncludingGst = useMemo(() => {
    const price = item.unit_price || 0;
    const gst = item.tax_rate || 0;
    if (price <= 0) return null;
    return price * (1 + gst / 100);
  }, [item.unit_price, item.tax_rate]);

  // Sync local price state when not focused (external updates like auto-fill)
  useEffect(() => {
    if (!isPriceFocused) {
      setLocalPrice(item.unit_price ? String(item.unit_price) : "");
    }
  }, [item.unit_price, isPriceFocused]);

  // Handle price change - store as-is (no back-calculation)
  const handlePriceInputChange = (value: string) => {
    setLocalPrice(value);
    onPriceChange(value);
  };

  // Calculate item total based on pricing mode
  const itemSubtotal = useMemo(() => {
    if (!item.selected) return 0;

    if (item.pricing_mode === "per_kg") {
      const weight = item.actual_weight ?? item.calculated_weight ?? 0;
      return weight * item.unit_price;
    }
    return item.quantity_to_order * item.unit_price;
  }, [
    item.selected,
    item.pricing_mode,
    item.actual_weight,
    item.calculated_weight,
    item.quantity_to_order,
    item.unit_price,
  ]);

  // When priceIncludesGst: tax is already inside the subtotal, extract it; total = subtotal
  // When not: tax is added on top of subtotal; total = subtotal + tax
  const itemTax = item.tax_rate
    ? priceIncludesGst
      ? (itemSubtotal * item.tax_rate) / (100 + item.tax_rate)  // back-extract GST portion
      : (itemSubtotal * item.tax_rate) / 100                     // add GST on top
    : 0;
  const itemTotal = priceIncludesGst ? itemSubtotal : itemSubtotal + itemTax;

  // Check if brand has variants
  const hasBrandVariants = brandVariantsForSelectedBrand.length > 1 ||
    (brandVariantsForSelectedBrand.length === 1 && (brandVariantsForSelectedBrand[0] as any).variant_name);

  // Find the currently selected brand variant
  const selectedBrandVariant = item.selected_brand_id
    ? vendorBrands.find((b: any) => b.id === item.selected_brand_id) as MaterialBrand | undefined
    : undefined;

  // Calculate total column count for chart row span
  const totalColumns = 10 + (showPricingModeColumn ? 1 : 0);

  return (
    <>
    <TableRow
      sx={{
        opacity: isDisabled ? 0.5 : 1,
        bgcolor: item.selected && !isDisabled ? "action.selected" : undefined,
      }}
    >
      {/* Checkbox */}
      <TableCell padding="checkbox">
        <Checkbox
          checked={item.selected && !isDisabled}
          onChange={onToggle}
          disabled={isDisabled}
        />
      </TableCell>

      {/* Material with variant selection */}
      <TableCell>
        <Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <Typography variant="body2">
              {item.material_name}
              {item.material_code && (
                <Typography
                  component="span"
                  variant="caption"
                  color="text.secondary"
                  sx={{ ml: 1 }}
                >
                  ({item.material_code})
                </Typography>
              )}
            </Typography>
            <Tooltip title={showChart ? "Hide price trend" : "Show price trend"}>
              <IconButton
                size="small"
                onClick={() => setShowChart(!showChart)}
                color={showChart ? "primary" : "default"}
                sx={{ p: 0.25 }}
              >
                <ShowChartIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Tooltip>
          </Box>

          {/* Variant Selection - show if material has variants */}
          {item.has_variants && item.variants && item.variants.length > 0 && (
            <Autocomplete
              size="small"
              options={item.variants}
              getOptionLabel={(opt) => opt.name}
              value={item.variants.find(v => v.id === item.selected_variant_id) || null}
              onChange={(_, value) => {
                onVariantChange(value?.id || null, value?.name || null);
                // Clear brand when variant changes
                onBrandChange(null, null);
                // Reset price when variant changes
                onPriceChange("0");
              }}
              disabled={isDisabled || !item.selected}
              slotProps={{
                popper: { disablePortal: false }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select variant..."
                  size="small"
                  sx={{ mt: 0.5, maxWidth: 200 }}
                />
              )}
              sx={{ mt: 0.5 }}
            />
          )}

          {/* Show selected variant name if any */}
          {item.selected_variant_name && (
            <Typography variant="caption" color="primary.main" sx={{ display: "block", mt: 0.25 }}>
              Variant: {item.selected_variant_name}
            </Typography>
          )}

          {/* Pack (can) size — only when the chosen variant is sold in cans */}
          {showPackUi && item.selected && (
            packOptions.length > 1 ? (
              <TextField
                select
                size="small"
                label="Can size"
                value={activePack?.id || ""}
                onChange={(e) => handlePackSelect(e.target.value)}
                disabled={isDisabled}
                sx={{ mt: 0.5, maxWidth: 200 }}
              >
                {packOptions.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.label}
                  </MenuItem>
                ))}
              </TextField>
            ) : (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
                Sold in {activePack?.label}
              </Typography>
            )
          )}
        </Box>
      </TableCell>

      {/* Brand Selection */}
      <TableCell>
        <Box sx={{ minWidth: 140 }}>
          {/* Brand name dropdown */}
          <Autocomplete
            size="small"
            options={brandOptions}
            getOptionLabel={(opt) => opt.name}
            isOptionEqualToValue={(opt, val) => opt.name === val.name}
            value={
              item.selected_brand_name
                ? (brandOptions.find((o) => o.name === item.selected_brand_name) ?? { name: item.selected_brand_name, imageUrl: null })
                : null
            }
            onChange={(_, value) => handleBrandNameChange(value?.name ?? null)}
            disabled={isDisabled || !item.selected || !vendorId}
            loading={isLoadingBrands}
            slotProps={{
              popper: { disablePortal: false }
            }}
            renderOption={(props, option) => {
              // MUI passes `key` inside props; React forbids spreading it — pull it out.
              const { key, ...optionProps } = props as typeof props & { key?: string };
              return (
                <Box component="li" key={key} {...optionProps} sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                  {option.imageUrl ? (
                    <Box
                      component="img"
                      src={option.imageUrl}
                      sx={{ width: 24, height: 24, objectFit: "cover", borderRadius: 0.5, flexShrink: 0 }}
                    />
                  ) : (
                    <Box sx={{ width: 24, height: 24, bgcolor: "grey.200", borderRadius: 0.5, flexShrink: 0 }} />
                  )}
                  <span>{option.name}</span>
                </Box>
              );
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={
                  !vendorId
                    ? "Select vendor"
                    : isLoadingBrands
                      ? "Loading..."
                      : brandOptions.length === 0
                        ? "No brands"
                        : "Select brand"
                }
                size="small"
                InputProps={{
                  ...params.InputProps,
                  endAdornment: (
                    <>
                      {isLoadingBrands && <CircularProgress color="inherit" size={16} />}
                      {params.InputProps.endAdornment}
                    </>
                  ),
                }}
              />
            )}
          />

          {/* Brand variant dropdown - show if brand has multiple variants */}
          {hasBrandVariants && item.selected_brand_name && (
            <Autocomplete
              size="small"
              options={brandVariantsForSelectedBrand as MaterialBrand[]}
              getOptionLabel={(opt) => (opt as any).variant_name || "Standard"}
              value={selectedBrandVariant || null}
              onChange={(_, value) => handleBrandVariantChange(value)}
              disabled={isDisabled || !item.selected}
              slotProps={{
                popper: { disablePortal: false }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  placeholder="Select variant"
                  size="small"
                  sx={{ mt: 0.5 }}
                />
              )}
              sx={{ mt: 0.5 }}
            />
          )}

          {/* Price loading indicator */}
          {isLoadingPrice && item.selected_brand_id && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "flex", alignItems: "center", gap: 0.5, mt: 0.5 }}>
              <CircularProgress size={10} /> Loading price...
            </Typography>
          )}
        </Box>
      </TableCell>

      {/* Approved */}
      <TableCell align="right">
        {item.approved_qty} {item.unit}
      </TableCell>

      {/* Ordered */}
      <TableCell align="right">
        {item.already_ordered_qty > 0 ? (
          <Typography variant="body2" color="warning.main">
            {item.already_ordered_qty} {item.unit}
          </Typography>
        ) : (
          "-"
        )}
      </TableCell>

      {/* Remaining */}
      <TableCell align="right">
        {isDisabled ? (
          <Tooltip title="Already fully ordered">
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 0.5 }}>
              <WarningIcon fontSize="small" color="disabled" />
              <Typography variant="body2" color="text.disabled">
                0
              </Typography>
            </Box>
          </Tooltip>
        ) : (
          <Typography variant="body2" color="success.main" fontWeight={500}>
            {item.remaining_qty} {item.unit}
          </Typography>
        )}
      </TableCell>

      {/* Qty to Order */}
      <TableCell align="right">
        {showPackUi ? (
          <Box>
            <TextField
              type="number"
              size="small"
              value={cans || ""}
              onChange={(e) => handleCansChange(e.target.value)}
              disabled={isDisabled || !item.selected}
              inputProps={{
                min: 0,
                step: 1,
                style: { textAlign: "right", width: 56 },
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end" sx={{ fontSize: "0.7rem" }}>
                    cans
                  </InputAdornment>
                ),
              }}
            />
            {item.selected && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                = {item.quantity_to_order} {item.unit}
              </Typography>
            )}
          </Box>
        ) : (
          <TextField
            type="number"
            size="small"
            value={item.quantity_to_order || ""}
            onChange={(e) => onQuantityChange(e.target.value)}
            disabled={isDisabled || !item.selected}
            inputProps={{
              min: 0,
              max: item.remaining_qty,
              step: 1,
              style: { textAlign: "right", width: 60 },
            }}
          />
        )}
      </TableCell>

      {/* Unit Price */}
      <TableCell align="right">
        {showPackUi ? (
          <TextField
            type="number"
            size="small"
            value={localPackPrice}
            onChange={(e) => handlePackPriceChange(e.target.value)}
            onFocus={() => setIsPackPriceFocused(true)}
            onBlur={() => setIsPackPriceFocused(false)}
            disabled={isDisabled || !item.selected}
            inputProps={{
              min: 0,
              step: 0.01,
              style: { textAlign: "right", width: 80 },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">₹</InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end" sx={{ fontSize: "0.7rem" }}>/can</InputAdornment>
              ),
            }}
          />
        ) : (
          <TextField
            type="number"
            size="small"
            value={localPrice}
            onChange={(e) => handlePriceInputChange(e.target.value)}
            onFocus={() => setIsPriceFocused(true)}
            onBlur={() => setIsPriceFocused(false)}
            disabled={isDisabled || !item.selected}
            inputProps={{
              min: 0,
              step: 0.01,
              style: { textAlign: "right", width: 80 },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">₹</InputAdornment>
              ),
              endAdornment: isWeightBased ? (
                <InputAdornment position="end" sx={{ fontSize: "0.7rem" }}>/kg</InputAdornment>
              ) : undefined,
            }}
          />
        )}
        {/* Pack mode: per-can → per-unit equivalent + line total helper */}
        {showPackUi && item.selected && item.unit_price > 0 && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            ≈ {formatCurrency(item.unit_price)}/{item.unit} · {cans} can{cans !== 1 ? "s" : ""} = {formatCurrency(itemSubtotal)}
          </Typography>
        )}
        {/* Show last price hint if available with unit context */}
        {!showPackUi && priceData?.price && item.unit_price !== priceData.price && (
          <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
            → Last: {formatCurrency(priceData.price)}
            {priceData.pricing_mode === "per_kg" ? "/kg" : priceData.pricing_mode === "per_piece" ? "/pc" : ""}
            {priceData.last_purchase_date && (
              <> on {new Date(priceData.last_purchase_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</>
            )}
          </Typography>
        )}
        {/* Show converted price if weight-based */}
        {convertedPrice && item.selected && (
          <Typography
            variant="caption"
            sx={{ display: "block", color: "info.main", fontWeight: 500 }}
          >
            {convertedPrice.label}
          </Typography>
        )}
        {/* Show complementary GST price */}
        {item.unit_price > 0 && item.tax_rate > 0 && item.selected && (
          <Typography
            variant="caption"
            sx={{ display: "block", color: "success.main", fontWeight: 500 }}
          >
            {priceIncludesGst
              ? `Excl. GST: ₹${(item.unit_price / (1 + item.tax_rate / 100)).toFixed(2)}`
              : `Incl. ${item.tax_rate}% GST: ₹${priceIncludingGst?.toFixed(2)}`}
          </Typography>
        )}
      </TableCell>

      {/* Price Per / Weight — show column for alignment when any items have weight data.
          TMT is always priced per kg, so the mode is locked (no toggle) and the weight
          shown here is an ESTIMATE; the exact weight is captured at delivery from the bill. */}
      {showPricingModeColumn && (
        <TableCell align="right" sx={{ minWidth: 130 }}>
          {item.weight_per_unit ? (
            <Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", fontWeight: 600 }}
              >
                Per kg
              </Typography>
              {/* Standard weight per piece */}
              {item.standard_piece_weight && item.selected && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.25, fontSize: "0.65rem" }}
                >
                  ~{item.standard_piece_weight.toFixed(2)} kg/pc
                </Typography>
              )}
              {/* Estimated total weight (read-only) — exact kg comes from the bill at delivery */}
              {item.pricing_mode === "per_kg" && item.selected && item.calculated_weight ? (
                <Typography
                  variant="caption"
                  sx={{ display: "block", mt: 0.25, fontWeight: 500 }}
                >
                  ≈ {item.calculated_weight.toFixed(1)} kg (est)
                </Typography>
              ) : null}
              {/* Real-world reference: kg/pc actually delivered last time from this vendor */}
              {priceData?.last_actual_weight_per_piece && item.selected ? (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", fontSize: "0.6rem" }}
                >
                  last del. ~{priceData.last_actual_weight_per_piece.toFixed(2)} kg/pc
                </Typography>
              ) : null}
            </Box>
          ) : (
            <Typography variant="caption" color="text.secondary">
              -
            </Typography>
          )}
        </TableCell>
      )}

      {/* GST % */}
      <TableCell align="right">
        <TextField
          type="number"
          size="small"
          value={item.tax_rate || ""}
          onChange={(e) => onTaxRateChange(e.target.value)}
          disabled={isDisabled || !item.selected}
          inputProps={{
            min: 0,
            max: 100,
            step: 1,
            style: { textAlign: "right", width: 50 },
          }}
          InputProps={{
            endAdornment: (
              <InputAdornment position="end">%</InputAdornment>
            ),
          }}
        />
      </TableCell>

      {/* Subtotal (before GST) */}
      <TableCell align="right">
        {item.selected && !isDisabled ? (
          <Typography variant="body2">
            {formatCurrency(itemSubtotal)}
          </Typography>
        ) : (
          "-"
        )}
      </TableCell>

      {/* Total (with GST) */}
      <TableCell align="right">
        {item.selected && !isDisabled ? (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {formatCurrency(itemTotal)}
            </Typography>
            {itemTax > 0 && (
              <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                +{formatCurrency(itemTax)} GST
              </Typography>
            )}
          </Box>
        ) : (
          "-"
        )}
      </TableCell>
    </TableRow>
    {showChart && (
      <TableRow>
        <TableCell colSpan={totalColumns} sx={{ py: 0, borderBottom: showChart ? 1 : 0, borderColor: "divider" }}>
          <Collapse in={showChart}>
            <MiniPriceChart
              materialId={effectiveMaterialId}
              materialName={item.material_name}
              enabled={showChart}
            />
          </Collapse>
        </TableCell>
      </TableRow>
    )}
    </>
  );
}
