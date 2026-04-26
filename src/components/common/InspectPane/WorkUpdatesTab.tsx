import React from "react";
import { Box, Typography } from "@mui/material";
import type { InspectEntity } from "./types";
export default function WorkUpdatesTab({ entity }: { entity: InspectEntity }) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption">Work updates for {entity.kind}</Typography>
    </Box>
  );
}
