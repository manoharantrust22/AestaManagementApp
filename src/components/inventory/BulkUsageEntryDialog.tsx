"use client";

import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Typography,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  InputAdornment,
  IconButton,
  Alert,
  Chip,
  Divider,
  Paper,
  useMediaQuery,
  useTheme,
  CircularProgress,
  Slide,
  FormControlLabel,
  Switch,
} from "@mui/material";
import type { TransitionProps } from "@mui/material/transitions";
import {
  Close as CloseIcon,
  Search as SearchIcon,
  Clear as ClearIcon,
  Save as SaveIcon,
  Warning as WarningIcon,
  CheckCircle as CheckIcon,
  Home as SiteIcon,
  Groups as SharedIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  CallSplit as SplitBrandIcon,
} from "@mui/icons-material";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { useMaterialCategories } from "@/hooks/queries/useMaterials";
import {
  useBulkCreateMaterialUsage,
  useCreateMaterialUsageFIFO,
} from "@/hooks/queries/useMaterialUsage";
import type { ExtendedStockInventory } from "@/hooks/queries/useStockInventory";
import type { MaterialUnit, MaterialCategory } from "@/types/material.types";
import {
  consolidateStock,
  allocateFIFO,
  type ConsolidatedStockItem,
} from "@/lib/utils/fifoAllocator";
import dayjs from "dayjs";
import React from "react";

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

// Transition for fullscreen dialog
const Transition = React.forwardRef(function Transition(
  props: TransitionProps & { children: React.ReactElement },
  ref: React.Ref<unknown>
) {
  return <Slide direction="up" ref={ref} {...props} />;
});

type BulkViewMode = "material" | "batch";

interface BulkUsageEntry {
  stockId: string;
  quantity: number | null;
  hasError: boolean;
  errorMessage?: string;
}

interface ConsolidatedUsageEntry {
  key: string; // material_id
  quantity: number | null;
  hasError: boolean;
  errorMessage?: string;
}

interface BulkUsageEntryDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  stock: ExtendedStockInventory[];
  siteGroupId?: string | null;
  siteName?: string;
}

export default function BulkUsageEntryDialog({
  open,
  onClose,
  siteId,
  stock,
  siteGroupId,
  siteName,
}: BulkUsageEntryDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const { data: categories = [] } = useMaterialCategories();
  const bulkCreateUsage = useBulkCreateMaterialUsage();
  const createUsageFIFO = useCreateMaterialUsageFIFO();

  // View mode: "material" (consolidated) vs "batch"
  const [viewMode, setViewMode] = useState<BulkViewMode>("material");
  const [splitByBrand, setSplitByBrand] = useState(false);

  // Form state
  const [usageDate, setUsageDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [workDescription, setWorkDescription] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [entries, setEntries] = useState<Map<string, BulkUsageEntry>>(new Map());
  const [consolidatedEntries, setConsolidatedEntries] = useState<
    Map<string, ConsolidatedUsageEntry>
  >(new Map());
  const [showReview, setShowReview] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Input refs for Tab navigation
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setUsageDate(dayjs().format("YYYY-MM-DD"));
      setWorkDescription("");
      setCategoryFilter("");
      setSearchTerm("");
      setEntries(new Map());
      setConsolidatedEntries(new Map());
      setViewMode("material");
      setSplitByBrand(false);
      setShowReview(false);
      setSubmitError(null);
    }
  }, [open]);

  // Clear consolidated entries when splitByBrand changes (keys change)
  useEffect(() => {
    setConsolidatedEntries(new Map());
    inputRefs.current = new Map();
  }, [splitByBrand]);

  // Filter stock by category and search
  const filteredStock = useMemo(() => {
    let filtered = stock;

    // Category filter
    if (categoryFilter) {
      const childCategoryIds = categories
        .filter((c: MaterialCategory) => c.parent_id === categoryFilter)
        .map((c: MaterialCategory) => c.id);
      const validCategoryIds = [categoryFilter, ...childCategoryIds];

      filtered = filtered.filter(
        (s) =>
          validCategoryIds.includes(s.material?.category_id || "") ||
          !s.material?.category_id
      );
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.material?.name?.toLowerCase().includes(term) ||
          s.material?.code?.toLowerCase().includes(term) ||
          s.brand?.brand_name?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [stock, categoryFilter, searchTerm, categories]);

  // Consolidated stock (grouped by material, or material+brand when split)
  const consolidatedStock = useMemo(
    () => consolidateStock(filteredStock, splitByBrand),
    [filteredStock, splitByBrand]
  );

  // Validate consolidated entry against total available
  const validateConsolidatedEntry = useCallback(
    (
      quantity: number | null,
      item: ConsolidatedStockItem
    ): { hasError: boolean; errorMessage?: string } => {
      if (quantity === null || quantity <= 0) {
        return { hasError: false };
      }
      if (quantity > item.total_available_qty) {
        return {
          hasError: true,
          errorMessage: `Exceeds available (${item.total_available_qty} ${UNIT_LABELS[item.unit as MaterialUnit] || item.unit})`,
        };
      }
      return { hasError: false };
    },
    []
  );

  // Handle consolidated quantity change
  const handleConsolidatedQtyChange = useCallback(
    (item: ConsolidatedStockItem, value: string) => {
      const quantity = value === "" ? null : parseFloat(value);
      const validation = validateConsolidatedEntry(quantity, item);

      setConsolidatedEntries((prev) => {
        const next = new Map(prev);
        next.set(item.key, { key: item.key, quantity, ...validation });
        return next;
      });
    },
    [validateConsolidatedEntry]
  );

  // Calculate effective cost per piece (handles per-kg pricing and shared stock)
  const getEffectiveCostPerPiece = useCallback((stockItem: ExtendedStockInventory) => {
    // Both avg_unit_cost (from DB) and batch_unit_cost (computed with GST) are already GST-inclusive.
    // Use batch_unit_cost for shared stock to ensure consistent pricing across sites.
    const unitCost = (stockItem.is_shared && stockItem.batch_unit_cost)
      ? stockItem.batch_unit_cost
      : stockItem.avg_unit_cost;

    if (!unitCost) return 0;

    // For per-kg pricing, avg_unit_cost is per-kg rate — convert to per-piece
    if (stockItem.pricing_mode === "per_kg" && stockItem.total_weight && stockItem.current_qty > 0) {
      const weightPerPiece = stockItem.total_weight / stockItem.current_qty;
      return weightPerPiece * unitCost;
    }

    return unitCost;
  }, []);

  // Validate entry against stock
  const validateEntry = useCallback(
    (quantity: number | null, stockItem: ExtendedStockInventory): { hasError: boolean; errorMessage?: string } => {
      if (quantity === null || quantity <= 0) {
        return { hasError: false }; // Empty is valid (just not included)
      }

      if (quantity > stockItem.available_qty) {
        return {
          hasError: true,
          errorMessage: `Exceeds available (${stockItem.available_qty} ${UNIT_LABELS[stockItem.material?.unit || "piece"]})`,
        };
      }

      return { hasError: false };
    },
    []
  );

  // Handle quantity change
  const handleQuantityChange = useCallback(
    (stockItem: ExtendedStockInventory, value: string) => {
      const quantity = value === "" ? null : parseFloat(value);
      const validation = validateEntry(quantity, stockItem);

      setEntries((prev) => {
        const newEntries = new Map(prev);
        newEntries.set(stockItem.id, {
          stockId: stockItem.id,
          quantity,
          ...validation,
        });
        return newEntries;
      });
    },
    [validateEntry]
  );

  // Handle Tab navigation — works for both modes
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, currentIndex: number) => {
      const getKey = (idx: number) =>
        viewMode === "material"
          ? consolidatedStock[idx]?.key
          : filteredStock[idx]?.id;
      const listLen =
        viewMode === "material" ? consolidatedStock.length : filteredStock.length;

      if (e.key === "Tab" && !e.shiftKey) {
        e.preventDefault();
        const next = currentIndex + 1;
        if (next < listLen) inputRefs.current.get(getKey(next))?.focus();
      } else if (e.key === "Tab" && e.shiftKey) {
        e.preventDefault();
        const prev = currentIndex - 1;
        if (prev >= 0) inputRefs.current.get(getKey(prev))?.focus();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const next = currentIndex + 1;
        if (next < listLen) inputRefs.current.get(getKey(next))?.focus();
      }
    },
    [viewMode, filteredStock, consolidatedStock]
  );

  // Get active entries (with quantity > 0) — batch mode
  const activeEntries = useMemo(() => {
    return Array.from(entries.values()).filter(
      (e) => e.quantity !== null && e.quantity > 0
    );
  }, [entries]);

  // Get active consolidated entries — material mode
  const activeConsolidatedEntries = useMemo(() => {
    return Array.from(consolidatedEntries.values()).filter(
      (e) => e.quantity !== null && e.quantity > 0
    );
  }, [consolidatedEntries]);

  // Calculate summary (works for both modes)
  const summary = useMemo(() => {
    if (viewMode === "material") {
      let totalCost = 0;
      let errorCount = 0;

      activeConsolidatedEntries.forEach((entry) => {
        const item = consolidatedStock.find((c) => c.key === entry.key);
        if (item && entry.quantity) {
          totalCost += item.weighted_avg_cost * entry.quantity;
        }
        if (entry.hasError) errorCount++;
      });

      return {
        totalItems: activeConsolidatedEntries.length,
        totalCost,
        errors: activeConsolidatedEntries.filter((e) => e.hasError),
        hasErrors: errorCount > 0,
      };
    }

    // Batch mode
    let totalCost = 0;
    const errors: BulkUsageEntry[] = [];

    activeEntries.forEach((entry) => {
      const stockItem = stock.find((s) => s.id === entry.stockId);
      if (stockItem && entry.quantity) {
        const costPerPiece = getEffectiveCostPerPiece(stockItem);
        totalCost += costPerPiece * entry.quantity;
      }
      if (entry.hasError) {
        errors.push(entry);
      }
    });

    return {
      totalItems: activeEntries.length,
      totalCost,
      errors,
      hasErrors: errors.length > 0,
    };
  }, [
    viewMode,
    activeEntries,
    activeConsolidatedEntries,
    consolidatedStock,
    stock,
    getEffectiveCostPerPiece,
  ]);

  // Handle submit — material (consolidated) mode
  const handleConsolidatedSubmit = async () => {
    if (summary.hasErrors) {
      setSubmitError("Please fix errors before submitting");
      return;
    }
    setSubmitError(null);

    try {
      const validEntries = activeConsolidatedEntries.filter(
        (e) => !e.hasError && e.quantity && e.quantity > 0
      );

      // Process each material sequentially
      for (const entry of validEntries) {
        const item = consolidatedStock.find((c) => c.key === entry.key);
        if (!item) continue;

        const allocations = allocateFIFO(item.batches, entry.quantity!, siteId);

        await Promise.race([
          createUsageFIFO.mutateAsync({
            siteId,
            usageDate,
            workDescription: workDescription || undefined,
            sectionId: undefined,
            allocations,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error("Save timeout after 45 seconds. Please try again.")),
              45000
            )
          ),
        ]);
      }

      onClose();
    } catch (err) {
      console.error("Consolidated bulk usage failed:", err);
      setSubmitError(
        err instanceof Error ? err.message : "Failed to record usage. Please try again."
      );
    }
  };

  // Handle submit — batch mode
  const handleBatchSubmit = async () => {
    if (summary.hasErrors) {
      setSubmitError("Please fix errors before submitting");
      return;
    }

    setSubmitError(null);

    const entriesToSubmit = activeEntries
      .filter((e) => !e.hasError && e.quantity && e.quantity > 0)
      .map((entry) => {
        const stockItem = stock.find((s) => s.id === entry.stockId)!;
        const costPerPiece = getEffectiveCostPerPiece(stockItem);

        const inventorySiteId = stockItem.paid_by_site_id || siteId;
        const isSharedStock = stockItem.is_shared && stockItem.paid_by_site_id !== siteId;

        return {
          site_id: inventorySiteId,
          usage_site_id: isSharedStock ? siteId : undefined,
          usage_date: usageDate,
          material_id: stockItem.material?.id || "",
          brand_id: stockItem.brand_id || undefined,
          inventory_id: stockItem.id,
          quantity: entry.quantity!,
          unit_cost: costPerPiece,
          total_cost: costPerPiece * entry.quantity!,
          work_description: workDescription || undefined,
        };
      });

    try {
      const result = await Promise.race([
        bulkCreateUsage.mutateAsync(entriesToSubmit),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Save timeout after 45 seconds. Please try again.")), 45000)
        ),
      ]);

      if (result.batchSyncWarnings && result.batchSyncWarnings.length > 0) {
        console.warn("Batch sync warnings:", result.batchSyncWarnings);
        if (result.totalCreated > 0 && result.totalFailed === 0) {
          setSubmitError(
            `Saved ${result.totalCreated} entries, but settlement tracking may be incomplete. Check console for details.`
          );
          setTimeout(() => onClose(), 2000);
          return;
        }
      }

      if (result.totalFailed > 0) {
        setSubmitError(
          `${result.totalCreated} entries saved, ${result.totalFailed} failed. Please check and retry.`
        );
      } else {
        onClose();
      }
    } catch (err) {
      console.error("Bulk usage failed:", err);
      setSubmitError(
        err instanceof Error ? err.message : "Failed to record usage. Please try again."
      );
    }
  };

  const handleSubmit = viewMode === "material" ? handleConsolidatedSubmit : handleBatchSubmit;

  const isPending = bulkCreateUsage.isPending || createUsageFIFO.isPending;
  const canSubmit = summary.totalItems > 0 && !summary.hasErrors;

  // Parent categories only for filter
  const parentCategories = categories.filter((c: MaterialCategory) => !c.parent_id);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth="md"
      fullWidth
      TransitionComponent={isMobile ? Transition : undefined}
    >
      <DialogTitle
        sx={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: 1,
          borderColor: "divider",
          pb: 2,
        }}
      >
        Bulk Material Usage Entry
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ p: 0, display: "flex", flexDirection: "column" }}>
        {/* Shared Fields Header */}
        <Paper
          elevation={0}
          sx={{
            p: 2,
            bgcolor: "grey.50",
            borderBottom: 1,
            borderColor: "divider",
            position: "sticky",
            top: 0,
            zIndex: 10,
          }}
        >
          <Box
            sx={{
              display: "flex",
              gap: 2,
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <TextField
              label="Date"
              type="date"
              value={usageDate}
              onChange={(e) => setUsageDate(e.target.value)}
              size="small"
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 150 }}
            />
            <TextField
              label="Work Description"
              value={workDescription}
              onChange={(e) => setWorkDescription(e.target.value)}
              size="small"
              placeholder="What was the material used for?"
              fullWidth
            />
          </Box>
        </Paper>

        {/* View toggle + Filters */}
        <Box
          sx={{
            p: 2,
            display: "flex",
            gap: 2,
            flexDirection: isMobile ? "column" : "row",
            alignItems: isMobile ? "stretch" : "center",
          }}
        >
          <ToggleButtonGroup
            value={viewMode}
            exclusive
            onChange={(_, v) => v && setViewMode(v)}
            size="small"
          >
            <ToggleButton value="material">
              <ViewModuleIcon fontSize="small" sx={{ mr: 0.5 }} />
              {!isMobile && "By Material"}
            </ToggleButton>
            <ToggleButton value="batch">
              <ViewListIcon fontSize="small" sx={{ mr: 0.5 }} />
              {!isMobile && "By Batch"}
            </ToggleButton>
          </ToggleButtonGroup>

          {viewMode === "material" && (
            <FormControlLabel
              control={
                <Switch
                  size="small"
                  checked={splitByBrand}
                  onChange={(e) => setSplitByBrand(e.target.checked)}
                />
              }
              label={
                <Box component="span" sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <SplitBrandIcon fontSize="small" />
                  <Typography variant="body2" component="span">
                    {isMobile ? "By Brand" : "Split by Brand"}
                  </Typography>
                </Box>
              }
              sx={{ ml: 0, mr: 1 }}
            />
          )}

          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>Category</InputLabel>
            <Select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              label="Category"
            >
              <MenuItem value="">All Categories</MenuItem>
              {parentCategories.map((cat: MaterialCategory) => (
                <MenuItem key={cat.id} value={cat.id}>
                  {cat.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            size="small"
            placeholder="Search materials..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchIcon fontSize="small" />
                  </InputAdornment>
                ),
                endAdornment: searchTerm && (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setSearchTerm("")}>
                      <ClearIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
            sx={{ flex: 1, minWidth: 200 }}
          />

          <Typography variant="body2" color="text.secondary">
            {viewMode === "material"
              ? splitByBrand
                ? `${consolidatedStock.length} material-brands`
                : `${consolidatedStock.length} materials`
              : `${filteredStock.length} items`}
          </Typography>
        </Box>

        <Divider />

        {/* Material / Batch List with Inline Inputs */}
        <Box sx={{ flex: 1, overflow: "auto", p: 2 }}>
          {viewMode === "material" ? (
            /* ───── Consolidated (By Material) view ───── */
            consolidatedStock.length === 0 ? (
              <Alert severity="info">
                No materials found. Try adjusting your filters.
              </Alert>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {/* Desktop Header */}
                {!isMobile && (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "2fr 80px 1fr 120px 120px",
                      gap: 2,
                      px: 1,
                      py: 0.5,
                      bgcolor: "grey.100",
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" fontWeight={600}>
                      Material
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Batches
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Available
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Quantity
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Est. Cost
                    </Typography>
                  </Box>
                )}

                {consolidatedStock.map((item, index) => {
                  const entry = consolidatedEntries.get(item.key);
                  const unitLabel =
                    UNIT_LABELS[item.unit as MaterialUnit] || item.unit;
                  const estimatedCost = entry?.quantity
                    ? item.weighted_avg_cost * entry.quantity
                    : 0;

                  return (
                    <Paper
                      key={item.key}
                      variant="outlined"
                      sx={{
                        p: isMobile ? 1.5 : 1,
                        borderColor: entry?.hasError ? "error.main" : "divider",
                        bgcolor: entry?.quantity ? "primary.50" : "transparent",
                      }}
                    >
                      {isMobile ? (
                        <Box
                          sx={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 1,
                          }}
                        >
                          <Box>
                            <Box
                              sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                flexWrap: "wrap",
                              }}
                            >
                              <Typography variant="body2" fontWeight={500}>
                                {item.material_name}
                                {splitByBrand && item.brand_names.length > 0 && (
                                  <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                                    ({item.brand_names[0]})
                                  </Typography>
                                )}
                              </Typography>
                              {item.batch_count > 1 && (
                                <Chip
                                  label={`${item.batch_count} batches`}
                                  size="small"
                                  variant="outlined"
                                  sx={{ height: 20 }}
                                />
                              )}
                              {item.has_shared_batches && (
                                <Chip
                                  icon={<SharedIcon />}
                                  label="Shared"
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ height: 20 }}
                                />
                              )}
                            </Box>
                            <Box
                              sx={{
                                display: "flex",
                                gap: 0.5,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {!splitByBrand && item.brand_names.map((bn) => (
                                <Chip
                                  key={bn}
                                  label={bn}
                                  size="small"
                                  variant="outlined"
                                />
                              ))}
                              <Typography
                                variant="caption"
                                color="text.secondary"
                              >
                                Available: {item.total_available_qty} {unitLabel}
                              </Typography>
                            </Box>
                          </Box>
                          <Box
                            sx={{
                              display: "flex",
                              gap: 2,
                              alignItems: "center",
                            }}
                          >
                            <TextField
                              size="small"
                              type="number"
                              placeholder="Qty"
                              value={entry?.quantity ?? ""}
                              onChange={(e) =>
                                handleConsolidatedQtyChange(item, e.target.value)
                              }
                              onKeyDown={(e) => handleKeyDown(e, index)}
                              inputRef={(el) => {
                                if (el)
                                  inputRefs.current.set(item.key, el);
                              }}
                              error={entry?.hasError}
                              helperText={entry?.errorMessage}
                              slotProps={{
                                input: {
                                  inputProps: {
                                    min: 0,
                                    max: item.total_available_qty,
                                    step: 0.001,
                                  },
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      {unitLabel}
                                    </InputAdornment>
                                  ),
                                },
                              }}
                              sx={{ width: 140 }}
                            />
                            {estimatedCost > 0 && (
                              <Typography
                                variant="body2"
                                fontWeight={500}
                                color="primary.main"
                              >
                                ₹
                                {estimatedCost.toLocaleString("en-IN", {
                                  maximumFractionDigits: 0,
                                })}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      ) : (
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "2fr 80px 1fr 120px 120px",
                            gap: 2,
                            alignItems: "center",
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {item.material_name}
                              {splitByBrand && item.brand_names.length > 0 && (
                                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 0.5 }}>
                                  ({item.brand_names[0]})
                                </Typography>
                              )}
                            </Typography>
                            {!splitByBrand && item.brand_names.map((bn) => (
                              <Chip
                                key={bn}
                                label={bn}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 0.5, mr: 0.5 }}
                              />
                            ))}
                          </Box>
                          <Box>
                            <Chip
                              label={`${item.batch_count}`}
                              size="small"
                              variant="outlined"
                              color={
                                item.has_shared_batches && item.has_own_batches
                                  ? "warning"
                                  : item.has_shared_batches
                                    ? "info"
                                    : "default"
                              }
                              sx={{ height: 24 }}
                            />
                          </Box>
                          <Box>
                            <Typography variant="body2">
                              {item.total_available_qty} {unitLabel}
                            </Typography>
                            {item.has_shared_batches && (
                              <Typography variant="caption" color="info.main">
                                includes shared
                              </Typography>
                            )}
                          </Box>
                          <TextField
                            size="small"
                            type="number"
                            value={entry?.quantity ?? ""}
                            onChange={(e) =>
                              handleConsolidatedQtyChange(item, e.target.value)
                            }
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            inputRef={(el) => {
                              if (el) inputRefs.current.set(item.key, el);
                            }}
                            error={entry?.hasError}
                            slotProps={{
                              input: {
                                inputProps: {
                                  min: 0,
                                  max: item.total_available_qty,
                                  step: 0.001,
                                },
                              },
                            }}
                            sx={{ width: 100 }}
                          />
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            color={
                              estimatedCost > 0 ? "primary.main" : "text.disabled"
                            }
                          >
                            {estimatedCost > 0
                              ? `₹${estimatedCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                              : "-"}
                          </Typography>
                        </Box>
                      )}
                      {entry?.hasError && !isMobile && (
                        <Typography
                          variant="caption"
                          color="error"
                          sx={{ mt: 0.5, display: "block" }}
                        >
                          {entry.errorMessage}
                        </Typography>
                      )}
                    </Paper>
                  );
                })}
              </Box>
            )
          ) : (
            /* ───── Batch view (original) ───── */
            filteredStock.length === 0 ? (
              <Alert severity="info">
                No materials found. Try adjusting your filters.
              </Alert>
            ) : (
              <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {/* Desktop Header */}
                {!isMobile && (
                  <Box
                    sx={{
                      display: "grid",
                      gridTemplateColumns: "2fr 80px 1fr 120px 120px",
                      gap: 2,
                      px: 1,
                      py: 0.5,
                      bgcolor: "grey.100",
                      borderRadius: 1,
                    }}
                  >
                    <Typography variant="caption" fontWeight={600}>
                      Material
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Source
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Available
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Quantity
                    </Typography>
                    <Typography variant="caption" fontWeight={600}>
                      Est. Cost
                    </Typography>
                  </Box>
                )}

                {/* Material Rows */}
                {filteredStock.map((stockItem, index) => {
                  const entry = entries.get(stockItem.id);
                  const unit = stockItem.material?.unit || "piece";
                  const costPerPiece = getEffectiveCostPerPiece(stockItem);
                  const estimatedCost = entry?.quantity
                    ? costPerPiece * entry.quantity
                    : 0;

                  return (
                    <Paper
                      key={stockItem.id}
                      variant="outlined"
                      sx={{
                        p: isMobile ? 1.5 : 1,
                        borderColor: entry?.hasError ? "error.main" : "divider",
                        bgcolor: entry?.quantity ? "primary.50" : "transparent",
                      }}
                    >
                      {isMobile ? (
                        // Mobile: Stacked layout
                        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
                          <Box>
                            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                              <Typography variant="body2" fontWeight={500}>
                                {stockItem.material?.name}
                              </Typography>
                              {stockItem.is_shared && (
                                <Chip
                                  icon={<SharedIcon />}
                                  label="Shared"
                                  size="small"
                                  color="info"
                                  variant="outlined"
                                  sx={{ height: 20 }}
                                />
                              )}
                            </Box>
                            <Box sx={{ display: "flex", gap: 0.5, alignItems: "center", flexWrap: "wrap" }}>
                              {stockItem.brand && (
                                <Chip
                                  label={stockItem.brand.brand_name}
                                  size="small"
                                  variant="outlined"
                                />
                              )}
                              <Typography variant="caption" color="text.secondary">
                                Available: {stockItem.available_qty} {UNIT_LABELS[unit]}
                              </Typography>
                              {stockItem.paid_by_site_name && (
                                <Typography variant="caption" color="info.main">
                                  (from {stockItem.paid_by_site_name})
                                </Typography>
                              )}
                            </Box>
                          </Box>
                          <Box sx={{ display: "flex", gap: 2, alignItems: "center" }}>
                            <TextField
                              size="small"
                              type="number"
                              placeholder="Qty"
                              value={entry?.quantity ?? ""}
                              onChange={(e) => handleQuantityChange(stockItem, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(e, index)}
                              inputRef={(el) => {
                                if (el) inputRefs.current.set(stockItem.id, el);
                              }}
                              error={entry?.hasError}
                              helperText={entry?.errorMessage}
                              slotProps={{
                                input: {
                                  inputProps: {
                                    min: 0,
                                    max: stockItem.available_qty,
                                    step: 0.001,
                                  },
                                  endAdornment: (
                                    <InputAdornment position="end">
                                      {UNIT_LABELS[unit]}
                                    </InputAdornment>
                                  ),
                                },
                              }}
                              sx={{ width: 140 }}
                            />
                            {estimatedCost > 0 && (
                              <Typography variant="body2" fontWeight={500} color="primary.main">
                                ₹{estimatedCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      ) : (
                        // Desktop: Grid layout
                        <Box
                          sx={{
                            display: "grid",
                            gridTemplateColumns: "2fr 80px 1fr 120px 120px",
                            gap: 2,
                            alignItems: "center",
                          }}
                        >
                          <Box>
                            <Typography variant="body2" fontWeight={500}>
                              {stockItem.material?.name}
                            </Typography>
                            {stockItem.brand && (
                              <Chip
                                label={stockItem.brand.brand_name}
                                size="small"
                                variant="outlined"
                                sx={{ mt: 0.5 }}
                              />
                            )}
                          </Box>
                          <Box>
                            {stockItem.is_shared ? (
                              <Chip
                                icon={<SharedIcon />}
                                label="Shared"
                                size="small"
                                color="info"
                                variant="outlined"
                                sx={{ height: 24 }}
                              />
                            ) : (
                              <Chip
                                icon={<SiteIcon />}
                                label="Site"
                                size="small"
                                variant="outlined"
                                sx={{ height: 24 }}
                              />
                            )}
                          </Box>
                          <Box>
                            <Typography variant="body2">
                              {stockItem.available_qty} {UNIT_LABELS[unit]}
                            </Typography>
                            {stockItem.paid_by_site_name && (
                              <Typography variant="caption" color="info.main">
                                from {stockItem.paid_by_site_name}
                              </Typography>
                            )}
                          </Box>
                          <TextField
                            size="small"
                            type="number"
                            value={entry?.quantity ?? ""}
                            onChange={(e) => handleQuantityChange(stockItem, e.target.value)}
                            onKeyDown={(e) => handleKeyDown(e, index)}
                            inputRef={(el) => {
                              if (el) inputRefs.current.set(stockItem.id, el);
                            }}
                            error={entry?.hasError}
                            slotProps={{
                              input: {
                                inputProps: {
                                  min: 0,
                                  max: stockItem.available_qty,
                                  step: 0.001,
                                },
                              },
                            }}
                            sx={{ width: 100 }}
                          />
                          <Typography
                            variant="body2"
                            fontWeight={500}
                            color={estimatedCost > 0 ? "primary.main" : "text.disabled"}
                          >
                            {estimatedCost > 0
                              ? `₹${estimatedCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
                              : "-"}
                          </Typography>
                        </Box>
                      )}
                      {entry?.hasError && !isMobile && (
                        <Typography variant="caption" color="error" sx={{ mt: 0.5, display: "block" }}>
                          {entry.errorMessage}
                        </Typography>
                      )}
                    </Paper>
                  );
                })}
              </Box>
            )
          )}
        </Box>

        {/* Summary Bar */}
        <Paper
          elevation={3}
          sx={{
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          {submitError && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setSubmitError(null)}>
              {submitError}
            </Alert>
          )}

          {/* Recording site indicator when in a group */}
          {siteGroupId && siteName && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                mb: 1.5,
                p: 1,
                bgcolor: "info.lighter",
                borderRadius: 1,
              }}
            >
              <SiteIcon fontSize="small" color="info" />
              <Typography variant="body2" color="info.main">
                Recording for: <strong>{siteName}</strong>
              </Typography>
            </Box>
          )}

          <Box
            sx={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 2,
            }}
          >
            <Box sx={{ display: "flex", gap: 3, alignItems: "center" }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                {summary.totalItems > 0 ? (
                  <CheckIcon color="success" fontSize="small" />
                ) : null}
                <Typography variant="body2">
                  <strong>{summary.totalItems}</strong> materials selected
                </Typography>
              </Box>

              <Typography variant="body2">
                Total:{" "}
                <strong>
                  ₹{summary.totalCost.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
                </strong>
              </Typography>

              {summary.errors.length > 0 && (
                <Chip
                  icon={<WarningIcon />}
                  label={`${summary.errors.length} errors`}
                  color="error"
                  size="small"
                  variant="outlined"
                />
              )}
            </Box>
          </Box>
        </Paper>
      </DialogContent>

      <DialogActions sx={{ p: 2, borderTop: 1, borderColor: "divider" }}>
        <Button onClick={onClose} disabled={isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          startIcon={
            isPending ? (
              <CircularProgress size={20} color="inherit" />
            ) : (
              <SaveIcon />
            )
          }
          onClick={handleSubmit}
          disabled={!canSubmit || isPending}
        >
          {isPending
            ? "Saving..."
            : `Record ${summary.totalItems} Item${summary.totalItems !== 1 ? "s" : ""}`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
