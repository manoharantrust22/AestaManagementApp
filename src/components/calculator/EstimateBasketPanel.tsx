"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Paper,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import ShoppingCartOutlinedIcon from "@mui/icons-material/ShoppingCartOutlined";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import {
  useEstimateBasket,
  type EstimateItem,
} from "@/contexts/EstimateBasketContext";
import { getCalculatorTemplate } from "@/lib/category-calculator-templates";
import { formatINR } from "@/lib/calculatorMath";
import { BasketDraftsDialog } from "./BasketDraftsDialog";

interface EstimateBasketPanelProps {
  onConvertToRequest: () => void;
}

function formatDimensions(item: EstimateItem): string {
  const template = getCalculatorTemplate(item.categoryCode);
  return template.inputs
    .map((field) => {
      const val = item.inputs[field.key];
      const unit = item.units[field.key] ?? field.defaultUnit;
      if (!val) return null;
      return `${val} ${unit}`;
    })
    .filter((p): p is string => p !== null)
    .join(" × ");
}

function BasketItemRow({
  item,
  onRemove,
}: {
  item: EstimateItem;
  onRemove: () => void;
}) {
  const selectedQuote = item.selectedVendorId
    ? item.vendorQuotes.find((q) => q.vendorId === item.selectedVendorId)
    : null;

  const dimensions = formatDimensions(item);

  return (
    <Box
      sx={{
        py: 1.5,
        borderBottom: "1px solid",
        borderColor: "divider",
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0, pr: 1 }}>
          {/* Material name + quality chip */}
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap", mb: 0.25 }}>
            <Typography variant="body2" fontWeight={700}>
              {item.materialName}
            </Typography>
            {item.pricingDimensionValue && (
              <Chip
                label={item.pricingDimensionValue}
                size="small"
                variant="outlined"
                sx={{ fontSize: 10, height: 18 }}
              />
            )}
          </Box>

          {/* Dimensions */}
          {dimensions && (
            <Typography variant="caption" color="text.secondary" display="block">
              {dimensions}
            </Typography>
          )}

          {/* Computed output */}
          <Typography variant="caption" color="primary.main" fontWeight={600} display="block">
            {item.computedOutput.toFixed(3)} {item.outputUnit}
          </Typography>

          {/* Vendor + subtotal */}
          {selectedQuote ? (
            <Box sx={{ mt: 0.5, display: "flex", gap: 1, alignItems: "baseline" }}>
              <Typography variant="caption" color="text.secondary">
                {selectedQuote.vendorName}
              </Typography>
              <Typography variant="caption" fontWeight={700} color="text.primary">
                {formatINR(selectedQuote.subtotal)}
              </Typography>
            </Box>
          ) : (
            <Typography
              variant="caption"
              color="text.disabled"
              display="block"
              sx={{ mt: 0.5 }}
            >
              No vendor selected
            </Typography>
          )}
        </Box>

        <IconButton size="small" onClick={onRemove} color="error" sx={{ mt: -0.5 }}>
          <DeleteRoundedIcon fontSize="small" />
        </IconButton>
      </Box>
    </Box>
  );
}

export function EstimateBasketPanel({ onConvertToRequest }: EstimateBasketPanelProps) {
  const { items, removeItem, clearBasket, totalItems } = useEstimateBasket();
  const [draftsDialog, setDraftsDialog] = useState<null | "save" | "load">(null);

  const grandTotal = items.reduce((sum, item) => {
    if (!item.selectedVendorId) return sum;
    const quote = item.vendorQuotes.find((q) => q.vendorId === item.selectedVendorId);
    return sum + (quote?.subtotal ?? 0);
  }, 0);

  const itemsWithoutVendor = items.filter(
    (item) =>
      !item.selectedVendorId ||
      !item.vendorQuotes.some((q) => q.vendorId === item.selectedVendorId),
  ).length;

  const unitTotals = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.outputUnit] = (acc[item.outputUnit] ?? 0) + item.computedOutput;
    return acc;
  }, {});

  return (
    <Paper
      variant="outlined"
      sx={{
        display: "flex",
        flexDirection: "column",
        position: { md: "sticky" },
        top: { md: 80 },
        maxHeight: { md: "calc(100vh - 100px)" },
        overflow: "hidden", // clips border-radius; inner Box handles scroll
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <ShoppingCartOutlinedIcon fontSize="small" color="primary" />
          <Typography variant="subtitle2" fontWeight={700}>
            Estimate Basket
          </Typography>
          {totalItems > 0 && (
            <Chip label={totalItems} size="small" color="primary" />
          )}
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
          <Tooltip title="Load a saved draft">
            <IconButton
              size="small"
              onClick={() => setDraftsDialog("load")}
              aria-label="Load saved draft"
            >
              <FolderOpenOutlinedIcon fontSize="small" />
            </IconButton>
          </Tooltip>
          <Tooltip title={totalItems === 0 ? "Add items to save a draft" : "Save basket as draft"}>
            <span>
              <IconButton
                size="small"
                onClick={() => setDraftsDialog("save")}
                disabled={totalItems === 0}
                aria-label="Save current basket as draft"
              >
                <BookmarkAddOutlinedIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
          {totalItems > 0 && (
            <Button
              size="small"
              color="error"
              onClick={clearBasket}
              sx={{ textTransform: "none", fontSize: "0.75rem" }}
            >
              Clear all
            </Button>
          )}
        </Box>
      </Box>

      {/* Content */}
      {items.length === 0 ? (
        <Box
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            p: 3,
            textAlign: "center",
            color: "text.disabled",
            gap: 1,
          }}
        >
          <ShoppingCartOutlinedIcon sx={{ fontSize: 36, opacity: 0.3 }} />
          <Typography variant="body2">
            Add items from the calculator to build your estimate
          </Typography>
        </Box>
      ) : (
        <>
          <Box sx={{ flex: 1, overflowY: "auto", px: 2 }}>
            {items.map((item) => (
              <BasketItemRow
                key={item.id}
                item={item}
                onRemove={() => removeItem(item.id)}
              />
            ))}
          </Box>

          <Divider />

          {/* Unit totals + grand total */}
          <Box sx={{ px: 2, pt: 1.5, pb: 0.5 }}>
            <Stack spacing={0.25}>
              {Object.entries(unitTotals).map(([unit, total]) => (
                <Box
                  key={unit}
                  sx={{ display: "flex", justifyContent: "space-between" }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Total ({unit}):
                  </Typography>
                  <Typography variant="caption" fontWeight={700}>
                    {total.toFixed(3)} {unit}
                  </Typography>
                </Box>
              ))}

              <Divider sx={{ my: 0.5 }} />

              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <Typography variant="body2" color="text.secondary">
                  Grand total (selected vendors):
                </Typography>
                <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                  {formatINR(grandTotal)}
                </Typography>
              </Box>
              {itemsWithoutVendor > 0 && (
                <Typography variant="caption" color="warning.main">
                  {itemsWithoutVendor} item{itemsWithoutVendor !== 1 ? "s" : ""} without vendor
                </Typography>
              )}
            </Stack>
          </Box>

          <Divider />

          {/* Action */}
          <Box sx={{ p: 2 }}>
            <Button
              fullWidth
              variant="contained"
              color="primary"
              disabled={items.length === 0}
              onClick={onConvertToRequest}
            >
              Convert to Material Request →
            </Button>
          </Box>
        </>
      )}

      {draftsDialog && (
        <BasketDraftsDialog
          open
          mode={draftsDialog}
          onClose={() => setDraftsDialog(null)}
        />
      )}
    </Paper>
  );
}
