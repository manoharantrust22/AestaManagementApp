"use client";

/**
 * Pulsing LIVE pill shown next to the accrued cost on active rows.
 * Same matPulse keyframe used by the pipeline current-stage dot.
 */

import { Box } from "@mui/material";
import { hubTokens } from "@/lib/material-hub/tokens";

const PULSE_KEYFRAMES = `
@keyframes matPulse {
  0%, 100% { transform: scale(1); opacity: 1; }
  50% { transform: scale(0.6); opacity: 0.6; }
}
`;

export default function RentalLiveCostBadge() {
  return (
    <Box
      component="span"
      sx={{
        display: "inline-flex",
        alignItems: "center",
        gap: "5px",
        padding: "1px 8px 1px 6px",
        borderRadius: "999px",
        background: hubTokens.warnSoft,
        color: hubTokens.warn,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
      }}
    >
      <style>{PULSE_KEYFRAMES}</style>
      <Box
        component="span"
        sx={{
          width: 6,
          height: 6,
          borderRadius: "50%",
          background: hubTokens.warn,
          animation: "matPulse 1.4s ease-in-out infinite",
        }}
      />
      Live
    </Box>
  );
}
