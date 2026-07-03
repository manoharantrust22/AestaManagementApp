"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from "@mui/material";

import type {
  GraniteLine,
  Space,
  SpaceOpening,
  SpaceType,
} from "@/types/spaces.types";
import { SPACE_TYPE_LABELS } from "@/types/spaces.types";
import { useCreateSpace, useUpdateSpace } from "@/hooks/queries/useSpaces";
import SectionAutocomplete from "@/components/common/SectionAutocomplete";
import FeetInchesField from "./FeetInchesField";
import GraniteLinesEditor from "./GraniteLinesEditor";
import OpeningsEditor from "./OpeningsEditor";

interface SpaceDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
  /** Preselected floor for "Add space" from a floor group. */
  defaultSectionId?: string | null;
  /** Pass a space to edit; omit to create. */
  editing?: Space | null;
}

const WALL_TILE_DEFAULT_HEIGHT_IN = 84; // 7'0" — common bathroom tiling height

export default function SpaceDialog({
  open,
  onClose,
  siteId,
  defaultSectionId = null,
  editing = null,
}: SpaceDialogProps) {
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();

  const [name, setName] = useState("");
  const [spaceType, setSpaceType] = useState<SpaceType>("bedroom");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [lengthIn, setLengthIn] = useState<number | null>(null);
  const [widthIn, setWidthIn] = useState<number | null>(null);
  const [heightIn, setHeightIn] = useState<number | null>(null);
  const [openings, setOpenings] = useState<SpaceOpening[]>([]);
  const [wallTileEnabled, setWallTileEnabled] = useState(false);
  const [tilingHeightIn, setTilingHeightIn] = useState<number | null>(null);
  const [graniteLines, setGraniteLines] = useState<GraniteLine[]>([]);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Reset form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setSpaceType(editing?.space_type ?? "bedroom");
    setSectionId(editing ? editing.section_id : defaultSectionId);
    setLengthIn(editing?.drawing_length_in ?? null);
    setWidthIn(editing?.drawing_width_in ?? null);
    setHeightIn(editing?.drawing_height_in ?? null);
    setOpenings(editing?.openings ?? []);
    setWallTileEnabled(editing?.wall_tile_enabled ?? false);
    setTilingHeightIn(editing?.tiling_height_in ?? null);
    setGraniteLines(editing?.granite_lines ?? []);
    setNotes(editing?.notes ?? "");
    setError(null);
  }, [open, editing, defaultSectionId]);

  const saving = createSpace.isPending || updateSpace.isPending;

  const handleTypeChange = (t: SpaceType) => {
    setSpaceType(t);
    // Bathrooms almost always take wall tile — pre-enable with the common height.
    if (t === "bathroom" && !wallTileEnabled) {
      setWallTileEnabled(true);
      setTilingHeightIn((h) => h ?? WALL_TILE_DEFAULT_HEIGHT_IN);
    }
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Give the space a name (e.g. Master Bedroom).");
      return;
    }
    if (lengthIn === null || widthIn === null) {
      setError("Length and width from the drawing are required.");
      return;
    }
    if (wallTileEnabled && tilingHeightIn === null) {
      setError("Set the tiling height (e.g. 7') or turn wall tile off.");
      return;
    }
    setError(null);

    const payload = {
      name: name.trim(),
      space_type: spaceType,
      section_id: sectionId,
      drawing_length_in: lengthIn,
      drawing_width_in: widthIn,
      drawing_height_in: heightIn,
      openings: openings.filter((o) => o.width_in > 0),
      wall_tile_enabled: wallTileEnabled,
      tiling_height_in: wallTileEnabled ? tilingHeightIn : null,
      granite_lines: graniteLines.filter((l) => l.length_in > 0 && l.width_in > 0),
      notes: notes.trim() || null,
    };

    try {
      if (editing) {
        await updateSpace.mutateAsync({
          id: editing.id,
          siteId,
          updates: payload,
        });
      } else {
        await createSpace.mutateAsync({
          ...payload,
          site_id: siteId,
          verified_length_in: null,
          verified_width_in: null,
          verified_height_in: null,
          verified_by: null,
          verified_at: null,
          overrides: {},
          photos: [],
          sort_order: 0,
        });
      }
      onClose();
    } catch (e) {
      // Supabase throws PostgrestError objects (not Error instances) — read
      // .message off either shape so the real cause reaches the user.
      const message =
        (e as { message?: string } | null)?.message || "Failed to save space";
      setError(message);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>{editing ? "Edit space" : "Add space"}</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ mt: 0.5 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Master Bedroom"
              size="small"
              required
              autoFocus={!editing}
              sx={{ flex: 1 }}
            />
            <TextField
              label="Type"
              select
              size="small"
              value={spaceType}
              onChange={(e) => handleTypeChange(e.target.value as SpaceType)}
              sx={{ width: { xs: "100%", sm: 160 } }}
            >
              {(Object.keys(SPACE_TYPE_LABELS) as SpaceType[]).map((t) => (
                <MenuItem key={t} value={t}>
                  {SPACE_TYPE_LABELS[t]}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <SectionAutocomplete
            siteId={siteId}
            value={sectionId}
            onChange={setSectionId}
            label="Floor"
            placeholder="Select floor..."
            autoSelectDefault={false}
          />

          <Divider textAlign="left">Dimensions (from drawing)</Divider>
          <Stack direction="row" spacing={1.5}>
            <FeetInchesField label="Length" value={lengthIn} onChange={setLengthIn} required sx={{ flex: 1 }} />
            <FeetInchesField label="Width" value={widthIn} onChange={setWidthIn} required sx={{ flex: 1 }} />
            <FeetInchesField label="Height" value={heightIn} onChange={setHeightIn} sx={{ flex: 1 }} />
          </Stack>

          <OpeningsEditor value={openings} onChange={setOpenings} />

          <Divider />

          <FormControlLabel
            control={
              <Switch
                checked={wallTileEnabled}
                onChange={(e) => {
                  setWallTileEnabled(e.target.checked);
                  if (e.target.checked && tilingHeightIn === null) {
                    setTilingHeightIn(WALL_TILE_DEFAULT_HEIGHT_IN);
                  }
                }}
              />
            }
            label="Wall tile (bathroom / dado)"
          />
          {wallTileEnabled && (
            <FeetInchesField
              label="Tiling height"
              value={tilingHeightIn}
              onChange={setTilingHeightIn}
              helperText="Wall tile band height, e.g. 7'"
              sx={{ width: 180 }}
            />
          )}

          <GraniteLinesEditor value={graniteLines} onChange={setGraniteLines} />

          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            size="small"
            multiline
            minRows={2}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : undefined}
        >
          {editing ? "Save changes" : "Add space"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
