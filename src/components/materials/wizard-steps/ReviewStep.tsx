"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";
import type { ContainerSizeRow } from "@/components/materials/ContainerSizesEditor";
import type { VariantFormData } from "@/types/material.types";
import { formatCurrencyFull } from "@/lib/formatters";

interface ReviewStepProps {
  categoryName: string | null;
  brandName: string;
  name: string;
  unitLabel: string;
  variants: VariantFormData[];
  packsByVariant: ContainerSizeRow[][];
}

/** Step 5 of the branded wizard: read-only confirmation before writing anything. */
export default function ReviewStep({
  categoryName,
  brandName,
  name,
  unitLabel,
  variants,
  packsByVariant,
}: ReviewStepProps) {
  return (
    <Box sx={{ maxWidth: 640, mx: "auto" }}>
      <Stack direction="row" gap={1} flexWrap="wrap" sx={{ mb: 2 }}>
        {categoryName && <Chip size="small" label={categoryName} />}
        <Chip size="small" label={brandName || "No brand"} color="primary" variant="outlined" />
        <Chip size="small" label={unitLabel} variant="outlined" />
      </Stack>
      <Typography sx={{ fontSize: 18, fontWeight: 700, mb: 2 }}>
        {name || "Untitled product"}
      </Typography>

      <Stack gap={2}>
        {variants.map((variant, i) => {
          const rows = (packsByVariant[i] ?? []).filter(
            (r) => parseFloat(r.contents_qty) > 0
          );
          return (
            <Box key={i} sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 1.75 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700, mb: 1 }}>
                {variant.name}
              </Typography>
              {rows.length === 0 ? (
                <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                  No pack sizes added
                </Typography>
              ) : (
                <Stack gap={0.5}>
                  {rows.map((r, j) => {
                    const price = parseFloat(r.price);
                    const hasPrice = Number.isFinite(price) && price > 0;
                    return (
                      <Stack key={j} direction="row" justifyContent="space-between">
                        <Typography sx={{ fontSize: 13 }}>
                          {r.label || `${r.contents_qty} ${unitLabel}`}
                        </Typography>
                        <Typography
                          sx={{ fontSize: 13, fontWeight: 600, color: hasPrice ? "text.primary" : "text.secondary" }}
                        >
                          {hasPrice ? formatCurrencyFull(price) : "No price yet"}
                        </Typography>
                      </Stack>
                    );
                  })}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>
    </Box>
  );
}
