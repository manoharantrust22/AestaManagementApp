import React from "react";
import { Box, Typography } from "@mui/material";
import type { InspectEntity } from "./types";
export default function AuditTab({ entity }: { entity: InspectEntity }) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption">Audit for {entity.kind}</Typography>
    </Box>
  );
}
