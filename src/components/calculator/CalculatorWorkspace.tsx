"use client";

import { useState, useMemo } from "react";
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  MenuItem,
  Select,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import ShoppingCartRoundedIcon from "@mui/icons-material/ShoppingCartRounded";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";

import {
  getCalculatorTemplate,
  type UnitOption,
} from "@/lib/category-calculator-templates";
import { toFeet, type LengthUnit } from "@/lib/calculatorMath";
import {
  useMaterialSearchOptions,
  filterMaterialSearchOptions,
  useMaterialBrands,
} from "@/hooks/queries/useMaterials";
import { useCalculatorVendorQuotes } from "@/hooks/queries/useCalculatorQuotes";
import { useEstimateBasket } from "@/contexts/EstimateBasketContext";
import { useToast } from "@/contexts/ToastContext";

import CalculatorInputs from "./CalculatorInputs";
import VendorQuoteList from "./VendorQuoteList";
import { AiAssistDialog } from "./AiAssistDialog";
import { EstimateBasketDrawer } from "./EstimateBasketDrawer";

interface CalculatorWorkspaceProps {
  /** If provided, the material is pre-selected and the selector is hidden */
  fixedMaterialId?: string;
  fixedMaterialName?: string;
  fixedCategoryCode?: string;
  onConvertToRequest?: () => void;
  /**
   * When true, hides the top-right cart badge button and EstimateBasketDrawer.
   * Use on pages that render EstimateBasketPanel inline alongside the workspace.
   */
  hideBasketControls?: boolean;
}

export default function CalculatorWorkspace({
  fixedMaterialId,
  fixedMaterialName,
  fixedCategoryCode,
  onConvertToRequest,
  hideBasketControls = false,
}: CalculatorWorkspaceProps) {
  const theme = useTheme();
  const { addItem, totalItems } = useEstimateBasket();
  const { showSuccess } = useToast();

  // ── Selected material ──────────────────────────────────────────────────────
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(
    fixedMaterialId ?? null,
  );
  const [selectedMaterialName, setSelectedMaterialName] = useState<string>(
    fixedMaterialName ?? "",
  );
  const [selectedCategoryCode, setSelectedCategoryCode] = useState<
    string | undefined
  >(fixedCategoryCode);
  const [selectedMaterialCode, setSelectedMaterialCode] = useState<
    string | null
  >(null);

  // ── Template ───────────────────────────────────────────────────────────────
  const template = getCalculatorTemplate(selectedCategoryCode);

  // ── Teak wood: Log / Palagai with output unit picker ──────────────────────
  // Activated when the selected material is TEA-0001 (the teak parent material).
  // Type determines input set + default output unit; user can flip output unit
  // and the math + auto-rate-fill follow.
  const TEAK_TYPES = ['Log', 'Palagai'] as const;
  type TeakType = (typeof TEAK_TYPES)[number];
  type TeakOutputUnit = 'cft' | 'sqft' | 'ft';
  // Palagai is priced per running foot, rate varies by (width × quality).
  // Default output unit for Palagai is therefore `ft`, not sqft.
  const DEFAULT_TEAK_UNIT: Record<TeakType, TeakOutputUnit> = {
    Log: 'cft',
    Palagai: 'ft',
  };
  // Stored vendor rates assume this thickness; effective rate scales linearly
  // with thickness ratio until real rates for other thicknesses are entered.
  const PALAGAI_REFERENCE_THICKNESS_IN = 1.5;
  const PALAGAI_WIDTHS_IN = [5, 6, 7, 8, 9, 10, 12] as const;
  type PalagaiWidthIn = (typeof PALAGAI_WIDTHS_IN)[number];
  const isTeak = selectedMaterialCode === 'TEA-0001';

  const [teakType, setTeakType] = useState<TeakType>('Log');
  const [outputUnit, setOutputUnit] = useState<TeakOutputUnit>('cft');
  const [palagaiWidthIn, setPalagaiWidthIn] = useState<PalagaiWidthIn>(7);

  const effectiveTemplate = useMemo(() => {
    if (!isTeak) return template;

    // For Palagai the width is chosen via a chip selector (discrete market
    // widths), so drop the freeform width input from the template.
    const inputs =
      teakType === 'Palagai'
        ? template.inputs.filter((f) => f.key !== 'width')
        : template.inputs;

    const labelByUnit: Record<TeakOutputUnit, string> = {
      cft: 'Gana adi (cft)',
      sqft: 'Square feet (sqft)',
      ft: 'Running feet (ft)',
    };

    return {
      ...template,
      inputs,
      outputUnit,
      outputLabel: labelByUnit[outputUnit],
      computeOutput: (
        values: Record<string, number>,
        units: Record<string, UnitOption>,
      ) => {
        const lengthFt = toFeet(
          values.length ?? 0,
          (units.length ?? 'ft') as LengthUnit,
        );
        const widthFt =
          teakType === 'Log'
            ? toFeet(
                values.width ?? 0,
                (units.width ?? 'in') as LengthUnit,
              )
            : palagaiWidthIn / 12;
        const thicknessFt = toFeet(
          values.thickness ?? 0,
          (units.thickness ?? 'in') as LengthUnit,
        );
        const qty = values.qty ?? 0;
        if (outputUnit === 'cft') return lengthFt * widthFt * thicknessFt * qty;
        if (outputUnit === 'sqft') return lengthFt * widthFt * qty;
        return lengthFt * qty; // 'ft' (running)
      },
    };
  }, [isTeak, teakType, outputUnit, palagaiWidthIn, template]);

  // ── Dimension inputs ───────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, number | "">>(() =>
    Object.fromEntries(
      template.inputs.map((f) => [f.key, f.defaultValue ?? ""]),
    ),
  );
  const [units, setUnits] = useState<Record<string, UnitOption>>(() =>
    Object.fromEntries(template.inputs.map((f) => [f.key, f.defaultUnit])),
  );

  // ── Brand/quality ──────────────────────────────────────────────────────────
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);
  const [selectedBrandName, setSelectedBrandName] = useState<string | null>(
    null,
  );

  // ── Dialog / drawer state ──────────────────────────────────────────────────
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [basketDrawerOpen, setBasketDrawerOpen] = useState(false);

  // ── Material search options (unused when fixedMaterialId is set) ───────────
  const { data: searchOptions = [] } = useMaterialSearchOptions();

  // ── Brands for the selected material ──────────────────────────────────────
  const { data: brands = [] } = useMaterialBrands(
    selectedMaterialId ?? undefined,
  );

  // ── Vendor quotes ──────────────────────────────────────────────────────────
  // For teak we only auto-fill rates when the user is on the default unit for
  // that type (cft for Log, sqft for Palagai). On non-default units the brand's
  // stored unit won't match, so the query returns nothing — manual rate entry
  // would be a v2 feature.
  const teakUnitMatchesDefault = isTeak
    ? outputUnit === DEFAULT_TEAK_UNIT[teakType]
    : true;
  const { quotes, isLoading: quotesLoading } = useCalculatorVendorQuotes(
    selectedMaterialId,
    isTeak ? selectedBrandId : null,
    isTeak && teakUnitMatchesDefault ? outputUnit : null,
  );

  // ── Selected vendor ────────────────────────────────────────────────────────
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // ── Computed output ────────────────────────────────────────────────────────
  const numericValues = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, typeof v === "number" ? v : 0]),
  );
  const computedOutput = effectiveTemplate.computeOutput(numericValues, units);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleMaterialChange(
    materialId: string,
    materialName: string,
    categoryCode: string | undefined,
    materialCode: string | null,
  ) {
    const newTemplate = getCalculatorTemplate(categoryCode);
    setSelectedMaterialId(materialId);
    setSelectedMaterialName(materialName);
    setSelectedCategoryCode(categoryCode);
    setSelectedMaterialCode(materialCode);
    // Reset inputs to new template defaults
    setValues(
      Object.fromEntries(
        newTemplate.inputs.map((f) => [f.key, f.defaultValue ?? ""]),
      ),
    );
    setUnits(
      Object.fromEntries(
        newTemplate.inputs.map((f) => [f.key, f.defaultUnit]),
      ),
    );
    setSelectedBrandId(null);
    setSelectedBrandName(null);
    setSelectedVendorId(null);
    setTeakType('Log');
    setOutputUnit('cft');
    setPalagaiWidthIn(7);
  }

  // Brand-name prefix that the active teak chip combo maps to.
  // Log → "Log · "; Palagai → "Palagai {width}\" · " (composite width brand).
  const teakBrandPrefix = isTeak
    ? teakType === 'Log'
      ? 'Log · '
      : `Palagai ${palagaiWidthIn}" · `
    : null;

  // Thickness scaling for Palagai: vendor rate is stored at the reference
  // thickness (1.5"). If the user picks a different thickness, scale linearly
  // until real vendor rates for that thickness are entered.
  const palagaiThicknessIn =
    typeof values.thickness === 'number' && values.thickness > 0
      ? toFeet(values.thickness, (units.thickness ?? 'in') as LengthUnit) * 12
      : PALAGAI_REFERENCE_THICKNESS_IN;
  const palagaiThicknessScale =
    isTeak && teakType === 'Palagai'
      ? palagaiThicknessIn / PALAGAI_REFERENCE_THICKNESS_IN
      : 1;
  const palagaiNeedsScaleNote =
    isTeak &&
    teakType === 'Palagai' &&
    Math.abs(palagaiThicknessIn - PALAGAI_REFERENCE_THICKNESS_IN) > 0.001;

  // Quotes with thickness-scaled unit prices (only matters for Palagai when
  // user picks a thickness other than 1.5"). For Log and non-teak materials
  // this is a passthrough.
  const displayQuotes = useMemo(
    () =>
      quotes.map((q) => ({
        ...q,
        unitPrice: q.unitPrice * palagaiThicknessScale,
      })),
    [quotes, palagaiThicknessScale],
  );

  function handleAddToBasket() {
    if (!selectedMaterialId || computedOutput <= 0) return;

    addItem({
      materialId: selectedMaterialId,
      materialName: selectedMaterialName,
      categoryCode: selectedCategoryCode ?? "default",
      inputs: numericValues,
      units: Object.fromEntries(
        Object.entries(units).map(([k, u]) => [k, u as string]),
      ),
      computedOutput,
      outputUnit: effectiveTemplate.outputUnit,
      outputLabel: effectiveTemplate.outputLabel,
      pricingDimensionValue: selectedBrandName,
      vendorQuotes: displayQuotes.map((q) => ({
        vendorId: q.vendorId,
        vendorName: q.vendorName,
        unitPrice: q.unitPrice,
        subtotal: computedOutput * q.unitPrice,
      })),
      selectedVendorId,
    });

    showSuccess(
      `Added to basket — ${computedOutput.toFixed(3)} ${effectiveTemplate.outputUnit}`,
    );
  }

  const hasMaterial = selectedMaterialId !== null;
  const canAddToBasket = computedOutput > 0 && hasMaterial;
  const showBrandChips =
    hasMaterial &&
    template.pricingDimension === "brand" &&
    brands.length > 0;

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Top row: basket badge button — hidden when basket is shown inline */}
      {!hideBasketControls && (
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            startIcon={
              <Badge badgeContent={totalItems} color="primary">
                <ShoppingCartRoundedIcon />
              </Badge>
            }
            onClick={() => setBasketDrawerOpen(true)}
            variant="outlined"
            size="small"
          >
            Estimate Basket
          </Button>
        </Box>
      )}

      {/* Material selector — hidden when fixedMaterialId is provided */}
      {!fixedMaterialId && (
        <Autocomplete
          options={searchOptions}
          getOptionLabel={(option) => option.displayName}
          filterOptions={(options, { inputValue }) =>
            filterMaterialSearchOptions(options, inputValue)
          }
          isOptionEqualToValue={(option, value) => option.id === value.id}
          onChange={(_e, option) => {
            if (!option) {
              setSelectedMaterialId(null);
              setSelectedMaterialName("");
              setSelectedCategoryCode(undefined);
              setSelectedMaterialCode(null);
              setSelectedBrandId(null);
              setSelectedBrandName(null);
              setSelectedVendorId(null);
              return;
            }
            // Resolve the actual material (use variant if selected, otherwise material)
            const targetMaterial = option.variant ?? option.material;
            const categoryCode =
              (targetMaterial.category as { code?: string } | null)?.code ??
              undefined;
            handleMaterialChange(
              targetMaterial.id,
              targetMaterial.name,
              categoryCode,
              targetMaterial.code ?? null,
            );
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Select material"
              placeholder="Search by name, code, or brand…"
              size="small"
            />
          )}
          renderOption={(props, option) => (
            <li {...props} key={option.id}>
              <Box>
                <Typography variant="body2">{option.displayName}</Typography>
                <Typography variant="caption" color="text.secondary">
                  {option.contextLabel}
                </Typography>
              </Box>
            </li>
          )}
          slotProps={{ popper: { disablePortal: false } }}
        />
      )}

      {/* Teak wood type chips — TEA-0001 only */}
      {isTeak && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.75 }}
          >
            Wood type
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {TEAK_TYPES.map((t) => (
              <Chip
                key={t}
                label={t}
                onClick={() => {
                  setTeakType(t);
                  setOutputUnit(DEFAULT_TEAK_UNIT[t]);
                  // Seed thickness for Palagai (1.5" reference) so the user
                  // doesn't see an empty field when they switch types.
                  if (t === 'Palagai') {
                    setValues((prev) => ({
                      ...prev,
                      thickness: PALAGAI_REFERENCE_THICKNESS_IN,
                    }));
                    setUnits((prev) => ({ ...prev, thickness: 'in' }));
                  }
                  // Preserve quality across type switch. For Log, target
                  // "Log · {quality}". For Palagai, target
                  // "Palagai {width}\" · {quality}" using the current chip.
                  const qualitySuffix = selectedBrandName
                    ?.split(' · ')
                    .slice(1)
                    .join(' · ');
                  if (qualitySuffix) {
                    const nextName =
                      t === 'Log'
                        ? `Log · ${qualitySuffix}`
                        : `Palagai ${palagaiWidthIn}" · ${qualitySuffix}`;
                    const next = brands.find((b) => b.brand_name === nextName);
                    setSelectedBrandId(next?.id ?? null);
                    setSelectedBrandName(next?.brand_name ?? null);
                  } else {
                    setSelectedBrandId(null);
                    setSelectedBrandName(null);
                  }
                  setSelectedVendorId(null);
                }}
                variant={teakType === t ? 'filled' : 'outlined'}
                color={teakType === t ? 'primary' : 'default'}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Palagai width chip selector — only when Palagai mode active */}
      {isTeak && teakType === 'Palagai' && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.75 }}
          >
            Plank width
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
            {PALAGAI_WIDTHS_IN.map((w) => (
              <Chip
                key={w}
                label={`${w}"`}
                onClick={() => {
                  setPalagaiWidthIn(w);
                  // Re-target the brand row for the new width, preserving quality.
                  const qualitySuffix = selectedBrandName
                    ?.split(' · ')
                    .slice(1)
                    .join(' · ');
                  if (qualitySuffix) {
                    const next = brands.find(
                      (b) => b.brand_name === `Palagai ${w}" · ${qualitySuffix}`,
                    );
                    setSelectedBrandId(next?.id ?? null);
                    setSelectedBrandName(next?.brand_name ?? null);
                  } else {
                    setSelectedBrandId(null);
                    setSelectedBrandName(null);
                  }
                  setSelectedVendorId(null);
                }}
                variant={palagaiWidthIn === w ? 'filled' : 'outlined'}
                color={palagaiWidthIn === w ? 'primary' : 'default'}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Brand/quality chips — for teak, filter to the active type's brands */}
      {showBrandChips && teakBrandPrefix !== null && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.75 }}
          >
            {template.pricingDimensionLabel}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {brands
              .filter((b) => b.brand_name.startsWith(teakBrandPrefix))
              .map((b) => (
                <Chip
                  key={b.id}
                  label={b.brand_name.replace(teakBrandPrefix, '')}
                  onClick={() => {
                    setSelectedBrandId(b.id);
                    setSelectedBrandName(b.brand_name);
                    setSelectedVendorId(null);
                  }}
                  variant={selectedBrandId === b.id ? 'filled' : 'outlined'}
                  color={selectedBrandId === b.id ? 'primary' : 'default'}
                  sx={{ mr: 0.5 }}
                />
              ))}
          </Box>
        </Box>
      )}
      {showBrandChips && !isTeak && (
        <Box>
          <Typography
            variant="caption"
            color="text.secondary"
            display="block"
            sx={{ mb: 0.75 }}
          >
            {template.pricingDimensionLabel}
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            {brands.map((b) => (
              <Chip
                key={b.id}
                label={b.brand_name}
                onClick={() => {
                  setSelectedBrandId(b.id);
                  setSelectedBrandName(b.brand_name);
                  setSelectedVendorId(null);
                }}
                variant={selectedBrandId === b.id ? "filled" : "outlined"}
                color={selectedBrandId === b.id ? "primary" : "default"}
                sx={{ mr: 0.5 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Dimension inputs */}
      {hasMaterial && (
        <CalculatorInputs
          template={effectiveTemplate}
          values={values}
          units={units}
          onValueChange={(key, value) =>
            setValues((prev) => ({ ...prev, [key]: value }))
          }
          onUnitChange={(key, unit) =>
            setUnits((prev) => ({ ...prev, [key]: unit }))
          }
        />
      )}

      {/* Computed output display */}
      {computedOutput > 0 && (
        <Box
          sx={{
            bgcolor: alpha(theme.palette.primary.main, 0.08),
            borderRadius: 2,
            p: 1.5,
            textAlign: "center",
          }}
        >
          <Typography variant="caption" color="text.secondary">
            {effectiveTemplate.outputLabel}
          </Typography>
          <Box
            sx={{
              display: "flex",
              gap: 1,
              alignItems: "baseline",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <Typography variant="h5" color="primary.main" fontWeight={700}>
              {computedOutput.toFixed(3)}
            </Typography>
            {isTeak ? (
              <Select
                size="small"
                value={outputUnit}
                onChange={(e) =>
                  setOutputUnit(e.target.value as TeakOutputUnit)
                }
                sx={{
                  ".MuiSelect-select": { py: 0.25, fontWeight: 700 },
                  bgcolor: "background.paper",
                }}
              >
                <MenuItem value="cft">cft</MenuItem>
                <MenuItem value="sqft">sqft</MenuItem>
                <MenuItem value="ft">ft</MenuItem>
              </Select>
            ) : (
              <Typography
                variant="h5"
                color="primary.main"
                fontWeight={700}
                component="span"
              >
                {effectiveTemplate.outputUnit}
              </Typography>
            )}
          </Box>
          {(numericValues.qty ?? 0) > 1 && computedOutput > 0 && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              {(computedOutput / numericValues.qty).toFixed(3)}{" "}
              {effectiveTemplate.outputUnit} per piece × {numericValues.qty} pcs
              = {computedOutput.toFixed(3)} {effectiveTemplate.outputUnit}
            </Typography>
          )}
          {isTeak && !teakUnitMatchesDefault && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mt: 0.5 }}
            >
              Vendor rates only auto-fill on the default unit
              (cft for Log, ft for Palagai). Switch back to see prices.
            </Typography>
          )}
          {palagaiNeedsScaleNote && (
            <Typography
              variant="caption"
              color="warning.main"
              sx={{ display: "block", mt: 0.5 }}
            >
              Rate scaled from 1.5″ base by ×{palagaiThicknessScale.toFixed(2)}
              {" "}for {palagaiThicknessIn.toFixed(2)}″ thickness — confirm with vendor.
            </Typography>
          )}
        </Box>
      )}

      {/* Vendor quote list */}
      {hasMaterial && (
        <>
          <Divider />
          <Typography variant="subtitle2" color="text.secondary">
            Vendor prices
          </Typography>
          <VendorQuoteList
            quotes={displayQuotes}
            isLoading={quotesLoading}
            computedOutput={computedOutput}
            outputUnit={effectiveTemplate.outputUnit}
            selectedVendorId={selectedVendorId}
            onSelectVendor={setSelectedVendorId}
          />
        </>
      )}

      {/* Action buttons */}
      {hasMaterial && (
        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            startIcon={<AddShoppingCartIcon />}
            disabled={!canAddToBasket}
            onClick={handleAddToBasket}
            sx={{ flex: 1, minWidth: 160 }}
          >
            Add to basket
          </Button>
          <Button
            variant="outlined"
            startIcon={<AutoAwesomeIcon />}
            onClick={() => setAiDialogOpen(true)}
            sx={{ flex: 1, minWidth: 160 }}
          >
            Get AI estimate
          </Button>
        </Box>
      )}

      {/* AI assist dialog */}
      <AiAssistDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        template={template}
        materialId={selectedMaterialId}
        materialName={selectedMaterialName}
        categoryCode={selectedCategoryCode ?? "default"}
        onItemsAdded={(count) => {
          showSuccess(`${count} item${count !== 1 ? "s" : ""} added to basket`);
        }}
      />

      {/* Estimate basket drawer — hidden when basket is shown inline */}
      {!hideBasketControls && (
        <EstimateBasketDrawer
          open={basketDrawerOpen}
          onClose={() => setBasketDrawerOpen(false)}
          onConvertToRequest={() => {
            onConvertToRequest?.();
            setBasketDrawerOpen(false);
          }}
        />
      )}
    </Box>
  );
}
