"use client";

/**
 * SpotPurchaseItemRow — one item line of the spot-purchase form.
 * Extracted into its own component so it can call useVendorMaterialPrice
 * (a hook) per row to auto-fill the rate from the top-selected vendor, and
 * so area materials (granite/marble, sold per sqft) can be entered by slab
 * size instead of a bare quantity.
 */

import { useEffect, useRef, type HTMLAttributes } from "react";
import {
  Autocomplete, Box, IconButton, MenuItem, Paper, Stack, TextField, Typography,
} from "@mui/material";
import { Delete as DeleteIcon } from "@mui/icons-material";

import GraniteLinesEditor from "@/components/spaces/GraniteLinesEditor";
import { graniteSqft, isAreaUnit } from "@/lib/spaces/measurements";
import { makeGraniteLine, graniteSizeNote } from "@/lib/materials/granite";
import { useVendorMaterialPrice } from "@/hooks/queries/useVendorInventory";
import type { Material, MaterialWithDetails } from "@/types/material.types";
import type { ItemRow } from "./SpotPurchaseForm";

interface SpotPurchaseItemRowProps {
  item: ItemRow;
  vendorId: string | undefined;
  materials: MaterialWithDetails[];
  categories: { id: string; name: string }[];
  canRemove: boolean;
  onChange: (patch: Partial<ItemRow>) => void;
  onRemove: () => void;
}

export default function SpotPurchaseItemRow({
  item, vendorId, materials, categories, canRemove, onChange, onRemove,
}: SpotPurchaseItemRowProps) {
  const unit = item.material?.unit ?? "";
  const isArea = isAreaUnit(item.material?.unit);

  // Auto-fill the rate from the selected vendor's price for this material —
  // once per (vendor, material) pair, and only when the user hasn't typed a
  // rate yet. Also records the catalog rate so the post-submit
  // "update vendor rate?" prompt can compare it against what was paid.
  const priceQuery = useVendorMaterialPrice(vendorId, item.material?.id ?? undefined);
  const autofilledKey = useRef<string | null>(null);
  useEffect(() => {
    const mid = item.material?.id;
    const data = priceQuery.data;
    if (!vendorId || !mid || !data) return;
    const key = `${vendorId}:${mid}`;
    if (autofilledKey.current === key) return;
    autofilledKey.current = key;
    const patch: Partial<ItemRow> = { catalogRate: data.current_vendor_price ?? undefined };
    if ((!item.rate || item.rate <= 0) && data.price != null) patch.rate = data.price;
    onChange(patch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendorId, item.material?.id, priceQuery.data]);

  // Seed a first slab line when an area material is selected.
  useEffect(() => {
    if (isArea && (!item.graniteLines || item.graniteLines.length === 0)) {
      onChange({ graniteLines: [makeGraniteLine()] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isArea, item.material?.id]);

  const lineTotal = (Number(item.qty) || 0) * (Number(item.rate) || 0);
  const rateHint =
    vendorId && item.material && priceQuery.data?.price != null
      ? `${priceQuery.data.last_purchase_price != null ? "Last paid" : "Vendor rate"}: ₹${priceQuery.data.price}`
      : null;

  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} alignItems="flex-start">
          <Autocomplete
            size="small"
            sx={{ flex: 1 }}
            options={materials}
            getOptionKey={(m) => m.id}
            getOptionLabel={(m) => {
              const parent = (m as MaterialWithDetails).parent_material;
              return parent ? `${parent.name} — ${m.name}` : m.name;
            }}
            renderOption={(props, m) => {
              const parent = (m as MaterialWithDetails).parent_material;
              const { key, ...liProps } = props as { key?: string } & HTMLAttributes<HTMLLIElement>;
              return (
                <Box component="li" key={key ?? m.id} {...liProps}>
                  <Box sx={{ display: "flex", flexDirection: "column", minWidth: 0, py: 0.25 }}>
                    {parent ? (
                      <>
                        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
                          {parent.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary" noWrap>
                          {m.name}
                        </Typography>
                      </>
                    ) : (
                      <Typography variant="body2" noWrap>{m.name}</Typography>
                    )}
                  </Box>
                </Box>
              );
            }}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            value={item.material as MaterialWithDetails | null}
            onChange={(_, v) =>
              onChange({
                material: v as Material | null,
                newMaterialName: "",
                qty: 0,
                rate: 0,
                catalogRate: undefined,
                graniteLines: [],
                sizeNote: null,
              })
            }
            renderInput={(p) => <TextField {...p} label="Material" placeholder="Search..." />}
          />
          {canRemove && (
            <IconButton aria-label="remove item" size="small" onClick={onRemove}>
              <DeleteIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>

        {!item.material && (
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
            <TextField
              size="small" label="New material name" value={item.newMaterialName}
              onChange={(e) => onChange({ newMaterialName: e.target.value })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small" label="Unit" value={item.newMaterialUnit}
              onChange={(e) => onChange({ newMaterialUnit: e.target.value })}
              sx={{ width: { sm: 110 } }}
            />
            <TextField
              select size="small" label="Category"
              value={item.newMaterialCategoryId ?? ""}
              onChange={(e) => onChange({ newMaterialCategoryId: e.target.value || null })}
              sx={{ width: { sm: 180 } }}
            >
              <MenuItem value="">(none)</MenuItem>
              {categories.map((c) => (
                <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
              ))}
            </TextField>
          </Stack>
        )}

        {isArea ? (
          <>
            <GraniteLinesEditor
              value={item.graniteLines ?? []}
              onChange={(next) =>
                onChange({
                  graniteLines: next,
                  qty: graniteSqft(next),
                  sizeNote: graniteSizeNote(next) || null,
                })
              }
            />
            <Stack direction="row" spacing={1}>
              <TextField
                size="small" label={`Area (${unit})`}
                value={item.qty ? String(item.qty) : "0"}
                InputProps={{ readOnly: true }} sx={{ flex: 1 }}
              />
              <TextField
                size="small" type="number" label={`Rate / ${unit}`} value={item.rate}
                onChange={(e) => onChange({ rate: Number(e.target.value) })}
                sx={{ flex: 1 }}
              />
              <TextField
                size="small" label="Line total" value={lineTotal.toFixed(2)}
                InputProps={{ readOnly: true }} sx={{ flex: 1 }}
              />
            </Stack>
          </>
        ) : (
          <Stack direction="row" spacing={1}>
            <TextField
              size="small" type="number" label="Qty" value={item.qty}
              onChange={(e) => onChange({ qty: Number(e.target.value) })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small" type="number" label="Rate" value={item.rate}
              onChange={(e) => onChange({ rate: Number(e.target.value) })}
              sx={{ flex: 1 }}
            />
            <TextField
              size="small" label="Line total" value={lineTotal.toFixed(2)}
              InputProps={{ readOnly: true }} sx={{ flex: 1 }}
            />
          </Stack>
        )}

        {rateHint && (
          <Typography variant="caption" color="text.secondary">{rateHint}</Typography>
        )}
      </Stack>
    </Paper>
  );
}
