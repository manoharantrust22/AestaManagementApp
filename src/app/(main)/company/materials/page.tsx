"use client";

import { useMemo, useState, useCallback, useDeferredValue } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Typography,
  TextField,
  InputAdornment,
  Fab,
  Tooltip,
  Link,
  Tabs,
  Tab,
  FormControl,
  Select,
  MenuItem,
  InputLabel,
  Snackbar,
  Alert,
} from "@mui/material";
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Store as StoreIcon,
  Whatshot as FireIcon,
  Visibility as ViewIcon,
} from "@mui/icons-material";
import DataTable, { type MRT_ColumnDef, type PaginationState } from "@/components/common/DataTable";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasEditPermission } from "@/lib/permissions";
import { formatCurrency, formatDate } from "@/lib/formatters";
import {
  usePaginatedMaterials,
  useMaterialCategories,
  useDeleteMaterial,
  type MaterialSortOption,
} from "@/hooks/queries/useMaterials";
import { useMaterialVendorCounts } from "@/hooks/queries/useVendorInventory";
import {
  useMaterialOrderStats,
  useMaterialBestPrices,
  useMaterialAuditInfo,
} from "@/hooks/queries/useMaterialOrderStats";
const MaterialDialog = dynamic(
  () => import("@/components/materials/MaterialDialog"),
  { ssr: false }
);
import VendorDrawer from "@/components/materials/VendorDrawer";
import VariantSubTable from "@/components/materials/VariantSubTable";
import BrandSubTable from "@/components/materials/BrandSubTable";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import type {
  MaterialWithDetails,
  MaterialUnit,
} from "@/types/material.types";

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

// Category tab mapping - which category codes belong to which tab
const CATEGORY_TAB_MAPPING: Record<string, string[]> = {
  civil: ["CEM", "STL", "AGG", "BRK"],
  electrical: ["ELC"],
  plumbing: ["PLB"],
  painting: ["PNT", "WPF"],
  doors_windows: ["WOD", "GLS"],
  hardware: ["HRD", "MSC"],
  tiles: ["TIL"],
  all: [], // All categories
};

const CATEGORY_TABS = [
  { id: "all", label: "All" },
  { id: "civil", label: "Civil" },
  { id: "electrical", label: "Electrical" },
  { id: "plumbing", label: "Plumbing" },
  { id: "painting", label: "Painting" },
  { id: "doors_windows", label: "Doors & Windows" },
  { id: "hardware", label: "Hardware" },
  { id: "tiles", label: "Tiles" },
];

const SORT_OPTIONS: { value: MaterialSortOption; label: string }[] = [
  { value: "frequently_used", label: "Frequently Used" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "recently_added", label: "Recently Added" },
  { value: "most_vendors", label: "Most Vendors" },
  { value: "lowest_price", label: "Lowest Price" },
];

export default function MaterialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<MaterialWithDetails | null>(null);
  const [selectedTab, setSelectedTab] = useState<string>(searchParams.get("tab") || "all");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<MaterialSortOption>("alphabetical");
  const [vendorDrawerMaterial, setVendorDrawerMaterial] = useState<MaterialWithDetails | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; material: MaterialWithDetails | null }>({
    open: false,
    material: null,
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });
  // Server-side pagination state
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });

  const { userProfile } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = hasEditPermission(userProfile?.role);

  // Debounce search input for server-side filtering
  const deferredSearch = useDeferredValue(searchInput);

  // Fetch categories first (needed for tab filtering)
  const { data: categories = [] } = useMaterialCategories();

  // Get category IDs for selected tab
  const tabCategoryIds = useMemo(() => {
    if (selectedTab === "all") return null;

    const categoryCodes = CATEGORY_TAB_MAPPING[selectedTab] || [];
    return categories
      .filter((c) => categoryCodes.includes(c.code || "") || categoryCodes.some((code) => c.code?.startsWith(code + "-")))
      .map((c) => c.id);
  }, [selectedTab, categories]);

  // Fetch paginated materials with server-side filtering
  const { data: paginatedData, isLoading } = usePaginatedMaterials(
    pagination,
    tabCategoryIds,
    deferredSearch.length >= 2 ? deferredSearch : undefined,
    sortBy
  );

  const materials = paginatedData?.data || [];
  const totalCount = paginatedData?.totalCount || 0;

  // Defer loading of supplementary data until materials are loaded
  const materialsReady = !isLoading && materials.length > 0;
  const { data: vendorCounts = {} } = useMaterialVendorCounts();
  const { data: orderStats } = useMaterialOrderStats();
  const { data: bestPrices } = useMaterialBestPrices();
  const { data: auditInfo } = useMaterialAuditInfo();
  const deleteMaterial = useDeleteMaterial();

  // Reset pagination when filters change
  const handleTabChange = useCallback((event: React.SyntheticEvent, newValue: string) => {
    setSelectedTab(newValue);
    setPagination(prev => ({ ...prev, pageIndex: 0 })); // Reset to first page
    // Update URL without navigation
    const params = new URLSearchParams(window.location.search);
    if (newValue === "all") {
      params.delete("tab");
    } else {
      params.set("tab", newValue);
    }
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState({}, "", newUrl);
  }, []);

  // Handle pagination change
  const handlePaginationChange = useCallback((newPagination: PaginationState) => {
    setPagination(newPagination);
  }, []);

  // Client-side sorting for sort options that need supplementary data
  // Server-side handles: alphabetical, recently_added
  // Client-side handles: frequently_used, most_vendors, lowest_price
  const sortedMaterials = useMemo(() => {
    // If using server-side sort options, return as-is
    if (sortBy === "alphabetical" || sortBy === "recently_added") {
      return materials;
    }

    // Client-side sort for options requiring supplementary data
    return [...materials].sort((a, b) => {
      switch (sortBy) {
        case "frequently_used": {
          const aOrders = orderStats?.get(a.id)?.order_count || 0;
          const bOrders = orderStats?.get(b.id)?.order_count || 0;
          if (bOrders !== aOrders) return bOrders - aOrders;
          return a.name.localeCompare(b.name);
        }
        case "most_vendors": {
          const aVendors = vendorCounts[a.id] || 0;
          const bVendors = vendorCounts[b.id] || 0;
          if (bVendors !== aVendors) return bVendors - aVendors;
          return a.name.localeCompare(b.name);
        }
        case "lowest_price": {
          const aPrice = bestPrices?.get(a.id)?.unit_price || 999999;
          const bPrice = bestPrices?.get(b.id)?.unit_price || 999999;
          if (aPrice !== bPrice) return aPrice - bPrice;
          return a.name.localeCompare(b.name);
        }
        default:
          return 0;
      }
    });
  }, [materials, sortBy, orderStats, vendorCounts, bestPrices]);

  // Add variant/brand count display text to materials (variant_count already from server)
  const materialsWithVariantText = useMemo(() => {
    return sortedMaterials.map((material) => {
      const variantCount = material.variant_count || 0;
      const brandCount = material.brands?.filter(b => b.is_active)?.length || 0;

      // Determine if row can expand (has variants OR brands)
      const canExpand = variantCount > 0 || brandCount > 0;

      return {
        ...material,
        _variantText: variantCount > 0
          ? `${variantCount} variant${variantCount !== 1 ? "s" : ""}`
          : null,
        _variantCount: variantCount,
        _brandCount: brandCount,
        _canExpand: canExpand,
      };
    });
  }, [sortedMaterials]);

  const handleOpenDialog = useCallback((material?: MaterialWithDetails) => {
    if (material) {
      setEditingMaterial(material);
    } else {
      setEditingMaterial(null);
    }
    setDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setDialogOpen(false);
    setEditingMaterial(null);
  }, []);

  const handleDeleteClick = useCallback((material: MaterialWithDetails) => {
    setDeleteConfirm({ open: true, material });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.material) return;
    const materialName = deleteConfirm.material.name;
    try {
      await deleteMaterial.mutateAsync(deleteConfirm.material.id);
      setDeleteConfirm({ open: false, material: null });
      setSnackbar({
        open: true,
        message: `"${materialName}" deleted successfully`,
        severity: "success",
      });
    } catch (error) {
      console.error("Failed to delete material:", error);
      setDeleteConfirm({ open: false, material: null });
      setSnackbar({
        open: true,
        message: `Failed to delete material: ${error instanceof Error ? error.message : "Unknown error"}`,
        severity: "error",
      });
    }
  }, [deleteConfirm.material, deleteMaterial]);

  const handleDeleteCancel = useCallback(() => {
    setDeleteConfirm({ open: false, material: null });
  }, []);

  const handleSnackbarClose = useCallback(() => {
    setSnackbar((prev) => ({ ...prev, open: false }));
  }, []);

  const handleOpenVendorDrawer = useCallback((material: MaterialWithDetails) => {
    setVendorDrawerMaterial(material);
  }, []);

  const handleCloseVendorDrawer = useCallback(() => {
    setVendorDrawerMaterial(null);
  }, []);

  const handleCreatePO = useCallback((vendorId: string, materialId: string) => {
    // Navigate to PO creation with pre-selected vendor and material
    router.push(`/company/purchase-orders/new?vendor=${vendorId}&material=${materialId}`);
  }, [router]);

  // Table columns
  const columns = useMemo<MRT_ColumnDef<MaterialWithDetails & { _variantText?: string | null; _variantCount?: number; _brandCount?: number; _canExpand?: boolean }>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Material",
        size: 280,
        Cell: ({ row }) => {
          const isFrequent = (orderStats?.get(row.original.id)?.order_count || 0) >= 3;
          const audit = auditInfo?.get(row.original.id);

          return (
            <Tooltip
              title={
                audit ? (
                  <Box>
                    <Typography variant="caption" display="block">
                      Created by: {audit.created_by_name || "Unknown"}
                    </Typography>
                    <Typography variant="caption" display="block">
                      Created: {formatDate(audit.created_at)}
                    </Typography>
                    <Typography variant="caption" display="block">
                      Last edited: {formatDate(audit.updated_at)}
                    </Typography>
                  </Box>
                ) : (
                  ""
                )
              }
              arrow
              placement="top"
            >
              <Box>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  {isFrequent && (
                    <FireIcon
                      fontSize="small"
                      sx={{ color: "warning.main", fontSize: "1rem" }}
                    />
                  )}
                  <Link
                    component="button"
                    variant="body2"
                    fontWeight={500}
                    onClick={() => router.push(`/company/materials/${row.original.id}`)}
                    sx={{ textAlign: "left", cursor: "pointer" }}
                  >
                    {row.original.name}
                  </Link>
                </Box>
                {row.original.code && (
                  <Typography variant="caption" color="text.secondary" display="block">
                    {row.original.code}
                  </Typography>
                )}
              </Box>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "unit",
        header: "Unit",
        size: 70,
        Cell: ({ row }) => UNIT_LABELS[row.original.unit] || row.original.unit,
      },
      {
        id: "variants",
        header: "Sizes/Variants",
        size: 160,
        enableSorting: false,
        Cell: ({ row }) => {
          const variantText = row.original._variantText;
          const variantCount = row.original._variantCount || 0;

          if (!variantText && variantCount === 0) {
            return <Typography variant="caption" color="text.secondary">-</Typography>;
          }

          return (
            <Tooltip title={variantText || ""} placement="top">
              <Typography
                variant="body2"
                sx={{
                  maxWidth: 150,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {variantText || `${variantCount} variant${variantCount !== 1 ? "s" : ""}`}
              </Typography>
            </Tooltip>
          );
        },
      },
      {
        id: "vendors",
        header: "Vendors",
        size: 90,
        enableSorting: false,
        Cell: ({ row }) => {
          const count = vendorCounts[row.original.id] || 0;

          return count > 0 ? (
            <Chip
              icon={<StoreIcon />}
              label={count}
              size="small"
              color="primary"
              variant="outlined"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenVendorDrawer(row.original);
              }}
              clickable
            />
          ) : (
            <Button
              size="small"
              variant="text"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenVendorDrawer(row.original);
              }}
              sx={{ minWidth: 0, p: 0.5, fontSize: "0.75rem" }}
            >
              Add
            </Button>
          );
        },
      },
      {
        id: "best_price",
        header: "Best Price",
        size: 130,
        enableSorting: false,
        Cell: ({ row }) => {
          const priceInfo = bestPrices?.get(row.original.id);

          if (!priceInfo) {
            return <Typography variant="caption" color="text.secondary">-</Typography>;
          }

          return (
            <Tooltip title={`${priceInfo.vendor_name}${priceInfo.price_includes_gst ? " (incl. GST)" : ""}`}>
              <Box>
                <Typography variant="body2" fontWeight={500} color="success.main">
                  {formatCurrency(priceInfo.unit_price)}
                </Typography>
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{
                    maxWidth: 100,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    display: "block",
                  }}
                >
                  {priceInfo.vendor_name}
                </Typography>
              </Box>
            </Tooltip>
          );
        },
      },
      {
        accessorKey: "brands",
        header: "Brands",
        size: 160,
        enableSorting: false,
        Cell: ({ row }) => {
          const brands = row.original.brands?.filter((b) => b.is_active) || [];

          if (brands.length === 0) {
            return <Typography variant="caption" color="text.secondary">-</Typography>;
          }

          // Format brand label with variant name if present
          const formatBrandLabel = (brand: typeof brands[0]) => {
            if (brand.variant_name) {
              return `${brand.brand_name} ${brand.variant_name}`;
            }
            return brand.brand_name;
          };

          // Get unique brand names (for display count)
          const uniqueBrandNames = new Set(brands.map(b => b.brand_name));
          const brandCount = uniqueBrandNames.size;

          return (
            <Tooltip
              title={brands.map(b => formatBrandLabel(b)).join(", ")}
              placement="top"
            >
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
                {brands.slice(0, 2).map((brand) => (
                  <Chip
                    key={brand.id}
                    label={formatBrandLabel(brand)}
                    size="small"
                    color={brand.is_preferred ? "primary" : "default"}
                    variant={brand.is_preferred ? "filled" : "outlined"}
                    sx={{ maxWidth: 120, "& .MuiChip-label": { overflow: "hidden", textOverflow: "ellipsis" } }}
                  />
                ))}
                {brands.length > 2 && (
                  <Chip label={`+${brands.length - 2}`} size="small" />
                )}
              </Box>
            </Tooltip>
          );
        },
      },
    ],
    [vendorCounts, router, orderStats, bestPrices, auditInfo, handleOpenVendorDrawer]
  );

  // Row actions
  const renderRowActions = useCallback(
    ({ row }: { row: { original: MaterialWithDetails } }) => (
      <Box sx={{ display: "flex", gap: 0.5 }}>
        <Tooltip title="View Details">
          <IconButton
            size="small"
            onClick={() => router.push(`/company/materials/${row.original.id}`)}
          >
            <ViewIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Edit">
          <IconButton
            size="small"
            onClick={() => handleOpenDialog(row.original)}
            disabled={!canEdit}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
        <Tooltip title="Delete">
          <IconButton
            size="small"
            onClick={() => handleDeleteClick(row.original)}
            disabled={!canEdit}
            color="error"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      </Box>
    ),
    [handleOpenDialog, handleDeleteClick, canEdit, router]
  );

  return (
    <Box>
      <PageHeader
        title="Material Catalog"
        actions={
          !isMobile && canEdit ? (
            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={() => handleOpenDialog()}
            >
              Add Material
            </Button>
          ) : null
        }
      />

      {/* Category Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 2 }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
          allowScrollButtonsMobile
        >
          {CATEGORY_TABS.map((tab) => (
            <Tab key={tab.id} value={tab.id} label={tab.label} />
          ))}
        </Tabs>
      </Box>

      {/* Search and Sort */}
      <Box
        sx={{
          display: "flex",
          gap: 2,
          mb: 2,
          flexDirection: isMobile ? "column" : "row",
          alignItems: isMobile ? "stretch" : "center",
        }}
      >
        <TextField
          size="small"
          placeholder="Search materials (min 2 chars)..."
          value={searchInput}
          onChange={(e) => {
            setSearchInput(e.target.value);
            setPagination(prev => ({ ...prev, pageIndex: 0 })); // Reset to first page on search
          }}
          slotProps={{
            input: {
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              ),
            },
          }}
          sx={{ minWidth: 250, flex: 1 }}
        />
        <FormControl size="small" sx={{ minWidth: 180 }}>
          <InputLabel>Sort by</InputLabel>
          <Select
            value={sortBy}
            label="Sort by"
            onChange={(e) => {
              setSortBy(e.target.value as MaterialSortOption);
              setPagination(prev => ({ ...prev, pageIndex: 0 })); // Reset to first page on sort change
            }}
          >
            {SORT_OPTIONS.map((opt) => (
              <MenuItem key={opt.value} value={opt.value}>
                {opt.label}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      {/* Legend */}
      <Box sx={{ display: "flex", gap: 2, mb: 1, alignItems: "center" }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <FireIcon fontSize="small" sx={{ color: "warning.main" }} />
          <Typography variant="caption" color="text.secondary">
            Frequently ordered
          </Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">
          {totalCount} material{totalCount !== 1 ? "s" : ""}
        </Typography>
      </Box>

      {/* Data Table with Server-Side Pagination */}
      <DataTable
        columns={columns}
        data={materialsWithVariantText}
        isLoading={isLoading}
        enableRowActions={canEdit}
        renderRowActions={renderRowActions}
        mobileHiddenColumns={["variants", "best_price", "brands"]}
        enableSorting={false}
        // Server-side pagination
        manualPagination={true}
        rowCount={totalCount}
        pagination={pagination}
        onPaginationChange={handlePaginationChange}
        // Expandable rows for materials with variants OR brands
        enableExpanding={true}
        positionExpandColumn="first"
        getRowCanExpand={(row) => row.original._canExpand === true}
        renderDetailPanel={({ row }) => {
          if (!row.original._canExpand) return null;
          // Show variant sub-table if has variants, otherwise show brand sub-table
          if ((row.original._variantCount ?? 0) > 0) {
            return (
              <VariantSubTable
                parentMaterial={row.original}
                onEditVariant={(variant) => handleOpenDialog(variant)}
              />
            );
          }
          if ((row.original._brandCount ?? 0) > 0) {
            return <BrandSubTable material={row.original} onOpenVendorDrawer={handleOpenVendorDrawer} />;
          }
          return null;
        }}
        muiExpandButtonProps={({ row }) => ({
          sx: {
            // Show expand button only for rows that can expand
            visibility: row.original._canExpand ? "visible" : "hidden",
          },
        })}
      />

      {/* Mobile FAB */}
      {isMobile && canEdit && (
        <Fab
          color="primary"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={() => handleOpenDialog()}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Material Dialog */}
      <MaterialDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        material={editingMaterial}
        categories={categories}
        onEditVariant={handleOpenDialog}
      />

      {/* Vendor Drawer */}
      <VendorDrawer
        open={!!vendorDrawerMaterial}
        onClose={handleCloseVendorDrawer}
        material={vendorDrawerMaterial}
        onCreatePO={handleCreatePO}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Material"
        message={`Are you sure you want to delete "${deleteConfirm.material?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteMaterial.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={handleDeleteCancel}
      />

      {/* Feedback Snackbar */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={handleSnackbarClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={handleSnackbarClose}
          severity={snackbar.severity}
          variant="filled"
          sx={{ width: "100%" }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}
