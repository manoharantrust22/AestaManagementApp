"use client";

import { useMemo, useState, useCallback, useDeferredValue, useEffect } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Fab,
  Pagination,
  Skeleton,
  Snackbar,
  Stack,
  Tab,
  Tabs,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  AutoAwesome as AIIcon,
  Whatshot as FireIcon,
  Image as ImageIcon,
  Store as StoreIcon,
  AutoAwesome as VariantsIcon,
  PriceChange as PriceMissingIcon,
  GridView as TileIcon,
} from "@mui/icons-material";
import { useSitesData } from "@/contexts/SiteContext";
import PageHeader from "@/components/layout/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/useIsMobile";
import { hasEditPermission } from "@/lib/permissions";
import { CATEGORY_TAB_MAPPING, CATEGORY_TABS } from "@/lib/constants/materialCategories";
import {
  usePaginatedMaterials,
  useMaterialCategories,
  useDeleteMaterial,
  useUpdateMaterial,
  type MaterialSortOption,
} from "@/hooks/queries/useMaterials";
import { useMaterialVendorCounts } from "@/hooks/queries/useVendorInventory";
import {
  useMaterialOrderStats,
  useMaterialBestPrices,
  useMaterialLatestPurchases,
} from "@/hooks/queries/useMaterialOrderStats";
import { FilterBar, type FilterChipDef } from "@/components/common/FilterBar";
import { ViewToggle, type ViewMode } from "@/components/common/ViewToggle";
import { MaterialListRow } from "@/components/materials/MaterialListRow";
import { MaterialGridCard } from "@/components/materials/MaterialGridCard";
import { MaterialInspectPane } from "@/components/materials/MaterialInspectPane";
import { VendorInspectPane } from "@/components/vendors/VendorInspectPane";
import ConfirmDialog from "@/components/common/ConfirmDialog";
import { VendorQuoteDialog } from "@/components/shared/VendorQuoteDialog";
import { InspectPaneBreadcrumb } from "@/components/shared/InspectPaneBreadcrumb";
import { useInspectStack } from "@/components/shared/useInspectStack";
import type { MaterialWithDetails, VendorWithCategories } from "@/types/material.types";

const MaterialDialog = dynamic(
  () => import("@/components/materials/MaterialDialog"),
  { ssr: false }
);

const AIIngestionDialog = dynamic(
  () => import("@/components/ai-ingestion/AIIngestionDialog"),
  { ssr: false }
);

const CatalogImageFillDialog = dynamic(
  () => import("@/components/materials/CatalogImageFillDialog"),
  { ssr: false }
);

const TileMaterialDialog = dynamic(
  () => import("@/components/materials/TileMaterialDialog"),
  { ssr: false }
);

const SORT_OPTIONS: { value: MaterialSortOption; label: string }[] = [
  { value: "frequently_used", label: "Frequently used" },
  { value: "alphabetical", label: "Alphabetical" },
  { value: "recently_added", label: "Recently added" },
  { value: "most_vendors", label: "Most vendors" },
  { value: "lowest_price", label: "Lowest price" },
];

const PAGE_SIZE = 50;
const VIEW_MODE_KEY = "materials_view_mode";

type FilterKey = "frequent" | "has_image" | "has_vendors" | "has_variants" | "missing_price";

export default function MaterialsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userProfile } = useAuth();
  const isMobile = useIsMobile();
  const canEdit = hasEditPermission(userProfile?.role);

  const [selectedTab, setSelectedTab] = useState<string>(searchParams.get("tab") || "all");
  const [searchInput, setSearchInput] = useState("");
  const [sortBy, setSortBy] = useState<MaterialSortOption>("alphabetical");
  const [pageIndex, setPageIndex] = useState(0);
  // Default to "list" for SSR; rehydrate from localStorage after mount to avoid
  // hydration mismatches in ToggleButtonGroup's aria-pressed.
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_MODE_KEY);
    if (saved === "grid" || saved === "table" || saved === "list") {
      setViewMode(saved);
    }
  }, []);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  // Task M-2: drafts filter for office review of supervisor-quick-added materials.
  const [showDraftsOnly, setShowDraftsOnly] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [tileDialogOpen, setTileDialogOpen] = useState(false);
  const [aiDialogOpen, setAiDialogOpen] = useState(false);
  const [fillImagesOpen, setFillImagesOpen] = useState(false);
  const { sites: userSites } = useSitesData();
  const aiSites = useMemo(
    () => userSites.map((s) => ({ id: s.id, name: s.name })),
    [userSites],
  );
  const [editingMaterial, setEditingMaterial] = useState<MaterialWithDetails | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ open: boolean; material: MaterialWithDetails | null }>({
    open: false,
    material: null,
  });
  const [snackbar, setSnackbar] = useState<{ open: boolean; message: string; severity: "success" | "error" }>({
    open: false,
    message: "",
    severity: "success",
  });

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

  const { data: categories = [] } = useMaterialCategories();
  const tabCategoryIds = useMemo(() => {
    if (selectedTab === "all") return null;
    const codes = CATEGORY_TAB_MAPPING[selectedTab] || [];
    return categories
      .filter(
        (c) =>
          codes.includes(c.code || "") ||
          codes.some((code) => c.code?.startsWith(code + "-"))
      )
      .map((c) => c.id);
  }, [selectedTab, categories]);

  const pagination = useMemo(() => ({ pageIndex, pageSize: PAGE_SIZE }), [pageIndex]);
  const { data: paginatedData, isLoading } = usePaginatedMaterials(
    pagination,
    tabCategoryIds,
    deferredSearch.length >= 2 ? deferredSearch : undefined,
    sortBy
  );
  const materials = paginatedData?.data || [];
  const totalCount = paginatedData?.totalCount || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const { data: vendorCounts = {} } = useMaterialVendorCounts();
  const { data: orderStats } = useMaterialOrderStats();
  const { data: bestPrices } = useMaterialBestPrices();
  const { data: latestPurchases } = useMaterialLatestPurchases();
  const deleteMaterial = useDeleteMaterial();
  const updateMaterial = useUpdateMaterial();

  // Task M-2: count drafts in the current page (cheap, no extra query).
  const draftCount = useMemo(
    () => materials.filter((m) => m.is_draft).length,
    [materials],
  );

  const visibleMaterials = useMemo(() => {
    // Task M-2: drafts-only filter takes precedence over other sort/filter chips.
    const source = showDraftsOnly ? materials.filter((m) => m.is_draft) : materials;
    const sorted =
      sortBy === "alphabetical" || sortBy === "recently_added"
        ? source
        : [...source].sort((a, b) => {
            switch (sortBy) {
              case "frequently_used": {
                const aOrders = orderStats?.get(a.id)?.order_count || 0;
                const bOrders = orderStats?.get(b.id)?.order_count || 0;
                if (bOrders !== aOrders) return bOrders - aOrders;
                return a.name.localeCompare(b.name);
              }
              case "most_vendors": {
                const aV = vendorCounts[a.id] || 0;
                const bV = vendorCounts[b.id] || 0;
                if (bV !== aV) return bV - aV;
                return a.name.localeCompare(b.name);
              }
              case "lowest_price": {
                const aP = bestPrices?.get(a.id)?.landed_cost ?? Number.MAX_SAFE_INTEGER;
                const bP = bestPrices?.get(b.id)?.landed_cost ?? Number.MAX_SAFE_INTEGER;
                if (aP !== bP) return aP - bP;
                return a.name.localeCompare(b.name);
              }
              default:
                return 0;
            }
          });

    if (activeFilters.size === 0) return sorted;
    return sorted.filter((m) => {
      const isFrequent = (orderStats?.get(m.id)?.order_count || 0) >= 3;
      const vendorN = vendorCounts[m.id] || 0;
      const hasImage = !!m.image_url;
      const hasVariants = (m.variant_count || 0) > 0;
      const hasPrice = bestPrices?.get(m.id)?.landed_cost != null;
      if (activeFilters.has("frequent") && !isFrequent) return false;
      if (activeFilters.has("has_image") && !hasImage) return false;
      if (activeFilters.has("has_vendors") && vendorN === 0) return false;
      if (activeFilters.has("has_variants") && !hasVariants) return false;
      if (activeFilters.has("missing_price") && hasPrice) return false;
      return true;
    });
  }, [materials, sortBy, orderStats, vendorCounts, bestPrices, activeFilters, showDraftsOnly]);

  const filterChips: FilterChipDef[] = useMemo(
    () => [
      { key: "frequent", label: "Frequently ordered", icon: <FireIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("frequent") },
      { key: "has_image", label: "Has image", icon: <ImageIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("has_image") },
      { key: "has_vendors", label: "Has vendors", icon: <StoreIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("has_vendors") },
      { key: "has_variants", label: "Has variants", icon: <VariantsIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("has_variants") },
      { key: "missing_price", label: "Missing price", icon: <PriceMissingIcon sx={{ fontSize: 14 }} />, active: activeFilters.has("missing_price") },
    ],
    [activeFilters]
  );

  const handleTabChange = useCallback(
    (_: React.SyntheticEvent, newValue: string) => {
      setSelectedTab(newValue);
      setPageIndex(0);
      const params = new URLSearchParams(window.location.search);
      if (newValue === "all") params.delete("tab");
      else params.set("tab", newValue);
      const url = params.toString() ? `?${params.toString()}` : window.location.pathname;
      window.history.replaceState({}, "", url);
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
    (m: MaterialWithDetails) =>
      inspect.openRoot({ kind: "material", id: m.id, title: m.name }),
    [inspect]
  );

  const handleOpenAdd = useCallback(() => {
    setEditingMaterial(null);
    setDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback((material: MaterialWithDetails) => {
    setEditingMaterial(material);
    setDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((material: MaterialWithDetails) => {
    setDeleteConfirm({ open: true, material });
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteConfirm.material) return;
    const name = deleteConfirm.material.name;
    try {
      await deleteMaterial.mutateAsync(deleteConfirm.material.id);
      setDeleteConfirm({ open: false, material: null });
      if (top?.kind === "material" && top.id === deleteConfirm.material.id) {
        inspect.close();
      }
      setSnackbar({ open: true, message: `"${name}" deleted`, severity: "success" });
    } catch (err) {
      setDeleteConfirm({ open: false, material: null });
      setSnackbar({
        open: true,
        message: `Failed to delete: ${err instanceof Error ? err.message : "Unknown error"}`,
        severity: "error",
      });
    }
  }, [deleteConfirm.material, deleteMaterial, inspect, top]);

  const handleAddVendorQuote = useCallback((material: MaterialWithDetails) => {
    setQuoteCtx({ lockedMaterial: material, lockedVendor: null });
  }, []);

  // Task M-2: flip a draft material to approved (is_draft -> false).
  const handleApproveDraft = useCallback(
    async (material: MaterialWithDetails) => {
      try {
        await updateMaterial.mutateAsync({ id: material.id, data: { is_draft: false } });
        setSnackbar({
          open: true,
          message: `"${material.name}" approved`,
          severity: "success",
        });
      } catch (err) {
        setSnackbar({
          open: true,
          message: `Failed to approve: ${err instanceof Error ? err.message : "Unknown error"}`,
          severity: "error",
        });
      }
    },
    [updateMaterial],
  );

  const handleAddMaterialToVendor = useCallback((vendor: VendorWithCategories) => {
    setQuoteCtx({ lockedMaterial: null, lockedVendor: vendor });
  }, []);

  const handleOpenInPage = useCallback(
    (material: MaterialWithDetails) => router.push(`/company/materials/${material.id}`),
    [router]
  );

  const handleOpenVendorPage = useCallback(
    (vendor: VendorWithCategories) => router.push(`/company/vendors/${vendor.id}`),
    [router]
  );

  return (
    <Box>
      <PageHeader
        title="Material Catalog"
        actions={
          !isMobile && canEdit ? (
            <Box sx={{ display: "flex", gap: 1 }}>
              <Button
                variant="outlined"
                startIcon={<ImageIcon />}
                onClick={() => setFillImagesOpen(true)}
              >
                Fill images
              </Button>
              <Button
                variant="outlined"
                startIcon={<AIIcon />}
                onClick={() => setAiDialogOpen(true)}
              >
                Ingest from AI
              </Button>
              <Button
                variant="outlined"
                startIcon={<TileIcon />}
                onClick={() => setTileDialogOpen(true)}
              >
                New tile
              </Button>
              <Button variant="contained" startIcon={<AddIcon />} onClick={handleOpenAdd}>
                Add Material
              </Button>
            </Box>
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
          {CATEGORY_TABS.map((t) => (
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
        searchPlaceholder="Search materials (min 2 chars)…"
        filterChips={filterChips}
        onFilterChipToggle={handleFilterToggle}
        sortOptions={SORT_OPTIONS}
        sortValue={sortBy}
        onSortChange={(v) => {
          setSortBy(v as MaterialSortOption);
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

      <Stack
        direction="row"
        spacing={1}
        alignItems="center"
        sx={{ px: { xs: 1, sm: 1.5 }, mb: 0.75, flexWrap: "wrap" }}
      >
        <Typography
          sx={{
            fontSize: 10.5,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {totalCount} material{totalCount !== 1 ? "s" : ""}
          {activeFilters.size > 0 ? ` · ${visibleMaterials.length} match filters` : ""}
        </Typography>
        {/* Task M-2: drafts filter chip — toggles is_draft-only view for office review. */}
        <Chip
          label={`Drafts (${draftCount})`}
          size="small"
          color={showDraftsOnly ? "primary" : "default"}
          variant={showDraftsOnly ? "filled" : "outlined"}
          onClick={() => setShowDraftsOnly((v) => !v)}
          clickable
        />
      </Stack>

      <Box sx={{ px: { xs: 1, sm: 1.5 }, pb: 12 }}>
        {isLoading ? (
          <ListSkeleton viewMode={viewMode} />
        ) : visibleMaterials.length === 0 ? (
          <Box sx={{ p: 6, textAlign: "center" }}>
            <Typography variant="body2" color="text.secondary">
              No materials match your filters.
            </Typography>
          </Box>
        ) : viewMode === "list" ? (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {visibleMaterials.map((m) => {
              const isFrequent = (orderStats?.get(m.id)?.order_count || 0) >= 3;
              const bp = bestPrices?.get(m.id);
              const variantCount = m.variant_count || 0;
              const brandCount = (m.brands || []).filter((b) => b.is_active).length;
              const row = (
                <MaterialListRow
                  key={m.id}
                  material={m}
                  variantCount={variantCount}
                  brandCount={brandCount}
                  vendorCount={vendorCounts[m.id] || 0}
                  bestPrice={bp?.landed_cost}
                  bestPriceVendor={bp?.vendor_name}
                  priceNote={bp?.price_note}
                  latestPurchase={latestPurchases?.get(m.id) ?? null}
                  isFrequent={isFrequent}
                  selected={top?.kind === "material" && top.id === m.id}
                  canEdit={canEdit}
                  onClick={() => handleRowClick(m)}
                  onView={() => handleOpenInPage(m)}
                  onEdit={() => handleOpenEdit(m)}
                  onDelete={() => handleDeleteClick(m)}
                  onAddVendorQuote={() => handleAddVendorQuote(m)}
                />
              );
              // Task M-2: in drafts mode, append an inline Approve button.
              if (showDraftsOnly && m.is_draft && canEdit) {
                return (
                  <Box key={m.id} sx={{ position: "relative" }}>
                    {row}
                    <Box
                      sx={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 1,
                        mt: -0.5,
                        mb: 0.5,
                        px: 1,
                      }}
                    >
                      <Button
                        size="small"
                        variant="contained"
                        color="primary"
                        disabled={updateMaterial.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApproveDraft(m);
                        }}
                      >
                        Approve
                      </Button>
                    </Box>
                  </Box>
                );
              }
              return row;
            })}
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
            {visibleMaterials.map((m) => {
              const isFrequent = (orderStats?.get(m.id)?.order_count || 0) >= 3;
              const bp = bestPrices?.get(m.id);
              const variantCount = m.variant_count || 0;
              const brandCount = (m.brands || []).filter((b) => b.is_active).length;
              return (
                <MaterialGridCard
                  key={m.id}
                  material={m}
                  variantCount={variantCount}
                  brandCount={brandCount}
                  vendorCount={vendorCounts[m.id] || 0}
                  bestPrice={bp?.landed_cost}
                  bestPriceVendor={bp?.vendor_name}
                  priceNote={bp?.price_note}
                  isFrequent={isFrequent}
                  selected={top?.kind === "material" && top.id === m.id}
                  onClick={() => handleRowClick(m)}
                />
              );
            })}
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
        <>
          <Fab
            color="secondary"
            size="medium"
            sx={{ position: "fixed", bottom: 156, right: 16 }}
            onClick={() => setTileDialogOpen(true)}
            aria-label="New tile"
          >
            <TileIcon />
          </Fab>
          <Fab
            color="secondary"
            size="medium"
            sx={{ position: "fixed", bottom: 86, right: 16 }}
            onClick={() => setAiDialogOpen(true)}
            aria-label="Ingest from AI"
          >
            <AIIcon />
          </Fab>
          <Fab
            color="primary"
            sx={{ position: "fixed", bottom: 16, right: 16 }}
            onClick={handleOpenAdd}
            aria-label="Add material"
          >
            <AddIcon />
          </Fab>
        </>
      ) : null}

      {/* Inspect pane — material or vendor based on stack top (Slice 5) */}
      {top?.kind === "material" ? (
        <MaterialInspectPane
          materialId={top.id}
          isOpen
          onClose={inspect.close}
          onEdit={handleOpenEdit}
          onOpenInPage={handleOpenInPage}
          onAddVendorQuote={handleAddVendorQuote}
          onVendorClick={(vendorId, vendorName) =>
            inspect.push({ kind: "vendor", id: vendorId, title: vendorName })
          }
          breadcrumb={breadcrumb}
          canEdit={canEdit}
        />
      ) : null}
      {top?.kind === "vendor" ? (
        <VendorInspectPane
          vendorId={top.id}
          isOpen
          onClose={inspect.close}
          onOpenInPage={handleOpenVendorPage}
          onAddMaterial={handleAddMaterialToVendor}
          onMaterialClick={(materialId, materialName) =>
            inspect.push({ kind: "material", id: materialId, title: materialName })
          }
          breadcrumb={breadcrumb}
          canEdit={canEdit}
        />
      ) : null}

      <MaterialDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingMaterial(null);
        }}
        material={editingMaterial}
        categories={categories}
        onEditVariant={handleOpenEdit}
      />

      {tileDialogOpen && (
        <TileMaterialDialog
          open={tileDialogOpen}
          onClose={() => setTileDialogOpen(false)}
          categories={categories}
        />
      )}

      <AIIngestionDialog
        open={aiDialogOpen}
        onClose={() => setAiDialogOpen(false)}
        sites={aiSites}
        onSaved={(result) => {
          const refCode = (result as { ref_code?: string } | null)?.ref_code;
          setSnackbar({
            open: true,
            message: refCode ? `Saved as ${refCode}` : "Saved",
            severity: "success",
          });
        }}
      />

      {fillImagesOpen ? (
        <CatalogImageFillDialog open={fillImagesOpen} onClose={() => setFillImagesOpen(false)} />
      ) : null}

      <VendorQuoteDialog
        open={quoteCtx !== null}
        onClose={() => setQuoteCtx(null)}
        lockedMaterial={quoteCtx?.lockedMaterial ?? null}
        lockedVendor={quoteCtx?.lockedVendor ?? null}
        onSaved={() =>
          setSnackbar({ open: true, message: "Vendor quote saved", severity: "success" })
        }
      />

      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Material"
        message={`Delete "${deleteConfirm.material?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        confirmColor="error"
        isLoading={deleteMaterial.isPending}
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, material: null })}
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
