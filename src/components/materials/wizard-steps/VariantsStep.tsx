"use client";

import { Box, Typography } from "@mui/material";
import VariantInlineTable from "@/components/materials/VariantInlineTable";
import type { MaterialCategory, VariantFormData } from "@/types/material.types";

interface VariantsStepProps {
  parentName: string;
  parentUnit: string;
  categoryId: string | null;
  categories: MaterialCategory[];
  variants: VariantFormData[];
  onVariantsChange: (variants: VariantFormData[]) => void;
}

/**
 * Step 3 of the branded wizard: what varies within this brand's product — a
 * thin wrapper around the existing category-template-driven variant table,
 * which already resolves the right spec columns (shade for adhesives, grade
 * for cement, etc.) from the category chosen in Step 1.
 */
export default function VariantsStep({
  parentName,
  parentUnit,
  categoryId,
  categories,
  variants,
  onVariantsChange,
}: VariantsStepProps) {
  return (
    <Box sx={{ maxWidth: 720, mx: "auto" }}>
      <Typography sx={{ fontSize: 13, color: "text.secondary", mb: 1.5 }}>
        Add one row per color, size, or grade this brand sells — e.g. White, Grey.
      </Typography>
      <VariantInlineTable
        parentName={parentName}
        parentUnit={parentUnit}
        categoryId={categoryId}
        categories={categories}
        variants={variants}
        onVariantsChange={onVariantsChange}
      />
    </Box>
  );
}
