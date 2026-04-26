import React from "react";
import { Box, Typography } from "@mui/material";
import type { InspectEntity } from "./types";
export default function SettlementTab({
  entity,
}: {
  entity: InspectEntity;
  onSettleClick?: (entity: InspectEntity) => void;
}) {
  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="caption">Settlement for {entity.kind}</Typography>
    </Box>
  );
}
