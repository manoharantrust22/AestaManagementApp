"use client";

import React, { useState } from "react";
import {
  Box,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Tooltip,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  MoreVert as MoreVertIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AddBusiness as AddVendorIcon,
  Whatshot as FireIcon,
  Inventory2 as InventoryIcon,
  Store as StoreIcon,
  Receipt as ReceiptIcon,
} from "@mui/icons-material";
import { ListRow } from "@/components/common/ListRow";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { formatCurrency, formatDate } from "@/lib/formatters";
import type { MaterialWithDetails, MaterialUnit } from "@/types/material.types";
import type { MaterialLatestPurchase } from "@/hooks/queries/useMaterialOrderStats";

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

interface MaterialListRowProps {
  material: MaterialWithDetails;
  variantCount: number;
  brandCount: number;
  vendorCount: number;
  bestPrice?: number | null;
  bestPriceVendor?: string | null;
  priceNote?: string | null;
  /**
   * Chronologically-latest purchase of this material (from v_material_latest_purchase).
   * Surfaces a "Last: ₹X · vendor · date · 📎" line under the best-price chip,
   * with the 📎 linking to the bill_url when present.
   */
  latestPurchase?: MaterialLatestPurchase | null;
  isFrequent?: boolean;
  selected?: boolean;
  canEdit?: boolean;
  onClick: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddVendorQuote: () => void;
  /** Hover prefetch (Slice 6) */
  onHoverPrefetch?: () => void;
}

export function MaterialListRow({
  material,
  variantCount,
  brandCount,
  vendorCount,
  bestPrice,
  bestPriceVendor,
  priceNote,
  latestPurchase,
  isFrequent = false,
  selected = false,
  canEdit = false,
  onClick,
  onView,
  onEdit,
  onDelete,
  onAddVendorQuote,
  onHoverPrefetch,
}: MaterialListRowProps) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  };
  const handleCloseMenu = () => setMenuAnchor(null);
  const wrap =
    (action: () => void) => (e?: React.MouseEvent) => {
      e?.stopPropagation();
      handleCloseMenu();
      action();
    };

  const unitLabel = UNIT_LABELS[material.unit] || material.unit;
  const visibleBrands = (material.brands || []).filter((b) => b.is_active);
  const preferredBrand = visibleBrands.find((b) => b.is_preferred) ?? visibleBrands[0];
  const remainingBrandCount = Math.max(0, brandCount - 1);

  const primary = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
      {isFrequent ? (
        <Tooltip title="Frequently ordered" placement="top">
          <FireIcon sx={{ color: "warning.main", fontSize: 14, flexShrink: 0 }} />
        </Tooltip>
      ) : null}
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: 13,
          color: "text.primary",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {material.name}
      </Typography>
    </Box>
  );

  const secondaryParts: string[] = [];
  if (material.code) secondaryParts.push(material.code);
  secondaryParts.push(unitLabel);
  if (material.category?.name) secondaryParts.push(material.category.name);

  // "Last:" line is rendered only when a purchase history exists. Distinct
  // from "best price" (lowest across vendors, shown on the right) — this is
  // the chronologically-most-recent purchase + an optional bill link.
  const lastPurchaseLine = latestPurchase ? (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: 10.5,
          color: "text.secondary",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        Last:{" "}
        <Box component="span" sx={{ fontWeight: 700, color: "text.primary", fontVariantNumeric: "tabular-nums" }}>
          {formatCurrency(latestPurchase.last_unit_price)}
        </Box>
        {latestPurchase.last_vendor_name ? ` · ${latestPurchase.last_vendor_name}` : ""}
        {" · "}
        {formatDate(latestPurchase.last_purchase_date)}
      </Typography>
      {latestPurchase.last_bill_url ? (
        <Tooltip title="View bill from latest purchase" placement="top">
          <IconButton
            size="small"
            component="a"
            href={latestPurchase.last_bill_url}
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
  ) : null;

  const secondary = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 0.125, minWidth: 0 }}>
      <Typography
        sx={{
          fontSize: 11,
          color: "text.secondary",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {secondaryParts.join(" · ")}
      </Typography>
      {lastPurchaseLine}
    </Box>
  );

  const chips = (
    <>
      {variantCount > 0 ? (
        <Chip
          size="small"
          label={`${variantCount} variant${variantCount !== 1 ? "s" : ""}`}
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: alpha(theme.palette.info.main, 0.12),
            color: theme.palette.info.dark,
            border: 0,
          }}
        />
      ) : null}
      {preferredBrand ? (
        <Chip
          size="small"
          label={
            preferredBrand.variant_name
              ? `${preferredBrand.brand_name} ${preferredBrand.variant_name}`
              : preferredBrand.brand_name
          }
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: preferredBrand.is_preferred
              ? alpha(theme.palette.primary.main, 0.14)
              : "background.paper",
            color: preferredBrand.is_preferred
              ? theme.palette.primary.dark
              : "text.secondary",
            border: preferredBrand.is_preferred ? 0 : 1,
            borderColor: "divider",
            maxWidth: 160,
            "& .MuiChip-label": {
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          }}
        />
      ) : null}
      {remainingBrandCount > 0 ? (
        <Chip
          size="small"
          label={`+${remainingBrandCount}`}
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            color: "text.secondary",
          }}
        />
      ) : null}
      {material.gst_rate ? (
        <Chip
          size="small"
          label={`GST ${material.gst_rate}%`}
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: "background.paper",
            border: 1,
            borderColor: "divider",
            color: "text.secondary",
          }}
        />
      ) : null}
    </>
  );

  const rightContent = (
    <>
      {bestPrice != null ? (
        <Tooltip
          title={bestPriceVendor ? `Best price: ${bestPriceVendor}${priceNote ? ` · ${priceNote}` : ""}` : priceNote || "Best price"}
          placement="top"
        >
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <Typography
              sx={{
                fontSize: 13,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: "success.dark",
              }}
            >
              {formatCurrency(bestPrice)}
            </Typography>
            <Typography
              sx={{
                fontSize: 9.5,
                color: "text.secondary",
                textTransform: "uppercase",
                letterSpacing: 0.4,
              }}
            >
              per {unitLabel}
            </Typography>
          </Box>
        </Tooltip>
      ) : (
        <Typography
          sx={{
            fontSize: 11,
            color: "text.disabled",
            fontStyle: "italic",
          }}
        >
          No price yet
        </Typography>
      )}
      <Chip
        size="small"
        icon={<StoreIcon sx={{ fontSize: 13 }} />}
        label={vendorCount > 0 ? `${vendorCount} vendor${vendorCount !== 1 ? "s" : ""}` : "Add vendor"}
        onClick={(e) => {
          e.stopPropagation();
          if (vendorCount === 0) {
            onAddVendorQuote();
          } else {
            onClick();
          }
        }}
        sx={{
          height: 22,
          fontSize: 10.5,
          fontWeight: 600,
          mt: 0.25,
          bgcolor:
            vendorCount > 0
              ? alpha(theme.palette.primary.main, 0.12)
              : "background.paper",
          color: vendorCount > 0 ? theme.palette.primary.dark : "text.secondary",
          border: vendorCount > 0 ? 0 : 1,
          borderColor: "divider",
          cursor: "pointer",
          "&:hover": {
            bgcolor:
              vendorCount > 0
                ? alpha(theme.palette.primary.main, 0.18)
                : "action.hover",
          },
        }}
      />
    </>
  );

  const actionsMenu = (
    <>
      <IconButton size="small" onClick={handleOpenMenu} aria-label="More actions">
        <MoreVertIcon fontSize="small" />
      </IconButton>
      <Menu
        anchorEl={menuAnchor}
        open={menuOpen}
        onClose={handleCloseMenu}
        slotProps={{
          paper: { sx: { minWidth: 200 } },
        }}
      >
        <MenuItem onClick={wrap(onView)}>
          <ListItemIcon>
            <ViewIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
            Open detail page
          </ListItemText>
        </MenuItem>
        <MenuItem onClick={wrap(onAddVendorQuote)}>
          <ListItemIcon>
            <AddVendorIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
            Add vendor quote
          </ListItemText>
        </MenuItem>
        {canEdit ? (
          <MenuItem onClick={wrap(onEdit)}>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
              Edit material
            </ListItemText>
          </MenuItem>
        ) : null}
        {canEdit ? (
          <MenuItem onClick={wrap(onDelete)} sx={{ color: "error.main" }}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: "error.main" }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
              Delete material
            </ListItemText>
          </MenuItem>
        ) : null}
      </Menu>
    </>
  );

  return (
    <ListRow
      image={
        <EntityImageAvatar
          src={material.image_url}
          name={material.name}
          size={56}
          fallbackIcon={<InventoryIcon />}
          tint="primary"
        />
      }
      primary={primary}
      secondary={secondary}
      chips={chips}
      rightContent={rightContent}
      actionsMenu={actionsMenu}
      selected={selected}
      onClick={onClick}
      onHoverPrefetch={onHoverPrefetch}
      ariaLabel={`Material ${material.name}`}
    />
  );
}
