"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Divider,
  Drawer,
  IconButton,
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
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { useMaterial, useMaterialVariants } from "@/hooks/queries/useMaterials";
import {
  useMaterialVendors,
  useMaterialPriceHistory,
} from "@/hooks/queries/useVendorInventory";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { PriceHistorySparkline } from "@/components/shared/PriceHistorySparkline";
import { ArrowForward as ArrowForwardIcon } from "@mui/icons-material";
import type {
  MaterialUnit,
  MaterialWithDetails,
  VendorInventoryWithDetails,
  MaterialBrand,
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
  const { data: rawVendors = [], isLoading: vendorsLoading } = useMaterialVendors(
    activeTab === "vendors" ? materialId ?? undefined : undefined
  );

  // Dedupe by (vendor_id, brand_id): same vendor + same brand should only
  // appear once. Keep the row with the most recent price update.
  const vendors = useMemo(() => {
    const map = new Map<string, (typeof rawVendors)[number]>();
    for (const row of rawVendors) {
      const key = `${row.vendor_id}::${row.brand_id ?? "no-brand"}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, row);
        continue;
      }
      const a = existing.last_price_update || existing.updated_at || "";
      const b = row.last_price_update || row.updated_at || "";
      if (b > a) map.set(key, row);
    }
    // Re-sort by current_price ascending (matches server order)
    return Array.from(map.values()).sort(
      (x, y) => (x.current_price ?? 0) - (y.current_price ?? 0)
    );
  }, [rawVendors]);
  const { data: variants = [], isLoading: variantsLoading } = useMaterialVariants(
    activeTab === "variants" ? materialId ?? undefined : undefined
  );
  const { data: priceHistory = [], isLoading: historyLoading } = useMaterialPriceHistory(
    activeTab === "price-history" ? materialId ?? undefined : undefined
  );

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

  const visibleBrands: MaterialBrand[] = (material?.brands || []).filter(
    (b) => b.is_active
  );
  const variantCount = variants.length;
  const brandCount = visibleBrands.length;

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
              vendors={vendors}
              unitLabel={UNIT_LABELS[material.unit] || material.unit}
              onAddVendorQuote={
                onAddVendorQuote ? () => onAddVendorQuote(material) : undefined
              }
              onVendorClick={onVendorClick}
            />
          ) : activeTab === "brands" ? (
            <BrandsTab brands={visibleBrands} />
          ) : activeTab === "variants" ? (
            <VariantsTab isLoading={variantsLoading} variants={variants} />
          ) : activeTab === "price-history" ? (
            <PriceHistoryTab
              isLoading={historyLoading}
              points={priceHistory.map((p) => ({
                date: p.recorded_date,
                price: p.price,
              }))}
            />
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
// Vendors tab
// =====================================================
function VendorsTab({
  isLoading,
  vendors,
  unitLabel,
  onAddVendorQuote,
  onVendorClick,
}: {
  isLoading: boolean;
  vendors: VendorInventoryWithDetails[];
  unitLabel: string;
  onAddVendorQuote?: () => void;
  onVendorClick?: (vendorId: string, vendorName: string) => void;
}) {
  const theme = useTheme();

  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} variant="rounded" height={56} sx={{ mb: 1 }} />
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

      {vendors.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No vendor quotes yet.
          </Typography>
        </Box>
      ) : (
        vendors.map((v) => {
          const lastUpdated = v.last_price_update || v.updated_at;
          const clickable = !!onVendorClick && !!v.vendor?.id;
          return (
            <Box
              key={v.id}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => {
                if (clickable && v.vendor?.id) {
                  onVendorClick(v.vendor.id, v.vendor.name);
                }
              }}
              onKeyDown={(e) => {
                if (
                  clickable &&
                  v.vendor?.id &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  onVendorClick(v.vendor.id, v.vendor.name);
                }
              }}
              sx={{
                px: 1.5,
                py: 1,
                border: 1,
                borderColor: "divider",
                borderRadius: 1.5,
                bgcolor: "background.paper",
                display: "flex",
                gap: 1.25,
                alignItems: "center",
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
              <EntityImageAvatar
                src={null}
                name={v.vendor?.name || "Vendor"}
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
                  {v.vendor?.name || "Unknown vendor"}
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
                    v.brand?.brand_name,
                    v.vendor?.shop_name,
                    lastUpdated ? `Updated ${formatDate(lastUpdated)}` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Typography>
              </Box>
              <Box sx={{ textAlign: "right", flexShrink: 0 }}>
                <Typography
                  sx={{
                    fontSize: 13,
                    fontWeight: 700,
                    fontVariantNumeric: "tabular-nums",
                    color: "success.dark",
                  }}
                >
                  {formatCurrency(v.current_price)}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 9.5,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  per {v.unit || unitLabel}
                </Typography>
              </Box>
              {clickable ? (
                <ArrowForwardIcon
                  sx={{ fontSize: 14, color: "text.disabled", flexShrink: 0 }}
                />
              ) : null}
            </Box>
          );
        })
      )}
    </Box>
  );
}

// =====================================================
// Brands tab
// =====================================================
function BrandsTab({ brands }: { brands: MaterialBrand[] }) {
  if (brands.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No brands recorded for this material.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
      {brands.map((b) => (
        <Box
          key={b.id}
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
          <EntityImageAvatar
            src={b.image_url}
            name={b.brand_name}
            size={36}
            tint={b.is_preferred ? "primary" : "secondary"}
          />
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
              {b.is_preferred ? (
                <Tooltip title="Preferred brand" placement="top">
                  <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
                </Tooltip>
              ) : (
                <StarBorderIcon sx={{ fontSize: 14, color: "text.disabled" }} />
              )}
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>
                {b.variant_name ? `${b.brand_name} ${b.variant_name}` : b.brand_name}
              </Typography>
            </Box>
            {b.notes ? (
              <Typography sx={{ fontSize: 11, color: "text.secondary", mt: 0.25 }}>
                {b.notes}
              </Typography>
            ) : null}
          </Box>
          {b.quality_rating != null ? (
            <Chip
              size="small"
              label={`${b.quality_rating}/5`}
              sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
            />
          ) : null}
        </Box>
      ))}
    </Box>
  );
}

// =====================================================
// Variants tab
// =====================================================
function VariantsTab({
  isLoading,
  variants,
}: {
  isLoading: boolean;
  variants: MaterialWithDetails[];
}) {
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
          <EntityImageAvatar
            src={v.image_url}
            name={v.name}
            size={36}
            fallbackIcon={<InventoryIcon />}
            tint="primary"
          />
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
  points,
}: {
  isLoading: boolean;
  points: { date: string; price: number }[];
}) {
  if (isLoading) {
    return (
      <Box sx={{ p: 1.5 }}>
        <Skeleton variant="rounded" height={64} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={32} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" height={32} />
      </Box>
    );
  }
  if (points.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No price history recorded yet.
        </Typography>
      </Box>
    );
  }

  const sorted = [...points].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
      <Box
        sx={{
          px: 1.5,
          py: 1.25,
          border: 1,
          borderColor: "divider",
          borderRadius: 1.5,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Typography
          sx={{
            fontSize: 9.5,
            fontWeight: 700,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.4,
          }}
        >
          {points.length} entries
        </Typography>
        <PriceHistorySparkline points={points} width={140} height={40} />
      </Box>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {sorted.slice(0, 30).map((p, i) => (
          <Box
            key={i}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
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
                fontSize: 11,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {formatDate(p.date)}
            </Typography>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatCurrency(p.price)}
            </Typography>
          </Box>
        ))}
      </Box>
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
