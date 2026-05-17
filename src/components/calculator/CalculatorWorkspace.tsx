"use client";

import { useState } from "react";
import {
  Autocomplete,
  Badge,
  Box,
  Button,
  Chip,
  Divider,
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

  // ── Template ───────────────────────────────────────────────────────────────
  const template = getCalculatorTemplate(selectedCategoryCode);

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
  const { quotes, isLoading: quotesLoading } = useCalculatorVendorQuotes(
    selectedMaterialId,
    selectedBrandId,
  );

  // ── Selected vendor ────────────────────────────────────────────────────────
  const [selectedVendorId, setSelectedVendorId] = useState<string | null>(null);

  // ── Computed output ────────────────────────────────────────────────────────
  const numericValues = Object.fromEntries(
    Object.entries(values).map(([k, v]) => [k, typeof v === "number" ? v : 0]),
  );
  const computedOutput = template.computeOutput(numericValues, units);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function handleMaterialChange(materialId: string, materialName: string, categoryCode: string | undefined) {
    const newTemplate = getCalculatorTemplate(categoryCode);
    setSelectedMaterialId(materialId);
    setSelectedMaterialName(materialName);
    setSelectedCategoryCode(categoryCode);
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
  }

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
      outputUnit: template.outputUnit,
      outputLabel: template.outputLabel,
      pricingDimensionValue: selectedBrandName,
      vendorQuotes: quotes.map((q) => ({
        vendorId: q.vendorId,
        vendorName: q.vendorName,
        unitPrice: q.unitPrice,
        subtotal: computedOutput * q.unitPrice,
      })),
      selectedVendorId,
    });

    showSuccess(
      `Added to basket — ${computedOutput.toFixed(3)} ${template.outputUnit}`,
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
            handleMaterialChange(targetMaterial.id, targetMaterial.name, categoryCode);
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

      {/* Brand/quality chips */}
      {showBrandChips && (
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
          template={template}
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
            {template.outputLabel}
          </Typography>
          <Typography variant="h5" color="primary.main" fontWeight={700}>
            {computedOutput.toFixed(3)} {template.outputUnit}
          </Typography>
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
            quotes={quotes}
            isLoading={quotesLoading}
            computedOutput={computedOutput}
            outputUnit={template.outputUnit}
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
