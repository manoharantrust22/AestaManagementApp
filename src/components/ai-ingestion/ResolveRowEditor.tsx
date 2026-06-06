/**
 * Popover for editing a single preview row's resolution: pick from candidates,
 * override the material name, or accept the AI's suggestion.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  Chip,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import { MATERIAL_UNITS } from "@/lib/ai-ingestion/schemas";
import type { MaterialMatchCandidate } from "@/lib/ai-ingestion/fuzzyMatch";
import type { ResolvedPreviewRow } from "@/lib/ai-ingestion/types";

interface ResolveRowEditorProps {
  anchorEl: HTMLElement | null;
  row: ResolvedPreviewRow | null;
  onClose: () => void;
  onApply: (patch: {
    overrideMaterialId: string | null;
    overrideMaterialName: string | null;
    quantity: number | null;
    unit: string;
    unitPrice: number;
    brand: string | null;
  }) => void;
}

export default function ResolveRowEditor({
  anchorEl,
  row,
  onClose,
  onApply,
}: ResolveRowEditorProps) {
  const [overrideId, setOverrideId] = useState<string>("");
  const [overrideName, setOverrideName] = useState<string>("");
  const [quantity, setQuantity] = useState<string>("");
  const [unit, setUnit] = useState<string>("");
  const [unitPrice, setUnitPrice] = useState<string>("");
  const [brand, setBrand] = useState<string>("");

  useEffect(() => {
    if (!row) return;
    setOverrideId(row.overrideMaterialId ?? "");
    setOverrideName(row.overrideMaterialName ?? row.rawName);
    setQuantity(row.quantity != null ? String(row.quantity) : "");
    setUnit(row.unit);
    setUnitPrice(String(row.unitPrice));
    setBrand(row.rawBrand ?? "");
  }, [row]);

  const candidates: MaterialMatchCandidate[] = row
    ? row.materialMatch.kind === "matched"
      ? row.materialMatch.candidates
      : row.materialMatch.kind === "ambiguous"
        ? row.materialMatch.candidates
        : []
    : [];

  // Size/pack variants of the matched material's family (e.g. 1L/5L/20L can),
  // each with its last-paid price — picking a chip snaps the line to that
  // exact variant via overrideMaterialId.
  const variantOptions = row?.variantOptions ?? [];
  const autoMatchedId =
    row && row.materialMatch.kind === "matched" ? row.materialMatch.entity.id : null;
  const selectedMaterialId = overrideId || autoMatchedId || "";

  const apply = () => {
    if (!row) return;
    const qtyNum = quantity.trim() === "" ? null : Number(quantity);
    const priceNum = unitPrice.trim() === "" ? 0 : Number(unitPrice);
    onApply({
      overrideMaterialId: overrideId === "" ? null : overrideId,
      overrideMaterialName: overrideId === "" ? overrideName.trim() || null : null,
      quantity: qtyNum != null && Number.isFinite(qtyNum) ? qtyNum : null,
      unit: unit || row.unit,
      unitPrice: Number.isFinite(priceNum) ? priceNum : row.unitPrice,
      brand: brand.trim() === "" ? null : brand.trim(),
    });
    onClose();
  };

  return (
    <Popover
      open={Boolean(anchorEl) && Boolean(row)}
      anchorEl={anchorEl}
      onClose={onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      slotProps={{ paper: { sx: { width: 360, p: 2 } } }}
    >
      {row ? (
        <Stack spacing={2}>
          <Typography variant="subtitle2">Resolve material</Typography>

          {candidates.length > 0 ? (
            <TextField
              select
              size="small"
              label="Match against existing"
              value={overrideId}
              onChange={(e) => setOverrideId(e.target.value)}
              fullWidth
            >
              <MenuItem value="">
                <em>Create as NEW</em>
              </MenuItem>
              {candidates.map((c) => (
                <MenuItem key={c.id} value={c.id}>
                  {c.name}
                  <Typography
                    component="span"
                    variant="caption"
                    color="text.secondary"
                    sx={{ ml: 1 }}
                  >
                    ({Math.round(c.score * 100)}%)
                  </Typography>
                </MenuItem>
              ))}
            </TextField>
          ) : (
            <Typography variant="body2" color="text.secondary">
              No similar materials in catalog. A new entry will be created.
            </Typography>
          )}

          {variantOptions.length > 1 ? (
            <Box>
              <Typography variant="caption" color="text.secondary" component="div" gutterBottom>
                Pick the exact size / pack — price is the last you paid:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                {variantOptions.map((v) => (
                  <Chip
                    key={v.id}
                    size="small"
                    clickable
                    onClick={() => setOverrideId(v.id)}
                    color={selectedMaterialId === v.id ? "primary" : "default"}
                    variant={selectedMaterialId === v.id ? "filled" : "outlined"}
                    label={
                      v.lastPrice != null ? `${v.name} · ₹${formatNumber(v.lastPrice)}` : v.name
                    }
                  />
                ))}
              </Stack>
            </Box>
          ) : null}

          {overrideId === "" ? (
            <Box>
              <TextField
                size="small"
                label="New material name"
                value={overrideName}
                onChange={(e) => setOverrideName(e.target.value)}
                fullWidth
                helperText={`AI extracted: "${row.rawName}"`}
              />
              {row.rawPackSize ? (
                <Box sx={{ display: "flex", alignItems: "center", gap: 1, mt: 0.75 }}>
                  <Typography variant="caption" color="text.secondary">
                    Pack size (AI): <strong>{row.rawPackSize}</strong>
                  </Typography>
                  <Button
                    size="small"
                    onClick={() => {
                      const ps = row.rawPackSize as string;
                      if (!overrideName.toLowerCase().includes(ps.toLowerCase())) {
                        setOverrideName((prev) => `${prev} ${ps}`.trim());
                      }
                    }}
                  >
                    Add to name
                  </Button>
                </Box>
              ) : null}
            </Box>
          ) : null}

          <Typography variant="subtitle2" sx={{ pt: 0.5 }}>
            Line details
          </Typography>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              type="number"
              label="Quantity"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              inputProps={{ min: 0, step: "any" }}
              fullWidth
            />
            <TextField
              select
              size="small"
              label="Unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              fullWidth
            >
              {MATERIAL_UNITS.map((u) => (
                <MenuItem key={u} value={u}>
                  {u}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
          <Stack direction="row" spacing={1}>
            <TextField
              size="small"
              type="number"
              label="Unit price (₹)"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              inputProps={{ min: 0, step: "any" }}
              fullWidth
              helperText="Per piece/can/bag — not per litre for packaged goods"
            />
            <TextField
              size="small"
              label="Brand"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
              fullWidth
              placeholder="e.g. Dr. Fixit"
            />
          </Stack>

          <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="contained" onClick={apply}>
              Apply
            </Button>
          </Box>
        </Stack>
      ) : null}
    </Popover>
  );
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
