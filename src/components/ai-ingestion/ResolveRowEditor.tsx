/**
 * Popover for editing a single preview row's resolution: pick from candidates,
 * override the material name, or accept the AI's suggestion.
 */

"use client";

import { useEffect, useState } from "react";
import {
  Box,
  Button,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from "@mui/material";

import type { MaterialMatchCandidate } from "@/lib/ai-ingestion/fuzzyMatch";
import type { ResolvedPreviewRow } from "@/lib/ai-ingestion/types";

interface ResolveRowEditorProps {
  anchorEl: HTMLElement | null;
  row: ResolvedPreviewRow | null;
  onClose: () => void;
  onApply: (patch: {
    overrideMaterialId: string | null;
    overrideMaterialName: string | null;
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

  useEffect(() => {
    if (!row) return;
    setOverrideId(row.overrideMaterialId ?? "");
    setOverrideName(row.overrideMaterialName ?? row.rawName);
  }, [row]);

  const candidates: MaterialMatchCandidate[] = row
    ? row.materialMatch.kind === "matched"
      ? row.materialMatch.candidates
      : row.materialMatch.kind === "ambiguous"
        ? row.materialMatch.candidates
        : []
    : [];

  const apply = () => {
    onApply({
      overrideMaterialId: overrideId === "" ? null : overrideId,
      overrideMaterialName: overrideId === "" ? overrideName.trim() || null : null,
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

          {overrideId === "" ? (
            <TextField
              size="small"
              label="New material name"
              value={overrideName}
              onChange={(e) => setOverrideName(e.target.value)}
              fullWidth
              helperText={`AI extracted: "${row.rawName}"`}
            />
          ) : null}

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
