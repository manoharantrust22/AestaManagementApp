"use client";

import { Box, ButtonBase, Chip, Stack, Typography } from "@mui/material";
import {
  StarRounded as StarIcon,
  Inventory2 as MaterialIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import type { MaterialWithDetails } from "@/types/material.types";

interface FrequentMaterialsProps {
  materials: MaterialWithDetails[];
  /** Material ids currently in the request cart (to show a "in request" badge). */
  cartIds: Set<string>;
  onSelect: (material: MaterialWithDetails) => void;
}

/**
 * Horizontal quick-reorder strip of this site's most-frequently-requested
 * materials. Tapping a tile opens the quantity picker. Renders nothing when
 * there's no history yet.
 */
export function FrequentMaterials({
  materials,
  cartIds,
  onSelect,
}: FrequentMaterialsProps) {
  if (materials.length === 0) return null;

  return (
    <Box sx={{ mb: 2.5 }}>
      <Stack direction="row" alignItems="center" spacing={0.75} sx={{ mb: 1 }}>
        <StarIcon sx={{ fontSize: 18, color: "warning.main" }} />
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ fontWeight: 700, letterSpacing: 0.4 }}
        >
          Frequently requested
        </Typography>
      </Stack>

      <Box
        sx={{
          display: "flex",
          gap: 1,
          overflowX: "auto",
          pb: 1,
          scrollbarWidth: "none",
          "&::-webkit-scrollbar": { display: "none" },
          WebkitOverflowScrolling: "touch",
        }}
      >
        {materials.map((m) => {
          const inCart = cartIds.has(m.id);
          return (
            <ButtonBase
              key={m.id}
              onClick={() => onSelect(m)}
              aria-label={`Add ${m.name}`}
              sx={{
                flexShrink: 0,
                width: 96,
                p: 1,
                borderRadius: 2,
                border: 1,
                borderColor: inCart ? "primary.main" : "divider",
                bgcolor: inCart ? "action.hover" : "background.paper",
                flexDirection: "column",
                alignItems: "center",
                gap: 0.75,
                position: "relative",
              }}
            >
              {inCart && (
                <Chip
                  size="small"
                  label="✓"
                  color="primary"
                  sx={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    height: 18,
                    minWidth: 18,
                    "& .MuiChip-label": { px: 0.5, fontSize: 11 },
                  }}
                />
              )}
              <EntityImageAvatar
                src={m.image_url}
                name={m.name}
                size={48}
                radius={1.5}
                fallbackIcon={<MaterialIcon />}
                tint="primary"
              />
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  lineHeight: 1.2,
                  textAlign: "center",
                  display: "-webkit-box",
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  width: "100%",
                }}
              >
                {m.name}
              </Typography>
            </ButtonBase>
          );
        })}
      </Box>
    </Box>
  );
}
