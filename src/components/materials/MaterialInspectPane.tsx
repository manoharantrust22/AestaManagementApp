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
  Popover,
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
  PhotoCamera as PhotoCameraIcon,
  AddCircleOutline as AddCircleOutlineIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { useMaterial, useMaterialVariants, useMaterialBrands, useUpdateMaterial, useBrandVariantLinks } from "@/hooks/queries/useMaterials";
import {
  useMaterialVendorSummary,
  useMaterialPriceHistory,
  useUpdateVendorBillPolicy,
} from "@/hooks/queries/useVendorInventory";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { PriceHistorySparkline } from "@/components/shared/PriceHistorySparkline";
import { ArrowForward as ArrowForwardIcon } from "@mui/icons-material";
import { VendorBillChips } from "@/components/materials/inspect/VendorBillChips";
import { RecordPriceDialog } from "./RecordPriceDialog";
import type {
  MaterialUnit,
  MaterialWithDetails,
  MaterialVendorSummary,
  VendorBillPolicy,
  BrandWithVariantLinks,
  Material,
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

type TabKey = "overview" | "vendors" | "brands" | "variants" | "price-history" | "activity";

interface MaterialInspectPaneProps {
  materialId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (material: MaterialWithDetails) => void;
  onOpenInPage?: (material: MaterialWithDetails) => void;
  onAddVendorQuote?: (material: MaterialWithDetails) => void;
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
  onVendorClick,
  breadcrumb,
  canEdit = false,
  zIndex,
}: MaterialInspectPaneProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

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
              <EntityImageAvatar
                src={material.image_url}
                name={material.name}
                size={64}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
              />
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
          <Tab value="vendors" label="Vendors" />
          <Tab value="brands" label={`Brands${brandCount ? ` (${brandCount})` : ""}`} />
          <Tab value="variants" label={`Variants${variantCount ? ` (${variantCount})` : ""}`} />
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
            <VariantsTab isLoading={variantsLoading} variants={variants} canEdit={canEdit} />
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
      label: "HSN code",
      value: material.hsn_code || "—",
    },
    {
      label: "GST rate",
      value: material.gst_rate != null ? `${material.gst_rate}%` : "—",
    },
    {
      label: "Reorder level",
      value:
        material.reorder_level != null
          ? `${material.reorder_level} ${UNIT_LABELS[material.unit] || material.unit}`
          : "—",
    },
    {
      label: "Min order qty",
      value:
        material.min_order_qty != null
          ? `${material.min_order_qty} ${UNIT_LABELS[material.unit] || material.unit}`
          : "—",
    },
  ];

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
  const clickable = !!onVendorClick;
  const brandChips = summary.brand_chips || [];
  const overflowBrands = brandChips.length > 3 ? brandChips.length - 3 : 0;
  const lastUpdated = summary.latest_quote_updated;

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
          {summary.min_price != null ? (
            <>
              <Typography
                sx={{
                  fontSize: 13,
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                  color: "success.dark",
                }}
              >
                {formatCurrency(summary.min_price)}
              </Typography>
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

      {/* Purchase summary */}
      {summary.purchase_count > 0 ? (
        <Box
          sx={{
            display: "flex",
            gap: 1,
            flexWrap: "wrap",
            fontSize: 10.5,
            color: "text.secondary",
            mt: 0.25,
          }}
        >
          {summary.last_purchase_date ? (
            <span>
              Last: <strong>{formatCurrency(summary.last_purchase_amount ?? 0)}</strong> on{" "}
              {formatDate(summary.last_purchase_date)}
            </span>
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
          <EntityImageAvatar
            src={brand.image_url}
            name={brand.brand_name}
            size={36}
            tint={brand.is_preferred ? "primary" : "secondary"}
          />
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
}: {
  isLoading: boolean;
  variants: MaterialWithDetails[];
  canEdit?: boolean;
}) {
  const [pickerAnchor, setPickerAnchor] = useState<{ el: HTMLElement; variantId: string } | null>(null);
  const updateMaterial = useUpdateMaterial();

  const GALLERY_PHOTOS: string[] = ["CRI2HP30Stage.jpeg",
  "Chamber_brick.jpg",
  "Country_nattu_brick.jpeg",
  "Cover-Block.webp",
  "Msand.jpg",
  "PanelCRI.jpeg",
  "amman-tmt-bar-500x500.webp",
  "binding_wire.jpg",
  "chettinadPPC43.png",
  "flyash.jpg",
  "mukkal_Jalli.jpg",
  "ondra_jalli.webp",
  "psand.png",
  "red_Brick.jpg"];

  const openPicker = (e: React.MouseEvent<HTMLElement>, variantId: string) => {
    e.stopPropagation();
    setPickerAnchor({ el: e.currentTarget, variantId });
  };
  const closePicker = () => setPickerAnchor(null);

  const assignImage = (imageName: string | null) => {
    if (!pickerAnchor) return;
    const url = imageName ? `/Material_Photo/${imageName}` : null;
    updateMaterial.mutate({
      id: pickerAnchor.variantId,
      data: { image_url: url ?? undefined },
    });
    closePicker();
  };

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
        ))}
      </Box>
    );
  }
  if (variants.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No variants for this material.
        </Typography>
      </Box>
    );
  }
  return (
    <>
      <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
        {variants.map((v) => (
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
            <Box sx={{ position: "relative", flexShrink: 0 }}>
              <EntityImageAvatar
                src={v.image_url}
                name={v.name}
                size={36}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
              />
              {canEdit && (
                <Tooltip title="Change image" placement="top">
                  <IconButton
                    size="small"
                    onClick={(e) => openPicker(e, v.id)}
                    sx={{
                      position: "absolute",
                      bottom: -6,
                      right: -6,
                      width: 18,
                      height: 18,
                      bgcolor: "background.paper",
                      border: 1,
                      borderColor: "divider",
                      "&:hover": { bgcolor: "action.hover" },
                      p: 0,
                    }}
                  >
                    <PhotoCameraIcon sx={{ fontSize: 11 }} />
                  </IconButton>
                </Tooltip>
              )}
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
          </Box>
        ))}
      </Box>

      {/* Image picker popover */}
      <Popover
        open={Boolean(pickerAnchor)}
        anchorEl={pickerAnchor?.el}
        onClose={closePicker}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{ paper: { sx: { p: 1.5, width: 280 } } }}
      >
        <Typography sx={{ fontSize: 11, fontWeight: 700, mb: 1, color: "text.secondary", textTransform: "uppercase", letterSpacing: 0.5 }}>
          Choose image
        </Typography>
        <Box sx={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0.75 }}>
          {GALLERY_PHOTOS.map((fname) => (
            <Tooltip key={fname} title={fname.replace(/\.[^.]+$/, "").replace(/_/g, " ")} placement="top">
              <Box
                component="img"
                src={`/Material_Photo/${fname}`}
                alt={fname}
                onClick={() => assignImage(fname)}
                sx={{
                  width: "100%",
                  aspectRatio: "1",
                  objectFit: "cover",
                  borderRadius: 1,
                  cursor: "pointer",
                  border: 2,
                  borderColor: "transparent",
                  "&:hover": { borderColor: "primary.main" },
                }}
              />
            </Tooltip>
          ))}
        </Box>
        <Box
          onClick={() => assignImage(null)}
          sx={{
            mt: 1,
            pt: 1,
            borderTop: 1,
            borderColor: "divider",
            fontSize: 12,
            color: "text.secondary",
            cursor: "pointer",
            "&:hover": { color: "error.main" },
          }}
        >
          Remove image
        </Box>
      </Popover>
    </>
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
