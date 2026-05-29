// src/components/rentals/RentalItemInspectPane.tsx
"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Box,
  Chip,
  Divider,
  Drawer,
  IconButton,
  InputAdornment,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
  Button,
  Skeleton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import EditIcon from "@mui/icons-material/Edit";
import AddIcon from "@mui/icons-material/Add";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import {
  useRentalItemSizes,
  useRentalInventoryForItem,
  useUpdateRentalItem,
  useAddRentalStoreInventory,
} from "@/hooks/queries/useRentals";
import { getRateForSize } from "@/lib/utils/rentalCatalogUtils";
import { useEstimateBasket } from "./EstimateBasket";
import RentalItemDialog from "./RentalItemDialog";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import type { RentalRateType, RentalItemWithDetails } from "@/types/rental.types";
import ImageUploadWithCrop from "@/components/common/ImageUploadWithCrop";
import { createClient } from "@/lib/supabase/client";

interface RentalItemInspectPaneProps {
  itemId: string | null;
  itemName?: string;
  rateType?: RentalRateType;
  item?: RentalItemWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
  zIndex?: number;
}

export function RentalItemInspectPane({
  itemId,
  itemName,
  rateType = "daily",
  item = null,
  isOpen,
  onClose,
  zIndex = 1200,
}: RentalItemInspectPaneProps) {
  const [tab, setTab] = useState(0);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [qty, setQty] = useState(10);
  const [days, setDays] = useState(25);
  const [editOpen, setEditOpen] = useState(false);
  const [addVendorOpen, setAddVendorOpen] = useState(false);
  const [newVendorId, setNewVendorId] = useState<string | null>(null);
  const [newVendorRate, setNewVendorRate] = useState<string>("");
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [editingRate, setEditingRate] = useState<string>("");

  const supabase = createClient();
  const updateItem = useUpdateRentalItem();
  const addInventory = useAddRentalStoreInventory();

  const { data: sizes = [], isLoading: sizesLoading } = useRentalItemSizes(itemId ?? undefined);
  const { data: inventory = [], isLoading: invLoading } = useRentalInventoryForItem(itemId ?? undefined);
  const { addItem } = useEstimateBasket();

  useEffect(() => {
    setSelectedSize(null);
    setTab(0);
    setAddVendorOpen(false);
    setNewVendorId(null);
    setNewVendorRate("");
    setEditingInvId(null);
    setEditingRate("");
  }, [itemId]);

  const resetAddVendor = () => {
    setAddVendorOpen(false);
    setNewVendorId(null);
    setNewVendorRate("");
  };

  const handleSaveVendor = async () => {
    if (!itemId || !newVendorId) return;
    const rate = parseFloat(newVendorRate);
    if (!Number.isFinite(rate) || rate <= 0) return;
    await addInventory.mutateAsync({
      vendor_id: newVendorId,
      rental_item_id: itemId,
      daily_rate: rate,
      min_rental_days: 1,
      long_term_discount_percentage: 0,
      long_term_threshold_days: 30,
    });
    resetAddVendor();
  };

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
  const hasStrictCheapest =
    vendorRates.length > 1 && vendorRates[0].rate < vendorRates[1].rate;

  const handleAddToBasket = () => {
    if (!itemId || !itemName) return;
    addItem({
      rental_item_id: itemId,
      rental_item_name: itemName,
      size_label: effectiveSize,
      rental_item_size_id: sizes.find((s) => s.size_label === effectiveSize)?.id ?? null,
      quantity: qty,
      days,
    });
  };

  const handleImageChange = async (url: string | null) => {
    if (!item) return;
    await updateItem.mutateAsync({
      id: item.id,
      data: { image_url: url ?? undefined },
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
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          {item && (
            <IconButton size="small" onClick={() => setEditOpen(true)} title="Edit item">
              <EditIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
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

            {/* Add Vendor row */}
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={600}>
                VENDORS
              </Typography>
              {!addVendorOpen && (
                <Button
                  size="small"
                  startIcon={<AddIcon fontSize="small" />}
                  onClick={() => setAddVendorOpen(true)}
                  sx={{ fontSize: 11, py: 0.25 }}
                >
                  Add Vendor
                </Button>
              )}
            </Box>

            {addVendorOpen && (
              <Box
                sx={{
                  p: 1.25,
                  mb: 1.5,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 1.5,
                  bgcolor: "action.hover",
                }}
              >
                <Stack spacing={1}>
                  <VendorAutocomplete
                    size="small"
                    label="Vendor"
                    value={newVendorId}
                    vendorType="rental_store"
                    onChange={(val) => setNewVendorId(typeof val === "string" ? val : null)}
                  />
                  <TextField
                    size="small"
                    type="number"
                    label={rateType === "hourly" ? "₹/hour" : "₹/day"}
                    value={newVendorRate}
                    onChange={(e) => setNewVendorRate(e.target.value)}
                    InputProps={{
                      startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                    }}
                  />
                  <Stack direction="row" spacing={1} justifyContent="flex-end">
                    <Button size="small" onClick={resetAddVendor} disabled={addInventory.isPending}>
                      Cancel
                    </Button>
                    <Button
                      size="small"
                      variant="contained"
                      onClick={handleSaveVendor}
                      disabled={
                        !newVendorId ||
                        !newVendorRate ||
                        parseFloat(newVendorRate) <= 0 ||
                        addInventory.isPending
                      }
                    >
                      {addInventory.isPending ? "Saving…" : "Save"}
                    </Button>
                  </Stack>
                </Stack>
              </Box>
            )}

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
                      borderColor: idx === 0 && hasStrictCheapest ? "success.main" : "divider",
                      bgcolor: "background.paper",
                    }}
                  >
                    {editingInvId === inv.id ? (
                      <Stack spacing={1}>
                        <Typography variant="body2" fontWeight={600}>
                          {inv.vendor?.name}
                        </Typography>
                        <TextField
                          size="small"
                          type="number"
                          autoFocus
                          label={rateType === "hourly" ? "₹/hour" : "₹/day"}
                          value={editingRate}
                          onChange={(e) => setEditingRate(e.target.value)}
                          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                        />
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            onClick={() => { setEditingInvId(null); setEditingRate(""); }}
                            disabled={addInventory.isPending}
                          >
                            Cancel
                          </Button>
                          <Button
                            size="small"
                            variant="contained"
                            disabled={!editingRate || parseFloat(editingRate) <= 0 || addInventory.isPending}
                            onClick={async () => {
                              if (!itemId || !inv.vendor_id) return;
                              await addInventory.mutateAsync({
                                vendor_id: inv.vendor_id,
                                rental_item_id: itemId,
                                daily_rate: parseFloat(editingRate),
                                min_rental_days: inv.min_rental_days ?? 1,
                                long_term_discount_percentage: Number(inv.long_term_discount_percentage ?? 0),
                                long_term_threshold_days: inv.long_term_threshold_days ?? 30,
                              });
                              setEditingInvId(null);
                              setEditingRate("");
                            }}
                          >
                            {addInventory.isPending ? "Saving…" : "Save"}
                          </Button>
                        </Stack>
                      </Stack>
                    ) : (
                      <>
                        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.25 }}>
                          <Typography variant="body2" fontWeight={600}>
                            {inv.vendor?.name}
                          </Typography>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                            {idx === 0 && hasStrictCheapest && (
                              <Chip label="CHEAPEST" size="small" color="success" variant="outlined" sx={{ fontSize: 9, height: 18 }} />
                            )}
                            <IconButton
                              size="small"
                              onClick={() => { setEditingInvId(inv.id); setEditingRate(String(inv.rate)); setAddVendorOpen(false); }}
                              title="Edit rate"
                            >
                              <EditIcon sx={{ fontSize: 14 }} />
                            </IconButton>
                          </Box>
                        </Box>
                        <Typography variant="subtitle2" color="warning.main" fontWeight={700}>
                          ₹{inv.rate}/{rateType === "hourly" ? "hour" : "day"}
                        </Typography>
                        {inv.transport_cost != null && Number(inv.transport_cost) > 0 && (
                          <Typography variant="caption" color="text.secondary">
                            Transport: ₹{inv.transport_cost} outward
                          </Typography>
                        )}
                      </>
                    )}
                  </Box>
                ))}
              </Stack>
            )}
          </>
        )}

        {tab === 1 && (
          <Box>
            <ImageUploadWithCrop
              supabase={supabase}
              bucketName="rental-items"
              folderPath="item-photos"
              fileNamePrefix="rental-item"
              value={item?.image_url || null}
              onChange={handleImageChange}
              disabled={!item || updateItem.isPending}
              label="Item Photo"
              aspectRatio={4 / 3}
              maxSizeKB={500}
              cropShape="rect"
            />
            {item && (
              <Stack spacing={1} sx={{ mt: 2 }}>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">Category</Typography>
                  <Typography variant="caption" fontWeight={600}>{item.category?.name ?? "—"}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">Type</Typography>
                  <Typography variant="caption" fontWeight={600} sx={{ textTransform: "capitalize" }}>{item.rental_type}</Typography>
                </Box>
                <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                  <Typography variant="caption" color="text.secondary">Charged per</Typography>
                  <Typography variant="caption" fontWeight={600}>{rateType === "hourly" ? "Hour" : "Day"}</Typography>
                </Box>
              </Stack>
            )}
          </Box>
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
            label={rateType === "hourly" ? "Hours" : "Days"}
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

      {editOpen && item && (
        <RentalItemDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          item={item}
        />
      )}
    </Drawer>
  );
}
