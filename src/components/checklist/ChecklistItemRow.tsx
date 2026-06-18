"use client";

import { Box, Button, Card, Stack, Typography, alpha, useTheme } from "@mui/material";
import { OpenInNew, EventRepeat } from "@mui/icons-material";
import ChecklistStatusChip from "./ChecklistStatusChip";
import {
  DONE_STATUSES,
  STATUS_META,
  type ChecklistComplianceRow,
} from "@/types/checklist.types";

function shortTime(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

export interface ItemRowHandlers {
  onGo: (row: ChecklistComplianceRow) => void;
  onDefer: (row: ChecklistComplianceRow) => void;
  onMarkDone: (row: ChecklistComplianceRow) => void;
  onMarkNA: (row: ChecklistComplianceRow) => void;
  onConfirmStock: (row: ChecklistComplianceRow) => void;
  onUndo: (row: ChecklistComplianceRow) => void;
}

export default function ChecklistItemRow({
  row,
  saving,
  handlers,
  children,
}: {
  row: ChecklistComplianceRow;
  saving?: boolean;
  handlers: ItemRowHandlers;
  children?: React.ReactNode; // e.g. stale-materials hint under the usage item
}) {
  const theme = useTheme();
  const isDone = DONE_STATUSES.includes(row.status);
  const isManual = row.detection_type === "manual";
  const meta = STATUS_META[row.status];
  const accent =
    meta.color === "default" ? theme.palette.text.disabled : theme.palette[meta.color].main;

  // meta/explanation line
  const metaBits: string[] = [];
  if (row.detected_at) metaBits.push(`Auto · ${shortTime(row.detected_at)}`);
  else if (row.overlay_status === "done" && row.completed_at)
    metaBits.push(`Marked done · ${shortTime(row.completed_at)}`);
  if (row.status === "deferred_pending" && row.defer_reason)
    metaBits.push(`Deferred: ${row.defer_reason}`);
  if (row.note) metaBits.push(`Note: ${row.note}`);

  const primaryLabel = (() => {
    if (row.detection_source === "stock_confirmation") return "Confirm stock";
    if (isManual) return "Mark done";
    if (row.detection_source === "material_usage") return "Log usage";
    return "Open";
  })();

  const primaryClick = () => {
    if (row.detection_source === "stock_confirmation") return handlers.onConfirmStock(row);
    if (isManual) return handlers.onMarkDone(row);
    return handlers.onGo(row);
  };

  // "Nothing due" affordance for items that may legitimately have nothing to do
  const showNA =
    !isDone &&
    (isManual ||
      row.detection_source === "material_usage" ||
      row.detection_source === "delivery_status" ||
      row.detection_source === "wallet_settlement");
  const naLabel =
    row.detection_source === "material_usage" ? "Nothing to log" : "Nothing due";

  return (
    <Card
      variant="outlined"
      sx={{
        p: 2,
        borderLeft: `4px solid ${accent}`,
        bgcolor: isDone ? alpha(accent, 0.04) : "background.paper",
      }}
    >
      <Stack
        direction={{ xs: "column", sm: "row" }}
        spacing={1.5}
        alignItems={{ sm: "flex-start" }}
        justifyContent="space-between"
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: "wrap" }}>
            <Typography variant="subtitle1" fontWeight={600}>
              {row.label}
            </Typography>
            <ChecklistStatusChip status={row.status} />
          </Stack>
          {row.description && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
              {row.description}
            </Typography>
          )}
          {metaBits.length > 0 && (
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.5 }}>
              {metaBits.join("  ·  ")}
            </Typography>
          )}
          {children}
        </Box>

        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {!isDone && (
            <Button
              variant="contained"
              size="small"
              disabled={saving}
              onClick={primaryClick}
              endIcon={
                !isManual && row.detection_source !== "stock_confirmation" ? (
                  <OpenInNew fontSize="small" />
                ) : undefined
              }
            >
              {primaryLabel}
            </Button>
          )}
          {showNA && (
            <Button size="small" variant="outlined" disabled={saving} onClick={() => handlers.onMarkNA(row)}>
              {naLabel}
            </Button>
          )}
          {!isDone && row.allow_defer && row.status !== "deferred_pending" && (
            <Button
              size="small"
              color="info"
              variant="text"
              disabled={saving}
              startIcon={<EventRepeat fontSize="small" />}
              onClick={() => handlers.onDefer(row)}
            >
              Defer
            </Button>
          )}
          {isDone && row.overlay_status && (
            <Button size="small" variant="text" color="inherit" disabled={saving} onClick={() => handlers.onUndo(row)}>
              Undo
            </Button>
          )}
        </Stack>
      </Stack>
    </Card>
  );
}
