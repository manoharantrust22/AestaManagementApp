"use client";

import React, { useEffect, useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import {
  Whatshot as FireIcon,
  Inventory2 as InventoryIcon,
  Store as StoreIcon,
  ZoomIn as ZoomInIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { useImageViewer } from "@/components/common/ImageViewerProvider";
import { formatCurrency } from "@/lib/formatters";
import type { MaterialWithDetails, MaterialUnit } from "@/types/material.types";

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

interface MaterialGridCardProps {
  material: MaterialWithDetails;
  variantCount: number;
  brandCount: number;
  vendorCount: number;
  bestPrice?: number | null;
  bestPriceVendor?: string | null;
  priceNote?: string | null;
  isFrequent?: boolean;
  selected?: boolean;
  onClick: () => void;
}

export function MaterialGridCard({
  material,
  variantCount,
  brandCount,
  vendorCount,
  bestPrice,
  bestPriceVendor,
  priceNote,
  isFrequent = false,
  selected = false,
  onClick,
}: MaterialGridCardProps) {
  const theme = useTheme();
  const { openImage } = useImageViewer();
  const unitLabel = UNIT_LABELS[material.unit] || material.unit;
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [material.image_url]);

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
        "&:hover .material-card-zoom": { opacity: 1 },
      }}
    >
      {/* Image area: fixed 4:3 aspect via padding-top trick (works regardless
          of image natural aspect ratio or row stretch behavior). */}
      <Box
        sx={{
          position: "relative",
          width: "100%",
          pt: "75%", // 4:3 — height = width * 3/4
          bgcolor: alpha(theme.palette.primary.main, 0.04),
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {material.image_url && !imgFailed ? (
            <Box
              component="img"
              src={material.image_url}
              alt={material.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              sx={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                display: "block",
              }}
            />
          ) : (
            <EntityImageAvatar
              src={null}
              name={material.name}
              size={72}
              fallbackIcon={<InventoryIcon />}
              tint="primary"
            />
          )}
        </Box>

        {isFrequent ? (
          <Tooltip title="Frequently ordered" placement="top">
            <Box
              sx={{
                position: "absolute",
                top: 6,
                left: 6,
                bgcolor: alpha(theme.palette.warning.main, 0.92),
                color: "warning.contrastText",
                width: 22,
                height: 22,
                borderRadius: "50%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FireIcon sx={{ fontSize: 14 }} />
            </Box>
          </Tooltip>
        ) : null}

        {material.image_url && !imgFailed ? (
          <IconButton
            className="material-card-zoom"
            aria-label="Zoom image"
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              openImage({ src: material.image_url!, title: material.name });
            }}
            sx={{
              position: "absolute",
              bottom: 6,
              right: 6,
              width: 26,
              height: 26,
              bgcolor: alpha(theme.palette.common.black, 0.45),
              color: "#fff",
              opacity: { xs: 0.85, md: 0 },
              transition: "opacity 120ms, background-color 120ms",
              "&:hover": { bgcolor: alpha(theme.palette.common.black, 0.65) },
            }}
          >
            <ZoomInIcon sx={{ fontSize: 16 }} />
          </IconButton>
        ) : null}

        {variantCount > 0 ? (
          <Chip
            size="small"
            label={`${variantCount} variant${variantCount !== 1 ? "s" : ""}`}
            sx={{
              position: "absolute",
              top: 6,
              right: 6,
              height: 20,
              fontSize: 10.5,
              fontWeight: 600,
              bgcolor: alpha(theme.palette.info.main, 0.9),
              color: "info.contrastText",
            }}
          />
        ) : null}
      </Box>

      <Box sx={{ p: 1.25, display: "flex", flexDirection: "column", gap: 0.5, flex: 1 }}>
        <Typography
          sx={{
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.3,
            color: "text.primary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            minHeight: 34,
          }}
        >
          {material.name}
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
          {[material.code, unitLabel].filter(Boolean).join(" · ")}
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
          {bestPrice != null ? (
            <Tooltip
              placement="top"
              title={
                bestPriceVendor
                  ? `Best price: ${bestPriceVendor}${priceNote ? ` · ${priceNote}` : ""}`
                  : priceNote || "Best price"
              }
            >
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
            </Tooltip>
          ) : (
            <Typography
              sx={{
                fontSize: 11,
                color: "text.disabled",
                fontStyle: "italic",
              }}
            >
              No price
            </Typography>
          )}
          <Chip
            size="small"
            icon={<StoreIcon sx={{ fontSize: 13 }} />}
            label={vendorCount}
            sx={{
              height: 22,
              fontSize: 10.5,
              fontWeight: 600,
              bgcolor:
                vendorCount > 0
                  ? alpha(theme.palette.primary.main, 0.12)
                  : "background.paper",
              color:
                vendorCount > 0 ? theme.palette.primary.dark : "text.secondary",
              border: vendorCount > 0 ? 0 : 1,
              borderColor: "divider",
            }}
          />
        </Box>

        {brandCount > 0 ? (
          <Typography
            sx={{
              fontSize: 9.5,
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {brandCount} brand{brandCount !== 1 ? "s" : ""}
          </Typography>
        ) : null}
      </Box>
    </Box>
  );
}
