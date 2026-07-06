"use client";

import React, { useMemo, useState } from "react";
import { Divider, MenuItem, TextField } from "@mui/material";

import {
  useSpaceFloorPlans,
  useSpaces,
  useSpaceSections,
} from "@/hooks/queries/useSpaces";
import { filterFloorSections } from "@/lib/spaces/floors";

interface FloorSelectProps {
  siteId: string;
  value: string | null;
  onChange: (sectionId: string | null) => void;
  label?: string;
  size?: "small" | "medium";
  disabled?: boolean;
  error?: boolean;
  helperText?: string;
  /** Render an explicit "Unassigned" (null) option. */
  allowNone?: boolean;
  sx?: object;
}

const NONE = "__none__";
const TOGGLE = "__toggle_show_all__";

/**
 * Floor picker for the Spaces register. building_sections doubles as a
 * work-phase list on real sites, so options are filtered to floor-like
 * names (plus sections already in use and the current value), with a
 * "Show all sections" escape. Reads the same React Query caches as the
 * page — no extra fetches.
 */
export default function FloorSelect({
  siteId,
  value,
  onChange,
  label = "Floor",
  size = "small",
  disabled = false,
  error = false,
  helperText,
  allowNone = false,
  sx,
}: FloorSelectProps) {
  const { data: sections = [] } = useSpaceSections(siteId);
  const { data: spaces = [] } = useSpaces(siteId);
  const { data: floorPlans = [] } = useSpaceFloorPlans(siteId);
  const [showAll, setShowAll] = useState(false);

  const usedSectionIds = useMemo(() => {
    const used = new Set<string>();
    for (const s of spaces) if (s.section_id) used.add(s.section_id);
    for (const p of floorPlans) used.add(p.section_id);
    return used;
  }, [spaces, floorPlans]);

  const options = useMemo(
    () =>
      filterFloorSections(sections, {
        usedSectionIds,
        selectedId: value,
        showAll,
      }),
    [sections, usedSectionIds, value, showAll]
  );

  const hiddenCount = sections.length - options.length;

  return (
    <TextField
      select
      label={label}
      size={size}
      disabled={disabled}
      error={error}
      helperText={helperText}
      value={value ?? NONE}
      onChange={(e) => {
        const v = e.target.value;
        if (v === TOGGLE) {
          setShowAll((s) => !s);
          return; // not a selection — value stays as-is
        }
        onChange(v === NONE ? null : v);
      }}
      sx={sx}
    >
      {(allowNone || value === null) && (
        <MenuItem value={NONE}>
          <em>Unassigned</em>
        </MenuItem>
      )}
      {options.map((s) => (
        <MenuItem key={s.id} value={s.id}>
          {s.name}
        </MenuItem>
      ))}
      {(hiddenCount > 0 || showAll) && <Divider />}
      {(hiddenCount > 0 || showAll) && (
        <MenuItem value={TOGGLE} sx={{ color: "text.secondary" }}>
          {showAll
            ? "Show floors only"
            : `Show all ${sections.length} sections…`}
        </MenuItem>
      )}
    </TextField>
  );
}
