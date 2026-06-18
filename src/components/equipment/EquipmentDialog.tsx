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
  Autocomplete,
  Divider,
  FormControlLabel,
  Checkbox,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import {
  useCreateEquipment,
  useUpdateEquipment,
  useEquipmentCategories,
  useEquipmentList,
} from "@/hooks/queries/useEquipment";
import { useVendors } from "@/hooks/queries/useVendors";
import { useSitesData } from "@/contexts/SiteContext";
import { createClient } from "@/lib/supabase/client";
import ImageUploadWithCrop from "@/components/common/ImageUploadWithCrop";
import type {
  EquipmentWithDetails,
  EquipmentFormData,
  EquipmentLocationType,
  EquipmentPurchaseSource,
} from "@/types/equipment.types";
import {
  LOCATION_TYPE_LABELS,
  PURCHASE_SOURCE_LABELS,
  WAREHOUSE_LOCATIONS,
  PAYMENT_SOURCE_LABELS,
  PaymentSource,
} from "@/types/equipment.types";

interface EquipmentDialogProps {
  open: boolean;
  onClose: () => void;
  equipment: EquipmentWithDetails | null;
  defaultCategoryId?: string;
  defaultParentId?: string;
  // When set (and not editing), opens the dialog pre-configured as a new size
  // variant of this parent tool.
  defaultVariantParentId?: string;
}

export default function EquipmentDialog({
  open,
  onClose,
  equipment,
  defaultCategoryId,
  defaultParentId,
  defaultVariantParentId,
}: EquipmentDialogProps) {
  const isMobile = useIsMobile();
  const isEdit = !!equipment;
  const supabase = createClient();

  const { data: categories = [] } = useEquipmentCategories();
  const { data: vendors = [] } = useVendors();
  const { sites = [] } = useSitesData();
  const { data: allEquipment = [] } = useEquipmentList({ include_accessories: false });
  const createEquipment = useCreateEquipment();
  const updateEquipment = useUpdateEquipment();

  const [error, setError] = useState("");
  const [formData, setFormData] = useState<EquipmentFormData>({
    name: "",
    description: "",
    category_id: defaultCategoryId || "",
    current_location_type: "warehouse" as EquipmentLocationType,
    warehouse_location: "Storeroom",
    purchase_source: "store" as EquipmentPurchaseSource,
    parent_equipment_id: defaultVariantParentId || defaultParentId,
    parent_relationship: defaultVariantParentId ? "variant" : undefined,
  });

  // Camera-specific fields
  const [cameraDetails, setCameraDetails] = useState({
    camera_model: "",
    camera_brand: "",
    resolution: "",
    has_night_vision: false,
    has_motion_detection: false,
    has_audio: false,
  });

  useEffect(() => {
    if (equipment) {
      setFormData({
        name: equipment.name,
        description: equipment.description || "",
        category_id: equipment.category_id || "",
        current_location_type: equipment.current_location_type,
        current_site_id: equipment.current_site_id || undefined,
        warehouse_location: equipment.warehouse_location || "Storeroom",
        responsible_user_id: equipment.responsible_user_id || undefined,
        responsible_laborer_id: equipment.responsible_laborer_id || undefined,
        purchase_date: equipment.purchase_date || undefined,
        purchase_cost: equipment.purchase_cost || undefined,
        purchase_vendor_id: equipment.purchase_vendor_id || undefined,
        purchase_source: equipment.purchase_source || "store",
        payment_source: equipment.payment_source || undefined,
        warranty_expiry_date: equipment.warranty_expiry_date || undefined,
        serial_number: equipment.serial_number || undefined,
        model_number: equipment.model_number || undefined,
        brand: equipment.brand || undefined,
        manufacturer: equipment.manufacturer || undefined,
        parent_equipment_id: equipment.parent_equipment_id || undefined,
        parent_relationship: equipment.parent_relationship || undefined,
        variant_label: equipment.variant_label || undefined,
        photos: equipment.photos || [],
        primary_photo_url: equipment.primary_photo_url || undefined,
        maintenance_interval_days: equipment.maintenance_interval_days || undefined,
        notes: equipment.notes || undefined,
      });

      if (equipment.camera_details) {
        setCameraDetails({
          camera_model: equipment.camera_details.camera_model || "",
          camera_brand: equipment.camera_details.camera_brand || "",
          resolution: equipment.camera_details.resolution || "",
          has_night_vision: equipment.camera_details.has_night_vision || false,
          has_motion_detection: equipment.camera_details.has_motion_detection || false,
          has_audio: equipment.camera_details.has_audio || false,
        });
      }
    } else {
      setFormData({
        name: "",
        description: "",
        category_id: defaultCategoryId || "",
        current_location_type: "warehouse",
        warehouse_location: "Storeroom",
        purchase_source: "store",
        parent_equipment_id: defaultVariantParentId || defaultParentId,
        parent_relationship: defaultVariantParentId ? "variant" : undefined,
      });
      setCameraDetails({
        camera_model: "",
        camera_brand: "",
        resolution: "",
        has_night_vision: false,
        has_motion_detection: false,
        has_audio: false,
      });
    }
    setError("");
  }, [equipment, open, defaultCategoryId, defaultParentId, defaultVariantParentId]);

  const handleChange = (field: keyof EquipmentFormData, value: unknown) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setError("");
  };

  const handleCameraChange = (
    field: keyof typeof cameraDetails,
    value: unknown
  ) => {
    setCameraDetails((prev) => ({ ...prev, [field]: value }));
  };

  const selectedCategory = categories.find((c) => c.id === formData.category_id);
  const isCameraCategory = selectedCategory?.code === "SURV";
  const isAccessoryCategory = selectedCategory?.code === "ACC";
  const isVariant = formData.parent_relationship === "variant";

  // Filter out current equipment and its accessories from parent options.
  // allEquipment is top-level only (include_accessories: false), so variant
  // and accessory children are already excluded as parent candidates.
  const parentOptions = allEquipment.filter(
    (e) => e.id !== equipment?.id && e.category?.code !== "ACC"
  );

  const handleSubmit = async () => {
    if (!formData.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!formData.category_id) {
      setError("Category is required");
      return;
    }
    if (isVariant && !formData.parent_equipment_id) {
      setError("Select the parent tool this size belongs to");
      return;
    }

    try {
      const submitData: EquipmentFormData & { camera_details?: unknown } = {
        ...formData,
      };

      // Normalize the parent relationship discriminator.
      if (isAccessoryCategory) {
        // Accessory picker drives parent_equipment_id.
        submitData.parent_relationship = formData.parent_equipment_id
          ? "accessory"
          : undefined;
        submitData.variant_label = undefined;
      } else if (isVariant && formData.parent_equipment_id) {
        submitData.parent_relationship = "variant";
      } else {
        // Standalone item: clear any leftover linking fields.
        submitData.parent_equipment_id = undefined;
        submitData.parent_relationship = undefined;
        submitData.variant_label = undefined;
      }

      // Add camera details if surveillance category
      if (isCameraCategory) {
        submitData.camera_details = cameraDetails;
      }

      if (isEdit && equipment) {
        await updateEquipment.mutateAsync({ id: equipment.id, data: submitData });
      } else {
        await createEquipment.mutateAsync(submitData);
      }
      onClose();
    } catch (err: unknown) {
      const error = err as Error;
      setError(error.message || "Failed to save equipment");
    }
  };

  const isLoading = createEquipment.isPending || updateEquipment.isPending;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle>
        <Box display="flex" justifyContent="space-between" alignItems="center">
          <Typography variant="h6" component="span">
            {isEdit ? "Edit Equipment" : "Add Equipment"}
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
          {/* Basic Info */}
          <Grid size={12}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Basic Information
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth required>
              <InputLabel>Category</InputLabel>
              <Select
                value={formData.category_id}
                label="Category"
                onChange={(e) => handleChange("category_id", e.target.value)}
              >
                {categories.map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>
                    {cat.name} ({cat.code_prefix})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              fullWidth
              required
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Brand"
              value={formData.brand || ""}
              onChange={(e) => handleChange("brand", e.target.value)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Model Number"
              value={formData.model_number || ""}
              onChange={(e) => handleChange("model_number", e.target.value)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Serial Number"
              value={formData.serial_number || ""}
              onChange={(e) => handleChange("serial_number", e.target.value)}
              fullWidth
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Manufacturer"
              value={formData.manufacturer || ""}
              onChange={(e) => handleChange("manufacturer", e.target.value)}
              fullWidth
            />
          </Grid>

          <Grid size={12}>
            <TextField
              label="Description"
              value={formData.description || ""}
              onChange={(e) => handleChange("description", e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
          </Grid>

          {/* Camera-specific fields */}
          {isCameraCategory && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }} />
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  Camera Details
                </Typography>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Camera Brand"
                  value={cameraDetails.camera_brand}
                  onChange={(e) => handleCameraChange("camera_brand", e.target.value)}
                  fullWidth
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Camera Model"
                  value={cameraDetails.camera_model}
                  onChange={(e) => handleCameraChange("camera_model", e.target.value)}
                  fullWidth
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label="Resolution"
                  value={cameraDetails.resolution}
                  onChange={(e) => handleCameraChange("resolution", e.target.value)}
                  fullWidth
                  placeholder="e.g., 1080p, 4K"
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, mt: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={cameraDetails.has_night_vision}
                        onChange={(e) =>
                          handleCameraChange("has_night_vision", e.target.checked)
                        }
                      />
                    }
                    label="Night Vision"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={cameraDetails.has_motion_detection}
                        onChange={(e) =>
                          handleCameraChange("has_motion_detection", e.target.checked)
                        }
                      />
                    }
                    label="Motion Detection"
                  />
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={cameraDetails.has_audio}
                        onChange={(e) =>
                          handleCameraChange("has_audio", e.target.checked)
                        }
                      />
                    }
                    label="Audio"
                  />
                </Box>
              </Grid>
            </>
          )}

          {/* Accessory linking */}
          {isAccessoryCategory && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }} />
                <Typography
                  variant="subtitle2"
                  color="text.secondary"
                  sx={{ mb: 1 }}
                >
                  Link to Parent Equipment
                </Typography>
              </Grid>

              <Grid size={12}>
                <Autocomplete
                  options={parentOptions}
                  getOptionLabel={(option) =>
                    `${option.equipment_code} - ${option.name}`
                  }
                  value={
                    parentOptions.find((e) => e.id === formData.parent_equipment_id) ||
                    null
                  }
                  onChange={(_, newValue) =>
                    handleChange("parent_equipment_id", newValue?.id || undefined)
                  }
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      label="Parent Equipment (Machine)"
                      placeholder="Select the machine this accessory belongs to"
                    />
                  )}
                  slotProps={{ popper: { disablePortal: false } }}
                />
              </Grid>
            </>
          )}

          {/* Size variant linking (for tools that come in multiple sizes) */}
          {!isAccessoryCategory && !isCameraCategory && (
            <>
              <Grid size={12}>
                <Divider sx={{ my: 1 }} />
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={isVariant}
                      onChange={(e) => {
                        if (e.target.checked) {
                          handleChange("parent_relationship", "variant");
                        } else {
                          setFormData((prev) => ({
                            ...prev,
                            parent_relationship: undefined,
                            parent_equipment_id: undefined,
                            variant_label: undefined,
                          }));
                        }
                      }}
                    />
                  }
                  label="This is a size variant of another tool"
                />
              </Grid>

              {isVariant && (
                <>
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <Autocomplete
                      options={parentOptions}
                      getOptionLabel={(option) =>
                        `${option.equipment_code} - ${option.name}`
                      }
                      value={
                        parentOptions.find(
                          (e) => e.id === formData.parent_equipment_id
                        ) || null
                      }
                      onChange={(_, newValue) =>
                        handleChange("parent_equipment_id", newValue?.id || undefined)
                      }
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Parent Tool"
                          placeholder="Select the tool this is a size of"
                          required
                        />
                      )}
                      slotProps={{ popper: { disablePortal: false } }}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      label="Size / Variant Label"
                      value={formData.variant_label || ""}
                      onChange={(e) => handleChange("variant_label", e.target.value)}
                      fullWidth
                      placeholder="e.g. 10 ft"
                      helperText="The size; its cost is the Purchase Cost below"
                    />
                  </Grid>
                </>
              )}
            </>
          )}

          {/* Location */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Current Location
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Location Type</InputLabel>
              <Select
                value={formData.current_location_type}
                label="Location Type"
                onChange={(e) =>
                  handleChange(
                    "current_location_type",
                    e.target.value as EquipmentLocationType
                  )
                }
              >
                {Object.entries(LOCATION_TYPE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {formData.current_location_type === "warehouse" ? (
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Storage Area</InputLabel>
                <Select
                  value={formData.warehouse_location || "Storeroom"}
                  label="Storage Area"
                  onChange={(e) => handleChange("warehouse_location", e.target.value)}
                >
                  {WAREHOUSE_LOCATIONS.map((loc) => (
                    <MenuItem key={loc} value={loc}>
                      {loc}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          ) : (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                options={sites}
                getOptionLabel={(option) => option.name}
                value={sites.find((s) => s.id === formData.current_site_id) || null}
                onChange={(_, newValue) =>
                  handleChange("current_site_id", newValue?.id || undefined)
                }
                renderInput={(params) => <TextField {...params} label="Site" />}
                slotProps={{ popper: { disablePortal: false } }}
              />
            </Grid>
          )}

          {/* Purchase Info */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Purchase Information
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Purchase Date"
              type="date"
              value={formData.purchase_date || ""}
              onChange={(e) => handleChange("purchase_date", e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Purchase Cost"
              type="number"
              value={formData.purchase_cost || ""}
              onChange={(e) =>
                handleChange(
                  "purchase_cost",
                  e.target.value ? parseFloat(e.target.value) : undefined
                )
              }
              fullWidth
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
            <FormControl fullWidth>
              <InputLabel>Purchase Source</InputLabel>
              <Select
                value={formData.purchase_source || "store"}
                label="Purchase Source"
                onChange={(e) =>
                  handleChange(
                    "purchase_source",
                    e.target.value as EquipmentPurchaseSource
                  )
                }
              >
                {Object.entries(PURCHASE_SOURCE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth>
              <InputLabel>Payment Source</InputLabel>
              <Select
                value={formData.payment_source || ""}
                label="Payment Source"
                onChange={(e) => handleChange("payment_source", e.target.value)}
              >
                <MenuItem value="">
                  <em>Not specified</em>
                </MenuItem>
                {Object.entries(PAYMENT_SOURCE_LABELS).map(([value, label]) => (
                  <MenuItem key={value} value={value}>
                    {label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          {formData.purchase_source === "store" && (
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete
                options={vendors}
                getOptionLabel={(option) => option.name}
                value={
                  vendors.find((v) => v.id === formData.purchase_vendor_id) || null
                }
                onChange={(_, newValue) =>
                  handleChange("purchase_vendor_id", newValue?.id || undefined)
                }
                renderInput={(params) => (
                  <TextField {...params} label="Vendor" placeholder="Select vendor" />
                )}
                slotProps={{ popper: { disablePortal: false } }}
              />
            </Grid>
          )}

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Warranty Expiry Date"
              type="date"
              value={formData.warranty_expiry_date || ""}
              onChange={(e) => handleChange("warranty_expiry_date", e.target.value)}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          {/* Maintenance */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Maintenance
            </Typography>
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Maintenance Interval (days)"
              type="number"
              value={formData.maintenance_interval_days || ""}
              onChange={(e) =>
                handleChange(
                  "maintenance_interval_days",
                  e.target.value ? parseInt(e.target.value) : undefined
                )
              }
              fullWidth
              placeholder={
                selectedCategory?.default_maintenance_interval_days
                  ? `Default: ${selectedCategory.default_maintenance_interval_days} days`
                  : "90"
              }
              helperText="Leave empty to use category default"
            />
          </Grid>

          {/* Photo */}
          <Grid size={12}>
            <Divider sx={{ my: 1 }} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
              Photo
            </Typography>
          </Grid>

          <Grid size={12}>
            <ImageUploadWithCrop
              supabase={supabase}
              bucketName="equipment-photos"
              folderPath="equipment"
              fileNamePrefix="equipment"
              value={formData.primary_photo_url || null}
              onChange={(url) => {
                handleChange("primary_photo_url", url || "");
                if (url) {
                  handleChange("photos", [...(formData.photos || []), url]);
                }
              }}
              label="Equipment Photo"
              aspectRatio={4 / 3}
            />
          </Grid>

          {/* Notes */}
          <Grid size={12}>
            <TextField
              label="Notes"
              value={formData.notes || ""}
              onChange={(e) => handleChange("notes", e.target.value)}
              fullWidth
              multiline
              rows={2}
            />
          </Grid>
        </Grid>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={isLoading}>
          {isLoading ? "Saving..." : isEdit ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
