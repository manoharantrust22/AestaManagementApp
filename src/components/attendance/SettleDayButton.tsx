"use client";

import React from "react";
import {
  Button,
  IconButton,
  Tooltip,
  useMediaQuery,
  useTheme,
} from "@mui/material";
import { CurrencyRupee as RupeeIcon } from "@mui/icons-material";

interface SettleDayButtonProps {
  pendingAmount: number;
  onClick: () => void;
  /** Optional label override (e.g. "Settle Week"). Defaults to "Settle". */
  label?: string;
}

/**
 * Responsive Settle CTA shown on per-day (and per-week) attendance rows.
 * Renders the full "Settle ₹X" button on desktop, icon-only with a tooltip
 * on mobile. Caller wires onClick to the existing settlement dialog trigger.
 */
export default function SettleDayButton({
  pendingAmount,
  onClick,
  label = "Settle",
}: SettleDayButtonProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));
  const formatted = pendingAmount.toLocaleString("en-IN");

  if (isMobile) {
    return (
      <Tooltip title={`${label} ₹${formatted}`}>
        <IconButton
          color="success"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          size="small"
          aria-label={`${label} ₹${formatted}`}
        >
          <RupeeIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    );
  }

  return (
    <Button
      variant="contained"
      color="success"
      size="small"
      startIcon={<RupeeIcon />}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {label} ₹{formatted}
    </Button>
  );
}
