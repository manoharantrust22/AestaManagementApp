"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import {
  AddCircleOutline as AddIcon,
  Delete as DeleteIcon,
  Edit as EditIcon,
  Inventory2 as InventoryIcon,
} from "@mui/icons-material";
import { formatCurrency } from "@/lib/formatters";
import { packUnitPrice } from "@/lib/materials/packs";
import {
  useMaterialPacks,
  useCreateMaterialPack,
  useUpdateMaterialPack,
  useDeactivateMaterialPack,
} from "@/hooks/queries/useMaterialPacks";
import type { MaterialPack } from "@/types/material.types";

interface MaterialPacksTabProps {
  materialId: string;
  unitLabel: string;
  canEdit?: boolean;
}

/**
 * Manage the standard can/container sizes for a pack-only material.
 * Each pack records a label, the amount inside (in the base unit) and the
 * per-can price that drives honest "₹1,620 / 5 L can" display.
 */
export function MaterialPacksTab({ materialId, unitLabel, canEdit = false }: MaterialPacksTabProps) {
  const { data: packs = [], isLoading } = useMaterialPacks(materialId);
  const deactivate = useDeactivateMaterialPack();
  const [editing, setEditing] = useState<string | "add" | null>(null);

  if (isLoading) {
    return (
      <Box sx={{ p: 2, display: "flex", justifyContent: "center" }}>
        <CircularProgress size={24} />
      </Box>
    );
  }

  return (
    <Box sx={{ p: 1.5, display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography sx={{ fontSize: 11.5, color: "text.secondary", px: 0.5 }}>
        This material is sold in whole cans/containers. Requests and purchase
        orders pick a can size below; stock and usage stay in {unitLabel}.
      </Typography>

      {packs.length === 0 && editing !== "add" && (
        <Box sx={{ p: 2, textAlign: "center" }}>
          <Typography variant="body2" color="text.secondary">
            No can sizes added yet.
          </Typography>
        </Box>
      )}

      {packs.map((pack) =>
        editing === pack.id ? (
          <PackForm
            key={pack.id}
            materialId={materialId}
            unitLabel={unitLabel}
            pack={pack}
            onDone={() => setEditing(null)}
          />
        ) : (
          <Box
            key={pack.id}
            sx={{
              px: 1.5,
              py: 1,
              border: 1,
              borderColor: "divider",
              borderRadius: 1.5,
              display: "flex",
              gap: 1.25,
              alignItems: "center",
            }}
          >
            <InventoryIcon sx={{ fontSize: 22, color: "text.disabled", flexShrink: 0 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 700 }}>{pack.label}</Typography>
              <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>
                {pack.contents_qty} {unitLabel}
                {pack.price != null
                  ? ` · ${formatCurrency(pack.price)} / can`
                  : " · no price"}
                {pack.price != null
                  ? ` · ${formatCurrency(packUnitPrice(pack) ?? 0)} / ${unitLabel}`
                  : ""}
              </Typography>
            </Box>
            {canEdit && (
              <>
                <Tooltip title="Edit can size" placement="top">
                  <IconButton size="small" onClick={() => setEditing(pack.id)}>
                    <EditIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
                <Tooltip title="Remove can size" placement="top">
                  <IconButton
                    size="small"
                    onClick={() =>
                      deactivate.mutate({ id: pack.id, materialId })
                    }
                  >
                    <DeleteIcon sx={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        )
      )}

      {editing === "add" ? (
        <PackForm
          materialId={materialId}
          unitLabel={unitLabel}
          nextDisplayOrder={packs.length}
          onDone={() => setEditing(null)}
        />
      ) : canEdit ? (
        <Button
          startIcon={<AddIcon />}
          size="small"
          onClick={() => setEditing("add")}
          sx={{ alignSelf: "flex-start", mt: 0.5 }}
        >
          Add can size
        </Button>
      ) : null}
    </Box>
  );
}

function PackForm({
  materialId,
  unitLabel,
  pack,
  nextDisplayOrder = 0,
  onDone,
}: {
  materialId: string;
  unitLabel: string;
  pack?: MaterialPack;
  nextDisplayOrder?: number;
  onDone: () => void;
}) {
  const create = useCreateMaterialPack();
  const update = useUpdateMaterialPack();
  const [label, setLabel] = useState(pack?.label ?? "");
  const [contents, setContents] = useState(pack ? String(pack.contents_qty) : "");
  const [price, setPrice] = useState(pack?.price != null ? String(pack.price) : "");
  const [gstIncluded, setGstIncluded] = useState(pack?.price_includes_gst ?? false);

  const contentsNum = parseFloat(contents);
  const priceNum = price.trim() === "" ? null : parseFloat(price);
  const valid =
    label.trim().length > 0 &&
    Number.isFinite(contentsNum) &&
    contentsNum > 0 &&
    (priceNum === null || (Number.isFinite(priceNum) && priceNum >= 0));
  const saving = create.isPending || update.isPending;

  const handleSave = async () => {
    if (!valid) return;
    const payload = {
      label: label.trim(),
      contents_qty: contentsNum,
      price: priceNum,
      price_includes_gst: gstIncluded,
    };
    if (pack) {
      await update.mutateAsync({ id: pack.id, materialId, data: payload });
    } else {
      await create.mutateAsync({
        material_id: materialId,
        display_order: nextDisplayOrder,
        ...payload,
      });
    }
    onDone();
  };

  return (
    <Box
      sx={{
        px: 1.5,
        py: 1.25,
        border: 1,
        borderColor: "primary.main",
        borderRadius: 1.5,
        display: "flex",
        flexDirection: "column",
        gap: 1,
      }}
    >
      <TextField
        size="small"
        label="Label"
        placeholder="5 L can"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        fullWidth
      />
      <Box sx={{ display: "flex", gap: 1 }}>
        <TextField
          size="small"
          label="Contains"
          type="number"
          value={contents}
          onChange={(e) => setContents(e.target.value)}
          slotProps={{
            input: {
              endAdornment: <InputAdornment position="end">{unitLabel}</InputAdornment>,
              inputProps: { min: 0, step: "any" },
            },
          }}
          sx={{ flex: 1 }}
        />
        <TextField
          size="small"
          label="Price / can"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              inputProps: { min: 0, step: "any" },
            },
          }}
          sx={{ flex: 1 }}
        />
      </Box>
      <FormControlLabel
        control={
          <Switch
            size="small"
            checked={gstIncluded}
            onChange={(e) => setGstIncluded(e.target.checked)}
          />
        }
        label={
          <Typography sx={{ fontSize: 12 }}>Price includes GST</Typography>
        }
      />
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button size="small" onClick={onDone} disabled={saving}>
          Cancel
        </Button>
        <Button
          size="small"
          variant="contained"
          onClick={handleSave}
          disabled={!valid || saving}
        >
          {saving ? "Saving…" : pack ? "Save" : "Add"}
        </Button>
      </Box>
    </Box>
  );
}
