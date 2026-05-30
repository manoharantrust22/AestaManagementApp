"use client";

/**
 * Per-direction debt panel inside the netting math worked example. Shows
 * "Site A → Site B used your/their batches" + ₹amount + top contributing
 * records.
 *
 * Mirrors `DirectionPanel` in docs/MaterialHub_Redesign/proto-screens.jsx.
 */

import { Box, Typography } from "@mui/material";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/material-hub/formatters";

export interface DirectionPanelRecord {
  /** Material name shown on the contributing row. */
  materialName: string;
  /** Batch ref-code (mono prefix); optional when not known. */
  batchCode?: string;
  value: number;
}

export interface DirectionPanelProps {
  fromShort: string;
  fromAccent: string;
  toShort: string;
  toAccent: string;
  amount: number;
  records: DirectionPanelRecord[];
  /** "used your batches" | "used their batches" */
  reasonShort: string;
  emptyReason: string;
  /** success (green) when others owe me, danger (red) when I owe others */
  color: string;
}

export default function DirectionPanel({
  fromShort,
  fromAccent,
  toShort,
  toAccent,
  amount,
  records,
  reasonShort,
  emptyReason,
  color,
}: DirectionPanelProps) {
  return (
    <Box
      sx={{
        background: hubTokens.card,
        border: `1px solid ${hubTokens.border}`,
        borderRadius: "10px",
        padding: "12px 14px",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "10px",
        }}
      >
        <Box
          component="span"
          sx={{
            padding: "3px 8px",
            borderRadius: "5px",
            background: `${fromAccent}1a`,
            color: fromAccent,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.3px",
          }}
        >
          {fromShort}
        </Box>
        <ArrowForwardIcon sx={{ fontSize: 12, color: hubTokens.subtle }} />
        <Box
          component="span"
          sx={{
            padding: "3px 8px",
            borderRadius: "5px",
            background: `${toAccent}1a`,
            color: toAccent,
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.3px",
          }}
        >
          {toShort}
        </Box>
        <Box
          component="span"
          sx={{ fontSize: 10.5, color: hubTokens.muted, fontWeight: 600 }}
        >
          {reasonShort}
        </Box>
      </Box>
      <Typography
        sx={{
          fontSize: 22,
          fontWeight: 800,
          fontFamily: hubTokens.mono,
          letterSpacing: "-0.5px",
          color: amount > 0 ? color : hubTokens.subtle,
        }}
      >
        {inr(amount)}
      </Typography>
      <Typography
        sx={{
          fontSize: 11,
          color: hubTokens.muted,
          marginTop: "4px",
          marginBottom: records.length > 0 ? "10px" : "0",
        }}
      >
        {records.length} {records.length === 1 ? "record" : "records"}
      </Typography>
      {records.length > 0 ? (
        <Box sx={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "4px" }}>
          {records.slice(0, 4).map((r, i) => (
            <Box
              key={i}
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: 11,
                padding: "5px 8px",
                background: hubTokens.bg,
                borderRadius: "6px",
              }}
            >
              {r.batchCode && (
                <Box
                  component="span"
                  sx={{
                    fontFamily: hubTokens.mono,
                    color: hubTokens.subtle,
                    fontSize: 10,
                  }}
                >
                  {r.batchCode}
                </Box>
              )}
              <Box
                component="span"
                sx={{
                  flex: 1,
                  color: hubTokens.muted,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {r.materialName}
              </Box>
              <Box
                component="span"
                sx={{
                  fontFamily: hubTokens.mono,
                  fontWeight: 700,
                  color: hubTokens.text,
                }}
              >
                {inr(r.value)}
              </Box>
            </Box>
          ))}
          {records.length > 4 && (
            <Typography
              sx={{
                fontSize: 10.5,
                color: hubTokens.subtle,
                fontWeight: 600,
                padding: "2px 8px",
              }}
            >
              +{records.length - 4} more
            </Typography>
          )}
        </Box>
      ) : (
        <Typography
          sx={{
            fontSize: 11,
            color: hubTokens.subtle,
            fontStyle: "italic",
            marginTop: "8px",
          }}
        >
          {emptyReason}
        </Typography>
      )}
    </Box>
  );
}
