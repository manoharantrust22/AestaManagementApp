"use client";

import { useMemo } from "react";
import {
  Box,
  Button,
  Divider,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import { ContentCopy as CopyIcon } from "@mui/icons-material";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import ContainerSizesEditor, {
  blankContainerSize,
  type ContainerSizeRow,
} from "@/components/materials/ContainerSizesEditor";
import type { VariantFormData } from "@/types/material.types";

interface PacksPricingStepProps {
  variants: VariantFormData[];
  packsByVariant: ContainerSizeRow[][];
  onPacksByVariantChange: (packs: ContainerSizeRow[][]) => void;
  unitLabel: string;
  vendorId: string | null;
  onVendorChange: (v: string | null) => void;
  quoteDate: string;
  onQuoteDateChange: (v: string) => void;
  priceIncludesGst: boolean;
  onPriceIncludesGstChange: (v: boolean) => void;
}

/**
 * Step 4 of the branded wizard: what you paid, per variant, per pack size.
 * This is the step that fixes the original limitation — one ContainerSizesEditor
 * per variant, each independently priced, instead of a single pack for the
 * whole product.
 */
export default function PacksPricingStep({
  variants,
  packsByVariant,
  onPacksByVariantChange,
  unitLabel,
  vendorId,
  onVendorChange,
  quoteDate,
  onQuoteDateChange,
  priceIncludesGst,
  onPriceIncludesGstChange,
}: PacksPricingStepProps) {
  const rowsFor = (i: number): ContainerSizeRow[] =>
    packsByVariant[i]?.length ? packsByVariant[i] : [blankContainerSize()];

  // Variants that share a name (e.g. two rows both left as "M1010 Bond Plus")
  // would otherwise render identical card titles here — disambiguate with an
  // index so pricing never gets entered against the wrong color/size by mistake.
  const nameCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const v of variants) {
      const key = v.name.trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [variants]);

  const cardTitle = (variant: VariantFormData, i: number): string => {
    const name = variant.name.trim() || `Variant ${i + 1}`;
    const key = variant.name.trim().toLowerCase();
    const isDuplicate = key && (nameCounts.get(key) ?? 0) > 1;
    return isDuplicate ? `${name} (#${i + 1})` : name;
  };

  const setRowsFor = (i: number, rows: ContainerSizeRow[]) => {
    const next = variants.map((_, idx) => (idx === i ? rows : rowsFor(idx)));
    onPacksByVariantChange(next);
  };

  const copySizesToAll = (fromIndex: number) => {
    const source = rowsFor(fromIndex);
    const next = variants.map((_, idx) =>
      idx === fromIndex
        ? source
        : source.map((r) => ({
            label: r.label,
            contents_qty: r.contents_qty,
            price: "",
            coverage: "",
          }))
    );
    onPacksByVariantChange(next);
  };

  return (
    <Box sx={{ maxWidth: 640, mx: "auto" }}>
      <Stack gap={1.5} sx={{ mb: 3 }}>
        <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
          One vendor&apos;s quote, applied to every pack size below. Other vendors&apos; prices can be
          added later.
        </Typography>
        <Stack direction="row" gap={1.5} flexWrap="wrap" alignItems="center">
          <VendorAutocomplete
            value={vendorId}
            onChange={(v) => onVendorChange((v as string) || null)}
            label="Vendor (optional)"
            placeholder="Who did you buy from?"
          />
          <TextField
            label="Purchase date"
            type="date"
            value={quoteDate}
            onChange={(e) => onQuoteDateChange(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ minWidth: 160 }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={priceIncludesGst}
                onChange={(e) => onPriceIncludesGstChange(e.target.checked)}
              />
            }
            label={<Typography sx={{ fontSize: 13 }}>Prices include GST</Typography>}
          />
        </Stack>
      </Stack>

      <Divider sx={{ mb: 2 }} />

      <Stack gap={2}>
        {variants.map((variant, i) => (
          <Box
            key={i}
            sx={{ border: 1, borderColor: "divider", borderRadius: 1.5, p: 2 }}
          >
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.25 }}>
              <Typography sx={{ fontSize: 14, fontWeight: 700 }}>
                {cardTitle(variant, i)}
              </Typography>
              {i === 0 && variants.length > 1 && (
                <Button
                  size="small"
                  startIcon={<CopyIcon fontSize="small" />}
                  onClick={() => copySizesToAll(0)}
                  sx={{ textTransform: "none" }}
                >
                  Copy sizes to all variants
                </Button>
              )}
            </Stack>
            <ContainerSizesEditor
              sizes={rowsFor(i)}
              onChange={(rows) => setRowsFor(i, rows)}
              unitLabel={unitLabel}
              showPrice
              showCoverage
            />
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
