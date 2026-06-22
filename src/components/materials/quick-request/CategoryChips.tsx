"use client";

import { Box, Chip } from "@mui/material";
import {
  CATEGORY_COLORS,
  type CategorySectionId,
} from "@/lib/constants/materialCategories";

export type CategoryChipValue = CategorySectionId | "all";

export interface CategoryChipOption {
  id: CategoryChipValue;
  label: string;
  count: number;
}

interface CategoryChipsProps {
  options: CategoryChipOption[];
  value: CategoryChipValue;
  onChange: (value: CategoryChipValue) => void;
}

/**
 * Swipeable row of category filter chips with counts. The selected chip is
 * filled and tinted with the category's accent colour (from CATEGORY_COLORS);
 * "All" uses the primary colour. Horizontally scrollable on small screens.
 */
export function CategoryChips({ options, value, onChange }: CategoryChipsProps) {
  return (
    <Box
      sx={{
        display: "flex",
        gap: 1,
        overflowX: "auto",
        pb: 0.5,
        // Hide scrollbar but keep scrollability (touch swipe).
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": { display: "none" },
        WebkitOverflowScrolling: "touch",
      }}
    >
      {options.map((opt) => {
        const selected = opt.id === value;
        const accent =
          opt.id === "all" ? null : CATEGORY_COLORS[opt.id] ?? CATEGORY_COLORS.other;
        return (
          <Chip
            key={opt.id}
            label={`${opt.label} ${opt.count}`}
            onClick={() => onChange(opt.id)}
            variant={selected ? "filled" : "outlined"}
            color={selected && opt.id === "all" ? "primary" : "default"}
            sx={{
              flexShrink: 0,
              height: 36,
              borderRadius: 2,
              fontWeight: selected ? 700 : 500,
              ...(selected && accent
                ? { bgcolor: accent.bg, color: accent.color, borderColor: accent.color }
                : {}),
              "& .MuiChip-label": { px: 1.25 },
            }}
          />
        );
      })}
    </Box>
  );
}
