"use client";

/**
 * Red action-queue panel — shown above the filter chips when there are
 * overdue active rentals.
 *
 * Each row offers two actions:
 *   - Return  (danger) — record the return (current cost-meter freeze)
 *   - Extend  (secondary) — push expected_return_date forward
 *
 * Mirrors the red panel in docs/RentalHub_V2_redesign/README.md lines 130-138
 * and the structural pattern of material-hub/AllocationsQueue.tsx.
 */

import { Box, Button, Typography } from "@mui/material";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/rental-hub/formatters";
import type { OverdueQueueItem } from "@/lib/rental-hub/nextAction";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";
import type { NextActionIntent } from "@/lib/rental-hub/nextAction";

export interface OverdueQueueProps {
  items: OverdueQueueItem[];
  onAction: (thread: RentalThread, intent: NextActionIntent) => void;
}

export default function OverdueQueue({ items, onAction }: OverdueQueueProps) {
  if (items.length === 0) return null;

  return (
    <Box
      sx={{
        background: hubTokens.dangerSoft,
        border: `1px solid ${hubTokens.danger}`,
        borderRadius: "12px",
        padding: "12px 16px",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          marginBottom: "10px",
        }}
      >
        <NotificationsActiveIcon sx={{ color: hubTokens.danger, fontSize: 16 }} />
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text }}>
            {items.length} order{items.length === 1 ? " is" : "s are"} overdue
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
            Each extra day adds to the bill. Either record the return or extend
            the date.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map(({ thread, daysOverdue }) => (
          <Box
            key={thread.source_row_id}
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "8px 12px",
              background: hubTokens.card,
              borderRadius: "8px",
              border: `1px solid ${hubTokens.dangerSoft}`,
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flex: 1,
                minWidth: 0,
              }}
            >
              <Typography
                sx={{
                  fontFamily: hubTokens.mono,
                  fontSize: 10.5,
                  color: hubTokens.subtle,
                  fontWeight: 600,
                  flexShrink: 0,
                }}
              >
                {thread.id}
              </Typography>
              <Typography
                sx={{
                  fontSize: 12.5,
                  color: hubTokens.text,
                  fontWeight: 600,
                  flex: 1,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {thread.vendor?.name ?? "—"}
                <Box
                  component="span"
                  sx={{ color: hubTokens.muted, fontWeight: 500, marginLeft: "6px" }}
                >
                  {summarizeOutstanding(thread)}
                </Box>
              </Typography>
              <Box
                component="span"
                sx={{
                  padding: "2px 7px",
                  background: hubTokens.dangerSoft,
                  color: hubTokens.danger,
                  borderRadius: "5px",
                  fontSize: 10,
                  fontWeight: 700,
                  flexShrink: 0,
                }}
              >
                {daysOverdue}d overdue · {thread.daysSinceStart}d total
              </Box>
              {thread.accruedCost > 0 && (
                <Typography
                  sx={{
                    fontFamily: hubTokens.mono,
                    fontSize: 11.5,
                    color: hubTokens.muted,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}
                >
                  {inr(thread.accruedCost)}
                </Typography>
              )}
            </Box>
            <Box sx={{ display: "flex", gap: "6px", flexShrink: 0 }}>
              <Button
                size="small"
                variant="outlined"
                onClick={() => onAction(thread, "extend")}
                sx={{
                  textTransform: "none",
                  fontSize: 11.5,
                  fontWeight: 600,
                  padding: "4px 10px",
                  minWidth: "auto",
                  color: hubTokens.muted,
                  borderColor: hubTokens.border,
                  "&:hover": {
                    borderColor: hubTokens.muted,
                    background: hubTokens.chip,
                  },
                }}
              >
                Extend
              </Button>
              <Button
                size="small"
                variant="contained"
                onClick={() => onAction(thread, "record-return")}
                sx={{
                  textTransform: "none",
                  background: hubTokens.danger,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11.5,
                  padding: "5px 12px",
                  minWidth: "auto",
                  boxShadow: "0 1px 2px rgba(15,23,42,.08)",
                  "&:hover": {
                    background: hubTokens.danger,
                    filter: "brightness(0.92)",
                  },
                }}
              >
                Return
              </Button>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}

function summarizeOutstanding(thread: RentalThread): string {
  const outstandingLines = thread.items.filter((i) => i.qtyOutstanding > 0);
  if (outstandingLines.length === 0) return "";
  if (outstandingLines.length === 1) {
    const i = outstandingLines[0];
    return `· ${i.qtyOutstanding} ${i.name} still on site`;
  }
  const totalQty = outstandingLines.reduce((s, i) => s + i.qtyOutstanding, 0);
  return `· ${totalQty} units across ${outstandingLines.length} lines`;
}
