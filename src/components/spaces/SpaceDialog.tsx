"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Autocomplete,
  Button,
  Chip,
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
  Typography,
} from "@mui/material";

import type {
  GraniteLine,
  Space,
  SpaceOpening,
  SpaceType,
} from "@/types/spaces.types";
import { DIMENSION_LABELS, SPACE_TYPE_LABELS } from "@/types/spaces.types";
import {
  useCreateSpace,
  useSpaceSections,
  useUpdateSpace,
} from "@/hooks/queries/useSpaces";
import { DEFAULT_CEILING_HEIGHT_IN } from "@/lib/spaces/measurements";
import { filterFloorSections } from "@/lib/spaces/floors";
import { suggestSpaceName } from "@/lib/spaces/naming";
import FeetInchesField from "./FeetInchesField";
import FloorSelect from "./FloorSelect";
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
  /** Existing spaces on the site — powers the type-driven name suggestion. */
  existingSpaces?: Space[];
}

const WALL_TILE_DEFAULT_HEIGHT_IN = 84; // 7'0" — common bathroom tiling height

export default function SpaceDialog({
  open,
  onClose,
  siteId,
  defaultSectionId = null,
  editing = null,
  existingSpaces = [],
}: SpaceDialogProps) {
  const createSpace = useCreateSpace();
  const updateSpace = useUpdateSpace();

  // Kept in a ref so the open-reset effect doesn't re-run (and clobber
  // user input) when the spaces list refetches while the dialog is open.
  const spacesRef = useRef(existingSpaces);
  useEffect(() => {
    spacesRef.current = existingSpaces;
  }, [existingSpaces]);
  // The last auto-filled name — a user-typed name never equals it, so we
  // only ever replace names we set ourselves.
  const lastAutoName = useRef<string | null>(null);

  const { data: sections = [] } = useSpaceSections(siteId);

  const [name, setName] = useState("");
  const [spaceType, setSpaceType] = useState<SpaceType>("bedroom");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [mirroredSectionIds, setMirroredSectionIds] = useState<string[]>([]);
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
    if (editing) {
      setName(editing.name);
      lastAutoName.current = null;
    } else {
      const suggested = suggestSpaceName("bedroom", spacesRef.current);
      setName(suggested);
      lastAutoName.current = suggested;
    }
    setSpaceType(editing?.space_type ?? "bedroom");
    setSectionId(editing ? editing.section_id : defaultSectionId);
    setMirroredSectionIds(editing?.mirrored_section_ids ?? []);
    setLengthIn(editing?.drawing_length_in ?? null);
    setWidthIn(editing?.drawing_width_in ?? null);
    setHeightIn(editing ? editing.drawing_height_in : DEFAULT_CEILING_HEIGHT_IN);
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
    // Auto-fill the name from the type, but only over our own suggestion —
    // never over something the user typed.
    if (!editing && (name.trim() === "" || name === lastAutoName.current)) {
      const suggested = suggestSpaceName(t, spacesRef.current);
      setName(suggested);
      lastAutoName.current = suggested;
    }
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
      setError("X and Y from the drawing are required.");
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
      mirrored_section_ids: mirroredSectionIds.filter((id) => id !== sectionId),
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
          tile_option_id: null,
          tile_layout: {},
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

          <FloorSelect siteId={siteId} value={sectionId} onChange={setSectionId} />

          {(() => {
            // "Typical" units repeat on several floors — offer the other
            // floor-like sections as mirrors.
            const mirrorOptions = filterFloorSections(sections, {}).filter(
              (s) => s.id !== sectionId
            );
            const selected = mirrorOptions.filter((s) =>
              mirroredSectionIds.includes(s.id)
            );
            if (mirrorOptions.length === 0 && selected.length === 0) return null;
            return (
              <Autocomplete
                multiple
                size="small"
                options={mirrorOptions}
                getOptionLabel={(o) => o.name}
                value={selected}
                onChange={(_, v) => setMirroredSectionIds(v.map((s) => s.id))}
                slotProps={{ popper: { disablePortal: false } }}
                renderTags={(value, getTagProps) =>
                  value.map((option, index) => (
                    <Chip
                      label={option.name}
                      size="small"
                      {...getTagProps({ index })}
                      key={option.id}
                    />
                  ))
                }
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Also on floors (typical unit)"
                    helperText="Identical on other floors? Quantities count on every floor."
                    size="small"
                  />
                )}
              />
            );
          })()}

          <Divider textAlign="left">Dimensions (from drawing)</Divider>
          <Stack direction="row" spacing={1.5}>
            <FeetInchesField label={DIMENSION_LABELS.x} value={lengthIn} onChange={setLengthIn} required sx={{ flex: 1 }} />
            <FeetInchesField label={DIMENSION_LABELS.y} value={widthIn} onChange={setWidthIn} required sx={{ flex: 1 }} />
            <FeetInchesField label={DIMENSION_LABELS.h} value={heightIn} onChange={setHeightIn} helperText="Typical 10'" sx={{ flex: 1 }} />
          </Stack>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>
            Enter as printed on the plan: X × Y — the first number is horizontal.
          </Typography>

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
