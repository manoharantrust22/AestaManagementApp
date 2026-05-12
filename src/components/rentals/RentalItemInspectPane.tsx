// src/components/rentals/RentalItemInspectPane.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Button,
  Skeleton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import { useRentalItemSizes, useRentalInventoryForItem } from "@/hooks/queries/useRentals";
import { getRateForSize } from "@/lib/utils/rentalCatalogUtils";
import { useEstimateBasket } from "./EstimateBasket";

interface RentalItemInspectPaneProps {
  itemId: string | null;
  itemName?: string;          // optional — shown in header while item loads
  isOpen: boolean;
  onClose: () => void;
  zIndex?: number;
}

export function RentalItemInspectPane({
  itemId,
  itemName,
  isOpen,
  onClose,
  zIndex = 1200,
}: RentalItemInspectPaneProps) {
  const [tab, setTab] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [qty, setQty] = useState(10);
  const [days, setDays] = useState(25);

  const { data: sizes = [], isLoading: sizesLoading } = useRentalItemSizes(itemId ?? undefined);
  const { data: inventory = [], isLoading: invLoading } = useRentalInventoryForItem(itemId ?? undefined);
  const { addItem } = useEstimateBasket();

  // Reset selected size when item changes
  useEffect(() => {
    setSelectedSize(null);
  }, [itemId]);

  const effectiveSize = selectedSize ?? (sizes[0]?.size_label ?? null);

  const vendorRates = useMemo(
    () =>
      inventory
        .map((inv) => ({
          ...inv,
          rate: getRateForSize(inv, effectiveSize),
        }))
        .sort((a, b) => a.rate - b.rate),
    [inventory, effectiveSize]
  );

  const cheapestRate = vendorRates[0]?.rate ?? null;
  const estimatedCost = cheapestRate != null ? qty * cheapestRate * days : null;

  const handleAddToBasket = () => {
    if (!itemId || !itemName) return;
    addItem({
      rental_item_id: itemId,
      rental_item_name: itemName,
      size_label: effectiveSize,
      quantity: qty,
      days,
    });
  };

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      variant="persistent"
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 360 },
          zIndex,
          boxSizing: "border-box",
          borderLeft: "1px solid",
          borderColor: "divider",
        },
      }}
    >
      {/* Header */}
      <Box
        sx={{
          p: 2,
          pb: 1,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
        }}
      >
        <Box>
          <Typography variant="subtitle1" fontWeight={700}>
            {itemName ?? "—"}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        sx={{ px: 2, borderBottom: "1px solid", borderColor: "divider" }}
      >
        <Tab label="Vendors" sx={{ fontSize: 11, minWidth: 60, py: 0.75 }} />
        <Tab label="Overview" sx={{ fontSize: 11, minWidth: 60, py: 0.75 }} />
      </Tabs>

      <Box sx={{ flex: 1, overflow: "auto", p: 1.5 }}>
        {tab === 0 && (
          <>
            {/* Size selector */}
            {(sizesLoading || sizes.length > 0) && (
              <Box sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  fontWeight={600}
                  display="block"
                  sx={{ mb: 0.5 }}
                >
                  SELECT SIZE
                </Typography>
                {sizesLoading ? (
                  <Skeleton width={200} height={28} />
                ) : (
                  <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                    {sizes.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.size_label}
                        size="small"
                        color={effectiveSize === s.size_label ? "primary" : "default"}
                        onClick={() => setSelectedSize(s.size_label)}
                        sx={{ cursor: "pointer" }}
                      />
                    ))}
                  </Stack>
                )}
              </Box>
            )}

            <Divider sx={{ mb: 1.5 }} />

            {/* Vendor rates */}
            {invLoading ? (
              <Stack spacing={1}>
                {[1, 2].map((i) => (
                  <Skeleton key={i} height={60} sx={{ borderRadius: 1 }} />
                ))}
              </Stack>
            ) : vendorRates.length === 0 ? (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ textAlign: "center", mt: 3 }}
              >
                No vendors have this item yet
              </Typography>
            ) : (
              <Stack spacing={1} sx={{ mb: 2 }}>
                {vendorRates.map((inv, idx) => (
                  <Box
                    key={inv.id}
                    sx={{
                      p: 1.25,
                      borderRadius: 1.5,
                      border: "1px solid",
                      borderColor: idx === 0 ? "success.main" : "divider",
                      bgcolor: idx === 0 ? "success.light" : "background.paper",
                    }}
                  >
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        mb: 0.25,
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {inv.vendor?.name}
                      </Typography>
                      {idx === 0 && (
                        <Chip
                          label="CHEAPEST"
                          size="small"
                          color="success"
                          sx={{ fontSize: 9, height: 18 }}
                        />
                      )}
                    </Box>
                    <Typography variant="subtitle2" color="warning.main" fontWeight={700}>
                      ₹{inv.rate}/day
                    </Typography>
                    {inv.transport_cost != null && Number(inv.transport_cost) > 0 && (
                      <Typography variant="caption" color="text.secondary">
                        Transport: ₹{inv.transport_cost} outward
                      </Typography>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </>
        )}

        {tab === 1 && (
          <Typography variant="body2" color="text.secondary">
            Item details shown here in a future iteration.
          </Typography>
        )}
      </Box>

      {/* Estimate footer */}
      <Box
        sx={{
          p: 1.5,
          borderTop: "1px solid",
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      >
        <Stack direction="row" spacing={1} sx={{ mb: 1 }}>
          <TextField
            label="Qty"
            type="number"
            size="small"
            value={qty}
            onChange={(e) => setQty(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            sx={{ flex: 1 }}
          />
          <TextField
            label="Days"
            type="number"
            size="small"
            value={days}
            onChange={(e) => setDays(Math.max(1, Number(e.target.value)))}
            inputProps={{ min: 1 }}
            sx={{ flex: 1 }}
          />
          {estimatedCost != null && (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "center",
                minWidth: 64,
              }}
            >
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 9 }}>
                COST
              </Typography>
              <Typography variant="caption" color="warning.main" fontWeight={700}>
                ₹
                {estimatedCost >= 1000
                  ? `${(estimatedCost / 1000).toFixed(1)}k`
                  : estimatedCost}
              </Typography>
            </Box>
          )}
        </Stack>
        <Button
          fullWidth
          variant="contained"
          color="warning"
          startIcon={<AddShoppingCartIcon />}
          onClick={handleAddToBasket}
          disabled={!itemId || !itemName}
          size="small"
        >
          Add to Estimate Basket
        </Button>
      </Box>
    </Drawer>
  );
}
