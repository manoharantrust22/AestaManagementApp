"use client";

import React from "react";
import { Box, Stack, SwipeableDrawer, Typography } from "@mui/material";

import type { Space } from "@/types/spaces.types";
import SpaceStatusChip from "./SpaceStatusChip";
import { spaceStatus } from "@/lib/spaces/measurements";

interface SpaceDetailSheetProps {
  space: Space | null;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

/** Mobile bottom sheet hosting SpaceDetailContent (material-hub pattern). */
export default function SpaceDetailSheet({
  space,
  open,
  onClose,
  children,
}: SpaceDetailSheetProps) {
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={open && !!space}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderRadius: "18px 18px 0 0",
          maxWidth: 520,
          mx: "auto",
          maxHeight: "92vh",
        },
      }}
    >
      {/* Drag handle */}
      <Box
        sx={{
          width: 36,
          height: 4,
          borderRadius: 2,
          bgcolor: "divider",
          mx: "auto",
          mt: 1,
          flexShrink: 0,
        }}
      />
      {space && (
        <>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            sx={{ px: 2, pt: 1.5, pb: 1, flexShrink: 0 }}
          >
            <Typography variant="h6" sx={{ flex: 1, minWidth: 0 }} noWrap>
              {space.name}
            </Typography>
            <SpaceStatusChip status={spaceStatus(space)} />
          </Stack>
          <Box sx={{ px: 2, pb: 3, overflowY: "auto" }}>{children}</Box>
        </>
      )}
    </SwipeableDrawer>
  );
}
