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
  AddCircleOutline as AddMaterialIcon,
  Storefront as StorefrontIcon,
  Inventory2 as InventoryIcon,
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  Star as StarIcon,
  CreditCard as CreditIcon,
  AccountBalance as UpiIcon,
  LocalShipping as TransportIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { useVendor } from "@/hooks/queries/useVendors";
import {
  useVendorInventory,
  useVendorPriceHistory,
} from "@/hooks/queries/useVendorInventory";
import { formatCurrency, formatDate } from "@/lib/formatters";
import { PriceHistorySparkline } from "@/components/shared/PriceHistorySparkline";
import type {
  VendorWithCategories,
  VendorInventoryWithDetails,
} from "@/types/material.types";

type TabKey = "overview" | "materials" | "price-history" | "activity" | "notes";

interface VendorInspectPaneProps {
  vendorId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (vendor: VendorWithCategories) => void;
  onOpenInPage?: (vendor: VendorWithCategories) => void;
  onAddMaterial?: (vendor: VendorWithCategories) => void;
  /** Click a material row (in the Materials tab) → swap pane to that material */
  onMaterialClick?: (materialId: string, materialName: string) => void;
  /** Optional breadcrumb header — rendered above title when navigating a stack */
  breadcrumb?: React.ReactNode;
  canEdit?: boolean;
  zIndex?: number;
}

export function VendorInspectPane({
  vendorId,
  isOpen,
  onClose,
  onEdit,
  onOpenInPage,
  onAddMaterial,
  onMaterialClick,
  breadcrumb,
  canEdit = false,
  zIndex,
}: VendorInspectPaneProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const [activeTab, setActiveTab] = useState<TabKey>("overview");

  const { data: vendor, isLoading } = useVendor(vendorId ?? undefined);
  const { data: rawInventory = [], isLoading: invLoading } = useVendorInventory(
    activeTab === "materials" ? vendorId ?? undefined : undefined
  );

  // Dedupe by (material_id, brand_id): same material + same brand should
  // only appear once. Keep the row with the most recent price update.
  const inventory = useMemo(() => {
    const map = new Map<string, (typeof rawInventory)[number]>();
    for (const row of rawInventory) {
      const matKey = row.material_id ?? row.custom_material_name ?? "unknown";
      const key = `${matKey}::${row.brand_id ?? "no-brand"}`;
      const existing = map.get(key);
      if (!existing) {
        map.set(key, row);
        continue;
      }
      const a = existing.last_price_update || existing.updated_at || "";
      const b = row.last_price_update || row.updated_at || "";
      if (b > a) map.set(key, row);
    }
    return Array.from(map.values());
  }, [rawInventory]);
  const { data: priceHistory = [], isLoading: historyLoading } = useVendorPriceHistory(
    activeTab === "price-history" ? vendorId ?? undefined : undefined
  );

  useEffect(() => {
    setActiveTab("overview");
  }, [vendorId]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const materialCount = inventory.length;

  return (
    <Drawer
      anchor="right"
      variant={isMobile ? "temporary" : "persistent"}
      open={isOpen}
      onClose={onClose}
      sx={{
        zIndex,
        "& .MuiDrawer-paper": {
          width: { xs: "100%", sm: 480 },
          boxSizing: "border-box",
          borderLeft: 1,
          borderColor: "divider",
        },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
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
              Vendor
            </Typography>
            <Box sx={{ display: "flex", gap: 0.25 }}>
              {vendor && onOpenInPage ? (
                <Tooltip title="Open detail page" placement="top">
                  <IconButton size="small" onClick={() => onOpenInPage(vendor)}>
                    <OpenInNewIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : null}
              {vendor && canEdit && onEdit ? (
                <Tooltip title="Edit vendor" placement="top">
                  <IconButton size="small" onClick={() => onEdit(vendor)}>
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

          {isLoading || !vendor ? (
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
                src={vendor.shop_photo_url}
                name={vendor.name}
                size={64}
                fallbackIcon={<StorefrontIcon />}
                tint="secondary"
              />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                  <Typography
                    sx={{
                      fontSize: 16,
                      fontWeight: 700,
                      lineHeight: 1.25,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {vendor.name}
                  </Typography>
                  {vendor.rating != null && vendor.rating > 0 ? (
                    <Box
                      sx={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 0.25,
                        ml: 0.5,
                      }}
                    >
                      <StarIcon sx={{ fontSize: 14, color: "warning.main" }} />
                      <Typography
                        sx={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {vendor.rating.toFixed(1)}
                      </Typography>
                    </Box>
                  ) : null}
                </Box>
                <Typography
                  sx={{
                    fontSize: 11,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                    mt: 0.25,
                  }}
                >
                  {[vendor.shop_name && vendor.shop_name !== vendor.name ? vendor.shop_name : null, vendor.city, vendor.vendor_type]
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
          <Tab
            value="materials"
            label={`Materials${materialCount ? ` (${materialCount})` : ""}`}
          />
          <Tab value="price-history" label="Price history" />
          <Tab value="activity" label="Activity" />
          <Tab value="notes" label="Notes" />
        </Tabs>

        {/* Content */}
        <Box sx={{ flex: 1, minHeight: 0, overflow: "auto" }}>
          {!vendor && isLoading ? (
            <Box sx={{ p: 2, display: "flex", justifyContent: "center", mt: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : !vendor ? (
            <Box sx={{ p: 3, textAlign: "center" }}>
              <Typography variant="body2" color="text.secondary">
                Vendor not found.
              </Typography>
            </Box>
          ) : activeTab === "overview" ? (
            <OverviewTab vendor={vendor} />
          ) : activeTab === "materials" ? (
            <MaterialsTab
              isLoading={invLoading}
              inventory={inventory}
              onAddMaterial={
                onAddMaterial ? () => onAddMaterial(vendor) : undefined
              }
              onMaterialClick={onMaterialClick}
            />
          ) : activeTab === "price-history" ? (
            <PriceHistoryTab
              isLoading={historyLoading}
              entries={priceHistory.map((p) => ({
                id: p.id,
                date: p.recorded_date,
                price: p.price,
                materialName: p.material?.name || null,
              }))}
            />
          ) : activeTab === "activity" ? (
            <ActivityTab />
          ) : (
            <NotesTab vendor={vendor} />
          )}
        </Box>
      </Box>
    </Drawer>
  );
}

// ===== Overview =====
function OverviewTab({ vendor }: { vendor: VendorWithCategories }) {
  const theme = useTheme();
  const cats = vendor.categories || [];
  const specs = vendor.specializations || [];
  const serving = vendor.serving_locations || [];

  const contactRows: { label: string; value: React.ReactNode }[] = [];
  if (vendor.contact_person) {
    contactRows.push({ label: "Contact person", value: vendor.contact_person });
  }
  if (vendor.phone) {
    contactRows.push({
      label: "Phone",
      value: (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          <PhoneIcon sx={{ fontSize: 13 }} />
          {vendor.phone}
        </Box>
      ),
    });
  }
  if (vendor.whatsapp_number) {
    contactRows.push({
      label: "WhatsApp",
      value: (
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.5,
            color: "success.dark",
          }}
        >
          <WhatsAppIcon sx={{ fontSize: 13 }} />
          {vendor.whatsapp_number}
        </Box>
      ),
    });
  }
  if (vendor.email) {
    contactRows.push({
      label: "Email",
      value: (
        <Box sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}>
          <EmailIcon sx={{ fontSize: 13 }} />
          {vendor.email}
        </Box>
      ),
    });
  }

  const taxRows: { label: string; value: React.ReactNode }[] = [];
  if (vendor.gst_number) taxRows.push({ label: "GST number", value: vendor.gst_number });
  if (vendor.pan_number) taxRows.push({ label: "PAN", value: vendor.pan_number });
  if (vendor.payment_terms_days != null) {
    taxRows.push({
      label: "Payment terms",
      value: `${vendor.payment_terms_days} days`,
    });
  }
  if (vendor.credit_limit != null) {
    taxRows.push({
      label: "Credit limit",
      value: formatCurrency(vendor.credit_limit),
    });
  }
  if (vendor.min_order_amount != null) {
    taxRows.push({
      label: "Min order amount",
      value: formatCurrency(vendor.min_order_amount),
    });
  }

  const addressParts = [
    vendor.address,
    vendor.city,
    vendor.state,
    vendor.pincode,
  ].filter(Boolean);

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Capability badges */}
      {(vendor.accepts_credit ||
        vendor.accepts_upi ||
        vendor.accepts_cash ||
        vendor.provides_transport ||
        vendor.provides_loading ||
        vendor.provides_unloading) && (
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75 }}>
          {vendor.accepts_credit ? (
            <Chip
              size="small"
              icon={<CreditIcon sx={{ fontSize: 13 }} />}
              label={
                vendor.credit_days
                  ? `Credit · ${vendor.credit_days}d`
                  : "Credit"
              }
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: alpha(theme.palette.success.main, 0.14),
                color: theme.palette.success.dark,
                border: 0,
              }}
            />
          ) : null}
          {vendor.accepts_upi ? (
            <Chip
              size="small"
              icon={<UpiIcon sx={{ fontSize: 13 }} />}
              label="UPI"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: alpha(theme.palette.info.main, 0.14),
                color: theme.palette.info.dark,
                border: 0,
              }}
            />
          ) : null}
          {vendor.accepts_cash ? (
            <Chip
              size="small"
              label="Cash"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                color: "text.secondary",
              }}
            />
          ) : null}
          {vendor.provides_transport ? (
            <Chip
              size="small"
              icon={<TransportIcon sx={{ fontSize: 13 }} />}
              label="Transport"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: alpha(theme.palette.warning.main, 0.14),
                color: theme.palette.warning.dark,
                border: 0,
              }}
            />
          ) : null}
          {vendor.provides_loading ? (
            <Chip
              size="small"
              label="Loading"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                color: "text.secondary",
              }}
            />
          ) : null}
          {vendor.provides_unloading ? (
            <Chip
              size="small"
              label="Unloading"
              sx={{
                height: 22,
                fontSize: 11,
                fontWeight: 600,
                bgcolor: "background.paper",
                border: 1,
                borderColor: "divider",
                color: "text.secondary",
              }}
            />
          ) : null}
        </Box>
      )}

      {cats.length > 0 ? (
        <Box>
          <FieldLabel>Categories</FieldLabel>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
            {cats.map((c) => (
              <Chip
                key={c.id}
                size="small"
                label={c.name}
                sx={{ height: 22, fontSize: 11, fontWeight: 600 }}
              />
            ))}
          </Box>
        </Box>
      ) : null}

      {contactRows.length > 0 ? (
        <Section title="Contact">
          <Grid rows={contactRows} />
        </Section>
      ) : null}

      {addressParts.length > 0 ? (
        <Section title="Address">
          <Typography sx={{ fontSize: 13, fontWeight: 500, color: "text.primary" }}>
            {addressParts.join(", ")}
          </Typography>
        </Section>
      ) : null}

      {taxRows.length > 0 ? (
        <Section title="Tax & banking">
          <Grid rows={taxRows} />
        </Section>
      ) : null}

      {specs.length > 0 || serving.length > 0 ? (
        <Section title="Specializations & coverage">
          {specs.length > 0 ? (
            <Box sx={{ mb: serving.length > 0 ? 1 : 0 }}>
              <FieldLabel>Specializations</FieldLabel>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                {specs.map((s) => (
                  <Chip
                    key={s}
                    size="small"
                    label={s}
                    sx={{
                      height: 20,
                      fontSize: 10.5,
                      bgcolor: "background.paper",
                      border: 1,
                      borderColor: "divider",
                      color: "text.secondary",
                    }}
                  />
                ))}
              </Box>
            </Box>
          ) : null}
          {serving.length > 0 ? (
            <Box>
              <FieldLabel>Serving locations</FieldLabel>
              <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                {serving.map((s) => (
                  <Chip
                    key={s}
                    size="small"
                    label={s}
                    sx={{
                      height: 20,
                      fontSize: 10.5,
                      bgcolor: "background.paper",
                      border: 1,
                      borderColor: "divider",
                      color: "text.secondary",
                    }}
                  />
                ))}
              </Box>
            </Box>
          ) : null}
        </Section>
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
          Created {formatDate(vendor.created_at)}
          {vendor.updated_at !== vendor.created_at
            ? ` · Updated ${formatDate(vendor.updated_at)}`
            : ""}
        </Typography>
      </Box>
    </Box>
  );
}

// ===== Materials =====
function MaterialsTab({
  isLoading,
  inventory,
  onAddMaterial,
  onMaterialClick,
}: {
  isLoading: boolean;
  inventory: VendorInventoryWithDetails[];
  onAddMaterial?: () => void;
  onMaterialClick?: (materialId: string, materialName: string) => void;
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
      {onAddMaterial ? (
        <Box
          role="button"
          tabIndex={0}
          onClick={onAddMaterial}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onAddMaterial();
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
          <AddMaterialIcon fontSize="small" />
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            Add material to inventory
          </Typography>
        </Box>
      ) : null}

      {inventory.length === 0 ? (
        <Box sx={{ p: 3, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No materials in this vendor&apos;s inventory yet.
          </Typography>
        </Box>
      ) : (
        inventory.map((row) => {
          const matName = row.material?.name || row.custom_material_name || "Material";
          const clickable = !!onMaterialClick && !!row.material?.id;
          return (
            <Box
              key={row.id}
              role={clickable ? "button" : undefined}
              tabIndex={clickable ? 0 : undefined}
              onClick={() => {
                if (clickable && row.material?.id)
                  onMaterialClick(row.material.id, matName);
              }}
              onKeyDown={(e) => {
                if (
                  clickable &&
                  row.material?.id &&
                  (e.key === "Enter" || e.key === " ")
                ) {
                  e.preventDefault();
                  onMaterialClick(row.material.id, matName);
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
                name={matName}
                size={36}
                fallbackIcon={<InventoryIcon />}
                tint="primary"
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
                  {matName}
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
                    row.brand?.brand_name,
                    row.material?.code,
                    row.last_price_update
                      ? `Updated ${formatDate(row.last_price_update)}`
                      : null,
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
                  {formatCurrency(row.current_price)}
                </Typography>
                <Typography
                  sx={{
                    fontSize: 9.5,
                    color: "text.secondary",
                    textTransform: "uppercase",
                    letterSpacing: 0.4,
                  }}
                >
                  per {row.unit || row.material?.unit || ""}
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

// ===== Price History =====
function PriceHistoryTab({
  isLoading,
  entries,
}: {
  isLoading: boolean;
  entries: { id: string; date: string; price: number; materialName: string | null }[];
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

  if (entries.length === 0) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No price history recorded yet.
        </Typography>
      </Box>
    );
  }

  // Group by material so each gets its own sparkline
  const byMaterial = new Map<string, { date: string; price: number }[]>();
  entries.forEach((e) => {
    const key = e.materialName || "Unknown";
    if (!byMaterial.has(key)) byMaterial.set(key, []);
    byMaterial.get(key)!.push({ date: e.date, price: e.price });
  });

  return (
    <Box sx={{ p: 2, display: "flex", flexDirection: "column", gap: 1.25 }}>
      {Array.from(byMaterial.entries()).map(([material, points]) => (
        <Box
          key={material}
          sx={{
            px: 1.5,
            py: 1,
            border: 1,
            borderColor: "divider",
            borderRadius: 1.5,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 1,
          }}
        >
          <Box sx={{ minWidth: 0, flex: 1 }}>
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
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {material}
            </Typography>
          </Box>
          <PriceHistorySparkline points={points} width={120} height={36} />
        </Box>
      ))}
    </Box>
  );
}

// ===== Activity =====
function ActivityTab() {
  return (
    <Box sx={{ p: 3, textAlign: "center" }}>
      <Typography variant="body2" color="text.secondary">
        Recent purchase orders and quote updates will appear here.
      </Typography>
    </Box>
  );
}

// ===== Notes =====
function NotesTab({ vendor }: { vendor: VendorWithCategories }) {
  if (!vendor.notes) {
    return (
      <Box sx={{ p: 3, textAlign: "center" }}>
        <Typography variant="body2" color="text.secondary">
          No notes recorded.
        </Typography>
      </Box>
    );
  }
  return (
    <Box sx={{ p: 2 }}>
      <Typography
        sx={{
          fontSize: 13,
          color: "text.primary",
          whiteSpace: "pre-wrap",
        }}
      >
        {vendor.notes}
      </Typography>
    </Box>
  );
}

// ===== Helpers =====
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

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Box>
      <Divider sx={{ mb: 1 }} />
      <Typography
        sx={{
          fontSize: 11,
          fontWeight: 700,
          color: "text.secondary",
          textTransform: "uppercase",
          letterSpacing: 0.5,
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      {children}
    </Box>
  );
}

function Grid({
  rows,
}: {
  rows: { label: string; value: React.ReactNode }[];
}) {
  return (
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
            component="div"
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
  );
}
