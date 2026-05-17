"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tabs,
  Tab,
  TextField,
  Button,
  Box,
  Typography,
  Alert,
} from "@mui/material";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";

import { type CalculatorTemplate, type UnitOption } from "@/lib/category-calculator-templates";
import { parseAiJson, type WoodItem, type SteelItem, type TilesItem, type GenericItem } from "@/lib/aiPromptSchemas";
import { useToast } from "@/contexts/ToastContext";
import { useEstimateBasket, type EstimateItem } from "@/contexts/EstimateBasketContext";

interface AiAssistDialogProps {
  open: boolean;
  onClose: () => void;
  template: CalculatorTemplate;
  materialId: string | null;
  materialName: string;
  categoryCode: string;
  onItemsAdded: (count: number) => void;
}

function convertToEstimateItems(
  parsedItems: unknown[],
  categoryCode: string,
  materialId: string | null,
  materialName: string,
  template: CalculatorTemplate,
): Omit<EstimateItem, "id">[] {
  if (categoryCode === "WOD") {
    return (parsedItems as WoodItem[]).map((item) => {
      const inputs = {
        length: item.length_ft,
        width: item.width_in,
        thickness: item.thickness_in,
        qty: item.qty,
      };
      const units: Record<string, UnitOption> = {
        length: "ft",
        width: "in",
        thickness: "in",
        qty: "pcs",
      };
      return {
        materialId,
        materialName: `${materialName} — ${item.name}`,
        categoryCode,
        inputs,
        units,
        computedOutput: template.computeOutput(inputs, units),
        outputUnit: template.outputUnit,
        outputLabel: template.outputLabel,
        pricingDimensionValue: item.quality_tier ?? null,
        vendorQuotes: [],
        selectedVendorId: null,
      };
    });
  }

  if (categoryCode === "STL") {
    return (parsedItems as SteelItem[]).map((item) => {
      const inputs = {
        diameter_mm: item.diameter_mm,
        length: item.length_m,
        qty: item.qty,
      };
      const units: Record<string, UnitOption> = {
        diameter_mm: "mm",
        length: "m",
        qty: "pcs",
      };
      return {
        materialId,
        materialName: `${materialName} — ⌀${item.diameter_mm}mm`,
        categoryCode,
        inputs,
        units,
        computedOutput: template.computeOutput(inputs, units),
        outputUnit: template.outputUnit,
        outputLabel: template.outputLabel,
        pricingDimensionValue: item.brand ?? null,
        vendorQuotes: [],
        selectedVendorId: null,
      };
    });
  }

  if (categoryCode === "TIL") {
    return (parsedItems as TilesItem[]).map((item) => {
      const inputs = {
        area: item.area_sqft,
        tile_sqft: item.tile_size_sqft,
        wastage_pct: item.wastage_pct,
      };
      const units: Record<string, UnitOption> = {
        area: "sqft",
        tile_sqft: "sqft",
        wastage_pct: "%",
      };
      return {
        materialId,
        materialName,
        categoryCode,
        inputs,
        units,
        computedOutput: template.computeOutput(inputs, units),
        outputUnit: template.outputUnit,
        outputLabel: template.outputLabel,
        pricingDimensionValue: item.brand ?? null,
        vendorQuotes: [],
        selectedVendorId: null,
      };
    });
  }

  // Default / generic — best-effort using qty
  return (parsedItems as GenericItem[]).map((item) => {
    const inputs = { qty: item.qty };
    const units: Record<string, UnitOption> = { qty: "pcs" };
    return {
      materialId,
      materialName: `${materialName} — ${item.name}`,
      categoryCode,
      inputs,
      units,
      computedOutput: template.computeOutput(inputs, units),
      outputUnit: template.outputUnit,
      outputLabel: template.outputLabel,
      pricingDimensionValue: item.brand ?? null,
      vendorQuotes: [],
      selectedVendorId: null,
    };
  });
}

export function AiAssistDialog({
  open,
  onClose,
  template,
  materialId,
  materialName,
  categoryCode,
  onItemsAdded,
}: AiAssistDialogProps) {
  const { showSuccess } = useToast();
  const { addItem } = useEstimateBasket();

  const [activeTab, setActiveTab] = useState(0);
  const [pastedText, setPastedText] = useState("");
  const [parsedItems, setParsedItems] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseSuccess, setParseSuccess] = useState<string | null>(null);

  function handleClose() {
    setPastedText("");
    setParsedItems(null);
    setParseError(null);
    setParseSuccess(null);
    setActiveTab(0);
    onClose();
  }

  function handleCopyPrompt() {
    navigator.clipboard.writeText(template.aiPrompt);
    showSuccess("Prompt copied to clipboard");
  }

  function handleTestParse() {
    try {
      const result = parseAiJson(categoryCode, pastedText);
      setParsedItems(result);
      setParseError(null);
      setParseSuccess(`Valid — ${result.length} item${result.length !== 1 ? "s" : ""}`);
    } catch (err) {
      setParsedItems(null);
      setParseSuccess(null);
      setParseError(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  function handleAddToBasket() {
    if (!parsedItems) return;

    const estimateItems = convertToEstimateItems(
      parsedItems,
      categoryCode,
      materialId,
      materialName,
      template,
    );

    estimateItems.forEach((item) => addItem(item));
    onItemsAdded(estimateItems.length);
    handleClose();
  }

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="sm" fullWidth>
      <DialogTitle>AI Assist</DialogTitle>

      <Box sx={{ borderBottom: 1, borderColor: "divider", px: 3 }}>
        <Tabs
          value={activeTab}
          onChange={(_e, newValue: number) => setActiveTab(newValue)}
        >
          <Tab label="Copy prompt" />
          <Tab label="Paste response" />
        </Tabs>
      </Box>

      <DialogContent>
        {/* Tab 1 — Copy Prompt */}
        {activeTab === 0 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Copy this prompt and paste it into your AI assistant along with your drawing or image.
            </Typography>
            <TextField
              value={template.aiPrompt}
              multiline
              minRows={6}
              fullWidth
              slotProps={{ input: { readOnly: true } }}
              sx={{ fontFamily: "monospace", fontSize: "0.85rem" }}
            />
          </Box>
        )}

        {/* Tab 2 — Paste Response */}
        {activeTab === 1 && (
          <Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
              Paste the JSON response from your AI assistant below, then click &ldquo;Test Parse&rdquo; to validate it.
            </Typography>
            <TextField
              value={pastedText}
              onChange={(e) => {
                setPastedText(e.target.value);
                // Clear previous parse results when text changes
                setParsedItems(null);
                setParseError(null);
                setParseSuccess(null);
              }}
              multiline
              minRows={6}
              fullWidth
              placeholder="Paste AI JSON here..."
            />

            {parseSuccess && (
              <Alert severity="success" sx={{ mt: 1.5 }}>
                {parseSuccess}
              </Alert>
            )}

            {parseError && (
              <Alert severity="error" sx={{ mt: 1.5 }}>
                {parseError}
              </Alert>
            )}
          </Box>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2, gap: 1 }}>
        <Button onClick={handleClose} color="inherit">
          Cancel
        </Button>

        {activeTab === 0 && (
          <Button
            onClick={handleCopyPrompt}
            variant="contained"
            startIcon={<ContentCopyIcon />}
          >
            Copy
          </Button>
        )}

        {activeTab === 1 && (
          <>
            <Button
              onClick={handleTestParse}
              variant="outlined"
              startIcon={<PlayArrowIcon />}
              disabled={!pastedText.trim()}
            >
              Test Parse
            </Button>
            <Button
              onClick={handleAddToBasket}
              variant="contained"
              startIcon={<AddShoppingCartIcon />}
              disabled={parsedItems === null}
            >
              Add to Basket
            </Button>
          </>
        )}
      </DialogActions>
    </Dialog>
  );
}
