"use client";

/**
 * One material line inside the multi-line Backfill manual dialog. Each line is
 * its own component so it can legally call the per-row auto-fill hook
 * (useVendorMaterialPrice) — the same hook-per-row pattern used by
 * src/components/materials/RequestItemRow.tsx.
 *
 * Line shape (owned by the parent BackfillManualDialog):
 *   material  — draftable (freeSolo); no id => mints a draft material on save
 *   qty       — string-bound number
 *   unit      — editable only for draft (no-id) materials
 *   unitPrice — editable; auto-filled from the vendor's last quote when both
 *               the vendor and the material have real DB ids
 *   priceTouched — true once the user edits the rate => stop auto-overwriting
 */

import { useEffect, useRef } from "react";
import {
  Box,
  Typography,
  TextField,
  Autocomplete,
  MenuItem,
  IconButton,
} from "@mui/material";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr, fmtDateShort } from "@/lib/material-hub/formatters";
import { useVendorMaterialPrice } from "@/hooks/queries/useVendorInventory";

export interface BackfillLine {
  key: string;
  material: { id?: string; name: string; unit: string } | null;
  unit: string;
  qty: string;
  unitPrice: string;
  priceTouched: boolean;
}

export interface BackfillLineRowProps {
  line: BackfillLine;
  /** Shared record-level vendor id (undefined when the vendor is a draft). */
  vendorId: string | undefined;
  materials: any[];
  units: string[];
  canRemove: boolean;
  onChange: (patch: Partial<BackfillLine>) => void;
  onRemove: () => void;
}

export default function BackfillLineRow({
  line,
  vendorId,
  materials,
  units,
  canRemove,
  onChange,
  onRemove,
}: BackfillLineRowProps) {
  const { data: priceData } = useVendorMaterialPrice(vendorId, line.material?.id);

  // Reset the once-per-combo auto-fill latch when the vendor or material
  // changes so the next quote can populate the field. Declared first so it
  // runs before the fill effect on a vendor/material swap.
  const hasAutoFilled = useRef(false);
  useEffect(() => {
    hasAutoFilled.current = false;
  }, [vendorId, line.material?.id]);

  // Auto-fill the unit price from the vendor's last quote (once per combo,
  // never over the user's own edit, only when the field is empty).
  useEffect(() => {
    if (!priceData?.price) return;
    if (hasAutoFilled.current) return;
    if (line.priceTouched) return;
    if (line.unitPrice && line.unitPrice !== "0") return;
    hasAutoFilled.current = true;
    onChange({ unitPrice: String(priceData.price) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [priceData]);

  const qtyN = parseFloat(line.qty) || 0;
  const priceN = parseFloat(line.unitPrice) || 0;
  const lineTotal = qtyN * priceN;
  const isDraftMaterial = !!line.material && !line.material.id;
  const showPriceHint = !!priceData?.price;

  return (
    <Box
      sx={{
        border: `1px solid ${hubTokens.hairline}`,
        borderRadius: "10px",
        padding: "10px 12px",
        background: hubTokens.bg,
      }}
    >
      {/* Row 1: material + remove */}
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
        <Autocomplete
          freeSolo
          fullWidth
          options={materials as any[]}
          getOptionLabel={(opt) =>
            typeof opt === "string" ? opt : opt.name ?? ""
          }
          value={line.material}
          onChange={(_, val) => {
            if (typeof val === "string") {
              onChange({
                material: { name: val, unit: line.unit },
                unitPrice: "",
                priceTouched: false,
              });
            } else if (val) {
              onChange({
                material: { id: val.id, name: val.name, unit: val.unit ?? "piece" },
                unit: val.unit ?? "piece",
                unitPrice: "",
                priceTouched: false,
              });
            } else {
              onChange({ material: null, unitPrice: "", priceTouched: false });
            }
          }}
          onInputChange={(_, val, reason) => {
            if (reason === "input")
              onChange({
                material: line.material?.id
                  ? { ...line.material, name: val }
                  : { name: val, unit: line.material?.unit ?? line.unit },
              });
          }}
          slotProps={{ popper: { disablePortal: false } }}
          renderOption={(props, opt: any) => (
            <Box component="li" {...props} key={opt.id}>
              <Box>
                <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
                  {opt.name}
                  {opt.is_draft ? (
                    <Box
                      component="span"
                      sx={{
                        marginLeft: "6px",
                        padding: "1px 5px",
                        background: hubTokens.warnSoft,
                        color: hubTokens.warn,
                        fontSize: 9,
                        fontWeight: 800,
                        borderRadius: "3px",
                      }}
                    >
                      DRAFT
                    </Box>
                  ) : null}
                </Typography>
                <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                  {opt.description || opt.code || "—"} · {opt.unit ?? "piece"}
                </Typography>
              </Box>
            </Box>
          )}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Material"
              size="small"
              helperText={
                isDraftMaterial && line.material?.name
                  ? `Will create new material "${line.material.name}" as a draft`
                  : undefined
              }
              FormHelperTextProps={{ sx: { color: hubTokens.warn } }}
            />
          )}
        />
        <IconButton
          onClick={onRemove}
          size="small"
          disabled={!canRemove}
          sx={{ mt: "2px", color: canRemove ? hubTokens.danger : hubTokens.muted }}
          aria-label="Remove material"
        >
          <DeleteOutlineIcon fontSize="small" />
        </IconButton>
      </Box>

      {/* Row 2: qty + unit + unit price + line total */}
      <Box
        sx={{
          display: "flex",
          alignItems: "flex-start",
          gap: "8px",
          mt: "10px",
          flexWrap: "wrap",
        }}
      >
        <TextField
          label={`Qty${line.material?.unit ? ` (${line.material.unit})` : ""}`}
          size="small"
          type="number"
          value={line.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          sx={{ width: 110 }}
        />
        {isDraftMaterial && (
          <TextField
            select
            size="small"
            label="Unit"
            value={line.material?.unit ?? line.unit}
            onChange={(e) =>
              onChange({
                unit: e.target.value,
                material: line.material
                  ? { ...line.material, unit: e.target.value }
                  : line.material,
              })
            }
            sx={{ width: 90 }}
          >
            {units.map((u) => (
              <MenuItem key={u} value={u}>
                {u}
              </MenuItem>
            ))}
          </TextField>
        )}
        <Box sx={{ width: 140 }}>
          <TextField
            label="Unit price (₹)"
            size="small"
            type="number"
            fullWidth
            value={line.unitPrice}
            onChange={(e) =>
              onChange({ unitPrice: e.target.value, priceTouched: true })
            }
            InputProps={{
              startAdornment: (
                <Box component="span" sx={{ mr: "4px", color: hubTokens.muted }}>
                  ₹
                </Box>
              ),
            }}
          />
          {showPriceHint && (
            <Typography
              sx={{ fontSize: 10, color: hubTokens.muted, mt: "3px", pl: "2px" }}
            >
              → Last: {inr(priceData!.price)}
              {priceData!.pricing_mode === "per_kg" ? "/kg" : ""}
              {priceData!.last_purchase_date
                ? ` · ${fmtDateShort(priceData!.last_purchase_date)}`
                : ""}
            </Typography>
          )}
        </Box>
        <Box sx={{ flex: 1, textAlign: "right", minWidth: 90, pt: "8px" }}>
          <Typography sx={{ fontSize: 10.5, color: hubTokens.muted }}>
            Line total
          </Typography>
          <Typography
            sx={{
              fontSize: 13,
              fontWeight: 700,
              fontFamily: hubTokens.mono,
              color: hubTokens.text,
            }}
          >
            {inr(lineTotal)}
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
