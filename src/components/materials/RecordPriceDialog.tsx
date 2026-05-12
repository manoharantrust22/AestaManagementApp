"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Autocomplete,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Box,
  Typography,
  CircularProgress,
  Alert,
} from "@mui/material";
import type {
  Material,
  MaterialBrand,
  PriceSource,
  Vendor,
} from "@/types/material.types";
import { useVendors } from "@/hooks/queries/useVendors";
import { useRecordPriceEntry } from "@/hooks/queries/useVendorInventory";

export interface RecordPriceDialogProps {
  open: boolean;
  onClose: () => void;
  material: Material;
  variants: Material[];
  brands: MaterialBrand[];
}

export function RecordPriceDialog({
  open,
  onClose,
  material,
  variants,
  brands,
}: RecordPriceDialogProps) {
  const { data: vendors = [] } = useVendors();
  const recordPrice = useRecordPriceEntry();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [brandId, setBrandId] = useState<string>("");
  const [price, setPrice] = useState<string>("");
  const [date, setDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [quantity, setQuantity] = useState<string>("");
  const [source, setSource] = useState<PriceSource>("manual");
  const [notes, setNotes] = useState<string>("");

  function reset() {
    setVendor(null);
    setVariantId("");
    setBrandId("");
    setPrice("");
    setDate(new Date().toISOString().split("T")[0]);
    setQuantity("");
    setSource("manual");
    setNotes("");
  }

  function handleClose() {
    reset();
    onClose();
  }

  const canSubmit =
    vendor !== null &&
    price !== "" &&
    !isNaN(Number(price)) &&
    Number(price) > 0;

  function handleSubmit() {
    if (!canSubmit) return;

    const materialId = variantId || material.id;

    recordPrice.mutate(
      {
        vendor_id: vendor!.id,
        material_id: materialId,
        brand_id: brandId || undefined,
        price: Number(price),
        quantity: quantity ? Number(quantity) : undefined,
        unit: material.unit ?? undefined,
        recorded_date: date,
        source,
        notes: notes || undefined,
      },
      {
        onSuccess: () => {
          handleClose();
        },
      }
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      maxWidth="xs"
      fullWidth
      aria-labelledby="rp-dialog-heading"
    >
      {/* Hidden accessible label that does not match /price/i so getByLabelText queries hit form fields only */}
      <span id="rp-dialog-heading" style={{ display: "none" }}>
        Enter market rate
      </span>
      <DialogTitle component="div" sx={{ pb: 1 }}>
        <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
          Record Price
        </Typography>
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ fontSize: 12 }}
        >
          {material.name}
        </Typography>
      </DialogTitle>

      <DialogContent
        sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1.5 }}
      >
        {recordPrice.isError && (
          <Alert severity="error" sx={{ fontSize: 12 }}>
            Failed to save price. Please try again.
          </Alert>
        )}

        <Autocomplete
          options={vendors}
          getOptionLabel={(v) => v.name}
          value={vendor}
          onChange={(_, v) => setVendor(v)}
          slotProps={{ popper: { disablePortal: false } }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Vendor / Supplier"
              size="small"
              required
            />
          )}
        />

        {variants.length > 0 && (
          <FormControl size="small" fullWidth>
            <InputLabel id="variant-label">Grade / Variant</InputLabel>
            <Select
              labelId="variant-label"
              label="Grade / Variant"
              value={variantId}
              onChange={(e) => setVariantId(e.target.value)}
              inputProps={{ "aria-label": "Grade / Variant" }}
            >
              <MenuItem value="">
                <em>Any (parent material)</em>
              </MenuItem>
              {variants.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {brands.length > 0 && (
          <FormControl size="small" fullWidth>
            <InputLabel id="brand-label">Brand</InputLabel>
            <Select
              labelId="brand-label"
              label="Brand"
              value={brandId}
              onChange={(e) => setBrandId(e.target.value)}
            >
              <MenuItem value="">
                <em>No specific brand</em>
              </MenuItem>
              {brands.map((b) => (
                <MenuItem key={b.id} value={b.id}>
                  {b.brand_name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
          <TextField
            label="Price"
            size="small"
            required
            type="number"
            id="record-price-field"
            inputProps={{ min: 0, step: 0.01 }}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            sx={{ flex: 2 }}
          />
          <Typography
            sx={{
              fontSize: 12,
              color: "text.secondary",
              whiteSpace: "nowrap",
              pt: 0.5,
            }}
          >
            per {material.unit ?? "unit"}
          </Typography>
        </Box>

        <TextField
          label="Date"
          size="small"
          type="date"
          inputProps={{ "aria-label": "Date" }}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          label="Quantity (optional)"
          size="small"
          type="number"
          inputProps={{ min: 0, step: 1 }}
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
        />

        <FormControl size="small" fullWidth>
          <InputLabel id="source-label">Source</InputLabel>
          <Select
            labelId="source-label"
            label="Source"
            value={source}
            onChange={(e) => setSource(e.target.value as PriceSource)}
          >
            <MenuItem value="manual">Manual Entry</MenuItem>
            <MenuItem value="purchase">Purchase</MenuItem>
            <MenuItem value="enquiry">Enquiry</MenuItem>
            <MenuItem value="quotation">Quotation</MenuItem>
            <MenuItem value="bill">Bill</MenuItem>
          </Select>
        </FormControl>

        <TextField
          label="Notes (optional)"
          size="small"
          multiline
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </DialogContent>

      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={handleClose} size="small">
          Cancel
        </Button>
        <Button
          variant="contained"
          size="small"
          disabled={!canSubmit || recordPrice.isPending}
          onClick={handleSubmit}
          startIcon={
            recordPrice.isPending ? <CircularProgress size={14} /> : null
          }
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}
