"use client";

import { Chip, Tooltip, alpha, useTheme } from "@mui/material";
import type { SettlementListRow } from "@/hooks/queries/useSettlementsList";

function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

/**
 * Read-only trace chip for an inter-site settlement transfer.
 * - origin (fully moved)   → amber "↗ Moved to {site}"
 * - origin (partial)       → amber "↗ Partially moved ₹m"
 * - destination twin       → teal  "↘ Moved from {site}"
 * Renders nothing for a normal settlement.
 */
export function TransferBadge({ row }: { row: SettlementListRow }) {
  const theme = useTheme();
  if (!row.transferId || !row.transferRole) return null;

  if (row.transferRole === "origin") {
    const movedAmount =
      row.isPartialMove && row.transferOriginalTotal != null
        ? row.transferOriginalTotal - row.totalAmount
        : null;
    const label = row.isPartialMove
      ? `↗ Partially moved${movedAmount != null ? ` ${formatINR(movedAmount)}` : ""}`
      : `↗ Moved to ${row.movedToSiteName ?? "another site"}`;
    return (
      <Tooltip
        title={`This payment was moved to ${
          row.movedToSiteName ?? "another site"
        } — it no longer counts in this site's expenses (kept here for the record).`}
      >
        <Chip
          size="small"
          label={label}
          sx={{
            height: 16,
            fontSize: 9.5,
            fontWeight: 700,
            bgcolor: alpha(theme.palette.warning.main, 0.16),
            color: theme.palette.warning.dark,
          }}
        />
      </Tooltip>
    );
  }

  return (
    <Tooltip title={`Moved from ${row.movedFromSiteName ?? "another site"}.`}>
      <Chip
        size="small"
        label={`↘ Moved from ${row.movedFromSiteName ?? "another site"}`}
        sx={{
          height: 16,
          fontSize: 9.5,
          fontWeight: 700,
          bgcolor: alpha(theme.palette.info.main, 0.16),
          color: theme.palette.info.dark,
        }}
      />
    </Tooltip>
  );
}
