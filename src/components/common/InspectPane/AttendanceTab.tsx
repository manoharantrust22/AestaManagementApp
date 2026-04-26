import React from "react";
import { Box, Typography } from "@mui/material";
import type { InspectEntity } from "./types";
export default function AttendanceTab({ entity }: { entity: InspectEntity }) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption">Attendance content for {entity.kind}</Typography>
    </Box>
  );
}
