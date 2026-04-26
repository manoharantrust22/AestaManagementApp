"use client";

import React from "react";
import { Chip } from "@mui/material";
import { PushPin as PinIcon } from "@mui/icons-material";

interface SettlementRefChipProps {
  settlementRef: string;
  onClick: () => void;
}

/**
 * Compact chip rendering a settlement reference (e.g. SS-0421) on
 * settled attendance rows. Click opens the InspectPane in-place for that
 * date/laborer-week — does not navigate. Stops event propagation so the
 * surrounding row click handlers (expand/collapse) don't fire.
 */
export default function SettlementRefChip({
  settlementRef,
  onClick,
}: SettlementRefChipProps) {
  return (
    <Chip
      size="small"
      icon={<PinIcon sx={{ fontSize: 12 }} />}
      label={settlementRef}
      variant="outlined"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      sx={{
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        fontSize: 11,
        height: 22,
        "& .MuiChip-label": { px: 0.75 },
      }}
    />
  );
}
