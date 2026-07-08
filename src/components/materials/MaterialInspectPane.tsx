"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Button,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  Skeleton,
  Tab,
  Tabs,
  Tooltip,
  Typography,
  alpha,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import {
  Close as CloseIcon,
  Edit as EditIcon,
  OpenInNew as OpenInNewIcon,
  AddBusiness as AddVendorIcon,
  Inventory2 as InventoryIcon,
  Storefront as StorefrontIcon,
  Star as StarIcon,
  StarBorder as StarBorderIcon,
  MoreVert as MoreVertIcon,
  AddCircleOutline as AddCircleOutlineIcon,
  Receipt as ReceiptIcon,
  CallSplit as CallSplitIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { useImageViewer } from "@/components/common/ImageViewerProvider";
import { useMaterial, useMaterialVariants, useMaterialBrands, useBrandVariantLinks } from "@/hooks/queries/useMaterials";
import { useMaterialDesigns } from "@/hooks/queries/useMaterialDesigns";
import {
  useMaterialVendorSummary,
  useMaterialPriceHistory,
  useUpdateVendorBillPolicy,
} from "@/hooks/queries/useVendorInventory";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { activePacks } from "@/lib/materials/packs";
import { MaterialPacksTab } from "./MaterialPacksTab";
import { PriceHistorySparkline } from "@/components/shared/PriceHistorySparkline";
import { ArrowForward as ArrowForwardIcon } from "@mui/icons-material";
import { VendorBillChips } from "@/components/materials/inspect/VendorBillChips";
import { RecordPriceDialog } from "./RecordPriceDialog";
import VariantInlineCard from "./VariantInlineCard";
import type {
  MaterialUnit,
  MaterialWithDetails,
  MaterialVendorSummary,
  VendorBillPolicy,
  BrandWithVariantLinks,
  Material,
  MaterialDesign,
  PriceHistoryWithDetails,
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
  ft: "Ft",
  box: "Box",
  set: "Set",
};

type TabKey = "overview" | "designs" | "vendors" | "brands" | "variants" | "packs" | "price-history" | "activity";

interface MaterialInspectPaneProps {
  materialId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (material: MaterialWithDetails) => void;
  onOpenInPage?: (material: MaterialWithDetails) => void;
  onAddVendorQuote?: (material: MaterialWithDetails) => void;
  /** Convert a flat material into a branded parent-with-variants (see BrandedProductDialog). */
  onConvertToBranded?: (material: MaterialWithDetails) => void;
  /** Click a vendor row (in the Vendors tab) → swap pane to that vendor */
  onVendorClick?: (vendorId: string, vendorName: string) => void;
  /** Optional breadcrumb header — rendered above title when navigating a stack */
  breadcrumb?: React.ReactNode;
  canEdit?: boolean;
  zIndex?: number;
}

export function MaterialInspectPane({
  materialId,
  isOpen,
  onClose,
  onEdit,
  onOpenInPage,
  onAddVendorQuote,
  onConvertToBranded,
  onVendorClick,
  breadcrumb,
  canEdit = false,
  zIndex,
}: MaterialInspectPaneProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const { openImage } = useImageViewer();

  const { data: material, isLoading } = useMaterial(materialId ?? undefined);
  const { data: vendorSummaries = [], isLoading: vendorsLoading } =
    useMaterialVendorSummary(
      activeTab === "vendors" ? materialId ?? undefined : undefined
    );
  const { data: variants = [], isLoading: variantsLoading } = useMaterialVariants(
    activeTab === "variants" || activeTab === "brands" ? materialId ?? undefined : undefined
  );
  const { data: priceHistory = [], isLoading: historyLoading } = useMaterialPriceHistory(
    activeTab === "price-history" ? materialId ?? undefined : undefined
  );
  const { data: brandLinks = [], isLoading: brandLinksLoading } = useBrandVariantLinks(
    activeTab === "brands" ? materialId ?? undefined : undefined
  );
  const { data: materialBrands = [] } = useMaterialBrands(material?.id);
  // Fetch designs whenever the pane is open so the tab count is available.
  const { data: designs = [], isLoading: designsLoading } = useMaterialDesigns(
    isOpen ? materialId ?? undefined : undefined,
  );

  const [recordPriceOpen, setRecordPriceOpen] = useState(false);

  // Reset to Overview when switching materials
  useEffect(() => {
    setActiveTab("overview");
  }, [materialId]);

  // Esc closes
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const variantCount = variants.length;
  const brandCount = new Set(brandLinks.map((b) => b.brand_name.toLowerCase())).size;

  return (
    <Drawer
      anchor="right"
      variant={isMobile ? "temporary" : "persistent"}
      open={isOpen}
      onClose={onClose}
      sx={{
        zIndex: zIndex,
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 480 },
          boxSizing: "border-box",
          borderLeft: 1,
          borderColor: "divider",
        },
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          height: "100%",
        }}
      >
        {/* Header */}
        <Box
          sx={{
            px: 2,
            pt: 2,
            pb: 1,
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
          }}
        >
          {breadcrumb}
          <Box
            sx={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 1,
              mb: 1.25,
            }}
          >
            <Typography
              sx={{
                fontSize: 9.5,
                fontWeight: 700,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.6,
              }}
            >
              Material
            </Typography>
            <Box sx={{ display: "flex", gap: 0.25 }}>
              {material && onOpenInPage ? (
                <Tooltip title="Open detail page" placement="top">
                  <IconButton size="small" onClick={() => onOpenInPage(material)}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              {material && canEdit && onEdit ? (
                <Tooltip title="Edit material" placement="top">
                  <IconButton size="small" onClick={() => onEdit(material)}>
                    <EditIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              {material &&
              canEdit &&
              onConvertToBranded &&
              !material.parent_id &&
              (material.variant_count || 0) === 0 ? (
                <Tooltip title="Convert to branded product (add brand + variants)" placement="top">
                  <IconButton size="small" onClick={() => onConvertToBranded(material)}>
                    <CallSplitIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              <Tooltip title="Close" placement="top">
                <IconButton size="small" onClick={onClose}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            </Box>
          </Box>

          {isLoading || !material ? (
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
              <Skeleton variant="rounded" width={64} height={64} />
              <Box sx={{ flex: 1 }}>
                <Skeleton width="70%" height={20} />
                <Skeleton width="40%" height={14} />
              </Box>
            </Box>
          ) : (
            <Box sx={{ display: "flex", gap: 1.5, alignItems: "center" }}>
              <Box
                onClick={
                  material.image_url
                    ? () => openImage({ src: material.image_url!, title: material.name })
                    : undefined
                }
                sx={{
                  display: "flex",
                  borderRadius: 1.25,
                  cursor: material.image_url ? "zoom-in" : "default",
                }}
              >
                <EntityImageAvatar
                  src={material.image_url}
                  name={material.name}
                  size={64}
                  fallbackIcon={<InventoryIcon />}
                  tint="primary"
                />
              </Box>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 16,
                    fontWeight: 700,
                    lineHeight: 1.25,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: "vertical",
                  }}
                >
                  {material.name}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    mt: 0.25,
                  }}
                >
                  {[material.code, UNIT_LABELS[material.unit] || material.unit, material.category?.name]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Box>
            </Box>
          )}
        </Box>

        {/* Tabs */}
        <Tabs
          value={activeTab}
          onChange={(_, v: TabKey) => setActiveTab(v)}
          variant="scrollable"
          scrollButtons="auto"
          sx={{
            px: 1,
            borderBottom: 1,
            borderColor: "divider",
            flexShrink: 0,
            minHeight: 38,
            "& .MuiTab-root": {
              minHeight: 38,
              fontSize: 12,
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: 0.2,
              minWidth: 0,
              px: 1.5,
            },
          }}
        >
          <Tab value="overview" label="Overview" />
          {designs.length > 0 && (
            <Tab value="designs" label={`Designs (${designs.length})`} />
          )}
          <Tab value="vendors" label="Vendors" />
          <Tab value="brands" label={`Brands${brandCount ? ` (${brandCount})` : ""}`} />
          <Tab value="variants" label={`Variants${variantCount ? ` (${variantCount})` : ""}`} />
          {material?.sold_in_packs && (
            <Tab
              value="packs"
              label={`Packs${
                activePacks(material.packs).length
                  ? ` (${activePacks(material.packs).length})`
                  : ""
              }`}
            />
          )}
          <Tab value="price-history" label="Price history" />
          <Tab value="activity" label="Activity" />
        </Tabs>

        {/* Content */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {!material && isLoading ? (
            <Box sx={{ p: 2, display: "flex", justifyContent: "center", mt: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !material ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Material not found.
              </Typography>
            </Box>
          ) : activeTab === "overview" ? (
            <OverviewTab material={material} />
          ) : activeTab === "designs" ? (
            <DesignsTab isLoading={designsLoading} designs={designs} />
          ) : activeTab === "vendors" ? (
            <VendorsTab
              isLoading={vendorsLoading}
              summaries={vendorSummaries}
              unitLabel={UNIT_LABELS[material.unit] || material.unit}
              onAddVendorQuote={
                onAddVendorQuote ? () => onAddVendorQuote(material) : undefined
              }
              onVendorClick={onVendorClick}
            />
          ) : activeTab === "brands" ? (
            <BrandsTab isLoading={brandLinksLoading} brandLinks={brandLinks} variants={variants} />
          ) : activeTab === "variants" ? (
            <VariantsTab
              isLoading={variantsLoading}
              variants={variants}
              canEdit={canEdit}
              parentMaterial={material}
            />
          ) : activeTab === "packs" ? (
            <MaterialPacksTab
              materialId={material.id}
              unitLabel={UNIT_LABELS[material.unit] || material.unit}
              canEdit={canEdit}
            />
          ) : activeTab === "price-history" ? (
            <>
              <PriceHistoryTab
                isLoading={historyLoading}
                entries={priceHistory}
                variants={variants}
                parentMaterialId={material.id}
                onAddPrice={() => setRecordPriceOpen(true)}
              />
              {material && (
                <RecordPriceDialog
                  open={recordPriceOpen}
                  onClose={() => setRecordPriceOpen(false)}
                  material={material}
                  variants={variants}
                  brands={materialBrands}
                />
              )}
            </>
          ) : (
            <ActivityTab />
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

// =====================================================
// Overview tab
// =====================================================
function OverviewTab({ material }: { material: MaterialWithDetails }) {
  const rows: { label: string; value: React.ReactNode }[] = [
    { label: "Code", value: material.code || "—" },
    { label: "Category", value: material.category?.name || "—" },
    { label: "Unit", value: UNIT_LABELS[material.unit] || material.unit },
    {
      label: "Local name",
      value: material.local_name || "—",
    },
    {
      label: "GST rate",
      value: material.gst_rate != null ? `${material.gst_rate}%` : "—",
    },
  ];

  // Min order qty / Reorder level are now optional, advanced fields — only
  // surface them when actually set so the overview stays decluttered.
  if (material.min_order_qty != null) {
    rows.push({
      label: "Min order qty",
      value: `${material.min_order_qty} ${UNIT_LABELS[material.unit] || material.unit}`,
    });
  }
  if (material.reorder_level != null) {
    rows.push({
      label: "Reorder level",
      value: `${material.reorder_level} ${UNIT_LABELS[material.unit] || material.unit}`,
    });
  }

  if (material.weight_per_unit != null) {
    rows.push({
      label: "Weight per unit",
      value: `${material.weight_per_unit} ${material.weight_unit || ""}`.trim(),
    });
  }
  if (material.length_per_piece != null) {
    rows.push({
      label: "Length per piece",
      value: `${material.length_per_piece} ${material.length_unit || ""}`.trim(),
    });
  }
  if (material.rods_per_bundle != null) {
    rows.push({
      label: "Rods per bundle",
      value: material.rods_per_bundle,
    });
  }

  if (material.sold_in_packs) {
    const ps = activePacks(material.packs);
    rows.push({
      label: "Sold in",
      value: ps.length
        ? ps.map((p) => p.label).join(", ")
        : "Packs (add in the Packs tab)",
    });
  }

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {material.description ? (
        <Box>
          <FieldLabel>Description</FieldLabel>
          <Typography sx={{ fontSize: 13, color: "text.primary", mt: 0.25 }}>
            {material.description}
          </Typography>
        </Box>
      ) : null}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          rowGap: 1.25,
          columnGap: 2,
        }}
      >
        {rows.map((r) => (
          <Box key={r.label}>
            <FieldLabel>{r.label}</FieldLabel>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 600,
                color: "text.primary",
                mt: 0.25,
                wordBreak: "break-word",
              }}
            >
              {r.value}
            </Typography>
          </Box>
        ))}
      </Box>

      {material.specifications && Object.keys(material.specifications).length > 0 ? (
        <Box>
          <Divider sx={{ my: 1.5 }} />
          <FieldLabel>Specifications</FieldLabel>
          <Box
            sx={{
              mt: 0.75,
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              rowGap: 1,
              columnGap: 2,
            }}
          >
            {Object.entries(material.specifications).map(([k, v]) => (
              <Box key={k}>
                <Typography
                  sx={{
                    fontSize: 9.5,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  {k}
                </Typography>
                <Typography sx={{ fontSize: 13, fontWeight: 500 }}>
                  {String(v)}
                </Typography>
              </Box>
            ))}
          </Box>
        </Box>
      ) : null}

      <Box sx={{ pt: 1 }}>
        <Typography
          sx={{
            fontSize: 9.5,
            color: "text.disabled",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          Created {formatDate(material.created_at)}
          {material.updated_at !== material.created_at
            ? ` · Updated ${formatDate(material.updated_at)}`
            : ""}
        </Typography>
      </Box>
    </Box>
  );
}

// =====================================================
// Designs tab — shared visual gallery (e.g. tile patterns)
//
// Designs belong to the parent material and apply across all thickness
// variants. Read-only thumbnail grid; click a design to zoom in the shared viewer.
// =====================================================
function DesignsTab({
  isLoading,
  designs,
}: {
  isLoading: boolean;
  designs: MaterialDesign[];
}) {
  const { openImage } = useImageViewer();

  if (isLoading) {
    return (
      <Box sx={{ p: 2, display: "flex", justifyContent: "center", mt: 4 }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  if (designs.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No designs added yet.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Typography sx={{ fontSize: 12, color: "text.secondary", mb: 1.5 }}>
        {designs.length} design{designs.length === 1 ? "" : "s"} · the same
        designs are available in every thickness.
      </Typography>
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))",
          gap: 1,
        }}
      >
        {designs.map((d) => (
          <Box
            key={d.id}
            onClick={() =>
              d.image_url && openImage({ src: d.image_url, title: d.name || "Design" })
            }
            sx={{
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              overflow: "hidden",
              cursor: d.image_url ? "zoom-in" : "default",
              bgcolor: "background.paper",
              transition: "transform 120ms, box-shadow 120ms",
              "&:hover": { transform: "translateY(-2px)", boxShadow: 2 },
            }}
          >
            <Box sx={{ width: "100%", aspectRatio: "1 / 1", bgcolor: "action.hover" }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.image_url}
                alt={d.name || "Design"}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </Box>
            {d.name ? (
              <Typography
                sx={{
                  fontSize: 11,
                  fontWeight: 600,
                  textAlign: "center",
                  px: 0.5,
                  py: 0.5,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {d.name}
              </Typography>
            ) : null}
          </Box>
        ))}
      </Box>

    </Box>
  );
}

// =====================================================
// Vendors tab — deduped per-vendor summary
//
// One row per vendor, regardless of how many (size × brand) quotes they have
// against the material's variants. Each row shows quote count, brand chips,
// payment policy, last purchase and total purchased aggregates. Clicking
// drills into the vendor's own inspect pane via useInspectStack.
// =====================================================
function VendorsTab({
  isLoading,
  summaries,
  unitLabel,
  onAddVendorQuote,
  onVendorClick,
}: {
  isLoading: boolean;
  summaries: MaterialVendorSummary[];
  unitLabel: string;
  onAddVendorQuote?: () => void;
  onVendorClick?: (vendorId: string, vendorName: string) => void;
}) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={84} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
      {onAddVendorQuote ? (
        <Box
          role="button"
          tabIndex={0}
          onClick={onAddVendorQuote}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAddVendorQuote();
            }
          }}
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            px: 1.5,
            py: 1,
            border: 1,
            borderColor: alpha(theme.palette.primary.main, 0.4),
            borderStyle: "dashed",
            borderRadius: 1.5,
            color: theme.palette.primary.dark,
            cursor: "pointer",
            transition: "background-color 120ms",
            "&:hover": { bgcolor: alpha(theme.palette.primary.main, 0.06) },
          }}
        >
          <AddVendorIcon fontSize="small" />
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Add vendor quote
          </Typography>
        </Box>
      ) : null}

      {summaries.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No vendor quotes or purchases yet.
          </Typography>
        </Box>
      ) : (
        summaries.map((s) => (
          <VendorSummaryRow
            key={s.vendor_id}
            summary={s}
            unitLabel={unitLabel}
            onVendorClick={onVendorClick}
          />
        ))
      )}
    </Box>
  );
}

function VendorSummaryRow({
  summary,
  unitLabel,
  onVendorClick,
}: {
  summary: MaterialVendorSummary;
  unitLabel: string;
  onVendorClick?: (vendorId: string, vendorName: string) => void;
}) {
  const theme = useTheme();
  const updateBillPolicy = useUpdateVendorBillPolicy();
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [variantsExpanded, setVariantsExpanded] = useState(false);
  const clickable = !!onVendorClick;
  const brandChips = summary.brand_chips || [];
  const overflowBrands = brandChips.length > 3 ? brandChips.length - 3 : 0;
  const lastUpdated = summary.latest_quote_updated;
  const variantPrices = summary.variant_prices || [];
  const hasVariantPrices = variantPrices.length > 0;
  // Min/max LANDED range across variants for the headline price display.
  const variantPriceMin = hasVariantPrices
    ? Math.min(...variantPrices.map((vp) => vp.landed_price))
    : null;
  const variantPriceMax = hasVariantPrices
    ? Math.max(...variantPrices.map((vp) => vp.landed_price))
    : null;
  // Breakdown tooltip for the headline landed price (only when extras apply).
  const landedBase = summary.min_landed_base;
  const landedTransport = summary.min_landed_transport_extra || 0;
  const landedGst = summary.min_landed_gst_extra || 0;
  const landedBreakdownTitle =
    landedBase != null && (landedTransport > 0 || landedGst > 0)
      ? [
          `Base ${formatCurrency(landedBase)}`,
          landedTransport > 0 ? `+ ${formatCurrency(landedTransport)} transport` : null,
          landedGst > 0 ? `+ ${formatCurrency(landedGst)} GST` : null,
        ]
          .filter(Boolean)
          .join("   ")
      : "";
  const variantsCollapsedCount = 2;
  const visibleVariants = variantsExpanded
    ? variantPrices
    : variantPrices.slice(0, variantsCollapsedCount);
  const hiddenVariantsCount = Math.max(
    0,
    variantPrices.length - variantsCollapsedCount
  );

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  };
  const closeMenu = () => setMenuAnchor(null);
  const setPolicy = (next: VendorBillPolicy) => {
    closeMenu();
    if (next === summary.bill_policy) return;
    updateBillPolicy.mutate({ vendorId: summary.vendor_id, billPolicy: next });
  };

  return (
    <Box
      role={clickable ? "button" : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={() => clickable && onVendorClick(summary.vendor_id, summary.vendor_name)}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onVendorClick(summary.vendor_id, summary.vendor_name);
        }
      }}
      sx={{
        px: 1.5,
        py: 1.25,
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
        gap: 0.75,
        cursor: clickable ? "pointer" : "default",
        transition: "background-color 120ms, border-color 120ms",
        ...(clickable && {
          "&:hover": {
            bgcolor: "action.hover",
            borderColor: alpha(theme.palette.primary.main, 0.4),
          },
        }),
      }}
    >
      {/* Top row: avatar, name, price, drill arrow */}
      <Box sx={{ display: "flex", gap: 1.25, alignItems: "center" }}>
        <EntityImageAvatar
          src={null}
          name={summary.vendor_name}
          size={36}
          fallbackIcon={<StorefrontIcon />}
          tint="secondary"
        />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {summary.vendor_name}
          </Typography>
          <Typography
            sx={{
              fontSize: 10.5,
              color: "text.secondary",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {[
              summary.shop_name,
              summary.quote_count > 0
                ? `${summary.quote_count} quote${summary.quote_count === 1 ? "" : "s"}`
                : null,
              lastUpdated ? `Updated ${formatDate(lastUpdated)}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Typography>
        </Box>
        <Box sx={{ textAlign: "right", flexShrink: 0 }}>
          {hasVariantPrices && variantPriceMin != null && variantPriceMax != null ? (
            <>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "success.dark",
                  whiteSpace: "nowrap",
                }}
              >
                {variantPriceMin === variantPriceMax
                  ? formatCurrency(variantPriceMin)
                  : `${formatCurrency(variantPriceMin)} – ${formatCurrency(variantPriceMax)}`}
              </Typography>
              <Typography
                sx={{
                  fontSize: 9.5,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {variantPrices.length} variant{variantPrices.length === 1 ? "" : "s"} · per {unitLabel}
              </Typography>
            </>
          ) : summary.min_landed_price != null ? (
            <>
              <Tooltip placement="top" title={landedBreakdownTitle}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: "success.dark",
                  }}
                >
                  {formatCurrency(summary.min_landed_price)}
                </Typography>
              </Tooltip>
              <Typography
                sx={{
                  fontSize: 9.5,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {summary.distinct_brands_count > 1 ? "best · " : ""}per {unitLabel}
              </Typography>
            </>
          ) : (
            <Typography sx={{ fontSize: 11, color: "text.disabled" }}>No quote</Typography>
          )}
        </Box>
        <IconButton
          size="small"
          aria-label="Vendor actions"
          onClick={openMenu}
          sx={{ ml: 0.25, mt: -0.5 }}
        >
          <MoreVertIcon sx={{ fontSize: 16 }} />
        </IconButton>
        {clickable ? (
          <ArrowForwardIcon
            sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }}
          />
        ) : null}
      </Box>

      {/* Chip row: payment / bill policy */}
      <VendorBillChips
        billPolicy={summary.bill_policy}
        acceptsCash={summary.accepts_cash}
        acceptsUpi={summary.accepts_upi}
        acceptsCredit={summary.accepts_credit}
        gstNumber={summary.gst_number}
        size="xs"
      />

      {/* Brand chips */}
      {brandChips.length > 0 ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.4 }}>
          {brandChips.slice(0, 3).map((b) => (
            <Chip
              key={b}
              label={b}
              size="small"
              sx={{
                height: 18,
                fontSize: 10,
                fontWeight: 600,
                bgcolor: alpha(theme.palette.info.main, 0.1),
                color: theme.palette.info.dark,
                border: 0,
                "& .MuiChip-label": { px: 0.75 },
              }}
            />
          ))}
          {overflowBrands > 0 ? (
            <Tooltip title={brandChips.slice(3).join(", ")} placement="top">
              <Chip
                label={`+${overflowBrands}`}
                size="small"
                sx={{
                  height: 18,
                  fontSize: 10,
                  fontWeight: 600,
                  bgcolor: "action.selected",
                  color: "text.secondary",
                  border: 0,
                  "& .MuiChip-label": { px: 0.75 },
                }}
              />
            </Tooltip>
          ) : null}
        </Box>
      ) : null}

      {/* Per-variant price chips (only when parent has variants this vendor quotes) */}
      {hasVariantPrices ? (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.25 }}>
          {visibleVariants.map((vp) => (
            <Box
              key={vp.variant_id}
              sx={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 0.5,
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                border: 1,
                borderColor: alpha(theme.palette.success.main, 0.3),
                bgcolor: alpha(theme.palette.success.main, 0.06),
              }}
            >
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  color: "text.primary",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: 140,
                  whiteSpace: "nowrap",
                }}
              >
                {vp.variant_name}
              </Typography>
              <Typography
                sx={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "success.dark",
                  whiteSpace: "nowrap",
                }}
              >
                {formatCurrency(vp.landed_price)}
              </Typography>
            </Box>
          ))}
          {hiddenVariantsCount > 0 && !variantsExpanded ? (
            <Box
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setVariantsExpanded(true);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  setVariantsExpanded(true);
                }
              }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                border: 1,
                borderColor: "divider",
                cursor: "pointer",
                fontSize: 10.5,
                fontWeight: 600,
                color: "text.secondary",
                "&:hover": { color: "primary.main", borderColor: "primary.main" },
              }}
            >
              +{hiddenVariantsCount} more
            </Box>
          ) : null}
          {variantsExpanded && variantPrices.length > variantsCollapsedCount ? (
            <Box
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                setVariantsExpanded(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.stopPropagation();
                  e.preventDefault();
                  setVariantsExpanded(false);
                }
              }}
              sx={{
                display: "inline-flex",
                alignItems: "center",
                px: 0.75,
                py: 0.25,
                borderRadius: 1,
                border: 1,
                borderColor: "divider",
                cursor: "pointer",
                fontSize: 10.5,
                fontWeight: 600,
                color: "text.secondary",
                "&:hover": { color: "primary.main", borderColor: "primary.main" },
              }}
            >
              Collapse
            </Box>
          ) : null}
        </Box>
      ) : null}

      {/* Purchase summary */}
      {summary.purchase_count > 0 ? (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            alignItems: "center",
            fontSize: 10.5,
            color: "text.secondary",
            mt: 0.25,
          }}
        >
          {summary.last_purchase_date ? (
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
              <span>
                Last: <strong>{formatCurrency(summary.last_purchase_amount ?? 0)}</strong> on{" "}
                {formatDate(summary.last_purchase_date)}
              </span>
              {summary.last_bill_url ? (
                <Tooltip title="View bill from latest purchase" placement="top">
                  <IconButton
                    size="small"
                    component="a"
                    href={summary.last_bill_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    sx={{ p: 0.25, color: "primary.main" }}
                    aria-label="View bill"
                  >
                    <ReceiptIcon sx={{ fontSize: 13 }} />
                  </IconButton>
                </Tooltip>
              ) : null}
            </Box>
          ) : null}
          {summary.total_purchased_value != null ? (
            <span>
              · Total <strong>{formatCurrency(summary.total_purchased_value)}</strong>{" "}
              across {summary.purchase_count} purchase
              {summary.purchase_count === 1 ? "" : "s"}
            </span>
          ) : null}
        </Box>
      ) : null}

      <Menu
        anchorEl={menuAnchor}
        open={!!menuAnchor}
        onClose={closeMenu}
        onClick={(e) => e.stopPropagation()}
        slotProps={{ paper: { sx: { minWidth: 220 } } }}
      >
        <MenuItem disabled sx={{ fontSize: 10.5, opacity: 0.7 }}>
          BILL POLICY
        </MenuItem>
        {(["always_bills", "bills_unless_cash", "no_bills"] as VendorBillPolicy[]).map(
          (p) => (
            <MenuItem
              key={p}
              selected={summary.bill_policy === p}
              onClick={() => setPolicy(p)}
              sx={{ fontSize: 12.5 }}
            >
              {p === "always_bills"
                ? "Always bills"
                : p === "bills_unless_cash"
                ? "Skips bill on cash"
                : "Never issues bills"}
            </MenuItem>
          )
        )}
      </Menu>
    </Box>
  );
}

// =====================================================
// Brands tab
// =====================================================

// Exported for testing
export function BrandsTabContent({
  isLoading = false,
  brandLinks,
  variants,
}: {
  isLoading?: boolean;
  brandLinks: BrandWithVariantLinks[];
  variants: Material[];
}) {
  const { openImage } = useImageViewer();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={72} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  if (brandLinks.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No brands recorded for this material.
        </Typography>
      </Box>
    );
  }

  // Group duplicate brand_name rows (same as edit dialog)
  const grouped = new Map<string, BrandWithVariantLinks>();
  for (const b of brandLinks) {
    const key = b.brand_name.toLowerCase();
    if (!grouped.has(key)) {
      grouped.set(key, { ...b, material_brand_variant_links: [...b.material_brand_variant_links] });
    } else {
      const existing = grouped.get(key)!;
      if (b.is_preferred) existing.is_preferred = true;
      if (!existing.image_url && b.image_url) existing.image_url = b.image_url;
      if (b.quality_rating != null && (existing.quality_rating == null || b.quality_rating > existing.quality_rating))
        existing.quality_rating = b.quality_rating;
      for (const link of b.material_brand_variant_links) {
        if (!existing.material_brand_variant_links.find((l) => l.variant_id === link.variant_id))
          existing.material_brand_variant_links.push(link);
      }
    }
  }
  const dedupedBrands = Array.from(grouped.values());

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
      {dedupedBrands.map((brand) => (
        <Box
          key={brand.id}
          sx={{
            px: 1.5,
            py: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            display: "flex",
            gap: 1.25,
            alignItems: "flex-start",
          }}
        >
          <Box
            onClick={
              brand.image_url
                ? () => openImage({ src: brand.image_url!, title: brand.brand_name })
                : undefined
            }
            sx={{ flexShrink: 0, cursor: brand.image_url ? "zoom-in" : "default", display: "flex" }}
          >
            <EntityImageAvatar
              src={brand.image_url}
              name={brand.brand_name}
              size={36}
              tint={brand.is_preferred ? "primary" : "secondary"}
            />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {brand.is_preferred ? (
                <Tooltip title="Preferred brand" placement="top">
                  <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
                </Tooltip>
              ) : (
                <StarBorderIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              )}
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                {brand.brand_name}
              </Typography>
            </Box>

            {/* Variant chips */}
            {variants.length > 0 && (
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.75 }}>
                {variants.map((variant) => {
                  const link = brand.material_brand_variant_links.find(
                    (l) => l.variant_id === variant.id
                  );
                  const isLinked = link?.is_active ?? false;
                  return (
                    <Chip
                      key={variant.id}
                      data-testid={`variant-chip-${brand.id}-${variant.id}`}
                      label={variant.name}
                      size="small"
                      variant={isLinked ? "filled" : "outlined"}
                      color={isLinked ? "primary" : "default"}
                      sx={{ height: 20, fontSize: 11, fontWeight: 600 }}
                    />
                  );
                })}
              </Box>
            )}

            {brand.notes ? (
              <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>
                {brand.notes}
              </Typography>
            ) : null}
          </Box>

          {brand.quality_rating != null ? (
            <Chip
              size="small"
              label={`${brand.quality_rating}/5`}
              sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
            />
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

// Internal wrapper — kept so the tab switch logic is unchanged
function BrandsTab({
  isLoading,
  brandLinks,
  variants,
}: {
  isLoading: boolean;
  brandLinks: BrandWithVariantLinks[];
  variants: Material[];
}) {
  return <BrandsTabContent isLoading={isLoading} brandLinks={brandLinks} variants={variants} />;
}

// =====================================================
// Variants tab
// =====================================================
function VariantsTab({
  isLoading,
  variants,
  canEdit = false,
  parentMaterial,
}: {
  isLoading: boolean;
  variants: MaterialWithDetails[];
  canEdit?: boolean;
  parentMaterial: MaterialWithDetails;
}) {
  // Which row is in inline-edit mode (variantId), or "add" for the new-variant card
  const [editing, setEditing] = useState<string | "add" | null>(null);
  const { openImage } = useImageViewer();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
      {variants.length === 0 && editing !== "add" && (
        <Box sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No variants for this material yet.
          </Typography>
        </Box>
      )}

      {variants.map((v) =>
        editing === v.id ? (
          <VariantInlineCard
            key={v.id}
            mode="edit"
            parentMaterial={parentMaterial}
            variant={v}
            onCancel={() => setEditing(null)}
            onSaved={() => setEditing(null)}
          />
        ) : (
          <Box
            key={v.id}
            sx={{
              px: 1.5,
              py: 1,
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              display: "flex",
              gap: 1.25,
              alignItems: "center",
            }}
          >
            <Box
              onClick={
                v.image_url
                  ? () => openImage({ src: v.image_url!, title: v.name })
                  : undefined
              }
              sx={{ flexShrink: 0, cursor: v.image_url ? "zoom-in" : "default", display: "flex" }}
            >
              <EntityImageAvatar
                src={v.image_url}
                name={v.name}
                size={40}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
              />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{v.name}</Typography>
              <Typography
                sx={{
                  fontSize: 10.5,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.4,
                }}
              >
                {[v.code, UNIT_LABELS[v.unit as MaterialUnit] || v.unit].filter(Boolean).join(" · ")}
              </Typography>
            </Box>
            {canEdit && (
              <Tooltip title="Edit variant" placement="top">
                <IconButton size="small" onClick={() => setEditing(v.id)}>
                  <EditIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Tooltip>
            )}
          </Box>
        )
      )}

      {/* Add Variant: inline card or "+ Add" affordance */}
      {canEdit && editing === "add" && (
        <VariantInlineCard
          mode="add"
          parentMaterial={parentMaterial}
          onCancel={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {canEdit && editing !== "add" && (
        <Box
          onClick={() => setEditing("add")}
          sx={{
            px: 1.5,
            py: 1.25,
            border: "1px dashed",
            borderColor: "divider",
            borderRadius: 1.5,
            display: "flex",
            gap: 1,
            alignItems: "center",
            cursor: "pointer",
            color: "text.secondary",
            "&:hover": {
              borderColor: "primary.main",
              color: "primary.main",
              bgcolor: alpha("#1976d2", 0.04),
            },
          }}
        >
          <AddCircleOutlineIcon sx={{ fontSize: 18 }} />
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>Add variant</Typography>
        </Box>
      )}
    </Box>
  );
}

// =====================================================
// Activity tab — placeholder
// =====================================================
function ActivityTab() {
  return (
    <Box sx={{ p: 3, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        Recent purchase orders for this material will appear here.
      </Typography>
    </Box>
  );
}

// =====================================================
// Price History tab
// =====================================================
function PriceHistoryTab({
  isLoading,
  entries,
  variants,
  parentMaterialId,
  onAddPrice,
}: {
  isLoading: boolean;
  entries: PriceHistoryWithDetails[];
  variants: Material[];
  parentMaterialId: string;
  onAddPrice: () => void;
}) {
  // Track which material we last initialized for, so selection resets on material change
  const initializedFor = useRef<string | null>(null);

  // null = parent material, string = variant id
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(null);
  // "ALL" = all brands, "NO_BRAND" = entries with no brand, string = specific brand id
  const [selectedBrandId, setSelectedBrandId] = useState<string>("ALL");

  // Reset brand selection when material changes
  useEffect(() => {
    if (initializedFor.current === parentMaterialId) return;
    initializedFor.current = parentMaterialId;
    setSelectedVariantId(null);
    setSelectedBrandId("ALL");
  }, [parentMaterialId]);

  // Filter by selected variant: null = all entries (across parent + all variants)
  const variantFiltered = useMemo(
    () =>
      selectedVariantId === null
        ? entries
        : entries.filter((e) => e.material_id === selectedVariantId),
    [entries, selectedVariantId]
  );

  // Available brands within the variant-filtered set
  const brandsInFilter = useMemo(() => {
    const map = new Map<string, string>();
    let hasNoBrand = false;
    for (const e of variantFiltered) {
      if (e.brand_id && e.brand?.brand_name) {
        map.set(e.brand_id, e.brand.brand_name);
      } else if (!e.brand_id) {
        hasNoBrand = true;
      }
    }
    return { brands: Array.from(map.entries()), hasNoBrand };
  }, [variantFiltered]);

  // Filter by selected brand
  const brandFiltered = useMemo(() => {
    if (selectedBrandId === "ALL") return variantFiltered;
    if (selectedBrandId === "NO_BRAND")
      return variantFiltered.filter((e) => !e.brand_id);
    return variantFiltered.filter((e) => e.brand_id === selectedBrandId);
  }, [variantFiltered, selectedBrandId]);

  // Deduplicate: same date + vendor + price = one data point (avoids delivery-receipt fan-out)
  const dedupedEntries = useMemo(() => {
    const seen = new Set<string>();
    return brandFiltered.filter((e) => {
      const key = `${e.recorded_date}|${e.vendor_id}|${e.price}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [brandFiltered]);

  // Sort desc by date for display
  const sortedEntries = useMemo(
    () =>
      [...dedupedEntries].sort(
        (a, b) =>
          new Date(b.recorded_date).getTime() -
          new Date(a.recorded_date).getTime()
      ),
    [dedupedEntries]
  );

  const sparklinePoints = sortedEntries.map((e) => ({
    date: e.recorded_date,
    price: e.price,
  }));

  const latestPrice = sortedEntries[0]?.price;
  const prices = sortedEntries.map((e) => e.price);
  const minPrice = prices.length ? Math.min(...prices) : null;
  const maxPrice = prices.length ? Math.max(...prices) : null;

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        <Skeleton variant="rounded" height={40} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={32} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={64} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={32} sx={{ mb: 0.5 }} />
        <Skeleton variant="rounded" height={32} />
      </Box>
    );
  }

  if (entries.length === 0) {
    return (
      <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
        <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
          <Button
            size="small"
            startIcon={<AddCircleOutlineIcon sx={{ fontSize: 14 }} />}
            onClick={onAddPrice}
            sx={{ fontSize: 11, py: 0.4, px: 1 }}
          >
            Record Price
          </Button>
        </Box>
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No price history recorded yet.
          </Typography>
        </Box>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1.25 }}>
      {/* Variant selector chips — show all variants regardless of whether they have entries */}
      {variants.length > 0 && (
        <Box>
          <Typography
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              mb: 0.5,
            }}
          >
            Grade / Variant
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            <Chip
              label="All grades"
              size="small"
              variant={selectedVariantId === null ? "filled" : "outlined"}
              color={selectedVariantId === null ? "primary" : "default"}
              onClick={() => {
                setSelectedVariantId(null);
                setSelectedBrandId("ALL");
              }}
              sx={{ fontSize: 11, height: 24 }}
            />
            {variants.map((v) => (
              <Chip
                key={v.id}
                label={v.name}
                size="small"
                variant={selectedVariantId === v.id ? "filled" : "outlined"}
                color={selectedVariantId === v.id ? "primary" : "default"}
                onClick={() => {
                  setSelectedVariantId(v.id);
                  setSelectedBrandId("ALL");
                }}
                sx={{ fontSize: 11, height: 24 }}
              />
            ))}
          </Box>
        </Box>
      )}

      {/* Brand selector chips */}
      {(brandsInFilter.brands.length > 0 || brandsInFilter.hasNoBrand) && (
        <Box>
          <Typography
            sx={{
              fontSize: 9.5,
              fontWeight: 700,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.4,
              mb: 0.5,
            }}
          >
            Brand
          </Typography>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5 }}>
            <Chip
              label="All"
              size="small"
              variant={selectedBrandId === "ALL" ? "filled" : "outlined"}
              color={selectedBrandId === "ALL" ? "primary" : "default"}
              onClick={() => setSelectedBrandId("ALL")}
              sx={{ fontSize: 11, height: 24 }}
            />
            {brandsInFilter.brands.map(([id, name]) => (
              <Chip
                key={id}
                label={name}
                size="small"
                variant={selectedBrandId === id ? "filled" : "outlined"}
                color={selectedBrandId === id ? "primary" : "default"}
                onClick={() => setSelectedBrandId(id)}
                sx={{ fontSize: 11, height: 24 }}
              />
            ))}
            {brandsInFilter.hasNoBrand && (
              <Chip
                label="No brand"
                size="small"
                variant={selectedBrandId === "NO_BRAND" ? "filled" : "outlined"}
                color={selectedBrandId === "NO_BRAND" ? "primary" : "default"}
                onClick={() => setSelectedBrandId("NO_BRAND")}
                sx={{ fontSize: 11, height: 24 }}
              />
            )}
          </Box>
        </Box>
      )}

      {/* Summary card: latest price + sparkline + Record Price button */}
      <Box
        sx={{
          px: 1.5,
          py: 1,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {latestPrice != null && (
            <Typography
              sx={{
                fontSize: 18,
                fontWeight: 800,
                fontVariantNumeric: "tabular-nums",
                lineHeight: 1.1,
              }}
            >
              {formatCurrency(latestPrice)}
            </Typography>
          )}
          {minPrice != null && maxPrice != null && minPrice !== maxPrice && (
            <Typography sx={{ fontSize: 10, color: "text.secondary" }}>
              Range: {formatCurrency(minPrice)} – {formatCurrency(maxPrice)}
            </Typography>
          )}
          <Typography sx={{ fontSize: 9.5, color: "text.secondary" }}>
            {sortedEntries.length} data point
            {sortedEntries.length !== 1 ? "s" : ""}
          </Typography>
        </Box>
        {sortedEntries.length > 1 && (
          <PriceHistorySparkline
            points={sparklinePoints}
            width={90}
            height={40}
          />
        )}
        <Button
          size="small"
          startIcon={<AddCircleOutlineIcon sx={{ fontSize: 14 }} />}
          onClick={onAddPrice}
          sx={{
            fontSize: 11,
            py: 0.4,
            px: 1,
            minWidth: 0,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          Record Price
        </Button>
      </Box>

      {/* Price entry list */}
      {sortedEntries.length === 0 ? (
        <Box sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary" sx={{ fontSize: 12 }}>
            No entries for this selection.
          </Typography>
        </Box>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          {sortedEntries.slice(0, 30).map((entry) => (
            <Box
              key={entry.id}
              sx={{
                display: "grid",
                gridTemplateColumns: "60px 1fr auto",
                alignItems: "center",
                gap: 0.75,
                px: 1.25,
                py: 0.75,
                border: 1,
                borderColor: "divider",
                borderRadius: 1,
                bgcolor: "background.paper",
              }}
            >
              <Typography
                sx={{
                  fontSize: 10,
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.3,
                }}
              >
                {formatDate(entry.recorded_date)}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 600,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {entry.vendor?.name ?? "—"}
                </Typography>
                {entry.bill_url ? (
                  <Tooltip title="View bill" placement="top">
                    <IconButton
                      size="small"
                      component="a"
                      href={entry.bill_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      sx={{ p: 0.25, color: "primary.main", flexShrink: 0 }}
                      aria-label="View bill"
                    >
                      <ReceiptIcon sx={{ fontSize: 12 }} />
                    </IconButton>
                  </Tooltip>
                ) : null}
              </Box>
              <Box sx={{ textAlign: "right" }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {formatCurrency(entry.price)}
                </Typography>
                {entry.quantity != null && (
                  <Typography sx={{ fontSize: 10, color: "text.secondary" }}>
                    {entry.quantity} {entry.unit ?? ""}
                  </Typography>
                )}
              </Box>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}

// =====================================================
// Shared label
// =====================================================
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      sx={{
        fontSize: 9.5,
        color: "text.secondary",
        textTransform: "uppercase",
        letterSpacing: 0.4,
      }}
    >
      {children}
    </Typography>
  );
}
