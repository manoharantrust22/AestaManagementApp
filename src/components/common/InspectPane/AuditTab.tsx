"use client";

import React from "react";
import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import dayjs from "dayjs";
import type { InspectEntity } from "./types";
import { useSettlementAudit } from "@/hooks/useSettlementAudit";

export default function AuditTab({ entity }: { entity: InspectEntity }) {
  const theme = useTheme();
  const { data, isLoading } = useSettlementAudit(entity.settlementRef ?? null);

  // Pending entity: no settlement row exists yet, so there is nothing to audit.
  if (!entity.settlementRef) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No audit history — this entry has no settlement yet.
        </Typography>
      </Box>
    );
  }

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={64} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" width="100%" height={64} />
      </Box>
    );
  }

  const events = data ?? [];

  if (events.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No audit events.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1}>
        {events.map((e, i) => (
          <Box
            key={i}
            sx={{
              p: 1.25,
              borderRadius: 1,
              bgcolor: "background.paper",
              border: `1px solid ${theme.palette.divider}`,
            }}
          >
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 0.25 }}
            >
              {dayjs(e.timestamp).format("DD MMM YYYY, hh:mm A")}
            </Typography>
            <Typography variant="body2">
              <Box component="strong" sx={{ fontWeight: 700 }}>
                {e.action.toUpperCase()}
              </Box>{" "}
              by {e.actorName}
            </Typography>
            {e.note && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 0.5, whiteSpace: "pre-wrap" }}
              >
                {e.note}
              </Typography>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
