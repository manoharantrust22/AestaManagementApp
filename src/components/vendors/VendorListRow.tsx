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
  Rating,
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
  AddCircleOutline as AddMaterialIcon,
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  Storefront as StorefrontIcon,
  Inventory2 as InventoryIcon,
  CreditCard as CreditIcon,
  AccountBalance as UpiIcon,
  LocalShipping as TransportIcon,
  Star as StarIcon,
  Place as PlaceIcon,
} from "@mui/icons-material";
import { ListRow } from "@/components/common/ListRow";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { googleBusinessHref } from "@/lib/utils/contact";
import type { VendorWithCategories } from "@/types/material.types";

interface VendorListRowProps {
  vendor: VendorWithCategories;
  materialCount: number;
  selected?: boolean;
  canEdit?: boolean;
  onClick: () => void;
  onView: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddMaterial: () => void;
  /** Hover prefetch (Slice 6) */
  onHoverPrefetch?: () => void;
}

export function VendorListRow({
  vendor,
  materialCount,
  selected = false,
  canEdit = false,
  onClick,
  onView,
  onEdit,
  onDelete,
  onAddMaterial,
  onHoverPrefetch,
}: VendorListRowProps) {
  const theme = useTheme();
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const menuOpen = Boolean(menuAnchor);

  const handleOpenMenu = (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    setMenuAnchor(e.currentTarget);
  };
  const handleCloseMenu = () => setMenuAnchor(null);
  const wrap = (action: () => void) => (e?: React.MouseEvent) => {
    e?.stopPropagation();
    handleCloseMenu();
    action();
  };

  const cats = vendor.categories || [];
  const visibleCats = cats.slice(0, 2);
  const remainingCats = Math.max(0, cats.length - 2);

  const primary = (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
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
        {vendor.name}
      </Typography>
      {vendor.rating != null && vendor.rating > 0 ? (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.25,
            flexShrink: 0,
          }}
        >
          <StarIcon sx={{ fontSize: 12, color: "warning.main" }} />
          <Typography
            sx={{
              fontSize: 11,
              fontWeight: 600,
              color: "text.secondary",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {vendor.rating.toFixed(1)}
          </Typography>
        </Box>
      ) : null}
    </Box>
  );

  const secondaryParts: React.ReactNode[] = [];
  if (vendor.shop_name && vendor.shop_name !== vendor.name) {
    secondaryParts.push(vendor.shop_name);
  }
  if (vendor.city) secondaryParts.push(vendor.city);
  if (vendor.phone) {
    secondaryParts.push(
      <Box
        component="span"
        key="phone"
        sx={{ display: "inline-flex", alignItems: "center", gap: 0.25 }}
      >
        <PhoneIcon sx={{ fontSize: 11 }} />
        {vendor.phone}
      </Box>
    );
  }

  const secondary = (
    <Typography
      component="div"
      sx={{
        fontSize: 11,
        color: "text.secondary",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "flex",
        alignItems: "center",
        gap: 0.5,
      }}
    >
      {secondaryParts.map((part, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <span>·</span> : null}
          <span style={{ display: "inline-flex", alignItems: "center" }}>
            {part}
          </span>
        </React.Fragment>
      ))}
      {vendor.whatsapp_number ? (
        <Tooltip title="Has WhatsApp" placement="top">
          <WhatsAppIcon sx={{ fontSize: 12, color: "success.main", ml: 0.25 }} />
        </Tooltip>
      ) : null}
      {googleBusinessHref(vendor.google_business_url) ? (
        <Tooltip title="View on Google" placement="top">
          <Box
            component="a"
            href={googleBusinessHref(vendor.google_business_url)!}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            sx={{
              display: "inline-flex",
              alignItems: "center",
              color: "primary.main",
              ml: 0.25,
            }}
          >
            <PlaceIcon sx={{ fontSize: 13 }} />
          </Box>
        </Tooltip>
      ) : null}
    </Typography>
  );

  const chips = (
    <>
      {visibleCats.map((cat) => (
        <Chip
          key={cat.id}
          size="small"
          label={cat.name}
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
      ))}
      {remainingCats > 0 ? (
        <Chip
          size="small"
          label={`+${remainingCats}`}
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
      {vendor.accepts_credit ? (
        <Chip
          size="small"
          icon={<CreditIcon sx={{ fontSize: 12 }} />}
          label="Credit"
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: alpha(theme.palette.success.main, 0.12),
            color: theme.palette.success.dark,
            border: 0,
          }}
        />
      ) : null}
      {vendor.accepts_upi ? (
        <Chip
          size="small"
          icon={<UpiIcon sx={{ fontSize: 12 }} />}
          label="UPI"
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
      {vendor.provides_transport ? (
        <Chip
          size="small"
          icon={<TransportIcon sx={{ fontSize: 12 }} />}
          label="Transport"
          sx={{
            height: 20,
            fontSize: 10.5,
            fontWeight: 600,
            bgcolor: alpha(theme.palette.warning.main, 0.12),
            color: theme.palette.warning.dark,
            border: 0,
          }}
        />
      ) : null}
    </>
  );

  const rightContent = (
    <Chip
      size="small"
      icon={<InventoryIcon sx={{ fontSize: 13 }} />}
      label={
        materialCount > 0
          ? `${materialCount} material${materialCount !== 1 ? "s" : ""}`
          : "No materials"
      }
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        height: 22,
        fontSize: 10.5,
        fontWeight: 600,
        bgcolor:
          materialCount > 0
            ? alpha(theme.palette.primary.main, 0.12)
            : "background.paper",
        color:
          materialCount > 0 ? theme.palette.primary.dark : "text.secondary",
        border: materialCount > 0 ? 0 : 1,
        borderColor: "divider",
        cursor: "pointer",
        "&:hover": {
          bgcolor:
            materialCount > 0
              ? alpha(theme.palette.primary.main, 0.18)
              : "action.hover",
        },
      }}
    />
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
          paper: { sx: { minWidth: 220 } },
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
        <MenuItem onClick={wrap(onAddMaterial)}>
          <ListItemIcon>
            <AddMaterialIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
            Add material to inventory
          </ListItemText>
        </MenuItem>
        {canEdit ? (
          <MenuItem onClick={wrap(onEdit)}>
            <ListItemIcon>
              <EditIcon fontSize="small" />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
              Edit vendor
            </ListItemText>
          </MenuItem>
        ) : null}
        {canEdit ? (
          <MenuItem onClick={wrap(onDelete)} sx={{ color: "error.main" }}>
            <ListItemIcon>
              <DeleteIcon fontSize="small" sx={{ color: "error.main" }} />
            </ListItemIcon>
            <ListItemText primaryTypographyProps={{ fontSize: 13 }}>
              Delete vendor
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
          src={vendor.shop_photo_url}
          name={vendor.name}
          size={56}
          fallbackIcon={<StorefrontIcon />}
          tint="secondary"
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
      ariaLabel={`Vendor ${vendor.name}`}
    />
  );
}
