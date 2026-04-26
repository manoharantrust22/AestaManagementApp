"use client";

import React from "react";
import { Box, Typography } from "@mui/material";

interface SubcontractContextStripProps {
  subcontractTitle: string | null;
  totalValue: number | null;
  spent: number | null;
  onOpenFullBurnDown: () => void;
}

function formatINR(n: number): string {
  return `₹${n.toLocaleString("en-IN")}`;
}

export function SubcontractContextStrip({
  subcontractTitle,
  totalValue,
  spent,
  onOpenFullBurnDown,
}: SubcontractContextStripProps) {
  const percent =
    totalValue && totalValue > 0 && spent != null
      ? Math.round((spent / totalValue) * 100)
      : null;

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: { xs: 1, sm: 1.75 },
        alignItems: "center",
        px: { xs: 1.25, sm: 1.75 },
        py: 1,
        bgcolor: "background.paper",
        borderLeft: 3,
        borderLeftColor: "primary.main",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        mb: 1.5,
        fontSize: 12.5,
      }}
    >
      <span style={{ fontSize: 14 }}>📍</span>
      {subcontractTitle ? (
        <>
          <Typography sx={{ fontWeight: 700 }}>{subcontractTitle}</Typography>
          <Box
            sx={{
              width: 1,
              height: 18,
              bgcolor: "divider",
              display: { xs: "none", sm: "block" },
            }}
          />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            Subcontract{" "}
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color: "text.primary",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatINR(totalValue ?? 0)}
            </Box>
          </Typography>
          <Box
            sx={{
              width: 1,
              height: 18,
              bgcolor: "divider",
              display: { xs: "none", sm: "block" },
            }}
          />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            Spent (all categories){" "}
            <Box
              component="span"
              sx={{
                fontWeight: 700,
                color: "primary.main",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {formatINR(spent ?? 0)}
            </Box>
            {percent != null && <> · {percent}%</>}
          </Typography>
        </>
      ) : (
        <>
          <Typography sx={{ fontWeight: 700 }}>
            All subcontracts on this site
          </Typography>
          <Box
            sx={{
              width: 1,
              height: 18,
              bgcolor: "divider",
              display: { xs: "none", sm: "block" },
            }}
          />
          <Typography sx={{ fontSize: 11.5, color: "text.secondary" }}>
            Choose a subcontract from the chip above to see budget context
          </Typography>
        </>
      )}
      <Box
        component="span"
        role="button"
        onClick={onOpenFullBurnDown}
        sx={{
          ml: { xs: 0, sm: "auto" },
          color: "primary.main",
          fontWeight: 600,
          fontSize: 11.5,
          cursor: "pointer",
          "&:hover": { textDecoration: "underline" },
        }}
      >
        ↗ Full burn-down on /site/subcontracts
      </Box>
    </Box>
  );
}
