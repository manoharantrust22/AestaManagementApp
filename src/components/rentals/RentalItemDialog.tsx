"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  InputAdornment,
  Stack,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useCreateRentalItem,
  useUpdateRentalItem,
  useRentalCategories,
  useRentalItemSizes,
  useCreateRentalItemSize,
  useUpdateRentalItemSize,
  useDeleteRentalItemSize,
} from "@/hooks/queries/useRentals";
import { createClient } from "@/lib/supabase/client";
import ImageUploadWithCrop from "@/components/common/ImageUploadWithCrop";
import type {
  RentalItemWithDetails,
  RentalItemFormData,
  RentalType,
  RentalSourceType,
  RentalRateType,
} from "@/types/rental.types";
import {
  RENTAL_TYPE_LABELS,
  RENTAL_SOURCE_TYPE_LABELS,
  RENTAL_RATE_TYPE_LABELS,
} from "@/types/rental.types";

const UNITS = [
  { value: "piece", label: "Piece" },
  { value: "nos", label: "Numbers (nos)" },
  { value: "set", label: "Set" },
  { value: "hour", label: "Hours" },
  { value: "sqft", label: "Square Feet (sqft)" },
  { value: "rmt", label: "Running Meter (rmt)" },
  { value: "bundle", label: "Bundle" },
];

interface RentalItemDialogProps {
  open: boolean;
  onClose: () => void;
  item?: RentalItemWithDetails | null;
}

export default function RentalItemDialog({
  open,
  onClose,
  item = null,
}: RentalItemDialogProps) {
  const isMobile = useIsMobile();
  const isEdit = !!item;

  const { data: categories = [] } = useRentalCategories();
  const createItem = useCreateRentalItem();
  const updateItem = useUpdateRentalItem();
  const supabase = createClient();

  const { data: existingSizes = [] } = useRentalItemSizes(item?.id);
  const createSize = useCreateRentalItemSize();
  const updateSize = useUpdateRentalItemSize();
  const deleteSize = useDeleteRentalItemSize();

  const [error, setError] = useState("");

  // Variant staging — for both new and edit. Each entry has either `id` (persisted) or `tempId` (pending).
  type VariantRow = {
    id?: string;
    tempId?: string;
    size_label: string;
    daily_rate: number | "";
    default_hourly_rate: number | "";
    image_url: string;
    is_active: boolean;
    _dirty?: boolean;       // for edits — needs UPDATE on save
    _new?: boolean;         // for new rows — needs INSERT on save
  };
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [newRow, setNewRow] = useState<{ size_label: string; daily_rate: string }>({ size_label: "", daily_rate: "" });
  const [formData, setFormData] = useState<RentalItemFormData>({
    name: "",
    code: "",
    local_name: "",
    category_id: "",
    description: "",
    rental_type: "scaffolding" as RentalType,
    source_type: "store" as RentalSourceType,
    rate_type: "daily" as RentalRateType,
    unit: "piece",
    specifications: {},
    default_daily_rate: undefined,
    image_url: "",
  });

  useEffect(() => {
    if (item) {
      setFormData({
        name: item.name,
        code: item.code || "",
        local_name: item.local_name || "",
        category_id: item.category_id || "",
        description: item.description || "",
        rental_type: item.rental_type,
        source_type: item.source_type || "store",
        rate_type: item.rate_type || "daily",
        unit: item.unit,
        specifications: item.specifications || {},
        default_daily_rate: item.default_daily_rate || undefined,
        image_url: item.image_url || "",
      });
    } else {
      setFormData({
        name: "",
        code: "",
        local_name: "",
        category_id: "",
        description: "",
        rental_type: "scaffolding",
        source_type: "store",
        rate_type: "daily",
        unit: "piece",
        specifications: {},
        default_daily_rate: undefined,
        image_url: "",
      });
    }
    setError("");
    setNewRow({ size_label: "", daily_rate: "" });
    // On create, clear the variant staging area immediately
    if (!item) setVariants([]);
    // On edit, variants are seeded by the existingSizes effect below
  }, [item, open]);

  useEffect(() => {
    // Seed variants from server data when editing — only runs when existingSizes arrives
    if (item && existingSizes.length > 0) {
      setVariants(
        existingSizes.map((s) => ({
          id: s.id,
          size_label: s.size_label,
          daily_rate: s.daily_rate ?? "",
          default_hourly_rate: s.default_hourly_rate ?? "",
          image_url: s.image_url ?? "",
          is_active: s.is_active,
        }))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existingSizes]);

  const handleChange = (field: keyof RentalItemFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleAddVariant = () => {
    const label = newRow.size_label.trim();
    if (!label) return;
    if (variants.some((v) => v.size_label === label)) {
      setError(`Size "${label}" already exists`);
      return;
    }
    const rate = newRow.daily_rate.trim() === "" ? "" : parseFloat(newRow.daily_rate);
    setVariants((prev) => [
      ...prev,
      {
        tempId: `tmp-${Date.now()}`,
        size_label: label,
        daily_rate: rate === "" || Number.isNaN(rate as number) ? "" : (rate as number),
        default_hourly_rate: "",
        image_url: "",
        is_active: true,
        _new: true,
      },
    ]);
    setNewRow({ size_label: "", daily_rate: "" });
  };

  const updateVariant = (key: string, patch: Partial<VariantRow>) => {
    setVariants((prev) =>
      prev.map((v) => {
        const k = v.id ?? v.tempId;
        if (k !== key) return v;
        return { ...v, ...patch, _dirty: v.id ? true : v._dirty };
      })
    );
  };

  const removeVariant = async (row: VariantRow) => {
    if (row.id && item) {
      await deleteSize.mutateAsync({ id: row.id, rental_item_id: item.id });
    }
    setVariants((prev) => prev.filter((v) => (v.id ?? v.tempId) !== (row.id ?? row.tempId)));
  };

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }

    try {
      let parentId: string;
      if (isEdit && item) {
        await updateItem.mutateAsync({ id: item.id, data: formData });
        parentId = item.id;
      } else {
        const created = await createItem.mutateAsync(formData);
        parentId = created.id;
      }

      // Persist variant changes
      for (const v of variants) {
        const payload = {
          daily_rate: v.daily_rate === "" ? null : Number(v.daily_rate),
          default_hourly_rate: v.default_hourly_rate === "" ? null : Number(v.default_hourly_rate),
          image_url: v.image_url || null,
        };
        if (v._new) {
          await createSize.mutateAsync({
            rental_item_id: parentId,
            size_label: v.size_label,
            display_order: 0,
            ...payload,
          });
        } else if (v.id && v._dirty) {
          await updateSize.mutateAsync({
            id: v.id,
            rental_item_id: parentId,
            data: { size_label: v.size_label, ...payload },
          });
        }
      }

      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to save rental item");
    }
  };

  const isLoading = createItem.isPending || updateItem.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" component="span">
            {isEdit ? "Edit Rental Item" : "Add Rental Item"}
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
            <TextField
              fullWidth
              required
              label="Item Name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="e.g., 4ft Scaffolding Sheet"
            />
          </Grid>

          <Grid size={12}>
            <ImageUploadWithCrop
              supabase={supabase}
              bucketName="rental-items"
              folderPath="item-photos"
              fileNamePrefix="rental-item"
              value={formData.image_url || null}
              onChange={(url) => handleChange("image_url", url || "")}
              disabled={isLoading}
              label="Item Photo (Optional)"
              aspectRatio={1}
              maxSizeKB={300}
              cropShape="rect"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Code"
              value={formData.code}
              onChange={(e) => handleChange("code", e.target.value)}
              placeholder="Auto-generated if empty"
              helperText="Leave empty for auto-generation"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Local Name"
              value={formData.local_name}
              onChange={(e) => handleChange("local_name", e.target.value)}
              placeholder="Name in local language"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Source Type</InputLabel>
              <Select
                value={formData.source_type}
                label="Source Type"
                onChange={(e) => handleChange("source_type", e.target.value)}
              >
                {(Object.keys(RENTAL_SOURCE_TYPE_LABELS) as RentalSourceType[]).map((type) => (
                  <MenuItem key={type} value={type}>
                    {RENTAL_SOURCE_TYPE_LABELS[type]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Rate Type</InputLabel>
              <Select
                value={formData.rate_type}
                label="Rate Type"
                onChange={(e) => handleChange("rate_type", e.target.value)}
              >
                {(Object.keys(RENTAL_RATE_TYPE_LABELS) as RentalRateType[]).map((type) => (
                  <MenuItem key={type} value={type}>
                    {RENTAL_RATE_TYPE_LABELS[type]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Rental Type</InputLabel>
              <Select
                value={formData.rental_type}
                label="Rental Type"
                onChange={(e) => handleChange("rental_type", e.target.value)}
              >
                {(Object.keys(RENTAL_TYPE_LABELS) as RentalType[]).map((type) => (
                  <MenuItem key={type} value={type}>
                    {RENTAL_TYPE_LABELS[type]}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category_id || ""}
                label="Category"
                onChange={(e) => handleChange("category_id", e.target.value)}
              >
                <MenuItem value="">None</MenuItem>
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Unit</InputLabel>
              <Select
                value={formData.unit}
                label="Unit"
                onChange={(e) => handleChange("unit", e.target.value)}
              >
                {UNITS.map((u) => (
                  <MenuItem key={u.value} value={u.value}>
                    {u.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="number"
              label={formData.rate_type === "hourly" ? "Default Hourly Rate" : "Default Daily Rate"}
              value={formData.default_daily_rate || ""}
              onChange={(e) =>
                handleChange(
                  "default_daily_rate",
                  e.target.value ? parseFloat(e.target.value) : undefined
                )
              }
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              }}
              placeholder="0"
              helperText="Used when an order line doesn't pick a variant"
            />
          </Grid>

          <Grid size={12}>
            <TextField
              fullWidth
              multiline
              rows={2}
              label="Description"
              value={formData.description}
              onChange={(e) => handleChange("description", e.target.value)}
              placeholder="Additional details about the item"
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 2 }}>
          <Typography variant="subtitle2" gutterBottom>
            Sizes
          </Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 1 }}>
            Each size has its own rate and optional photo. The parent rate above is used when no size is picked on an order.
          </Typography>

          {variants.length > 0 && (
            <Stack spacing={1} sx={{ mb: 1 }}>
              {variants.map((v) => {
                const key = v.id ?? v.tempId!;
                return (
                  <Box
                    key={key}
                    sx={{
                      p: 1,
                      bgcolor: "grey.50",
                      borderRadius: 1,
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <TextField
                      size="small"
                      label="Size"
                      value={v.size_label}
                      onChange={(e) => updateVariant(key, { size_label: e.target.value })}
                      sx={{ flex: "1 1 120px" }}
                    />
                    <TextField
                      size="small"
                      type="number"
                      label={formData.rate_type === "hourly" ? "₹/hr" : "₹/day"}
                      value={
                        formData.rate_type === "hourly"
                          ? (v.default_hourly_rate as number | "")
                          : (v.daily_rate as number | "")
                      }
                      onChange={(e) => {
                        const num = e.target.value === "" ? "" : parseFloat(e.target.value);
                        if (formData.rate_type === "hourly") {
                          updateVariant(key, { default_hourly_rate: num as number | "" });
                        } else {
                          updateVariant(key, { daily_rate: num as number | "" });
                        }
                      }}
                      sx={{ width: 110 }}
                    />
                    <Box sx={{ width: 64 }}>
                      <ImageUploadWithCrop
                        supabase={supabase}
                        bucketName="rental-items"
                        folderPath="variant-photos"
                        fileNamePrefix={`variant-${key}`}
                        value={v.image_url || null}
                        onChange={(url) => updateVariant(key, { image_url: url || "" })}
                        disabled={isLoading}
                        label=""
                        aspectRatio={1}
                        maxSizeKB={300}
                        cropShape="rect"
                      />
                    </Box>
                    <IconButton size="small" color="error" onClick={() => removeVariant(v)}>
                      <CloseIcon fontSize="small" />
                    </IconButton>
                  </Box>
                );
              })}
            </Stack>
          )}

          <Box sx={{ display: "flex", gap: 1 }}>
            <TextField
              size="small"
              label='Size (e.g. 3×2)'
              value={newRow.size_label}
              onChange={(e) => setNewRow((r) => ({ ...r, size_label: e.target.value }))}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small"
              type="number"
              label={formData.rate_type === "hourly" ? "₹/hr" : "₹/day"}
              value={newRow.daily_rate}
              onChange={(e) => setNewRow((r) => ({ ...r, daily_rate: e.target.value }))}
              sx={{ width: 110 }}
            />
            <Button
              variant="outlined"
              size="small"
              onClick={handleAddVariant}
              disabled={!newRow.size_label.trim()}
            >
              Add
            </Button>
          </Box>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={isLoading || !formData.name.trim()}
        >
          {isLoading ? "Saving..." : isEdit ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
