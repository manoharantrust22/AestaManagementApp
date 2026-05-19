"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Storefront as StorefrontIcon,
  Inventory2 as InventoryIcon,
} from "@mui/icons-material";
import { MaterialPicker } from "@/components/shared/MaterialPicker";
import { VendorPicker } from "@/components/shared/VendorPicker";
import { useMaterial, useCreateMaterial } from "@/hooks/queries/useMaterials";
import { useVendor, useCreateVendor } from "@/hooks/queries/useVendors";
import { useUpsertVendorInventory } from "@/hooks/queries/useVendorInventory";
import type {
  MaterialUnit,
  MaterialWithDetails,
  VendorWithCategories,
  MaterialBrand,
} from "@/types/material.types";

const UNITS: MaterialUnit[] = [
  "kg",
  "g",
  "ton",
  "liter",
  "ml",
  "piece",
  "bag",
  "bundle",
  "sqft",
  "sqm",
  "cft",
  "cum",
  "nos",
  "rmt",
  "ft",
  "box",
  "set",
];

interface VendorQuoteDialogProps {
  open: boolean;
  onClose: () => void;
  /** Pre-locked material — picker is disabled */
  lockedMaterial?: MaterialWithDetails | null;
  /** Pre-locked vendor — picker is disabled */
  lockedVendor?: VendorWithCategories | null;
  onSaved?: (args: { materialId: string; vendorId: string }) => void;
}

export function VendorQuoteDialog({
  open,
  onClose,
  lockedMaterial,
  lockedVendor,
  onSaved,
}: VendorQuoteDialogProps) {
  const [material, setMaterial] = useState<MaterialWithDetails | null>(null);
  const [vendor, setVendor] = useState<VendorWithCategories | null>(null);
  const [brand, setBrand] = useState<MaterialBrand | null>(null);
  const [price, setPrice] = useState("");
  const [unit, setUnit] = useState<MaterialUnit | "">("");
  const [priceIncludesGst, setPriceIncludesGst] = useState(false);
  const [gstRate, setGstRate] = useState("");
  const [priceIncludesTransport, setPriceIncludesTransport] = useState(false);
  const [transportCost, setTransportCost] = useState("");
  const [leadTimeDays, setLeadTimeDays] = useState("");
  const [minOrderQty, setMinOrderQty] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [quickAdd, setQuickAdd] = useState<{
    type: "material" | "vendor";
    seedName: string;
  } | null>(null);

  const upsert = useUpsertVendorInventory();

  // Reset form whenever dialog opens
  useEffect(() => {
    if (open) {
      setMaterial(lockedMaterial ?? null);
      setVendor(lockedVendor ?? null);
      setBrand(null);
      setPrice("");
      setUnit(lockedMaterial?.category?.code === 'WOD' ? 'cft' : (lockedMaterial?.unit ?? ""));
      setPriceIncludesGst(false);
      setGstRate(lockedMaterial?.gst_rate?.toString() ?? "");
      setPriceIncludesTransport(false);
      setTransportCost("");
      setLeadTimeDays("");
      setMinOrderQty("");
      setNotes("");
      setError(null);
    }
  }, [open, lockedMaterial, lockedVendor]);

  // When a material is selected, default unit + GST rate
  useEffect(() => {
    if (material && !unit)
      setUnit(material.category?.code === 'WOD' ? 'cft' : (material.unit as MaterialUnit));
    if (material && !gstRate && material.gst_rate != null) {
      setGstRate(material.gst_rate.toString());
    }
  }, [material]); // eslint-disable-line react-hooks/exhaustive-deps

  // For teak, the brand name encodes the product type (Log → cft, Palagai → ft).
  // Palagai brands are named "Palagai {width}\" · {quality}" — keyed by running foot.
  // Auto-snap the unit when the user picks (or changes) the brand.
  useEffect(() => {
    if (!brand) return;
    if (brand.brand_name.startsWith('Palagai')) setUnit('ft');
    else if (brand.brand_name.startsWith('Log')) setUnit('cft');
  }, [brand]);

  const handleQuickAddCreated = (args: {
    kind: "material" | "vendor";
    material?: MaterialWithDetails;
    vendor?: VendorWithCategories;
  }) => {
    if (args.kind === "material" && args.material) setMaterial(args.material);
    if (args.kind === "vendor" && args.vendor) setVendor(args.vendor);
    setQuickAdd(null);
  };

  const handleSave = async () => {
    setError(null);
    if (!material || !vendor) {
      setError("Please pick a material and a vendor.");
      return;
    }
    const priceNum = Number(price);
    if (!priceNum || priceNum <= 0) {
      setError("Please enter a valid price.");
      return;
    }
    try {
      await upsert.mutateAsync({
        vendor_id: vendor.id,
        material_id: material.id,
        brand_id: brand?.id,
        current_price: priceNum,
        unit: unit || material.unit,
        price_includes_gst: priceIncludesGst,
        gst_rate: gstRate ? Number(gstRate) : undefined,
        price_includes_transport: priceIncludesTransport,
        transport_cost: transportCost ? Number(transportCost) : undefined,
        lead_time_days: leadTimeDays ? Number(leadTimeDays) : undefined,
        min_order_qty: minOrderQty ? Number(minOrderQty) : undefined,
        notes: notes || undefined,
        is_available: true,
      });
      onSaved?.({ materialId: material.id, vendorId: vendor.id });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save quote.");
    }
  };

  const visibleBrands: MaterialBrand[] =
    (material?.brands || []).filter((b) => b.is_active) || [];

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 2 } }}
      >
        <DialogTitle sx={{ pr: 6 }}>
          {lockedMaterial
            ? "Add vendor quote"
            : lockedVendor
              ? "Add material to inventory"
              : "Record vendor quote"}
          <IconButton
            onClick={onClose}
            sx={{ position: "absolute", right: 8, top: 8 }}
            size="small"
          >
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          {error ? (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          ) : null}

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
            {/* Material */}
            {lockedMaterial ? (
              <LockedSummary
                kind="material"
                title={lockedMaterial.name}
                subtitle={[lockedMaterial.code, lockedMaterial.unit]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : (
              <MaterialPicker
                value={material}
                onChange={setMaterial}
                onCreateNew={(seed) =>
                  setQuickAdd({ type: "material", seedName: seed })
                }
                inDialog
                required
              />
            )}

            {/* Vendor */}
            {lockedVendor ? (
              <LockedSummary
                kind="vendor"
                title={lockedVendor.name}
                subtitle={[lockedVendor.shop_name, lockedVendor.city]
                  .filter(Boolean)
                  .join(" · ")}
              />
            ) : (
              <VendorPicker
                value={vendor}
                onChange={setVendor}
                onCreateNew={(seed) =>
                  setQuickAdd({ type: "vendor", seedName: seed })
                }
                inDialog
                required
              />
            )}

            {/* Brand (optional) */}
            {visibleBrands.length > 0 ? (
              <Autocomplete
                size="small"
                value={brand}
                onChange={(_, b) => setBrand(b)}
                options={visibleBrands}
                getOptionLabel={(o) =>
                  o.variant_name ? `${o.brand_name} ${o.variant_name}` : o.brand_name
                }
                isOptionEqualToValue={(a, b) => a.id === b.id}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField {...params} label="Brand (optional)" size="small" />
                )}
              />
            ) : null}

            {/* Price + unit */}
            <Box sx={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 1.5 }}>
              <TextField
                size="small"
                label="Price"
                required
                type="number"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                InputProps={{
                  startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                  inputProps: { min: 0, step: "0.01" },
                }}
              />
              <Autocomplete
                size="small"
                freeSolo={false}
                value={unit || null}
                onChange={(_, v) => setUnit((v as MaterialUnit) || "")}
                options={UNITS}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField {...params} label="Unit" size="small" />
                )}
              />
            </Box>

            {/* GST */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={priceIncludesGst}
                    onChange={(e) => setPriceIncludesGst(e.target.checked)}
                  />
                }
                label={<Typography sx={{ fontSize: 13 }}>Price includes GST</Typography>}
              />
              <TextField
                size="small"
                label="GST rate"
                type="number"
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                InputProps={{
                  endAdornment: <InputAdornment position="end">%</InputAdornment>,
                  inputProps: { min: 0, max: 100, step: "0.01" },
                }}
                sx={{ maxWidth: 140 }}
              />
            </Box>

            {/* Transport */}
            <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={priceIncludesTransport}
                    onChange={(e) => setPriceIncludesTransport(e.target.checked)}
                  />
                }
                label={<Typography sx={{ fontSize: 13 }}>Includes transport</Typography>}
              />
              {!priceIncludesTransport ? (
                <TextField
                  size="small"
                  label="Transport cost"
                  type="number"
                  value={transportCost}
                  onChange={(e) => setTransportCost(e.target.value)}
                  InputProps={{
                    startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                    inputProps: { min: 0, step: "0.01" },
                  }}
                  sx={{ maxWidth: 180 }}
                />
              ) : null}
            </Box>

            {/* Lead time + Min order */}
            <Box sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1.5 }}>
              <TextField
                size="small"
                label="Lead time (days)"
                type="number"
                value={leadTimeDays}
                onChange={(e) => setLeadTimeDays(e.target.value)}
                InputProps={{ inputProps: { min: 0 } }}
              />
              <TextField
                size="small"
                label="Min order qty"
                type="number"
                value={minOrderQty}
                onChange={(e) => setMinOrderQty(e.target.value)}
                InputProps={{ inputProps: { min: 0, step: "0.01" } }}
              />
            </Box>

            <TextField
              size="small"
              label="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              multiline
              rows={2}
            />
          </Box>
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 1.5 }}>
          <Button onClick={onClose} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button
            variant="contained"
            onClick={handleSave}
            disabled={upsert.isPending}
          >
            {upsert.isPending ? "Saving…" : "Save quote"}
          </Button>
        </DialogActions>
      </Dialog>

      {quickAdd?.type === "material" ? (
        <QuickAddMaterialDialog
          open
          onClose={() => setQuickAdd(null)}
          seedName={quickAdd.seedName}
          onCreated={(m) => handleQuickAddCreated({ kind: "material", material: m })}
        />
      ) : null}
      {quickAdd?.type === "vendor" ? (
        <QuickAddVendorDialog
          open
          onClose={() => setQuickAdd(null)}
          seedName={quickAdd.seedName}
          onCreated={(v) => handleQuickAddCreated({ kind: "vendor", vendor: v })}
        />
      ) : null}
    </>
  );
}

// =====================================================
// Locked summary (when material or vendor is pre-locked)
// =====================================================
function LockedSummary({
  kind,
  title,
  subtitle,
}: {
  kind: "material" | "vendor";
  title: string;
  subtitle?: string;
}) {
  const theme = useTheme();
  const Icon = kind === "material" ? InventoryIcon : StorefrontIcon;
  const tint = kind === "material" ? theme.palette.primary : theme.palette.secondary;
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1.25,
        px: 1.25,
        py: 1,
        borderRadius: 1.5,
        border: 1,
        borderColor: alpha(tint.main, 0.4),
        bgcolor: alpha(tint.main, 0.04),
      }}
    >
      <Box
        sx={{
          width: 32,
          height: 32,
          borderRadius: 1,
          bgcolor: alpha(tint.main, 0.18),
          color: tint.dark,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon fontSize="small" />
      </Box>
      <Box sx={{ minWidth: 0, flex: 1 }}>
        <Typography
          sx={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {kind === "material" ? "Material" : "Vendor"} (locked)
        </Typography>
        <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{title}</Typography>
        {subtitle ? (
          <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>
            {subtitle}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}

// =====================================================
// Quick add Material (inline mini dialog)
// =====================================================
function QuickAddMaterialDialog({
  open,
  onClose,
  seedName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  seedName: string;
  onCreated: (material: MaterialWithDetails) => void;
}) {
  const [name, setName] = useState(seedName);
  const [unit, setUnit] = useState<MaterialUnit>("piece");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateMaterial();
  const { refetch } = useMaterial(undefined);

  useEffect(() => {
    if (open) {
      setName(seedName);
      setUnit("piece");
      setError(null);
    }
  }, [open, seedName]);

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      const created = await create.mutateAsync({ name: name.trim(), unit });
      // create returns Material; cast for now and supplement minimal details
      onCreated({ ...(created as any), brands: [] } as MaterialWithDetails);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create material.");
    }
    void refetch;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Quick-add material</DialogTitle>
      <DialogContent dividers>
        {error ? (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        ) : null}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
          <TextField
            autoFocus
            size="small"
            label="Material name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Autocomplete
            size="small"
            freeSolo={false}
            value={unit}
            onChange={(_, v) => v && setUnit(v as MaterialUnit)}
            options={UNITS}
            slotProps={{ popper: { disablePortal: false } }}
            renderInput={(params) => (
              <TextField {...params} label="Unit" size="small" required />
            )}
          />
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            More fields can be filled in later from the catalog.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleCreate} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create & continue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// =====================================================
// Quick add Vendor (inline mini dialog)
// =====================================================
function QuickAddVendorDialog({
  open,
  onClose,
  seedName,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  seedName: string;
  onCreated: (vendor: VendorWithCategories) => void;
}) {
  const [name, setName] = useState(seedName);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const create = useCreateVendor();
  const { refetch } = useVendor(undefined);

  useEffect(() => {
    if (open) {
      setName(seedName);
      setPhone("");
      setCity("");
      setError(null);
    }
  }, [open, seedName]);

  const handleCreate = async () => {
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      const created = await create.mutateAsync({
        name: name.trim(),
        phone: phone.trim() || undefined,
        city: city.trim() || undefined,
      } as any);
      onCreated({ ...(created as any), categories: [] } as VendorWithCategories);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create vendor.");
    }
    void refetch;
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Quick-add vendor</DialogTitle>
      <DialogContent dividers>
        {error ? (
          <Alert severity="error" sx={{ mb: 1.5 }}>
            {error}
          </Alert>
        ) : null}
        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, pt: 1 }}>
          <TextField
            autoFocus
            size="small"
            label="Vendor name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextField
            size="small"
            label="Phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <TextField
            size="small"
            label="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Typography sx={{ fontSize: 11, color: "text.secondary" }}>
            More fields can be filled in later from the directory.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={{ px: 3, py: 1.5 }}>
        <Button onClick={onClose} disabled={create.isPending}>
          Cancel
        </Button>
        <Button variant="contained" onClick={handleCreate} disabled={create.isPending}>
          {create.isPending ? "Creating…" : "Create & continue"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
