"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DeleteRoundedIcon from "@mui/icons-material/DeleteRounded";
import BookmarkAddOutlinedIcon from "@mui/icons-material/BookmarkAddOutlined";
import FolderOpenOutlinedIcon from "@mui/icons-material/FolderOpenOutlined";
import { useEstimateBasket, type EstimateItem } from "@/contexts/EstimateBasketContext";
import { formatINR } from "@/lib/calculatorMath";
import { BasketDraftsDialog } from "./BasketDraftsDialog";

interface EstimateBasketDrawerProps {
  open: boolean;
  onClose: () => void;
  onConvertToRequest: () => void;
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
          <Typography variant="body2" fontWeight={700} noWrap>
            {item.materialName}
          </Typography>
          <Typography variant="caption" color="text.secondary" display="block">
            {item.computedOutput.toFixed(3)} {item.outputUnit}
          </Typography>
          {item.pricingDimensionValue && (
            <Chip
              label={item.pricingDimensionValue}
              size="small"
              variant="outlined"
              sx={{ fontSize: 10, height: 18, mt: 0.5 }}
            />
          )}
          {selectedQuote ? (
            <Box sx={{ mt: 0.75 }}>
              <Typography variant="caption" color="text.secondary">
                {selectedQuote.vendorName}
              </Typography>
              <Typography
                variant="body2"
                fontWeight={700}
                color="primary.main"
                component="div"
              >
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

export function EstimateBasketDrawer({
  open,
  onClose,
  onConvertToRequest,
}: EstimateBasketDrawerProps) {
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

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: { xs: "100%", sm: 380 } } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        {/* Header */}
        <Box
          sx={{
            p: 2,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <Typography variant="subtitle1" fontWeight={700}>
              Estimate Basket
            </Typography>
            <Chip label={totalItems} size="small" color="primary" />
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
            <Tooltip title="Load a saved draft">
              <IconButton size="small" onClick={() => setDraftsDialog("load")}>
                <FolderOpenOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={totalItems === 0 ? "Add items to save a draft" : "Save basket as draft"}>
              <span>
                <IconButton
                  size="small"
                  onClick={() => setDraftsDialog("save")}
                  disabled={totalItems === 0}
                >
                  <BookmarkAddOutlinedIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            <IconButton size="small" onClick={onClose}>
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        {/* Content */}
        {items.length === 0 ? (
          <Box
            sx={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              p: 3,
              textAlign: "center",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              No estimates yet — use the calculator above to add items
            </Typography>
          </Box>
        ) : (
          <>
            {/* Item list */}
            <Box sx={{ flex: 1, overflow: "auto", px: 2, pt: 1 }}>
              {items.map((item) => (
                <BasketItemRow
                  key={item.id}
                  item={item}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </Box>

            <Divider />

            {/* Grand total summary */}
            <Box sx={{ px: 2, pt: 1.5, pb: 1 }}>
              <Stack spacing={0.5}>
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Typography variant="body2" color="text.secondary">
                    Grand total (selected vendors):
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700} color="primary.main">
                    {formatINR(grandTotal)}
                  </Typography>
                </Box>
                {itemsWithoutVendor > 0 && (
                  <Typography variant="caption" color="warning.main">
                    Items without vendor selection: {itemsWithoutVendor}
                  </Typography>
                )}
              </Stack>
            </Box>

            <Divider />

            {/* Footer actions */}
            <Box
              sx={{
                p: 2,
                display: "flex",
                flexDirection: "column",
                gap: 1,
              }}
            >
              <Button
                fullWidth
                variant="contained"
                color="primary"
                disabled={items.length === 0}
                onClick={() => {
                  onConvertToRequest();
                  onClose();
                }}
              >
                Convert to Material Request →
              </Button>
              <Button
                fullWidth
                variant="outlined"
                color="error"
                size="small"
                onClick={() => {
                  clearBasket();
                  onClose();
                }}
              >
                Clear basket
              </Button>
            </Box>
          </>
        )}
      </Box>
      {draftsDialog && (
        <BasketDraftsDialog
          open
          mode={draftsDialog}
          onClose={() => setDraftsDialog(null)}
        />
      )}
    </Drawer>
  );
}
