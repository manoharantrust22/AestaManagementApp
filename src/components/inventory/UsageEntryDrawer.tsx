"use client";

import { useMemo, useState, useEffect, useRef } from "react";
import {
  Box,
  Button,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Grid,
  IconButton,
  Drawer,
  Divider,
  Chip,
  Alert,
  Autocomplete,
  Paper,
} from "@mui/material";
import {
  Close as CloseIcon,
  Save as SaveIcon,
  Inventory as InventoryIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useMaterialCategories } from "@/hooks/queries/useMaterials";
import {
  useCreateMaterialUsage,
  useCreateMaterialUsageFIFO,
} from "@/hooks/queries/useMaterialUsage";
import type { ExtendedStockInventory } from "@/hooks/queries/useStockInventory";
import {
  allocateFIFO,
  type BatchAllocation,
  type ConsolidatedStockItem,
} from "@/lib/utils/fifoAllocator";
import type {
  MaterialUnit,
  UsageEntryFormData,
} from "@/types/material.types";
import QuantityWithPercentInput from "@/components/common/QuantityWithPercentInput";
import dayjs from "dayjs";

const UNIT_LABELS: Record<MaterialUnit, string> = {
  kg: "Kg",
  g: "Gram",
  ton: "Ton",
  liter: "Ltr",
  ml: "ml",
  piece: "Pcs",
  bag: "Bag",
  bundle: "Bundle",
  sqft: "Sqft",
  sqm: "Sqm",
  cft: "Cft",
  cum: "Cum",
  nos: "Nos",
  rmt: "Rmt",
  ft: "Ft",
  box: "Box",
  set: "Set",
};

interface UsageEntryDrawerProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  stock: ExtendedStockInventory[];
  preSelectedStock?: ExtendedStockInventory | null;
  preSelectedConsolidated?: ConsolidatedStockItem | null;
}

export default function UsageEntryDrawer({
  open,
  onClose,
  siteId,
  stock,
  preSelectedStock,
  preSelectedConsolidated,
}: UsageEntryDrawerProps) {
  const isMobile = useIsMobile();
  const { data: categories = [] } = useMaterialCategories();
  const createUsage = useCreateMaterialUsage();
  const createUsageFIFO = useCreateMaterialUsageFIFO();
  const quantityInputRef = useRef<HTMLInputElement>(null);

  const [categoryFilter, setCategoryFilter] = useState("");
  const [selectedStockId, setSelectedStockId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UsageEntryFormData>({
    site_id: siteId,
    usage_date: dayjs().format("YYYY-MM-DD"),
    material_id: "",
    quantity: 0,
    work_description: "",
  });

  // Determine mode
  const isConsolidatedMode = !!preSelectedConsolidated;
  const isBatchMode = !!preSelectedStock;
  const isPreSelected = isBatchMode || isConsolidatedMode;

  // Handle pre-selected stock (batch mode)
  useEffect(() => {
    if (open && preSelectedStock && !preSelectedConsolidated) {
      setSelectedStockId(preSelectedStock.id);
      setForm((prev) => ({
        ...prev,
        site_id: siteId,
        material_id: preSelectedStock.material?.id || "",
      }));
      setTimeout(() => {
        quantityInputRef.current?.focus();
      }, 300);
    }
  }, [open, preSelectedStock, preSelectedConsolidated, siteId]);

  // Handle pre-selected consolidated material
  useEffect(() => {
    if (open && preSelectedConsolidated) {
      setForm((prev) => ({
        ...prev,
        site_id: siteId,
        material_id: preSelectedConsolidated.material_id,
      }));
      setTimeout(() => {
        quantityInputRef.current?.focus();
      }, 300);
    }
  }, [open, preSelectedConsolidated, siteId]);

  // Reset form when drawer closes
  useEffect(() => {
    if (!open) {
      setSelectedStockId("");
      setCategoryFilter("");
      setError(null);
      setForm({
        site_id: siteId,
        usage_date: dayjs().format("YYYY-MM-DD"),
        material_id: "",
        quantity: 0,
        work_description: "",
      });
    }
  }, [open, siteId]);

  // Filter stock by category (for non-preselected mode)
  const filteredStock = useMemo(() => {
    if (!categoryFilter) return stock;
    const childCategoryIds = categories
      .filter((c) => c.parent_id === categoryFilter)
      .map((c) => c.id);
    const validCategoryIds = [categoryFilter, ...childCategoryIds];
    return stock.filter(
      (s) =>
        validCategoryIds.includes(s.material?.category_id || "") ||
        !s.material?.category_id
    );
  }, [stock, categoryFilter, categories]);

  // Consolidated mode: compute FIFO allocation preview
  const fifoAllocations = useMemo<BatchAllocation[]>(() => {
    if (!isConsolidatedMode || !preSelectedConsolidated || form.quantity <= 0) {
      return [];
    }
    try {
      return allocateFIFO(preSelectedConsolidated.batches, form.quantity, siteId);
    } catch {
      return [];
    }
  }, [isConsolidatedMode, preSelectedConsolidated, form.quantity, siteId]);

  const fifoTotalCost = fifoAllocations.reduce((sum, a) => sum + a.total_cost, 0);

  // Batch mode: find selected stock
  const selectedStock = stock.find((s) => s.id === selectedStockId);
  const selectedMaterial = isConsolidatedMode
    ? { unit: preSelectedConsolidated?.unit as MaterialUnit || "piece" as MaterialUnit }
    : selectedStock?.material;
  const unit = (isConsolidatedMode
    ? preSelectedConsolidated?.unit
    : selectedMaterial?.unit) as MaterialUnit || "piece";

  // Batch mode: Calculate effective cost per piece
  const getEffectiveCostPerPiece = () => {
    const baseCost =
      selectedStock?.is_shared && selectedStock?.batch_unit_cost
        ? selectedStock.batch_unit_cost
        : selectedStock?.avg_unit_cost;
    if (!baseCost) return 0;
    if (
      selectedStock?.pricing_mode === "per_kg" &&
      selectedStock?.total_weight &&
      selectedStock?.current_qty > 0
    ) {
      const weightPerPiece = selectedStock.total_weight / selectedStock.current_qty;
      return weightPerPiece * baseCost;
    }
    return baseCost;
  };

  const effectiveCostPerPiece = getEffectiveCostPerPiece();
  const estimatedCost = isConsolidatedMode ? fifoTotalCost : effectiveCostPerPiece * form.quantity;
  const isPerKgPricing = selectedStock?.pricing_mode === "per_kg";

  const totalAvailable = isConsolidatedMode
    ? preSelectedConsolidated?.total_available_qty || 0
    : selectedStock?.available_qty || 0;

  const handleSubmit = async () => {
    setError(null);

    if (!form.material_id || form.quantity <= 0) {
      setError("Please select a material and enter quantity");
      return;
    }

    if (form.quantity > totalAvailable) {
      setError(
        `Insufficient stock. Available: ${totalAvailable} ${UNIT_LABELS[unit] || unit}`
      );
      return;
    }

    try {
      if (isConsolidatedMode && fifoAllocations.length > 0) {
        // FIFO mode: distribute across batches
        await createUsageFIFO.mutateAsync({
          siteId,
          usageDate: form.usage_date,
          workDescription: form.work_description || undefined,
          sectionId: form.section_id || undefined,
          allocations: fifoAllocations,
        });
      } else {
        // Batch mode: single stock item
        await createUsage.mutateAsync({
          ...form,
          site_id: siteId,
          brand_id: selectedStock?.brand_id || undefined,
          inventory_id: selectedStock?.id,
          unit_cost: effectiveCostPerPiece,
          total_cost: estimatedCost,
        });
      }
      onClose();
    } catch (err: unknown) {
      console.error("Failed to record usage:", err);
      let message = "Failed to record usage. Please try again.";
      if (err instanceof Error) {
        message = err.message;
      } else if (err && typeof err === "object") {
        const error = err as Record<string, unknown>;
        if (error.code === "23503") {
          message = "Database constraint error. Please contact support.";
        } else if (error.code === "409" || error.status === 409) {
          message =
            "A conflict occurred. The stock may have been modified. Please refresh and try again.";
        } else if (error.message) {
          message = String(error.message);
        }
      }
      setError(message);
    }
  };

  const isPending = createUsage.isPending || createUsageFIFO.isPending;

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      sx={{
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: "450px" },
          maxWidth: "100%",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          p: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography variant="h6">Record Material Usage</Typography>
        <IconButton onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
        {/* Error Alert */}
        {error && (
          <Alert severity="error" onClose={() => setError(null)} sx={{ mb: 1 }}>
            {error}
          </Alert>
        )}

        {/* Consolidated Material Info (material-level mode) */}
        {isConsolidatedMode && preSelectedConsolidated && (
          <Alert severity="info" icon={<InventoryIcon />} sx={{ mb: 1 }}>
            <Typography variant="body2" fontWeight={500}>
              {preSelectedConsolidated.material_name}
              {preSelectedConsolidated.brand_names.length > 0 &&
                ` - ${preSelectedConsolidated.brand_names.join(", ")}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Total Available: {preSelectedConsolidated.total_available_qty}{" "}
              {UNIT_LABELS[unit] || unit} (across{" "}
              {preSelectedConsolidated.batch_count} batch
              {preSelectedConsolidated.batch_count > 1 ? "es" : ""})
            </Typography>
          </Alert>
        )}

        {/* Pre-selected Batch Info (batch mode) */}
        {isBatchMode && selectedStock && (
          <Alert severity="info" icon={<InventoryIcon />} sx={{ mb: 1 }}>
            <Typography variant="body2" fontWeight={500}>
              {selectedStock.material?.name}
              {selectedStock.brand && ` - ${selectedStock.brand.brand_name}`}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Available: {selectedStock.available_qty}{" "}
              {UNIT_LABELS[unit] || unit}
            </Typography>
          </Alert>
        )}

        {/* Date */}
        <TextField
          fullWidth
          label="Date"
          type="date"
          value={form.usage_date}
          onChange={(e) => setForm({ ...form, usage_date: e.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        {/* Category Filter - Hidden when pre-selected */}
        {!isPreSelected && (
          <FormControl fullWidth size="small">
            <InputLabel>Filter by Category</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Filter by Category"
            >
              <MenuItem value="">All Categories</MenuItem>
              {categories
                .filter((c) => !c.parent_id)
                .map((cat) => (
                  <MenuItem key={cat.id} value={cat.id}>
                    {cat.name}
                  </MenuItem>
                ))}
            </Select>
          </FormControl>
        )}

        {/* Material Selection - Hidden when pre-selected */}
        {!isPreSelected && (
          <Autocomplete
            options={filteredStock}
            getOptionLabel={(option) =>
              `${option.material?.name}${option.brand ? ` - ${option.brand.brand_name}` : ""}`
            }
            value={filteredStock.find((s) => s.id === selectedStockId) || null}
            onChange={(_, value) => {
              setSelectedStockId(value?.id || "");
              setForm({ ...form, material_id: value?.material?.id || "" });
            }}
            slotProps={{
              popper: { disablePortal: false },
            }}
            renderInput={(params) => (
              <TextField
                {...params}
                label="Select Material"
                placeholder="Search from available stock..."
                required
              />
            )}
            renderOption={(props, option) => (
              <Box component="li" {...props} key={option.id}>
                <Box sx={{ flex: 1 }}>
                  <Typography variant="body2">
                    {option.material?.name}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    Available: {option.available_qty}{" "}
                    {UNIT_LABELS[option.material?.unit || "piece"]}
                    {option.brand && ` | ${option.brand.brand_name}`}
                  </Typography>
                </Box>
              </Box>
            )}
          />
        )}

        {/* Quantity with available stock info */}
        {(selectedMaterial || isConsolidatedMode) && (
          <>
            <Grid container spacing={2}>
              <Grid size={7}>
                <QuantityWithPercentInput
                  value={form.quantity}
                  onChange={(qty) => setForm({ ...form, quantity: qty })}
                  unit={UNIT_LABELS[unit] || unit}
                  remaining={totalAvailable}
                  inputRef={quantityInputRef}
                  required
                />
              </Grid>
              <Grid size={5}>
                <Box
                  sx={{
                    p: 1.5,
                    bgcolor: "action.hover",
                    borderRadius: 1,
                    textAlign: "center",
                  }}
                >
                  <Typography variant="caption" color="text.secondary">
                    Available
                  </Typography>
                  <Typography
                    variant="h6"
                    fontWeight={600}
                    color={
                      form.quantity > totalAvailable
                        ? "error.main"
                        : "text.primary"
                    }
                  >
                    {totalAvailable} {UNIT_LABELS[unit] || unit}
                  </Typography>
                </Box>
              </Grid>
            </Grid>

            {/* FIFO Allocation Preview (consolidated mode) */}
            {isConsolidatedMode &&
              fifoAllocations.length > 0 &&
              form.quantity > 0 && (
                <Paper variant="outlined" sx={{ p: 1.5 }}>
                  <Typography
                    variant="subtitle2"
                    sx={{ mb: 1, color: "text.secondary" }}
                  >
                    Batch Allocation (FIFO - oldest first)
                  </Typography>
                  {fifoAllocations.map((alloc, idx) => (
                    <Box
                      key={alloc.inventory_id}
                      sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        py: 0.5,
                        borderBottom:
                          idx < fifoAllocations.length - 1
                            ? "1px solid"
                            : "none",
                        borderColor: "divider",
                      }}
                    >
                      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                        <Typography variant="body2" component="span">
                          {alloc.quantity} {UNIT_LABELS[unit] || unit}
                        </Typography>
                        {alloc.batch_code ? (
                          <Chip
                            label={alloc.batch_code}
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 18,
                              fontSize: "0.65rem",
                              fontFamily: "monospace",
                            }}
                          />
                        ) : (
                          <Chip
                            label="Own Stock"
                            size="small"
                            variant="outlined"
                            sx={{
                              height: 18,
                              fontSize: "0.65rem",
                            }}
                          />
                        )}
                      </Box>
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        fontWeight={500}
                      >
                        ₹
                        {alloc.total_cost.toLocaleString("en-IN", {
                          minimumFractionDigits: 2,
                        })}
                      </Typography>
                    </Box>
                  ))}
                  <Box
                    sx={{
                      display: "flex",
                      justifyContent: "space-between",
                      mt: 1,
                      pt: 1,
                      borderTop: "2px solid",
                      borderColor: "divider",
                    }}
                  >
                    <Typography variant="body2" fontWeight={600}>
                      Total
                    </Typography>
                    <Typography variant="body2" fontWeight={600}>
                      ₹
                      {fifoTotalCost.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </Typography>
                  </Box>
                </Paper>
              )}

            {/* Estimated Cost (batch mode) */}
            {!isConsolidatedMode &&
              selectedStock?.avg_unit_cost &&
              form.quantity > 0 && (
                <Alert severity="info" sx={{ py: 0.5 }}>
                  <Box>
                    <Typography variant="body2" fontWeight={500}>
                      Estimated cost: ₹
                      {estimatedCost.toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {isPerKgPricing ? (
                        <>
                          @ ₹{selectedStock.avg_unit_cost.toLocaleString()}/kg
                          ×{" "}
                          {(
                            (selectedStock.total_weight || 0) /
                            selectedStock.current_qty
                          ).toFixed(2)}{" "}
                          kg/pc
                        </>
                      ) : (
                        <>
                          @ ₹{selectedStock.avg_unit_cost.toLocaleString()}/
                          {UNIT_LABELS[unit] || unit}
                        </>
                      )}
                      {" (avg. rate)"}
                      {selectedStock.brand &&
                        ` | ${selectedStock.brand.brand_name}`}
                    </Typography>
                  </Box>
                </Alert>
              )}
          </>
        )}

        {/* Work Description */}
        <TextField
          fullWidth
          label="Work Description"
          value={form.work_description}
          onChange={(e) =>
            setForm({ ...form, work_description: e.target.value })
          }
          multiline
          rows={isMobile ? 2 : 3}
          placeholder="What was the material used for?"
        />

        <Divider />

        {/* Submit Button */}
        <Button
          variant="contained"
          size="large"
          startIcon={<SaveIcon />}
          onClick={handleSubmit}
          disabled={isPending || !form.material_id || form.quantity <= 0}
          fullWidth
          sx={{ py: 1.5 }}
        >
          {isPending ? "Saving..." : "Record Usage"}
        </Button>
      </Box>
    </Drawer>
  );
}
