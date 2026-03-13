"use client";

import { useMemo, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Box,
  Button,
  Card,
  CardContent,
  Typography,
  TextField,
  InputAdornment,
  Fab,
  Alert,
  Grid,
  Tabs,
  Tab,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  FormControlLabel,
  Switch,
  InputLabel,
  Select,
  MenuItem,
} from "@mui/material";
import {
  Add as AddIcon,
  Remove as RemoveIcon,
  Search as SearchIcon,
  Warning as WarningIcon,
  TrendingDown as TrendingDownIcon,
  Lock as DedicatedIcon,
  LockOpen as SharedIcon,
  Inventory as InventoryIcon,
  Domain as SiteIcon,
  History as HistoryIcon,
  PlayArrow as UseIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  ExpandMore as ExpandMoreIcon,
  Store as OwnStockIcon,
  Groups as GroupsIcon,
} from "@mui/icons-material";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import DataTable, { type MRT_ColumnDef } from "@/components/common/DataTable";
import PageHeader from "@/components/layout/PageHeader";
import Breadcrumbs from "@/components/layout/Breadcrumbs";
import MaterialWorkflowBar from "@/components/materials/MaterialWorkflowBar";
import { useSite } from "@/contexts/SiteContext";
import { useAuth } from "@/contexts/AuthContext";
import { useDateRange } from "@/contexts/DateRangeContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasEditPermission } from "@/lib/permissions";
import {
  useSiteStock,
  useLowStockAlerts,
  useStockAdjustment,
  useAddInitialStock,
  useCompletedStock,
  type ExtendedStockInventory,
  type CompletedStockItem,
} from "@/hooks/queries/useStockInventory";
import { consolidateStock, type ConsolidatedStockItem } from "@/lib/utils/fifoAllocator";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import {
  useMaterialUsage,
  useTodayUsageSummary,
  useDeleteMaterialUsage,
  useUpdateMaterialUsage,
  groupUsageRecords,
} from "@/hooks/queries/useMaterialUsage";
import { useMaterials, useMaterialCategories } from "@/hooks/queries/useMaterials";
import type {
  StockInventoryWithDetails,
  DailyMaterialUsageWithDetails,
  GroupedUsageRecord,
  MaterialUnit,
  MaterialWithDetails,
} from "@/types/material.types";
import dayjs from "dayjs";
import UsageEntryDrawer from "@/components/inventory/UsageEntryDrawer";
import BulkUsageEntryDialog from "@/components/inventory/BulkUsageEntryDialog";
import UsageDeleteConfirmDialog from "@/components/inventory/UsageDeleteConfirmDialog";
import UsageEditDialog from "@/components/inventory/UsageEditDialog";
import PODetailsDrawer from "@/components/materials/PODetailsDrawer";
import { usePOByBatchCode } from "@/hooks/queries/useStockInventory";

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
  box: "Box",
  set: "Set",
};

type MainTabType = "stock" | "usage";
type StockTabType = "all" | "own" | "group" | "completed";
type StockViewMode = "consolidated" | "batch";

export default function InventoryPage() {
  const { selectedSite } = useSite();
  const { user, userProfile } = useAuth();
  const { formatForApi, isAllTime } = useDateRange();
  const isMobile = useIsMobile();
  const router = useRouter();
  const searchParams = useSearchParams();
  const canEdit = hasEditPermission(userProfile?.role) || userProfile?.role === "site_engineer";

  // Main tab state from URL
  const mainTab = (searchParams.get("tab") as MainTabType) || "stock";
  const setMainTab = (tab: MainTabType) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "stock") {
      params.delete("tab");
    } else {
      params.set("tab", tab);
    }
    router.push(`/site/inventory${params.toString() ? `?${params.toString()}` : ""}`);
  };

  // Stock view state
  const [searchTerm, setSearchTerm] = useState("");
  const [stockTab, setStockTab] = useState<StockTabType>("all");
  const [stockViewMode, setStockViewMode] = useState<StockViewMode>("consolidated");
  const [adjustmentDialog, setAdjustmentDialog] = useState<{
    open: boolean;
    stock: StockInventoryWithDetails | null;
    type: "add" | "remove";
  }>({ open: false, stock: null, type: "add" });
  const [addStockDialog, setAddStockDialog] = useState(false);

  // Usage entry drawer state
  const [usageDrawerOpen, setUsageDrawerOpen] = useState(false);
  const [preSelectedStock, setPreSelectedStock] = useState<ExtendedStockInventory | null>(null);
  const [preSelectedConsolidated, setPreSelectedConsolidated] = useState<ConsolidatedStockItem | null>(null);

  // Bulk usage dialog state
  const [bulkUsageDialogOpen, setBulkUsageDialogOpen] = useState(false);

  // Usage delete/edit dialog state (uses GroupedUsageRecord for grouped FIFO display)
  const [usageDeleteDialog, setUsageDeleteDialog] = useState<{
    open: boolean;
    record: GroupedUsageRecord | null;
  }>({ open: false, record: null });
  const [usageEditDialog, setUsageEditDialog] = useState<{
    open: boolean;
    record: GroupedUsageRecord | null;
  }>({ open: false, record: null });

  // PO drawer state (batch card → PO details)
  const [poDrawerBatchCode, setPODrawerBatchCode] = useState<string | null>(null);
  const [poDrawerOpen, setPODrawerOpen] = useState(false);

  // Date range for usage
  const { dateFrom, dateTo } = formatForApi();
  const dateRange = useMemo(() => {
    if (isAllTime) {
      return {
        startDate: dayjs().subtract(90, "day").format("YYYY-MM-DD"),
        endDate: dayjs().format("YYYY-MM-DD"),
      };
    }
    return {
      startDate: dateFrom || dayjs().format("YYYY-MM-DD"),
      endDate: dateTo || dayjs().format("YYYY-MM-DD"),
    };
  }, [dateFrom, dateTo, isAllTime]);

  // Group membership for shared stock visibility
  const { data: groupMembership } = useSiteGroupMembership(selectedSite?.id);

  // Data queries
  // is_shared is determined by batch_code in useSiteStock (batch_code = group purchase = shared)
  // Pass siteGroupId to also fetch shared stock from other sites in the group
  const { data: stock = [], isLoading: stockLoading } = useSiteStock(selectedSite?.id, {
    siteGroupId: groupMembership?.groupId,
  });
  const { data: completedStock = [], isLoading: completedLoading } = useCompletedStock(selectedSite?.id);
  const { data: lowStockAlerts = [] } = useLowStockAlerts(selectedSite?.id);
  const { data: materials = [] } = useMaterials();
  const { data: usage = [], isLoading: usageLoading } = useMaterialUsage(selectedSite?.id, {
    ...dateRange,
    siteGroupId: groupMembership?.groupId, // Fetch ALL group batch usage for visibility across sites
  });
  const { data: todaySummary } = useTodayUsageSummary(selectedSite?.id);

  // PO lookup for batch card click → PO drawer
  const { data: batchPOData } = usePOByBatchCode(poDrawerBatchCode);

  // Group FIFO-split usage records for display
  const groupedUsage = useMemo(
    () => groupUsageRecords(usage),
    [usage]
  );

  // Filter usage to current site by default (hide other sites' shared stock usage)
  const [showOtherSiteUsage, setShowOtherSiteUsage] = useState(false);
  const filteredGroupedUsage = useMemo(() => {
    if (showOtherSiteUsage) return groupedUsage;
    return groupedUsage.filter(g => g.site_id === selectedSite?.id);
  }, [groupedUsage, showOtherSiteUsage, selectedSite?.id]);
  const otherSiteUsageCount = useMemo(
    () => groupedUsage.filter(g => g.site_id !== selectedSite?.id).length,
    [groupedUsage, selectedSite?.id]
  );

  const stockAdjustment = useStockAdjustment();
  const addInitialStock = useAddInitialStock();
  const deleteUsage = useDeleteMaterialUsage();
  const updateUsage = useUpdateMaterialUsage();

  // Count own vs group stock for tab badges
  const ownStockCount = useMemo(
    () => (stock as ExtendedStockInventory[]).filter((s) => !s.is_shared).length,
    [stock]
  );
  const groupStockCount = useMemo(
    () => (stock as ExtendedStockInventory[]).filter((s) => s.is_shared).length,
    [stock]
  );

  // Filter stock by search term and tab
  const filteredStock = useMemo(() => {
    // Completed tab uses different data source
    if (stockTab === "completed") {
      return [] as ExtendedStockInventory[];
    }

    let filtered = stock as ExtendedStockInventory[];

    // Filter by own/group tab
    if (stockTab === "own") {
      filtered = filtered.filter((s) => !s.is_shared);
    } else if (stockTab === "group") {
      filtered = filtered.filter((s) => s.is_shared);
    }

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (s) =>
          s.material?.name?.toLowerCase().includes(term) ||
          s.material?.code?.toLowerCase().includes(term) ||
          s.brand?.brand_name?.toLowerCase().includes(term) ||
          s.batch_code?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [stock, searchTerm, stockTab]);

  // Filter completed stock by search term
  const filteredCompletedStock = useMemo(() => {
    if (!searchTerm) return completedStock;

    const term = searchTerm.toLowerCase();
    return completedStock.filter(
      (s) =>
        s.material_name?.toLowerCase().includes(term) ||
        s.material_code?.toLowerCase().includes(term) ||
        s.brand_name?.toLowerCase().includes(term) ||
        s.batch_code?.toLowerCase().includes(term)
    );
  }, [completedStock, searchTerm]);

  // Consolidated stock view (group by material)
  const consolidatedStock = useMemo(
    () => consolidateStock(filteredStock),
    [filteredStock]
  );

  // Calculate stats
  const totalStockValue = useMemo(() => {
    return stock.reduce((sum, s) => {
      const extendedStock = s as ExtendedStockInventory;
      // For per-kg pricing, use total_weight; for per-piece, use current_qty
      if (extendedStock.pricing_mode === "per_kg" && extendedStock.total_weight) {
        return sum + extendedStock.total_weight * (s.avg_unit_cost || 0);
      }
      return sum + s.current_qty * (s.avg_unit_cost || 0);
    }, 0);
  }, [stock]);

  // Use the extended stock type from the hook
  type ExtendedStock = ExtendedStockInventory;

  // Handle opening usage drawer with pre-selected stock (batch mode)
  const handleRecordUsage = (stockItem?: ExtendedStockInventory) => {
    setPreSelectedConsolidated(null);
    setPreSelectedStock(stockItem || null);
    setUsageDrawerOpen(true);
  };

  // Handle opening usage drawer with consolidated material (material-level mode)
  const handleRecordConsolidatedUsage = (consolidated: ConsolidatedStockItem) => {
    setPreSelectedStock(null);
    setPreSelectedConsolidated(consolidated);
    setUsageDrawerOpen(true);
  };

  // Stock table columns
  const stockColumns = useMemo<MRT_ColumnDef<ExtendedStockInventory>[]>(
    () => [
      {
        accessorKey: "material.name",
        header: "Material",
        size: 200,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {row.original.material?.name}
            </Typography>
            {row.original.material?.code && (
              <Typography variant="caption" color="text.secondary">
                {row.original.material.code}
              </Typography>
            )}
            {row.original.brand && (
              <Chip
                label={row.original.brand.brand_name}
                size="small"
                variant="outlined"
                sx={{ ml: 1 }}
              />
            )}
          </Box>
        ),
      },
      {
        id: "batch_code",
        header: "Batch",
        size: 120,
        Cell: ({ row }) => {
          const batchCode = (row.original as ExtendedStock).batch_code;
          return batchCode ? (
            <Typography
              variant="caption"
              sx={{
                fontFamily: "monospace",
                bgcolor: "action.hover",
                px: 1,
                py: 0.5,
                borderRadius: 1,
              }}
            >
              {batchCode}
            </Typography>
          ) : (
            <Typography variant="caption" color="text.disabled">
              -
            </Typography>
          );
        },
      },
      {
        accessorKey: "current_qty",
        header: "Current Stock",
        size: 120,
        Cell: ({ row }) => {
          const unit = row.original.material?.unit || "piece";
          const isLow = lowStockAlerts.some((a) => a.id === row.original.id);
          return (
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Typography
                variant="body2"
                fontWeight={600}
                color={isLow ? "error.main" : "text.primary"}
              >
                {row.original.current_qty.toLocaleString()}{" "}
                {UNIT_LABELS[unit] || unit}
              </Typography>
              {isLow && (
                <Tooltip title="Low Stock">
                  <WarningIcon fontSize="small" color="error" />
                </Tooltip>
              )}
            </Box>
          );
        },
      },
      {
        accessorKey: "available_qty",
        header: "Available",
        size: 100,
        Cell: ({ row }) => {
          const unit = row.original.material?.unit || "piece";
          return (
            <Typography variant="body2">
              {row.original.available_qty.toLocaleString()}{" "}
              {UNIT_LABELS[unit] || unit}
            </Typography>
          );
        },
      },
      {
        accessorKey: "avg_unit_cost",
        header: "Avg Cost",
        size: 100,
        Cell: ({ row }) =>
          row.original.avg_unit_cost
            ? `₹${row.original.avg_unit_cost.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : "-",
      },
      {
        id: "value",
        header: "Value",
        size: 120,
        Cell: ({ row }) => {
          const s = row.original as ExtendedStock;
          const isPerKg = s.pricing_mode === "per_kg" && s.total_weight;
          let value: number;
          if (isPerKg) {
            value = s.total_weight! * (s.avg_unit_cost || 0);
          } else {
            value = s.current_qty * (s.avg_unit_cost || 0);
          }
          const fmt = (n: number) =>
            n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
          const valueStr = `₹${fmt(value)}`;

          // Build tooltip breakdown
          const unit = s.material?.unit || "Pcs";
          const hasBatchData = s.batch_unit_cost != null;

          if (!hasBatchData) {
            return (
              <Tooltip
                title={
                  <Box sx={{ fontSize: 12, lineHeight: 1.6 }}>
                    <div>{s.current_qty} {unit} × ₹{fmt(s.avg_unit_cost || 0)}/{unit}</div>
                    <div>= {valueStr}</div>
                  </Box>
                }
                arrow
                placement="left"
              >
                <span style={{ cursor: "help" }}>{valueStr}</span>
              </Tooltip>
            );
          }

          const weightPerPiece = isPerKg && s.current_qty > 0
            ? s.total_weight! / s.current_qty
            : null;
          const costPerPiece = isPerKg && weightPerPiece
            ? weightPerPiece * (s.batch_unit_cost || 0)
            : s.batch_unit_cost || 0;
          const gstPct = s.batch_tax_ratio
            ? Math.round((s.batch_tax_ratio - 1) * 100)
            : null;

          return (
            <Tooltip
              title={
                <Box sx={{ fontSize: 12, lineHeight: 1.8, minWidth: 200 }}>
                  <Box sx={{ fontWeight: 600, mb: 0.5, borderBottom: "1px solid rgba(255,255,255,0.3)", pb: 0.5 }}>
                    Value Breakdown
                  </Box>
                  <div>Qty: {s.current_qty} {unit}</div>
                  {isPerKg && weightPerPiece && (
                    <div>Wt/Pc: {weightPerPiece.toFixed(2)} kg</div>
                  )}
                  {s.batch_raw_unit_price != null && (
                    <div>Rate: ₹{fmt(s.batch_raw_unit_price)}/{isPerKg ? "kg" : unit}</div>
                  )}
                  {gstPct != null && gstPct > 0 && (
                    <div>GST: ×{s.batch_tax_ratio!.toFixed(2)} ({gstPct}%)</div>
                  )}
                  <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.3)", mt: 0.5, pt: 0.5 }}>
                    <div>Cost/Pc: ₹{fmt(costPerPiece)}</div>
                    <div><strong>Total: {s.current_qty} × ₹{fmt(costPerPiece)} = {valueStr}</strong></div>
                  </Box>
                  {(s.batch_code || s.batch_total_amount != null) && (
                    <Box sx={{ borderTop: "1px solid rgba(255,255,255,0.3)", mt: 0.5, pt: 0.5, opacity: 0.85 }}>
                      {s.batch_code && <div>Batch: {s.batch_code}</div>}
                      {s.batch_total_amount != null && (
                        <div>Purchased: ₹{fmt(s.batch_total_amount)}</div>
                      )}
                      {s.batch_original_qty != null && (
                        <div>Orig Qty: {s.batch_original_qty} {unit}</div>
                      )}
                    </Box>
                  )}
                </Box>
              }
              arrow
              placement="left"
            >
              <span style={{ cursor: "help", textDecoration: "underline dotted" }}>{valueStr}</span>
            </Tooltip>
          );
        },
      },
      {
        id: "paid_by",
        header: "Paid By",
        size: 140,
        Cell: ({ row }) => {
          const stock = row.original as ExtendedStock;
          const paidBy = stock.paid_by_site_name;
          const isVendorPaid = stock.is_vendor_paid;
          const hasBatch = stock.batch_code && stock.batch_code.trim().length > 0;

          // Shared stock with batch: show settlement status
          if (hasBatch && paidBy) {
            return isVendorPaid ? (
              <Chip
                icon={<SiteIcon />}
                label={`Paid by ${paidBy}`}
                size="small"
                variant="outlined"
                color="success"
              />
            ) : (
              <Chip
                label="Vendor Unpaid"
                size="small"
                variant="outlined"
                color="warning"
              />
            );
          }

          // Own stock with batch (self-paid group stock)
          if (hasBatch && !paidBy) {
            return isVendorPaid ? (
              <Chip
                label={selectedSite?.name || "This Site"}
                size="small"
                variant="outlined"
                color="success"
              />
            ) : (
              <Chip
                label="Vendor Unpaid"
                size="small"
                variant="outlined"
                color="warning"
              />
            );
          }

          // Own site stock (no batch)
          return (
            <Chip
              label={selectedSite?.name || "This Site"}
              size="small"
              variant="outlined"
            />
          );
        },
      },
      {
        id: "stock_type",
        header: "Type",
        size: 100,
        Cell: ({ row }) => {
          const isShared = (row.original as ExtendedStock).is_shared;
          const isDedicated = (row.original as ExtendedStock).is_dedicated;
          if (isDedicated) {
            return (
              <Tooltip title="Dedicated to this site only">
                <Chip
                  icon={<DedicatedIcon />}
                  label="Dedicated"
                  size="small"
                  color="warning"
                  variant="outlined"
                />
              </Tooltip>
            );
          }
          if (isShared) {
            return (
              <Tooltip title="Shared across site group">
                <Chip
                  icon={<SharedIcon />}
                  label="Shared"
                  size="small"
                  color="info"
                  variant="outlined"
                />
              </Tooltip>
            );
          }
          return <Chip label="Site" size="small" variant="outlined" />;
        },
      },
      {
        accessorKey: "location.name",
        header: "Location",
        size: 120,
        Cell: ({ row }) => row.original.location?.name || "Default",
      },
    ],
    [lowStockAlerts, selectedSite?.name]
  );

  // Consolidated stock table columns (grouped by material+brand)
  const consolidatedColumns = useMemo<MRT_ColumnDef<ConsolidatedStockItem>[]>(
    () => [
      {
        accessorKey: "material_name",
        header: "Material",
        size: 220,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {row.original.material_name}
            </Typography>
            {row.original.material_code && (
              <Typography variant="caption" color="text.secondary">
                {row.original.material_code}
              </Typography>
            )}
            {row.original.brand_names.length > 0 &&
              row.original.brand_names.map((bn) => (
                <Chip
                  key={bn}
                  label={bn}
                  size="small"
                  variant="outlined"
                  sx={{ ml: 0.5 }}
                />
              ))}
          </Box>
        ),
      },
      {
        accessorKey: "total_qty",
        header: "Total Stock",
        size: 130,
        Cell: ({ row }) => {
          const unit = row.original.unit || "piece";
          return (
            <Typography variant="body2" fontWeight={600}>
              {row.original.total_qty.toLocaleString()}{" "}
              {UNIT_LABELS[unit as MaterialUnit] || unit}
            </Typography>
          );
        },
      },
      {
        id: "batches",
        header: "Batches",
        size: 90,
        Cell: ({ row }) => (
          <Chip
            label={`${row.original.batch_count} batch${row.original.batch_count > 1 ? "es" : ""}`}
            size="small"
            variant="outlined"
            color={row.original.batch_count > 1 ? "primary" : "default"}
          />
        ),
      },
      {
        accessorKey: "weighted_avg_cost",
        header: "Avg Cost",
        size: 110,
        Cell: ({ row }) =>
          row.original.weighted_avg_cost
            ? `₹${row.original.weighted_avg_cost.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : "-",
      },
      {
        accessorKey: "total_value",
        header: "Total Value",
        size: 130,
        Cell: ({ row }) => (
          <Typography variant="body2" fontWeight={500}>
            ₹{row.original.total_value.toLocaleString("en-IN", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </Typography>
        ),
      },
      {
        id: "stock_type",
        header: "Type",
        size: 100,
        Cell: ({ row }) => {
          if (row.original.has_shared_batches && row.original.has_own_batches) {
            return <Chip label="Mixed" size="small" color="warning" variant="outlined" />;
          }
          if (row.original.has_shared_batches) {
            return (
              <Chip icon={<SharedIcon />} label="Shared" size="small" color="info" variant="outlined" />
            );
          }
          return <Chip label="Site" size="small" variant="outlined" />;
        },
      },
    ],
    []
  );

  // Row actions for consolidated view
  const renderConsolidatedRowActions = useCallback(
    ({ row }: { row: { original: ConsolidatedStockItem } }) => (
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <Tooltip title="Record Usage">
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleRecordConsolidatedUsage(row.original)}
            disabled={!canEdit || row.original.total_available_qty <= 0}
          >
            <UseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    ),
    [canEdit]
  );

  // Detail panel for consolidated rows — shows individual batches
  const renderConsolidatedDetailPanel = useCallback(
    ({ row }: { row: { original: ConsolidatedStockItem } }) => {
      const batches = row.original.batches;
      if (batches.length <= 1) return null;
      return (
        <Box sx={{ p: 2, bgcolor: "action.hover", width: "100%" }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Batch Details ({batches.length} batches)
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {batches.map((batch) => (
              <Paper
                key={batch.id}
                variant="outlined"
                onClick={() => {
                  if (batch.batch_code) {
                    setPODrawerBatchCode(batch.batch_code);
                    setPODrawerOpen(true);
                  }
                }}
                sx={{
                  p: 1.5, minWidth: 220, maxWidth: 280, flex: "1 1 220px",
                  cursor: batch.batch_code ? "pointer" : "default",
                  transition: "border-color 0.2s, background-color 0.2s",
                  "&:hover": batch.batch_code ? {
                    borderColor: "primary.main",
                    bgcolor: "action.selected",
                  } : {},
                }}
              >
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Typography variant="caption" sx={{ fontFamily: "monospace", bgcolor: "action.selected", px: 0.5, borderRadius: 0.5 }}>
                    {batch.batch_code || "Own Stock"}
                  </Typography>
                  {batch.is_shared ? (
                    <Chip label="Shared" size="small" color="info" variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                  ) : (
                    <Chip label="Own" size="small" variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                  )}
                </Box>
                <Typography variant="body2" fontWeight={600}>
                  {batch.current_qty.toLocaleString()} {UNIT_LABELS[(batch.material?.unit || "piece") as MaterialUnit] || batch.material?.unit}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  @ ₹{(batch.avg_unit_cost || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/unit
                </Typography>
                {batch.last_received_date && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    Received: {dayjs(batch.last_received_date).format("DD MMM YYYY")}
                  </Typography>
                )}
                {batch.batch_code && batch.is_vendor_paid === true && batch.paid_by_site_name && (
                  <Typography variant="caption" color="success.main" display="block">
                    Paid by: {batch.paid_by_site_name}
                  </Typography>
                )}
                {batch.batch_code && batch.is_vendor_paid === false && (
                  <Typography variant="caption" color="warning.main" display="block">
                    Vendor payment pending
                  </Typography>
                )}
                {batch.batch_code && (
                  <Typography variant="caption" color="primary.main" display="block" sx={{ mt: 0.5 }}>
                    Click to view PO
                  </Typography>
                )}
              </Paper>
            ))}
          </Box>
        </Box>
      );
    },
    []
  );

  // Completed stock table columns
  const completedStockColumns = useMemo<MRT_ColumnDef<CompletedStockItem>[]>(
    () => [
      {
        accessorKey: "material_name",
        header: "Material",
        size: 200,
        Cell: ({ row }) => (
          <Box>
            <Typography variant="body2" fontWeight={500}>
              {row.original.material_name}
            </Typography>
            {row.original.material_code && (
              <Typography variant="caption" color="text.secondary">
                {row.original.material_code}
              </Typography>
            )}
            {row.original.brand_name && (
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                {row.original.brand_name}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "batch_code",
        header: "Batch",
        size: 100,
        Cell: ({ row }) => row.original.batch_code || "-",
      },
      {
        accessorKey: "original_qty",
        header: "Original Qty",
        size: 110,
        Cell: ({ row }) =>
          row.original.original_qty > 0
            ? `${row.original.original_qty} ${row.original.unit}`
            : "-",
      },
      {
        accessorKey: "avg_unit_cost",
        header: "Avg Cost",
        size: 100,
        Cell: ({ row }) =>
          row.original.avg_unit_cost
            ? `₹${row.original.avg_unit_cost.toLocaleString("en-IN", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}`
            : "-",
      },
      {
        accessorKey: "completion_date",
        header: "Completed On",
        size: 120,
        Cell: ({ row }) =>
          row.original.completion_date
            ? dayjs(row.original.completion_date).format("DD MMM YYYY")
            : "-",
      },
      {
        accessorKey: "last_received_date",
        header: "Received On",
        size: 120,
        Cell: ({ row }) =>
          row.original.last_received_date
            ? dayjs(row.original.last_received_date).format("DD MMM YYYY")
            : "-",
      },
      {
        id: "stock_type",
        header: "Type",
        size: 100,
        Cell: ({ row }) =>
          row.original.is_shared ? (
            <Chip label="Group" size="small" color="info" variant="outlined" />
          ) : (
            <Chip label="Site" size="small" variant="outlined" />
          ),
      },
    ],
    []
  );

  // Stock row actions - with Use button
  const renderStockRowActions = useCallback(
    ({ row }: { row: { original: ExtendedStockInventory } }) => (
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <Tooltip title="Record Usage">
          <IconButton
            size="small"
            color="primary"
            onClick={() => handleRecordUsage(row.original)}
            disabled={!canEdit || row.original.available_qty <= 0}
          >
            <UseIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Add Stock">
          <IconButton
            size="small"
            color="success"
            onClick={() =>
              setAdjustmentDialog({
                open: true,
                stock: row.original,
                type: "add",
              })
            }
            disabled={!canEdit}
          >
            <AddIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Remove Stock">
          <IconButton
            size="small"
            color="error"
            onClick={() =>
              setAdjustmentDialog({
                open: true,
                stock: row.original,
                type: "remove",
              })
            }
            disabled={!canEdit}
          >
            <RemoveIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    ),
    [canEdit]
  );

  // Usage table columns (grouped by usage_group_id)
  const usageColumns = useMemo<MRT_ColumnDef<GroupedUsageRecord>[]>(
    () => [
      {
        accessorKey: "usage_date",
        header: "Date",
        size: 100,
        Cell: ({ row }) => dayjs(row.original.usage_date).format("DD MMM"),
      },
      {
        accessorKey: "material_id",
        header: "Material",
        size: 200,
        Cell: ({ row }) => (
          <Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap" }}>
              <Typography variant="body2" fontWeight={500}>
                {row.original.material?.name}
              </Typography>
              {row.original.is_shared_usage && (
                <Chip
                  label="Inter-Site"
                  size="small"
                  color="info"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
              {row.original.is_grouped && (
                <Chip
                  label={`${row.original.child_count} batches`}
                  size="small"
                  color="secondary"
                  variant="outlined"
                  sx={{ height: 18, fontSize: "0.65rem" }}
                />
              )}
            </Box>
            {row.original.brand && (
              <Typography variant="caption" color="text.secondary">
                {(row.original.brand as { brand_name?: string })?.brand_name}
              </Typography>
            )}
            {row.original.is_shared_usage && row.original.paid_by_site_name && (
              <Typography variant="caption" color="info.main" display="block">
                Used by {row.original.paid_by_site_name}
              </Typography>
            )}
          </Box>
        ),
      },
      {
        accessorKey: "total_quantity",
        header: "Quantity",
        size: 100,
        Cell: ({ row }) => {
          const unit = row.original.material?.unit || "piece";
          return `${row.original.total_quantity} ${UNIT_LABELS[unit as MaterialUnit] || unit}`;
        },
      },
      {
        accessorKey: "total_cost",
        header: "Cost",
        size: 100,
        Cell: ({ row }) =>
          row.original.total_cost
            ? `₹${row.original.total_cost.toLocaleString()}`
            : "-",
      },
      {
        accessorKey: "work_description",
        header: "Work",
        size: 150,
        Cell: ({ row }) => (
          <Typography
            variant="body2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 150,
            }}
          >
            {row.original.work_description || "-"}
          </Typography>
        ),
      },
      {
        accessorKey: "section_id",
        header: "Section",
        size: 120,
        Cell: ({ row }) => (row.original.section as { name?: string })?.name || "-",
      },
    ],
    []
  );

  // Usage row actions (for grouped records)
  const renderUsageRowActions = useCallback(
    ({ row }: { row: { original: GroupedUsageRecord } }) => {
      const group = row.original;

      // Only show "View only" for usage records from OTHER sites
      const isOtherSiteUsage = group.is_shared_usage &&
                                group.site_id !== selectedSite?.id;

      if (isOtherSiteUsage) {
        return (
          <Tooltip title="Recorded by another site in the group">
            <Typography variant="caption" color="text.secondary">
              View only
            </Typography>
          </Tooltip>
        );
      }

      return (
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {canEdit && (
            <>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  color="primary"
                  onClick={() => setUsageEditDialog({ open: true, record: group })}
                >
                  <EditIcon fontSize="small" />
                </IconButton>
              </Tooltip>
              <Tooltip title={group.is_grouped ? "Delete all allocations" : "Delete"}>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setUsageDeleteDialog({ open: true, record: group })}
                >
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      );
    },
    [canEdit, selectedSite?.id]
  );

  // Detail panel for grouped usage rows — shows individual batch allocations
  const renderUsageDetailPanel = useCallback(
    ({ row }: { row: { original: GroupedUsageRecord } }) => {
      if (!row.original.is_grouped) return null;
      const children = row.original.children;
      return (
        <Box sx={{ p: 2, bgcolor: "action.hover", width: "100%" }}>
          <Typography variant="subtitle2" sx={{ mb: 1 }}>
            Batch Allocations ({children.length} batches)
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
            {children.map((child) => {
              const unit = child.material?.unit || "piece";
              return (
                <Paper
                  key={child.id}
                  variant="outlined"
                  sx={{ p: 1.5, minWidth: 200, maxWidth: 260, flex: "1 1 200px" }}
                >
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                    <Typography
                      variant="caption"
                      sx={{
                        fontFamily: "monospace",
                        bgcolor: "action.selected",
                        px: 0.5,
                        borderRadius: 0.5,
                      }}
                    >
                      {child.is_shared_usage ? "Shared Stock" : "Own Stock"}
                    </Typography>
                  </Box>
                  <Typography variant="body2" fontWeight={600}>
                    {child.quantity.toLocaleString()} {UNIT_LABELS[unit as MaterialUnit] || unit}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    @ ₹{(child.unit_cost || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}/unit
                  </Typography>
                  {child.total_cost != null && (
                    <Typography variant="caption" color="text.secondary" display="block">
                      = ₹{child.total_cost.toLocaleString()}
                    </Typography>
                  )}
                </Paper>
              );
            })}
          </Box>
        </Box>
      );
    },
    []
  );

  return (
    <Box>
      <Breadcrumbs />

      <PageHeader
        title="Inventory"
        actions={
          !isMobile && canEdit ? (
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="contained"
                startIcon={<UseIcon />}
                onClick={() => setBulkUsageDialogOpen(true)}
              >
                Record Usage
              </Button>
              {mainTab === "stock" && (
                <Button
                  variant="outlined"
                  startIcon={<AddIcon />}
                  onClick={() => setAddStockDialog(true)}
                >
                  Manual Adjustment
                </Button>
              )}
            </Box>
          ) : null
        }
      />

      <MaterialWorkflowBar currentStep="inventory" />

      {/* Unified Summary Cards */}
      <Grid container spacing={2} sx={{ mb: 2 }}>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <InventoryIcon fontSize="small" color="primary" />
                <Typography variant="caption" color="text.secondary">
                  Total Items
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={600}>
                {stock.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">
                Stock Value
              </Typography>
              <Typography variant="h5" fontWeight={600}>
                ₹{totalStockValue.toLocaleString("en-IN", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ borderLeft: 3, borderColor: "error.main" }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Typography variant="caption" color="text.secondary">
                Low Stock Items
              </Typography>
              <Typography variant="h5" fontWeight={600} color="error.main">
                {lowStockAlerts.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid size={{ xs: 6, md: 3 }}>
          <Card sx={{ borderLeft: 3, borderColor: "info.main" }}>
            <CardContent sx={{ py: 1.5, "&:last-child": { pb: 1.5 } }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 0.5 }}>
                <HistoryIcon fontSize="small" color="info" />
                <Typography variant="caption" color="text.secondary">
                  Today&apos;s Usage
                </Typography>
              </Box>
              <Typography variant="h5" fontWeight={600} color="info.main">
                {todaySummary?.totalEntries || 0}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Tabs: Stock | Usage History */}
      <Paper sx={{ mb: 2 }}>
        <Tabs
          value={mainTab}
          onChange={(_, newValue) => setMainTab(newValue as MainTabType)}
          sx={{ borderBottom: 1, borderColor: "divider" }}
        >
          <Tab
            label="Stock Inventory"
            value="stock"
            icon={<InventoryIcon />}
            iconPosition="start"
          />
          <Tab
            label="Usage History"
            value="usage"
            icon={<HistoryIcon />}
            iconPosition="start"
          />
        </Tabs>
      </Paper>

      {/* Stock Tab Content */}
      {mainTab === "stock" && (
        <>
          {/* Low Stock Alert */}
          {lowStockAlerts.length > 0 && (
            <Alert
              severity="warning"
              icon={<TrendingDownIcon />}
              sx={{ mb: 2 }}
              action={
                <Button size="small" onClick={() => setSearchTerm("")}>
                  View All
                </Button>
              }
            >
              {lowStockAlerts.length} item(s) are below reorder level:{" "}
              {lowStockAlerts
                .slice(0, 3)
                .map((a) => a.material_name)
                .join(", ")}
              {lowStockAlerts.length > 3 && ` and ${lowStockAlerts.length - 3} more`}
            </Alert>
          )}

          {/* Stock Type Tabs */}
          <Paper sx={{ mb: 2 }}>
            <Tabs
              value={stockTab}
              onChange={(_, newValue) => setStockTab(newValue as StockTabType)}
              variant={isMobile ? "scrollable" : "standard"}
              scrollButtons={isMobile ? "auto" : false}
              sx={{ borderBottom: 1, borderColor: "divider" }}
            >
              <Tab
                label="All Stock"
                value="all"
                icon={<InventoryIcon />}
                iconPosition="start"
              />
              <Tab
                label={`Own Purchases${ownStockCount > 0 ? ` (${ownStockCount})` : ""}`}
                value="own"
                icon={<OwnStockIcon />}
                iconPosition="start"
              />
              <Tab
                label={`Group Stock${groupStockCount > 0 ? ` (${groupStockCount})` : ""}`}
                value="group"
                icon={<GroupsIcon />}
                iconPosition="start"
              />
              <Tab
                label={`Completed${completedStock.length > 0 ? ` (${completedStock.length})` : ""}`}
                value="completed"
                icon={<HistoryIcon />}
                iconPosition="start"
              />
            </Tabs>
          </Paper>

          {/* Search + View Mode Toggle */}
          <Box sx={{ mb: 2, display: "flex", gap: 2, alignItems: "center", flexWrap: "wrap" }}>
            <TextField
              id="inventory-search"
              size="small"
              placeholder="Search materials, batch codes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              slotProps={{
                input: {
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" />
                    </InputAdornment>
                  ),
                },
              }}
              sx={{ minWidth: 300 }}
            />
            {stockTab !== "completed" && (
              <ToggleButtonGroup
                value={stockViewMode}
                exclusive
                onChange={(_, value) => value && setStockViewMode(value)}
                size="small"
              >
                <ToggleButton value="consolidated">
                  <Tooltip title="By Material (consolidated)">
                    <ViewListIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="batch">
                  <Tooltip title="By Batch (detailed)">
                    <ViewModuleIcon fontSize="small" />
                  </Tooltip>
                </ToggleButton>
              </ToggleButtonGroup>
            )}
          </Box>

          {/* Stock Table - Active Stock (All, Site, Shared) */}
          {stockTab !== "completed" && stockViewMode === "consolidated" && (
            <DataTable
              columns={consolidatedColumns}
              data={consolidatedStock}
              isLoading={stockLoading}
              enableRowActions={canEdit}
              renderRowActions={renderConsolidatedRowActions}
              enableExpanding
              renderDetailPanel={renderConsolidatedDetailPanel}
              muiDetailPanelProps={{ sx: { "& > td": { width: "100%" } } }}
              mobileHiddenColumns={["batches", "weighted_avg_cost", "total_value", "stock_type"]}
              initialState={{
                sorting: [{ id: "material_name", desc: false }],
              }}
            />
          )}

          {stockTab !== "completed" && stockViewMode === "batch" && (
            <DataTable
              columns={stockColumns}
              data={filteredStock}
              isLoading={stockLoading}
              enableRowActions={canEdit}
              renderRowActions={renderStockRowActions}
              mobileHiddenColumns={["batch_code", "avg_unit_cost", "value", "paid_by", "stock_type", "location.name"]}
              initialState={{
                sorting: [{ id: "material.name", desc: false }],
              }}
            />
          )}

          {/* Stock Table - Completed Stock */}
          {stockTab === "completed" && (
            <>
              <Alert severity="info" sx={{ mb: 2 }}>
                Showing materials that have been fully consumed (current quantity = 0). This helps track historical purchases and usage patterns.
              </Alert>
              <DataTable
                columns={completedStockColumns}
                data={filteredCompletedStock}
                isLoading={completedLoading}
                enableRowActions={false}
                mobileHiddenColumns={["avg_unit_cost", "last_received_date"]}
                initialState={{
                  sorting: [{ id: "completion_date", desc: true }],
                }}
              />
            </>
          )}
        </>
      )}

      {/* Usage History Tab Content */}
      {mainTab === "usage" && (
        <>
          {otherSiteUsageCount > 0 && (
            <Box sx={{ mb: 1, display: "flex", justifyContent: "flex-end" }}>
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={showOtherSiteUsage}
                    onChange={(e) => setShowOtherSiteUsage(e.target.checked)}
                  />
                }
                label={`Show usage by other sites (${otherSiteUsageCount})`}
                slotProps={{ typography: { variant: "body2", color: "text.secondary" } }}
              />
            </Box>
          )}
        <DataTable
          columns={usageColumns}
          data={filteredGroupedUsage}
          isLoading={usageLoading}
          enableRowActions={canEdit}
          renderRowActions={renderUsageRowActions}
          enableExpanding
          renderDetailPanel={renderUsageDetailPanel}
          muiDetailPanelProps={{ sx: { "& > td": { width: "100%" } } }}
          mobileHiddenColumns={["total_cost", "section_id"]}
          initialState={{
            sorting: [{ id: "usage_date", desc: true }],
          }}
        />
        </>
      )}

      {/* Mobile FAB */}
      {isMobile && canEdit && (
        <Fab
          color="primary"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => setBulkUsageDialogOpen(true)}
        >
          <UseIcon />
        </Fab>
      )}

      {/* Usage Entry Drawer (for single item from table row) */}
      <UsageEntryDrawer
        open={usageDrawerOpen}
        onClose={() => {
          setUsageDrawerOpen(false);
          setPreSelectedStock(null);
          setPreSelectedConsolidated(null);
        }}
        siteId={selectedSite?.id || ""}
        stock={stock}
        preSelectedStock={preSelectedStock}
        preSelectedConsolidated={preSelectedConsolidated}
      />

      {/* Bulk Usage Entry Dialog */}
      <BulkUsageEntryDialog
        open={bulkUsageDialogOpen}
        onClose={() => setBulkUsageDialogOpen(false)}
        siteId={selectedSite?.id || ""}
        stock={stock}
        siteGroupId={groupMembership?.groupId}
        siteName={selectedSite?.name}
      />

      {/* Usage Delete Confirmation Dialog */}
      <UsageDeleteConfirmDialog
        open={usageDeleteDialog.open}
        usageRecord={usageDeleteDialog.record}
        onClose={() => setUsageDeleteDialog({ open: false, record: null })}
        onConfirm={async () => {
          if (usageDeleteDialog.record) {
            const group = usageDeleteDialog.record;
            // Delete all children in the group sequentially
            for (const child of group.children) {
              await deleteUsage.mutateAsync({
                id: child.id,
                siteId: selectedSite?.id || "",
                is_shared_usage: child.is_shared_usage || false,
              });
            }
            setUsageDeleteDialog({ open: false, record: null });
          }
        }}
        isDeleting={deleteUsage.isPending}
        isGroupStock={usageDeleteDialog.record?.is_shared_usage || false}
      />

      {/* Usage Edit Dialog */}
      <UsageEditDialog
        open={usageEditDialog.open}
        usageRecord={usageEditDialog.record}
        currentStockQty={
          stock.find(
            (s) =>
              s.material_id === usageEditDialog.record?.material_id &&
              (s.brand_id === usageEditDialog.record?.brand_id ||
                (!s.brand_id && !usageEditDialog.record?.brand_id))
          )?.current_qty || 0
        }
        onClose={() => setUsageEditDialog({ open: false, record: null })}
        onSave={async (data) => {
          if (usageEditDialog.record) {
            const group = usageEditDialog.record;
            if (group.is_grouped) {
              // For grouped records, update work_description on all children
              for (const child of group.children) {
                await updateUsage.mutateAsync({
                  id: child.id,
                  siteId: selectedSite?.id || "",
                  data: { quantity: child.quantity, work_description: data.work_description },
                });
              }
              setUsageEditDialog({ open: false, record: null });
            } else {
              // Single record — normal update
              updateUsage.mutate(
                {
                  id: group.representative.id,
                  siteId: selectedSite?.id || "",
                  data,
                },
                {
                  onSuccess: () => setUsageEditDialog({ open: false, record: null }),
                }
              );
            }
          }
        }}
        isSaving={updateUsage.isPending}
        isGroupStock={usageEditDialog.record?.is_shared_usage || false}
      />

      {/* Stock Adjustment Dialog */}
      <StockAdjustmentDialog
        open={adjustmentDialog.open}
        onClose={() =>
          setAdjustmentDialog({ open: false, stock: null, type: "add" })
        }
        stock={adjustmentDialog.stock}
        type={adjustmentDialog.type}
        onSubmit={async (qty, notes) => {
          if (!adjustmentDialog.stock) return;
          await stockAdjustment.mutateAsync({
            inventory_id: adjustmentDialog.stock.id,
            adjustment_qty: adjustmentDialog.type === "add" ? qty : -qty,
            adjustment_type: adjustmentDialog.type === "add" ? "adjustment" : "wastage",
            notes,
          });
          setAdjustmentDialog({ open: false, stock: null, type: "add" });
        }}
        isSubmitting={stockAdjustment.isPending}
      />

      {/* Add Initial Stock Dialog */}
      <AddStockDialog
        open={addStockDialog}
        onClose={() => setAddStockDialog(false)}
        siteId={selectedSite?.id || ""}
        materials={materials}
        onSubmit={async (data) => {
          await addInitialStock.mutateAsync(data);
          setAddStockDialog(false);
        }}
        isSubmitting={addInitialStock.isPending}
      />

      {/* PO Details Drawer (opened from batch card click) */}
      <PODetailsDrawer
        open={poDrawerOpen}
        onClose={() => {
          setPODrawerOpen(false);
          setPODrawerBatchCode(null);
        }}
        purchaseOrder={batchPOData?.poId ? { id: batchPOData.poId } as any : null}
        contextBanner={
          batchPOData && batchPOData.payingSiteId !== selectedSite?.id ? (
            <Alert severity="info" sx={{ mb: 2 }}>
              Purchased by <strong>{batchPOData.payingSiteName || "another site"}</strong> (shared group stock)
            </Alert>
          ) : undefined
        }
      />
    </Box>
  );
}

// Stock Adjustment Dialog Component
function StockAdjustmentDialog({
  open,
  onClose,
  stock,
  type,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  stock: StockInventoryWithDetails | null;
  type: "add" | "remove";
  onSubmit: (qty: number, notes: string) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [qty, setQty] = useState("");
  const [notes, setNotes] = useState("");

  const handleSubmit = async () => {
    const quantity = parseFloat(qty);
    if (isNaN(quantity) || quantity <= 0) return;
    await onSubmit(quantity, notes);
    setQty("");
    setNotes("");
  };

  if (!stock) return null;

  const unit = stock.material?.unit || "piece";
  const maxRemove = type === "remove" ? stock.available_qty : undefined;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        {type === "add" ? "Add Stock" : "Remove Stock"}: {stock.material?.name}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Typography variant="body2" color="text.secondary">
            Current stock: {stock.current_qty} {UNIT_LABELS[unit] || unit}
          </Typography>

          <TextField
            fullWidth
            label={`Quantity (${UNIT_LABELS[unit] || unit})`}
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            slotProps={{
              input: {
                inputProps: {
                  min: 0.001,
                  max: maxRemove,
                  step: 0.001,
                },
              },
            }}
            autoFocus
          />

          <TextField
            fullWidth
            label="Notes / Reason"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            multiline
            rows={2}
            placeholder={
              type === "remove"
                ? "e.g., Damaged, Lost, Correction"
                : "e.g., Purchase, Return, Correction"
            }
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          color={type === "add" ? "success" : "error"}
          onClick={handleSubmit}
          disabled={isSubmitting || !qty || parseFloat(qty) <= 0}
        >
          {isSubmitting ? "Saving..." : type === "add" ? "Add" : "Remove"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

// Adjustment reasons for manual stock entry
const ADJUSTMENT_REASONS = [
  { value: "initial_setup", label: "Initial Setup", description: "Setting up inventory for the first time" },
  { value: "count_correction", label: "Physical Count Correction", description: "Discrepancy found during physical count" },
  { value: "transfer_in", label: "Transfer In", description: "Received from another site without PO" },
  { value: "donation", label: "Donation/Gift", description: "Received without purchase" },
  { value: "other", label: "Other", description: "Other reason (specify in notes)" },
] as const;

// Manual Stock Adjustment Dialog Component (renamed from Add Stock)
function AddStockDialog({
  open,
  onClose,
  siteId,
  materials,
  onSubmit,
  isSubmitting,
}: {
  open: boolean;
  onClose: () => void;
  siteId: string;
  materials: MaterialWithDetails[];
  onSubmit: (data: {
    site_id: string;
    material_id: string;
    quantity: number;
    unit_cost: number;
  }) => Promise<void>;
  isSubmitting: boolean;
}) {
  const [materialId, setMaterialId] = useState("");
  const [qty, setQty] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [reason, setReason] = useState<string>("initial_setup");

  const selectedMaterial = materials.find((m) => m.id === materialId);
  const unit = selectedMaterial?.unit || "piece";

  const handleSubmit = async () => {
    const quantity = parseFloat(qty);
    const cost = parseFloat(unitCost);
    if (!materialId || isNaN(quantity) || quantity <= 0 || isNaN(cost) || cost < 0)
      return;

    await onSubmit({
      site_id: siteId,
      material_id: materialId,
      quantity,
      unit_cost: cost,
    });

    setMaterialId("");
    setQty("");
    setUnitCost("");
    setReason("initial_setup");
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Manual Stock Adjustment</DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <Alert severity="info" sx={{ mb: 1 }}>
            Use this for stock not from purchases. For materials ordered through vendors, use Purchase Orders &rarr; Delivery &rarr; Verification flow.
          </Alert>

          <FormControl fullWidth>
            <InputLabel>Reason for Adjustment</InputLabel>
            <Select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              label="Reason for Adjustment"
            >
              {ADJUSTMENT_REASONS.map((r) => (
                <MenuItem key={r.value} value={r.value}>
                  {r.label}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth>
            <InputLabel>Material</InputLabel>
            <Select
              value={materialId}
              onChange={(e) => setMaterialId(e.target.value)}
              label="Material"
            >
              {materials.map((m) => (
                <MenuItem key={m.id} value={m.id}>
                  {m.name} {m.code ? `(${m.code})` : ""}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <TextField
            fullWidth
            label={`Quantity (${UNIT_LABELS[unit] || unit})`}
            type="number"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            slotProps={{
              input: {
                inputProps: { min: 0.001, step: 0.001 },
              },
            }}
          />

          <TextField
            fullWidth
            label="Unit Cost (₹)"
            type="number"
            value={unitCost}
            onChange={(e) => setUnitCost(e.target.value)}
            slotProps={{
              input: {
                inputProps: { min: 0, step: 0.01 },
                startAdornment: (
                  <InputAdornment position="start">₹</InputAdornment>
                ),
              },
            }}
          />
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={
            isSubmitting ||
            !materialId ||
            !qty ||
            parseFloat(qty) <= 0 ||
            !unitCost
          }
        >
          {isSubmitting ? "Adding..." : "Add Adjustment"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
