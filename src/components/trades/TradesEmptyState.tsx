"use client";

import React from "react";
import { Typography, Paper } from "@mui/material";

export function TradesEmptyState() {
  return (
    <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
      <Typography variant="h6" gutterBottom>
        No trades yet on this site
      </Typography>
      <Typography variant="body2" color="text.secondary">
        Trades appear here once you record civil attendance or create a
        subcontract for any work scope (painting, tiling, electrical, etc.).
      </Typography>
    </Paper>
  );
}
