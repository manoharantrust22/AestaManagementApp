"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  InputAdornment,
  Autocomplete,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useVendors } from "@/hooks/queries/useVendors";
import { useCreateEquipmentVendorPrice } from "@/hooks/queries/useEquipmentVendorPrices";
import { createClient } from "@/lib/supabase/client";
import ImageUploadWithCrop from "@/components/common/ImageUploadWithCrop";
import type { EquipmentVendorPriceFormData } from "@/types/equipment.types";

interface EquipmentPriceDialogProps {
  open: boolean;
  onClose: () => void;
  equipmentId: string;
  // Shown in the title so the user knows which size they're pricing.
  targetLabel?: string;
}

export default function EquipmentPriceDialog({
  open,
  onClose,
  equipmentId,
  targetLabel,
}: EquipmentPriceDialogProps) {
  const isMobile = useIsMobile();
  const supabase = createClient();
  const { data: vendors = [] } = useVendors();
  const createPrice = useCreateEquipmentVendorPrice();

  const [error, setError] = useState("");
  // price is optional while editing the form; validated on submit.
  const [form, setForm] = useState<
    Partial<EquipmentVendorPriceFormData> & { equipment_id: string }
  >({
    equipment_id: equipmentId,
  });

  useEffect(() => {
    if (open) {
      setForm({ equipment_id: equipmentId });
      setError("");
    }
  }, [open, equipmentId]);

  const selectedVendor = vendors.find((v) => v.id === form.vendor_id) || null;

  const handleSubmit = async () => {
    const price = form.price;
    if (!price || price <= 0) {
      setError("Enter a valid price");
      return;
    }
    if (!form.vendor_id && !form.store_name?.trim()) {
      setError("Pick a vendor or type a store name");
      return;
    }
    try {
      await createPrice.mutateAsync({
        ...form,
        price,
        store_name: form.vendor_id ? undefined : form.store_name?.trim(),
      });
      onClose();
    } catch (err: unknown) {
      setError((err as Error).message || "Failed to save price");
    }
  };

  const isLoading = createPrice.isPending;

  return (
    <Dialog open={open} onClose={onClose} fullScreen={isMobile} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" component="span">
            Add Store Price{targetLabel ? ` — ${targetLabel}` : ""}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={12}>
            <Autocomplete
              freeSolo
              options={vendors}
              getOptionLabel={(option) =>
                typeof option === "string" ? option : option.name
              }
              value={selectedVendor || form.store_name || null}
              onChange={(_, newValue) => {
                if (newValue && typeof newValue !== "string") {
                  setForm((f) => ({
                    ...f,
                    vendor_id: newValue.id,
                    store_name: undefined,
                  }));
                } else if (typeof newValue === "string") {
                  setForm((f) => ({
                    ...f,
                    vendor_id: undefined,
                    store_name: newValue,
                  }));
                } else {
                  setForm((f) => ({ ...f, vendor_id: undefined }));
                }
                setError("");
              }}
              onInputChange={(_, text, reason) => {
                if (reason === "input") {
                  setForm((f) => ({
                    ...f,
                    store_name: text,
                    vendor_id: undefined,
                  }));
                }
              }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Store / Vendor"
                  placeholder="Pick a vendor or type a store name"
                  required
                />
              )}
              slotProps={{ popper: { disablePortal: false } }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Price"
              type="number"
              value={form.price ?? ""}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  price: e.target.value ? parseFloat(e.target.value) : undefined,
                }))
              }
              fullWidth
              required
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">₹</InputAdornment>
                  ),
                },
              }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Date"
              type="date"
              value={form.recorded_date || ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, recorded_date: e.target.value }))
              }
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={12}>
            <TextField
              label="Notes"
              value={form.notes || ""}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              fullWidth
              multiline
              rows={2}
            />
          </Grid>

          <Grid size={12}>
            <ImageUploadWithCrop
              supabase={supabase}
              bucketName="equipment-photos"
              folderPath="equipment-bills"
              fileNamePrefix="bill"
              value={form.bill_url || null}
              onChange={(url) =>
                setForm((f) => ({ ...f, bill_url: url || undefined }))
              }
              label="Bill / Quote (optional)"
              aspectRatio={3 / 4}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isLoading}>
          {isLoading ? "Saving..." : "Add Price"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
