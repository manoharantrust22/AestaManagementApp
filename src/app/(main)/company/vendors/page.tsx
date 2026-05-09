"use client";

import { useMemo, useState, useCallback, useDeferredValue, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Fab,
  Pagination,
  Skeleton,
  Snackbar,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Star as StarIcon,
  CreditCard as CreditIcon,
  AccountBalance as UpiIcon,
  LocalShipping as TransportIcon,
  Image as ImageIcon,
} from "@mui/icons-material";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasEditPermission } from "@/lib/permissions";
import { usePaginatedVendors, useDeleteVendor } from "@/hooks/queries/useVendors";
import { useMaterialCategories } from "@/hooks/queries/useMaterials";
import { useVendorMaterialCounts } from "@/hooks/queries/useVendorInventory";
import VendorDialog from "@/components/materials/VendorDialog";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { VendorQuoteDialog } from "@/components/shared/VendorQuoteDialog";
import { FilterBar, type FilterChipDef } from "@/components/common/FilterBar";
import { ViewToggle, type ViewMode } from "@/components/common/ViewToggle";
import { VendorListRow } from "@/components/vendors/VendorListRow";
import { VendorGridCard } from "@/components/vendors/VendorGridCard";
import { VendorInspectPane } from "@/components/vendors/VendorInspectPane";
import { MaterialInspectPane } from "@/components/materials/MaterialInspectPane";
import { InspectPaneBreadcrumb } from "@/components/shared/InspectPaneBreadcrumb";
import { useInspectStack } from "@/components/shared/useInspectStack";
import type {
  MaterialWithDetails,
  VendorWithCategories,
  VendorType,
} from "@/types/material.types";

type VendorTabId =
  | "all"
  | "rental"
  | "civil"
  | "steel"
  | "electrical_plumbing"
  | "hardware"
  | "finishing"
  | "pumps_motors";

interface VendorTab {
  id: VendorTabId;
  label: string;
  vendorType?: VendorType;
  categoryNames?: string[];
}

const VENDOR_TABS: VendorTab[] = [
  { id: "all", label: "All Vendors" },
  { id: "rental", label: "Rental", vendorType: "rental_store" },
  {
    id: "civil",
    label: "Civil",
    categoryNames: ["cement", "brick", "block", "sand", "aggregate", "binding"],
  },
  {
    id: "steel",
    label: "Steel & Metals",
    categoryNames: ["steel", "metal", "iron", "tmt"],
  },
  {
    id: "electrical_plumbing",
    label: "Electrical & Plumbing",
    categoryNames: ["electrical", "plumbing", "wiring", "pipe"],
  },
  { id: "hardware", label: "Hardware", categoryNames: ["hardware"] },
  {
    id: "finishing",
    label: "Finishing",
    categoryNames: ["paint", "tile", "sanitary", "flooring", "finishing"],
  },
  {
    id: "pumps_motors",
    label: "Pumps & Motors",
    categoryNames: ["pump", "motor"],
  },
];

const SORT_OPTIONS = [
  { value: "alphabetical", label: "Alphabetical" },
  { value: "rating", label: "Top rated" },
  { value: "most_materials", label: "Most materials" },
  { value: "recently_added", label: "Recently added" },
];

const PAGE_SIZE = 50;
const VIEW_MODE_KEY = "vendors_view_mode";

type FilterKey =
  | "top_rated"
  | "accepts_credit"
  | "accepts_upi"
  | "provides_transport"
  | "has_photo";

export default function VendorsPage() {
  const router = useRouter();
  const { userProfile } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = hasEditPermission(userProfile?.role);

  const [selectedTab, setSelectedTab] = useState<VendorTabId>("all");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<string>("alphabetical");
  const [pageIndex, setPageIndex] = useState(0);
  // Default to "list" for SSR; rehydrate from localStorage after mount.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "grid" || saved === "table" || saved === "list") {
      setViewMode(saved);
    }
  }, []);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState<VendorWithCategories | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    vendor: VendorWithCategories | null;
  }>({ open: false, vendor: null });
  const [snackbar, setSnackbar] = useState<{
    open: boolean;
    message: string;
    severity: "success" | "error";
  }>({ open: false, message: "", severity: "success" });

  // Quote dialog (Slice 4) — locked to either material or vendor
  const [quoteCtx, setQuoteCtx] = useState<{
    lockedMaterial: MaterialWithDetails | null;
    lockedVendor: VendorWithCategories | null;
  } | null>(null);

  // Inspect stack (Slice 5)
  const inspect = useInspectStack();
  const top = inspect.top;
  const trail = inspect.trail;
  const breadcrumb = trail.length > 0 ? (
    <InspectPaneBreadcrumb
      trail={trail}
      onJumpTo={inspect.popTo}
      onBack={inspect.back}
    />
  ) : null;

  const deferredSearch = useDeferredValue(searchInput);
  const currentTab = VENDOR_TABS.find((t) => t.id === selectedTab) || VENDOR_TABS[0];

  const pagination = useMemo(() => ({ pageIndex, pageSize: PAGE_SIZE }), [pageIndex]);
  const { data: paginatedData, isLoading } = usePaginatedVendors(
    pagination,
    undefined,
    deferredSearch.length >= 2 ? deferredSearch : undefined,
    currentTab.vendorType,
    currentTab.categoryNames
  );
  const allVendors = paginatedData?.data || [];
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: categories = [] } = useMaterialCategories();
  const { data: materialCounts = {} } = useVendorMaterialCounts();
  const deleteVendor = useDeleteVendor();

  const visibleVendors = useMemo(() => {
    const sorted =
      sortBy === "alphabetical" || sortBy === "recently_added"
        ? allVendors
        : [...allVendors].sort((a, b) => {
            switch (sortBy) {
              case "rating": {
                const ar = a.rating ?? 0;
                const br = b.rating ?? 0;
                if (br !== ar) return br - ar;
                return a.name.localeCompare(b.name);
              }
              case "most_materials": {
                const am = materialCounts[a.id] || 0;
                const bm = materialCounts[b.id] || 0;
                if (bm !== am) return bm - am;
                return a.name.localeCompare(b.name);
              }
              default:
                return 0;
            }
          });

    if (activeFilters.size === 0) return sorted;
    return sorted.filter((v) => {
      if (activeFilters.has("top_rated") && (v.rating ?? 0) < 4) return false;
      if (activeFilters.has("accepts_credit") && !v.accepts_credit) return false;
      if (activeFilters.has("accepts_upi") && !v.accepts_upi) return false;
      if (activeFilters.has("provides_transport") && !v.provides_transport) return false;
      if (activeFilters.has("has_photo") && !v.shop_photo_url) return false;
      return true;
    });
  }, [allVendors, sortBy, materialCounts, activeFilters]);

  const filterChips: FilterChipDef[] = useMemo(
    () => [
      { key: "top_rated", label: "Top rated", icon: <StarIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("top_rated") },
      { key: "accepts_credit", label: "Accepts credit", icon: <CreditIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("accepts_credit") },
      { key: "accepts_upi", label: "Accepts UPI", icon: <UpiIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("accepts_upi") },
      { key: "provides_transport", label: "Provides transport", icon: <TransportIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("provides_transport") },
      { key: "has_photo", label: "Has photo", icon: <ImageIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("has_photo") },
    ],
    [activeFilters]
  );

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: VendorTabId) => {
      setSelectedTab(newValue);
      setPageIndex(0);
    },
    []
  );

  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VIEW_MODE_KEY, mode);
    }
  }, []);

  const handleFilterToggle = useCallback((key: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      const k = key as FilterKey;
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
    setPageIndex(0);
  }, []);

  const handleRowClick = useCallback(
    (v: VendorWithCategories) =>
      inspect.openRoot({ kind: "vendor", id: v.id, title: v.name }),
    [inspect]
  );

  const handleOpenAdd = useCallback(() => {
    setEditingVendor(null);
    setDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback((vendor: VendorWithCategories) => {
    setEditingVendor(vendor);
    setDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((vendor: VendorWithCategories) => {
    setDeleteConfirm({ open: true, vendor });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.vendor) return;
    const name = deleteConfirm.vendor.name;
    try {
      await deleteVendor.mutateAsync(deleteConfirm.vendor.id);
      setDeleteConfirm({ open: false, vendor: null });
      if (top?.kind === "vendor" && top.id === deleteConfirm.vendor.id) {
        inspect.close();
      }
      setSnackbar({ open: true, message: `"${name}" deleted`, severity: "success" });
    } catch (err) {
      setDeleteConfirm({ open: false, vendor: null });
      setSnackbar({
        open: true,
        message: `Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`,
        severity: "error",
      });
    }
  }, [deleteConfirm.vendor, deleteVendor, inspect, top]);

  const handleAddMaterial = useCallback((vendor: VendorWithCategories) => {
    setQuoteCtx({ lockedMaterial: null, lockedVendor: vendor });
  }, []);

  const handleAddVendorQuote = useCallback((material: MaterialWithDetails) => {
    setQuoteCtx({ lockedMaterial: material, lockedVendor: null });
  }, []);

  const handleOpenInPage = useCallback(
    (vendor: VendorWithCategories) => router.push(`/company/vendors/${vendor.id}`),
    [router]
  );

  const handleOpenMaterialPage = useCallback(
    (material: MaterialWithDetails) =>
      router.push(`/company/materials/${material.id}`),
    [router]
  );

  return (
    <Box>
      <PageHeader
        title="Vendors & Suppliers"
        actions={
          !isMobile && canEdit ? (
            <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
              Add Vendor
            </Button>
          ) : null
        }
      />

      <Box sx={{ borderBottom: 1, borderColor: "divider", mb: 0.5 }}>
        <Tabs
          value={selectedTab}
          onChange={handleTabChange}
          variant={isMobile ? "scrollable" : "standard"}
          scrollButtons={isMobile ? "auto" : false}
          allowScrollButtonsMobile
          sx={{
            minHeight: 40,
            "& .MuiTab-root": {
              minHeight: 40,
              fontSize: 13,
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0.2,
            },
          }}
        >
          {VENDOR_TABS.map((t) => (
            <Tab key={t.id} value={t.id} label={t.label} />
          ))}
        </Tabs>
      </Box>

      <FilterBar
        searchValue={searchInput}
        onSearchChange={(v) => {
          setSearchInput(v);
          setPageIndex(0);
        }}
        searchPlaceholder="Search vendors (min 2 chars)…"
        filterChips={filterChips}
        onFilterChipToggle={handleFilterToggle}
        sortOptions={SORT_OPTIONS}
        sortValue={sortBy}
        onSortChange={(v) => {
          setSortBy(v);
          setPageIndex(0);
        }}
        viewToggle={
          <ViewToggle
            value={viewMode}
            onChange={handleViewModeChange}
            modes={["list", "grid"]}
          />
        }
      />

      <Box sx={{ px: { xs: 1, sm: 1.5 }, mb: 0.75 }}>
        <Typography
          sx={{
            fontSize: 10.5,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {totalCount} vendor{totalCount !== 1 ? "s" : ""}
          {activeFilters.size > 0 ? ` · ${visibleVendors.length} match filters` : ""}
        </Typography>
      </Box>

      <Box sx={{ px: { xs: 1, sm: 1.5 }, pb: 12 }}>
        {isLoading ? (
          <ListSkeleton viewMode={viewMode} />
        ) : visibleVendors.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No vendors match your filters.
            </Typography>
          </Box>
        ) : viewMode === "list" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {visibleVendors.map((v) => (
              <VendorListRow
                key={v.id}
                vendor={v}
                materialCount={materialCounts[v.id] || 0}
                selected={top?.kind === "vendor" && top.id === v.id}
                canEdit={canEdit}
                onClick={() => handleRowClick(v)}
                onView={() => handleOpenInPage(v)}
                onEdit={() => handleOpenEdit(v)}
                onDelete={() => handleDeleteClick(v)}
                onAddMaterial={() => handleAddMaterial(v)}
              />
            ))}
          </Box>
        ) : (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "repeat(2, 1fr)",
                sm: "repeat(3, 1fr)",
                md: "repeat(4, 1fr)",
                lg: "repeat(5, 1fr)",
              },
              gap: 1.25,
            }}
          >
            {visibleVendors.map((v) => (
              <VendorGridCard
                key={v.id}
                vendor={v}
                materialCount={materialCounts[v.id] || 0}
                selected={top?.kind === "vendor" && top.id === v.id}
                onClick={() => handleRowClick(v)}
              />
            ))}
          </Box>
        )}

        {totalCount > PAGE_SIZE ? (
          <Box sx={{ display: "flex", justifyContent: "center", mt: 2 }}>
            <Pagination
              size="small"
              count={totalPages}
              page={pageIndex + 1}
              onChange={(_, p) => setPageIndex(p - 1)}
              color="primary"
            />
          </Box>
        ) : null}
      </Box>

      {isMobile && canEdit ? (
        <Fab
          color="primary"
          sx={{ position: "fixed", bottom: 16, right: 16 }}
          onClick={handleOpenAdd}
        >
          <AddIcon />
        </Fab>
      ) : null}

      {/* Inspect pane (Slice 5 stack) */}
      {top?.kind === "vendor" ? (
        <VendorInspectPane
          vendorId={top.id}
          isOpen
          onClose={inspect.close}
          onEdit={handleOpenEdit}
          onOpenInPage={handleOpenInPage}
          onAddMaterial={handleAddMaterial}
          onMaterialClick={(materialId, materialName) =>
            inspect.push({ kind: "material", id: materialId, title: materialName })
          }
          breadcrumb={breadcrumb}
          canEdit={canEdit}
        />
      ) : null}
      {top?.kind === "material" ? (
        <MaterialInspectPane
          materialId={top.id}
          isOpen
          onClose={inspect.close}
          onOpenInPage={handleOpenMaterialPage}
          onAddVendorQuote={handleAddVendorQuote}
          onVendorClick={(vendorId, vendorName) =>
            inspect.push({ kind: "vendor", id: vendorId, title: vendorName })
          }
          breadcrumb={breadcrumb}
          canEdit={canEdit}
        />
      ) : null}

      <VendorDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingVendor(null);
        }}
        vendor={editingVendor}
        categories={categories}
      />

      <VendorQuoteDialog
        open={quoteCtx !== null}
        onClose={() => setQuoteCtx(null)}
        lockedMaterial={quoteCtx?.lockedMaterial ?? null}
        lockedVendor={quoteCtx?.lockedVendor ?? null}
        onSaved={() =>
          setSnackbar({ open: true, message: "Material quote saved", severity: "success" })
        }
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Vendor"
        message={`Delete "${deleteConfirm.vendor?.name}"? This vendor will be removed from the active list.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteVendor.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, vendor: null })}
      />

      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
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

function ListSkeleton({ viewMode }: { viewMode: ViewMode }) {
  if (viewMode === "grid") {
    return (
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, 1fr)",
            sm: "repeat(3, 1fr)",
            md: "repeat(4, 1fr)",
            lg: "repeat(5, 1fr)",
          },
          gap: 1.25,
        }}
      >
        {Array.from({ length: 10 }).map((_, i) => (
          <Skeleton key={i} variant="rounded" height={210} />
        ))}
      </Box>
    );
  }
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} variant="rounded" height={84} />
      ))}
    </Box>
  );
}
