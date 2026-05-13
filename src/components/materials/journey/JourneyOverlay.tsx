// src/components/materials/journey/JourneyOverlay.tsx
"use client";

import React from "react";
import { Drawer, Box, IconButton, Typography } from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { usePathname } from "next/navigation";
import { useJourneyWatch } from "@/contexts/JourneyWatchContext";
import { useRequestJourney } from "@/hooks/queries/useRequestJourney";
import { JourneyPillTag } from "./JourneyPillTag";
import { MaterialRequestJourney } from "./MaterialRequestJourney";

export function JourneyOverlay() {
  const pathname = usePathname();
  const { activeJourneyId, isExpanded, setExpanded, deactivateJourney } = useJourneyWatch();

  // Always call hook — hooks must not be called after a conditional return
  const { journey } = useRequestJourney(activeJourneyId);
  const journeyStatus = journey?.overallStatus ?? null;

  // Hide entirely on material-requests — that page manages its own inline drawer
  if (!activeJourneyId || pathname === "/site/material-requests") return null;

  if (!isExpanded) {
    return (
      <JourneyPillTag
        overallStatus={journeyStatus}
        onOpen={() => setExpanded(true)}
        onDismiss={deactivateJourney}
      />
    );
  }

  return (
    <Drawer
      anchor="right"
      open={isExpanded}
      onClose={() => setExpanded(false)}
      variant="temporary"
      slotProps={{ backdrop: { invisible: false } }}
      sx={{ zIndex: 1300 }}
      PaperProps={{ sx: { width: { xs: "100%", sm: 520 } } }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: 2,
          py: 1.5,
          borderBottom: "1px solid",
          borderColor: "divider",
          flexShrink: 0,
        }}
      >
        <Typography variant="subtitle2" fontWeight={600}>
          Request Journey
        </Typography>
        <IconButton size="small" onClick={() => setExpanded(false)} aria-label="Collapse journey">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      <Box sx={{ flex: 1, overflow: "auto" }}>
        <MaterialRequestJourney requestId={activeJourneyId} isFullPage={false} />
      </Box>
    </Drawer>
  );
}
