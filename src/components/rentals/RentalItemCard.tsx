"use client";

import { useState } from "react";
import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import ConstructionIcon from "@mui/icons-material/Construction";
import type { RentalItemSize, RentalItemWithDetails } from "@/types/rental.types";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";

interface RentalItemCardProps {
  item: RentalItemWithDetails;
  sizes: RentalItemSize[];
  vendorCount: number;
  lowestRate: number | null;
  isSelected: boolean;
  onSelect: () => void;
  onAddToEstimate: () => void;
}

export function RentalItemCard({
  item,
  sizes,
  vendorCount,
  lowestRate,
  isSelected,
  onSelect,
  onAddToEstimate,
}: RentalItemCardProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const visibleSizes = sizes.slice(0, 3);
  const extraCount = sizes.length - visibleSizes.length;

  return (
    <Card
      variant="outlined"
      sx={{
        borderColor: isSelected ? "primary.main" : "divider",
        borderWidth: isSelected ? 2 : 1,
        borderRadius: 2,
        transition: "border-color 0.15s",
      }}
    >
      <CardActionArea onClick={onSelect}>
        {/* Image area — 4:3 aspect ratio */}
        <Box
          sx={{
            position: "relative",
            width: "100%",
            pt: "75%",
            bgcolor: "grey.50",
            borderBottom: "1px solid",
            borderColor: "divider",
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
            {item.image_url && !imgFailed ? (
              <Box
                component="img"
                src={item.image_url}
                alt={item.name}
                loading="lazy"
                onError={() => setImgFailed(true)}
                sx={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : (
              <EntityImageAvatar
                src={null}
                name={item.name}
                size={64}
                fallbackIcon={<ConstructionIcon />}
                tint="primary"
              />
            )}
          </Box>
        </Box>

        {/* Text content */}
        <Box sx={{ p: 1.5, pb: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.5 }}>
            <Typography variant="subtitle2" fontWeight={700} noWrap sx={{ flex: 1 }}>
              {item.name}
            </Typography>
            {sizes.length > 0 && (
              <Chip
                label={`${sizes.length} sizes`}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ ml: 0.5, fontSize: 10, height: 18 }}
              />
            )}
          </Box>

          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1 }}>
            {item.category?.name ?? "—"} · per piece
          </Typography>

          {sizes.length > 0 && (
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mb: 1 }}>
              {visibleSizes.map((s) => (
                <Chip key={s.id} label={s.size_label} size="small" sx={{ fontSize: 10, height: 20 }} />
              ))}
              {extraCount > 0 && (
                <Chip label={`+${extraCount}`} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
              )}
            </Stack>
          )}

          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <Box>
              {vendorCount > 0 ? (
                <Typography variant="caption" color="success.main" fontWeight={600}>
                  {vendorCount} vendor{vendorCount > 1 ? "s" : ""}
                  {lowestRate != null && (
                    <Typography component="span" variant="caption" color="warning.main" fontWeight={700} sx={{ ml: 0.5 }}>
                      · from ₹{lowestRate}/{item.rate_type === "hourly" ? "hour" : "day"}
                    </Typography>
                  )}
                </Typography>
              ) : lowestRate != null ? (
                <Typography variant="caption" color="warning.main" fontWeight={700}>
                  ₹{lowestRate}/{item.rate_type === "hourly" ? "hour" : "day"}
                </Typography>
              ) : (
                <Typography variant="caption" color="text.disabled">
                  No vendors yet
                </Typography>
              )}
            </Box>
          </Box>
        </Box>
      </CardActionArea>

      <Box
        onClick={(e) => { e.stopPropagation(); onAddToEstimate(); }}
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          px: 1.5,
          py: 0.75,
          borderTop: "1px solid",
          borderColor: "divider",
          cursor: "pointer",
          bgcolor: "warning.light",
          "&:hover": { bgcolor: "warning.main" },
          borderRadius: "0 0 8px 8px",
        }}
      >
        <AddShoppingCartIcon sx={{ fontSize: 14, color: "warning.contrastText" }} />
        <Typography variant="caption" fontWeight={700} color="warning.contrastText">
          + Estimate
        </Typography>
      </Box>
    </Card>
  );
}
