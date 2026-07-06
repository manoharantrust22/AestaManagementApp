"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
  EditOutlined as EditIcon,
  GridOn as TileIcon,
} from "@mui/icons-material";

import type { ScopePhotoRef, SpaceTileOption } from "@/types/spaces.types";
import {
  useCreateTileOption,
  useDeleteTileOption,
  useTileOptions,
  useUpdateTileOption,
} from "@/hooks/queries/useSpaces";
import { formatFeetInches } from "@/lib/spaces/measurements";
import {
  ReceiptCapture,
  type ReceiptCaptureValue,
} from "@/components/common/ReceiptCapture";
import FeetInchesField from "./FeetInchesField";

interface TileOptionsManagerProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  canEdit: boolean;
}

interface FormState {
  id: string | null; // null = creating
  label: string;
  widthIn: number | null;
  heightIn: number | null;
  tilesPerBox: string;
  pricePerBox: string;
  photo: ScopePhotoRef | null;
  notes: string;
}

const emptyForm = (): FormState => ({
  id: null,
  label: "",
  widthIn: 24,
  heightIn: 24,
  tilesPerBox: "",
  pricePerBox: "",
  photo: null,
  notes: "",
});

/** Shop tile options for the site: size + photo + box details. */
export default function TileOptionsManager({
  open,
  onClose,
  siteId,
  canEdit,
}: TileOptionsManagerProps) {
  const { data: options = [] } = useTileOptions(siteId);
  const createOption = useCreateTileOption();
  const updateOption = useUpdateTileOption();
  const deleteOption = useDeleteTileOption();

  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const saving = createOption.isPending || updateOption.isPending;

  const startEdit = (o: SpaceTileOption) =>
    setForm({
      id: o.id,
      label: o.label,
      widthIn: o.tile_width_in,
      heightIn: o.tile_height_in,
      tilesPerBox: o.tiles_per_box !== null ? String(o.tiles_per_box) : "",
      pricePerBox: o.price_per_box !== null ? String(o.price_per_box) : "",
      photo: o.photo,
      notes: o.notes ?? "",
    });

  const handleSave = async () => {
    if (!form) return;
    if (!form.label.trim()) {
      setError("Give the tile a name, e.g. Kajaria Ivory 2'×2'.");
      return;
    }
    if (form.widthIn === null || form.heightIn === null) {
      setError("Tile width and height are required.");
      return;
    }
    setError(null);
    const tilesPerBox = Number(form.tilesPerBox);
    const pricePerBox = Number(form.pricePerBox);
    const fields = {
      label: form.label.trim(),
      tile_width_in: form.widthIn,
      tile_height_in: form.heightIn,
      tiles_per_box:
        form.tilesPerBox.trim() !== "" && Number.isFinite(tilesPerBox) && tilesPerBox > 0
          ? Math.round(tilesPerBox)
          : null,
      price_per_box:
        form.pricePerBox.trim() !== "" && Number.isFinite(pricePerBox) && pricePerBox > 0
          ? pricePerBox
          : null,
      photo: form.photo,
      notes: form.notes.trim() || null,
    };
    try {
      if (form.id) {
        await updateOption.mutateAsync({ id: form.id, siteId, updates: fields });
      } else {
        await createOption.mutateAsync({ ...fields, site_id: siteId });
      }
      setForm(null);
    } catch (e) {
      const message =
        (e as { message?: string } | null)?.message || "Failed to save tile";
      setError(message);
    }
  };

  const handleDelete = (o: SpaceTileOption) => {
    if (
      window.confirm(
        `Delete "${o.label}"? Spaces using it lose their tile selection (layouts stay).`
      )
    ) {
      deleteOption.mutate({ id: o.id, siteId });
    }
  };

  const handlePhoto = (v: ReceiptCaptureValue | null) => {
    if (!form) return;
    setForm({
      ...form,
      photo: v ? { ...v, capturedAt: new Date().toISOString() } : null,
    });
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Tile options</DialogTitle>
      <DialogContent>
        <Stack spacing={1.5}>
          {options.length === 0 && !form && (
            <Typography variant="body2" color="text.secondary">
              No tiles yet. Add the options you shortlisted at the shop —
              size, photo and tiles per box — then apply them to spaces to
              get exact tile & box counts.
            </Typography>
          )}

          {options.length > 0 && (
            <List dense disablePadding>
              {options.map((o) => (
                <ListItem
                  key={o.id}
                  disableGutters
                  secondaryAction={
                    canEdit ? (
                      <Stack direction="row" spacing={0.5}>
                        <IconButton size="small" aria-label="edit tile" onClick={() => startEdit(o)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" aria-label="delete tile" onClick={() => handleDelete(o)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    ) : undefined
                  }
                >
                  {o.photo ? (
                    <Box
                      component="img"
                      src={o.photo.url}
                      alt={o.label}
                      sx={{
                        width: 40,
                        height: 40,
                        objectFit: "cover",
                        borderRadius: 0.5,
                        border: 1,
                        borderColor: "divider",
                        mr: 1.5,
                      }}
                    />
                  ) : (
                    <Box
                      sx={{
                        width: 40,
                        height: 40,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        borderRadius: 0.5,
                        border: 1,
                        borderColor: "divider",
                        mr: 1.5,
                        color: "text.disabled",
                      }}
                    >
                      <TileIcon fontSize="small" />
                    </Box>
                  )}
                  <ListItemText
                    primary={o.label}
                    secondary={
                      `${formatFeetInches(o.tile_width_in)} × ${formatFeetInches(o.tile_height_in)}` +
                      (o.tiles_per_box ? ` · ${o.tiles_per_box}/box` : "") +
                      (o.price_per_box ? ` · ₹${o.price_per_box}/box` : "")
                    }
                  />
                </ListItem>
              ))}
            </List>
          )}

          {form && (
            <>
              <Divider textAlign="left">
                {form.id ? "Edit tile" : "New tile"}
              </Divider>
              <TextField
                label="Name"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Kajaria Ivory 2'×2'"
                size="small"
                required
                autoFocus
              />
              <Stack direction="row" spacing={1.5}>
                <FeetInchesField
                  label="Tile width"
                  value={form.widthIn}
                  onChange={(v) => setForm({ ...form, widthIn: v })}
                  required
                  sx={{ flex: 1 }}
                />
                <FeetInchesField
                  label="Tile height"
                  value={form.heightIn}
                  onChange={(v) => setForm({ ...form, heightIn: v })}
                  required
                  sx={{ flex: 1 }}
                />
              </Stack>
              <Stack direction="row" spacing={1.5}>
                <TextField
                  label="Tiles per box"
                  value={form.tilesPerBox}
                  onChange={(e) => setForm({ ...form, tilesPerBox: e.target.value })}
                  size="small"
                  inputProps={{ inputMode: "numeric" }}
                  sx={{ flex: 1 }}
                />
                <TextField
                  label="Price per box (₹)"
                  value={form.pricePerBox}
                  onChange={(e) => setForm({ ...form, pricePerBox: e.target.value })}
                  size="small"
                  inputProps={{ inputMode: "decimal" }}
                  sx={{ flex: 1 }}
                />
              </Stack>
              {form.photo && (
                <Box
                  component="img"
                  src={form.photo.url}
                  alt="tile"
                  sx={{
                    width: 96,
                    height: 96,
                    objectFit: "cover",
                    borderRadius: 1,
                    border: 1,
                    borderColor: "divider",
                  }}
                />
              )}
              <ReceiptCapture
                label={form.photo ? "Replace photo" : "Tile photo (from the shop)"}
                value={null}
                onChange={handlePhoto}
                folder={`${siteId}/tiles`}
                bucket="space-photos"
              />
              <TextField
                label="Notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                size="small"
                multiline
                minRows={1}
              />
              {error && <Alert severity="error">{error}</Alert>}
              <Stack direction="row" spacing={1} justifyContent="flex-end">
                <Button onClick={() => setForm(null)} disabled={saving}>
                  Cancel
                </Button>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                  startIcon={saving ? <CircularProgress size={16} /> : undefined}
                >
                  {form.id ? "Save tile" : "Add tile"}
                </Button>
              </Stack>
            </>
          )}

          {!form && canEdit && (
            <Button
              startIcon={<AddIcon />}
              onClick={() => setForm(emptyForm())}
              sx={{ alignSelf: "flex-start" }}
            >
              Add tile option
            </Button>
          )}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Close</Button>
      </DialogActions>
    </Dialog>
  );
}
