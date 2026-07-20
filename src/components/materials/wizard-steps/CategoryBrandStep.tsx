"use client";

import { Autocomplete, Box, Stack, TextField, Typography } from "@mui/material";
import CategoryAutocomplete from "@/components/common/CategoryAutocomplete";
import { useDistinctBrandNames } from "@/hooks/queries/useMaterials";

interface CategoryBrandStepProps {
  categoryId: string;
  onCategoryChange: (id: string) => void;
  brandName: string;
  onBrandNameChange: (name: string) => void;
  /** True when converting an existing flat material — its category is already set. */
  hideCategory?: boolean;
}

/**
 * Step 1 of the branded wizard. Category is asked first because it decides
 * which spec fields the Variants step shows later — the helper text says so
 * explicitly, since a silent category -> field-set link is exactly what
 * confused users under the old single-form dialog.
 */
export default function CategoryBrandStep({
  categoryId,
  onCategoryChange,
  brandName,
  onBrandNameChange,
  hideCategory = false,
}: CategoryBrandStepProps) {
  const { data: brandNames = [] } = useDistinctBrandNames();

  return (
    <Stack gap={2.5} sx={{ maxWidth: 480, mx: "auto" }}>
      {!hideCategory && (
        <Box>
          <CategoryAutocomplete
            value={categoryId || null}
            onChange={(v) => onCategoryChange((v as string) || "")}
            parentOnly={false}
            label="Category"
            placeholder="Search categories..."
            size="medium"
          />
          <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
            Determines which spec fields (grade, shade, size...) appear on the Variants step below.
          </Typography>
        </Box>
      )}

      <Box>
        <Autocomplete
          freeSolo
          value={brandName}
          onChange={(_, v) => onBrandNameChange(v ?? "")}
          onInputChange={(_, v) => onBrandNameChange(v)}
          options={brandNames}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Brand"
              placeholder="e.g. MCP Tixolite, Berger, Ramco"
              required
              autoFocus={hideCategory}
            />
          )}
        />
        <Typography sx={{ fontSize: 12, color: "text.secondary", mt: 0.5 }}>
          Used to suggest this brand next time you add a product.
        </Typography>
      </Box>
    </Stack>
  );
}
