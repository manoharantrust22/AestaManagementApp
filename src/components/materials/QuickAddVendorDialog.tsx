"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  MenuItem,
  Box,
  Grid,
  Typography,
  IconButton,
  Alert,
  Link,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  OpenInNew as OpenInNewIcon,
} from "@mui/icons-material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import { useCreateVendor } from "@/hooks/queries/useVendors";
import { useIsMobile } from "@/hooks/useIsMobile";
import type { Vendor, VendorFormData, VendorType } from "@/types/material.types";
import { VENDOR_TYPE_LABELS } from "@/types/material.types";

interface QuickAddVendorDialogProps {
  open: boolean;
  onClose: () => void;
  /** Called with the freshly created vendor, OR an existing vendor picked via the duplicate guard. */
  onCreated: (vendor: Vendor) => void;
  /** Existing directory vendors — used to warn about duplicates before creating. */
  allVendors: Vendor[];
  /** Escalate to the full vendor form, carrying over the typed name. */
  onOpenFullForm: (name: string) => void;
}

/**
 * Compact "quick add vendor" form for use inside the PO dialog — captures only
 * what a purchase order needs (name, phone, type, GST, category) and saves the
 * vendor as a draft (is_draft) so the office can enrich it later. Genuinely new
 * vendors are created here; if the typed name already exists, the user is nudged
 * to pick the existing one instead of creating a duplicate.
 */
export default function QuickAddVendorDialog({
  open,
  onClose,
  onCreated,
  allVendors,
  onOpenFullForm,
}: QuickAddVendorDialogProps) {
  const isMobile = useIsMobile();
  const createVendor = useCreateVendor();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [vendorType, setVendorType] = useState<VendorType>("dealer");
  const [gstNumber, setGstNumber] = useState("");
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  // Reset the form each time the dialog is opened.
  useEffect(() => {
    if (open) {
      setName("");
      setPhone("");
      setVendorType("dealer");
      setGstNumber("");
      setCategoryIds([]);
      setError("");
    }
  }, [open]);

  // Duplicate guard: exact (case-insensitive) name match against the directory.
  const duplicate = useMemo(() => {
    const trimmed = name.trim().toLowerCase();
    if (trimmed.length < 2) return null;
    return (
      allVendors.find((v) => (v.name ?? "").trim().toLowerCase() === trimmed) ??
      null
    );
  }, [allVendors, name]);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError("Vendor name is required");
      return;
    }
    setError("");

    const formData: VendorFormData = {
      name: name.trim(),
      phone: phone.trim() || undefined,
      gst_number: gstNumber.trim() ? gstNumber.trim().toUpperCase() : undefined,
      vendor_type: vendorType,
      category_ids: categoryIds,
      // Defaults mirroring the full VendorDialog form.
      state: "Tamil Nadu",
      payment_terms_days: 30,
      accepts_upi: true,
      accepts_cash: true,
      // Quick-added vendors are drafts until the office completes their details.
      is_draft: true,
    };

    try {
      const created = await createVendor.mutateAsync(formData);
      onCreated(created);
      onClose();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to create vendor";
      setError(message);
    }
  };

  const handleSelectExisting = () => {
    if (duplicate) {
      onCreated(duplicate);
      onClose();
    }
  };

  const isSubmitting = createVendor.isPending;

  return (
    <Dialog
      open={open}
      onClose={(_event, reason) => {
        if (reason !== "backdropClick") onClose();
      }}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Typography variant="h6" component="span">
          Add new vendor
        </Typography>
        <IconButton onClick={onClose} size="small" disabled={isSubmitting}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
            {error}
          </Alert>
        )}

        {duplicate && (
          <Alert
            severity="warning"
            sx={{ mb: 2 }}
            action={
              <Button
                color="inherit"
                size="small"
                onClick={handleSelectExisting}
              >
                Select it instead
              </Button>
            }
          >
            “{duplicate.name}” is already in your directory. Pick the existing
            vendor instead of creating a duplicate.
          </Alert>
        )}

        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 8 }}>
            <TextField
              label="Vendor Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              fullWidth
              autoFocus
              placeholder="e.g. Ramesh Traders"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <TextField
              label="Type"
              value={vendorType}
              onChange={(e) => setVendorType(e.target.value as VendorType)}
              select
              fullWidth
            >
              {(Object.keys(VENDOR_TYPE_LABELS) as VendorType[]).map((type) => (
                <MenuItem key={type} value={type}>
                  {VENDOR_TYPE_LABELS[type]}
                </MenuItem>
              ))}
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              fullWidth
              placeholder="+91 99999 99999"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="GST Number"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              fullWidth
              placeholder="22AAAAA0000A1Z5"
            />
          </Grid>
          <Grid size={{ xs: 12 }}>
            <CategoryAutocomplete
              value={categoryIds}
              onChange={(value) => setCategoryIds(Array.isArray(value) ? value : [])}
              multiple
              parentOnly
              label="Categories"
              placeholder="Search and select categories..."
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2 }}>
          <Link
            component="button"
            type="button"
            variant="body2"
            underline="hover"
            onClick={() => onOpenFullForm(name.trim())}
            sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
          >
            <OpenInNewIcon sx={{ fontSize: 16 }} />
            Need more fields? Open full form
          </Link>
        </Box>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleCreate}
          disabled={isSubmitting || !name.trim() || !!duplicate}
          startIcon={
            isSubmitting ? <CircularProgress size={16} color="inherit" /> : null
          }
        >
          Create &amp; Select
        </Button>
      </DialogActions>
    </Dialog>
  );
}
