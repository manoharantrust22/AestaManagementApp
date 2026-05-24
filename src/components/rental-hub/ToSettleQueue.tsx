"use client";

/**
 * Yellow action-queue panel — shown above the filter chips when there are
 * completed rentals whose settlements are still pending.
 *
 * Each row offers a single primary action:
 *   - Settle  (warn) — opens MultiPartySettlementDialog focused on the next
 *     pending party (vendor → transport_inbound → transport_outbound)
 *
 * Mirrors the yellow panel in docs/RentalHub_V2_redesign/README.md lines
 * 136-138.
 */

import { Box, Button, Typography } from "@mui/material";
import ReceiptIcon from "@mui/icons-material/Receipt";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/rental-hub/formatters";
import { nextAction } from "@/lib/rental-hub/nextAction";
import type {
  NextActionIntent,
  ToSettleQueueItem,
} from "@/lib/rental-hub/nextAction";
import type { RentalThread } from "@/lib/rental-hub/threadTypes";

export interface ToSettleQueueProps {
  items: ToSettleQueueItem[];
  onAction: (thread: RentalThread, intent: NextActionIntent) => void;
}

export default function ToSettleQueue({ items, onAction }: ToSettleQueueProps) {
  if (items.length === 0) return null;

  return (
    <Box
      sx={{
        background: hubTokens.warnSoft,
        border: `1px solid ${hubTokens.warn}`,
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
        <ReceiptIcon sx={{ color: hubTokens.warn, fontSize: 16 }} />
        <Box>
          <Typography sx={{ fontSize: 13, fontWeight: 700, color: hubTokens.text }}>
            {items.length} return{items.length === 1 ? "" : "s"} ready to settle
          </Typography>
          <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
            Equipment back. Settle the vendor (negotiate if you can) + any
            transport.
          </Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {items.map(({ thread, balanceEstimate }) => {
          const next = nextAction(thread);
          // Should always have a "settle-*" intent on a to-settle item, but
          // fall back to settle-vendor defensively.
          const intent: NextActionIntent = next?.intent.startsWith("settle-")
            ? next.intent
            : "settle-vendor";
          const buttonLabel = next?.label ?? "Settle vendor";

          return (
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
                border: `1px solid ${hubTokens.warnSoft}`,
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
                    sx={{
                      color: hubTokens.muted,
                      fontWeight: 500,
                      marginLeft: "6px",
                    }}
                  >
                    · {thread.items.length} item{thread.items.length === 1 ? "" : "s"}
                  </Box>
                </Typography>
                <Typography
                  sx={{
                    fontSize: 11.5,
                    color: hubTokens.muted,
                    flexShrink: 0,
                    fontFamily: hubTokens.mono,
                  }}
                >
                  Vendor: <Box component="b" sx={{ color: hubTokens.text }}>{inr(thread.accruedCost)}</Box>
                  {" accrued"}
                  {thread.totalAdvancePaid > 0 && (
                    <>
                      {" · advance "}
                      <Box component="b" sx={{ color: hubTokens.text }}>
                        {inr(thread.totalAdvancePaid)}
                      </Box>
                    </>
                  )}
                  {balanceEstimate > 0 && (
                    <>
                      {" · ~"}
                      <Box component="b" sx={{ color: hubTokens.warn }}>
                        {inr(balanceEstimate)}
                      </Box>
                      {" balance"}
                    </>
                  )}
                </Typography>
              </Box>
              <Button
                size="small"
                variant="contained"
                onClick={() => onAction(thread, intent)}
                sx={{
                  textTransform: "none",
                  background: hubTokens.warn,
                  color: "#fff",
                  fontWeight: 700,
                  fontSize: 11.5,
                  padding: "5px 12px",
                  minWidth: "auto",
                  boxShadow: "0 1px 2px rgba(15,23,42,.08)",
                  whiteSpace: "nowrap",
                  "&:hover": {
                    background: hubTokens.warn,
                    filter: "brightness(0.92)",
                  },
                }}
              >
                {buttonLabel}
              </Button>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
