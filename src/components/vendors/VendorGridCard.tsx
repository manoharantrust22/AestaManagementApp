"use client";

import React, { useEffect, useState } from "react";
import { Box, Chip, Typography, alpha, useTheme } from "@mui/material";
import {
  Storefront as StorefrontIcon,
  Inventory2 as InventoryIcon,
  Star as StarIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import type { VendorWithCategories } from "@/types/material.types";

interface VendorGridCardProps {
  vendor: VendorWithCategories;
  materialCount: number;
  selected?: boolean;
  onClick: () => void;
}

export function VendorGridCard({
  vendor,
  materialCount,
  selected = false,
  onClick,
}: VendorGridCardProps) {
  const theme = useTheme();
  const cats = vendor.categories || [];
  const firstCat = cats[0];
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [vendor.shop_photo_url]);

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      sx={{
        cursor: "pointer",
        bgcolor: selected
          ? alpha(theme.palette.primary.main, 0.06)
          : "background.paper",
        border: 1,
        borderColor: selected
          ? alpha(theme.palette.primary.main, 0.5)
          : "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 120ms, box-shadow 120ms, border-color 120ms",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: 2,
          borderColor: alpha(theme.palette.primary.main, 0.4),
        },
      }}
    >
      <Box
        sx={{
          position: "relative",
          aspectRatio: "4 / 3",
          bgcolor: alpha(theme.palette.secondary.main, 0.04),
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        {vendor.shop_photo_url && !imgFailed ? (
          <Box
            component="img"
            src={vendor.shop_photo_url}
            alt={vendor.name}
            loading="lazy"
            onError={() => setImgFailed(true)}
            sx={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <EntityImageAvatar
            src={null}
            name={vendor.name}
            size={72}
            fallbackIcon={<StorefrontIcon />}
            tint="secondary"
          />
        )}

        {vendor.rating != null && vendor.rating > 0 ? (
          <Box
            sx={{
              position: "absolute",
              top: 6,
              left: 6,
              bgcolor: alpha(theme.palette.warning.main, 0.92),
              color: "warning.contrastText",
              px: 0.75,
              py: 0.25,
              borderRadius: 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 0.25,
              fontSize: 10.5,
              fontWeight: 700,
            }}
          >
            <StarIcon sx={{ fontSize: 11 }} />
            {vendor.rating.toFixed(1)}
          </Box>
        ) : null}

        {firstCat ? (
          <Chip
            size="small"
            label={firstCat.name}
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              height: 20,
              fontSize: 10,
              fontWeight: 600,
              bgcolor: alpha(theme.palette.background.paper, 0.92),
              color: "text.primary",
              border: 1,
              borderColor: "divider",
            }}
          />
        ) : null}
      </Box>

      <Box
        sx={{
          p: 1.25,
          display: "flex",
          flexDirection: "column",
          gap: 0.5,
          flex: 1,
        }}
      >
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            minHeight: 34,
          }}
        >
          {vendor.name}
        </Typography>
        <Typography
          sx={{
            fontSize: 10.5,
            color: "text.secondary",
            textTransform: "uppercase",
            letterSpacing: 0.4,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {[vendor.shop_name && vendor.shop_name !== vendor.name ? vendor.shop_name : null, vendor.city]
            .filter(Boolean)
            .join(" · ") || "—"}
        </Typography>

        <Box
          sx={{
            mt: "auto",
            pt: 0.75,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 0.5,
          }}
        >
          <Box sx={{ display: "flex", gap: 0.5, alignItems: "center" }}>
            {vendor.accepts_credit ? (
              <Box
                sx={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: theme.palette.success.dark,
                  bgcolor: alpha(theme.palette.success.main, 0.14),
                  px: 0.6,
                  py: 0.15,
                  borderRadius: 0.5,
                  letterSpacing: 0.3,
                }}
              >
                CREDIT
              </Box>
            ) : null}
            {vendor.accepts_upi ? (
              <Box
                sx={{
                  fontSize: 9.5,
                  fontWeight: 700,
                  color: theme.palette.info.dark,
                  bgcolor: alpha(theme.palette.info.main, 0.14),
                  px: 0.6,
                  py: 0.15,
                  borderRadius: 0.5,
                  letterSpacing: 0.3,
                }}
              >
                UPI
              </Box>
            ) : null}
          </Box>
          <Chip
            size="small"
            icon={<InventoryIcon sx={{ fontSize: 13 }} />}
            label={materialCount}
            sx={{
              height: 22,
              fontSize: 10.5,
              fontWeight: 600,
              bgcolor:
                materialCount > 0
                  ? alpha(theme.palette.primary.main, 0.12)
                  : "background.paper",
              color:
                materialCount > 0
                  ? theme.palette.primary.dark
                  : "text.secondary",
              border: materialCount > 0 ? 0 : 1,
              borderColor: "divider",
            }}
          />
        </Box>
      </Box>
    </Box>
  );
}
