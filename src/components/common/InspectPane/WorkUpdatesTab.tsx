"use client";

import React from "react";
import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import dayjs from "dayjs";
import type { InspectEntity } from "./types";
import { useWorkUpdates } from "@/hooks/queries/useWorkUpdates";

export default function WorkUpdatesTab({ entity }: { entity: InspectEntity }) {
  const theme = useTheme();

  // Daily-date entity → updates for that single date.
  // Weekly-week entity → updates for the week's date range.
  const { siteId, dateFrom, dateTo } =
    entity.kind === "daily-date"
      ? { siteId: entity.siteId, dateFrom: entity.date, dateTo: entity.date }
      : {
          siteId: entity.siteId,
          dateFrom: entity.weekStart,
          dateTo: entity.weekEnd,
        };

  const { data, isLoading } = useWorkUpdates(siteId, dateFrom, dateTo);

  if (isLoading) {
    return (
      <Box sx={{ p: 2 }}>
        <Skeleton variant="rounded" width="100%" height={80} sx={{ mb: 1 }} />
        <Skeleton variant="rounded" width="100%" height={80} />
      </Box>
    );
  }

  const updates = data?.updates ?? [];

  if (updates.length === 0) {
    return (
      <Box sx={{ p: 2 }}>
        <Typography variant="body2" color="text.secondary">
          No work updates recorded.
        </Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 2 }}>
      <Stack spacing={1.5}>
        {updates.map((u) => (
          <Box
            key={u.id}
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
              sx={{ display: "block", mb: 0.5 }}
            >
              {u.timeOfDay} · {dayjs(u.createdAt).format("DD MMM, hh:mm A")} ·
              by {u.createdByName}
            </Typography>
            {u.note && (
              <Typography
                variant="body2"
                sx={{
                  mb: u.photoUrls && u.photoUrls.length > 0 ? 1 : 0,
                  whiteSpace: "pre-wrap",
                }}
              >
                {u.note}
              </Typography>
            )}
            {u.photoUrls && u.photoUrls.length > 0 && (
              <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                {u.photoUrls.slice(0, 6).map((url, i) => (
                  <Box
                    key={i}
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 0.75,
                      backgroundImage: `url(${url})`,
                      backgroundSize: "cover",
                      backgroundPosition: "center",
                      border: `1px solid ${theme.palette.divider}`,
                    }}
                  />
                ))}
                {u.photoUrls.length > 6 && (
                  <Box
                    sx={{
                      width: 56,
                      height: 56,
                      borderRadius: 0.75,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      bgcolor: theme.palette.action.hover,
                      border: `1px solid ${theme.palette.divider}`,
                      fontSize: 12,
                      color: "text.secondary",
                      fontWeight: 600,
                    }}
                  >
                    +{u.photoUrls.length - 6}
                  </Box>
                )}
              </Stack>
            )}
          </Box>
        ))}
      </Stack>
    </Box>
  );
}
