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
  MenuItem,
  IconButton,
  Collapse,
} from "@mui/material";
import { Warning as WarningIcon, ShowChart as ShowChartIcon } from "@mui/icons-material";
import MiniPriceChart from "./MiniPriceChart";
import { useVendorMaterialBrands, useVendorMaterialPrice } from "@/hooks/queries/useVendorInventory";
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
  onActualWeightChange: (value: string) => void;
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
  onActualWeightChange,
  showPricingModeColumn,
  priceIncludesGst = false,
}: RequestItemRowProps) {
  const isDisabled = item.remaining_qty <= 0;
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

  // Get unique brand names from vendor inventory
  const uniqueBrandNames = useMemo(() => {
    if (!vendorBrands || vendorBrands.length === 0) return [];
    const brandNames = new Set<string>();
    vendorBrands.forEach((b: any) => {
      if (b.brand_name) brandNames.add(b.brand_name);
    });
    return Array.from(brandNames).sort();
  }, [vendorBrands]);

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
      if (priceData.pricing_mode && item.weight_per_unit && item.pricing_mode !== priceData.pricing_mode) {
        onPricingModeChange(priceData.pricing_mode as "per_piece" | "per_kg");
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceData, item.selected]);

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
        </Box>
      </TableCell>

      {/* Brand Selection */}
      <TableCell>
        <Box sx={{ minWidth: 140 }}>
          {/* Brand name dropdown */}
          <Autocomplete
            size="small"
            options={uniqueBrandNames}
            value={item.selected_brand_name || null}
            onChange={(_, value) => handleBrandNameChange(value)}
            disabled={isDisabled || !item.selected || !vendorId}
            loading={isLoadingBrands}
            slotProps={{
              popper: { disablePortal: false }
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                placeholder={
                  !vendorId
                    ? "Select vendor"
                    : isLoadingBrands
                      ? "Loading..."
                      : uniqueBrandNames.length === 0
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
      </TableCell>

      {/* Unit Price */}
      <TableCell align="right">
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
          }}
        />
        {/* Show last price hint if available with unit context */}
        {priceData?.price && item.unit_price !== priceData.price && (
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

      {/* Price Per Mode - show column for alignment when any items have weight data */}
      {showPricingModeColumn && (
        <TableCell align="right" sx={{ minWidth: 130 }}>
          {item.weight_per_unit ? (
            <Box>
              <TextField
                select
                size="small"
                value={item.pricing_mode}
                onChange={(e) =>
                  onPricingModeChange(e.target.value as "per_piece" | "per_kg")
                }
                disabled={isDisabled || !item.selected}
                sx={{ width: 140 }}
              >
                <MenuItem value="per_piece">Per Piece</MenuItem>
                <MenuItem value="per_kg">Per Kilogram</MenuItem>
              </TextField>
              {/* Show weight per piece */}
              {item.standard_piece_weight && item.selected && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: "block", mt: 0.5, fontSize: "0.65rem" }}
                >
                  ~{item.standard_piece_weight.toFixed(2)} kg/pc
                </Typography>
              )}
              {/* Actual Weight input for per_kg mode */}
              {item.pricing_mode === "per_kg" && item.selected && item.calculated_weight && (
                <Box sx={{ mt: 1 }}>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    sx={{ display: "block", fontSize: "0.65rem" }}
                  >
                    Est: {item.calculated_weight.toFixed(1)} kg
                  </Typography>
                  <TextField
                    type="number"
                    size="small"
                    value={item.actual_weight ?? item.calculated_weight ?? ""}
                    onChange={(e) => onActualWeightChange(e.target.value)}
                    disabled={isDisabled}
                    placeholder="Actual kg"
                    inputProps={{
                      min: 0,
                      step: 0.1,
                      style: { textAlign: "right", width: 70 },
                    }}
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end" sx={{ fontSize: "0.7rem" }}>kg</InputAdornment>
                      ),
                    }}
                    sx={{ mt: 0.5 }}
                  />
                </Box>
              )}
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
