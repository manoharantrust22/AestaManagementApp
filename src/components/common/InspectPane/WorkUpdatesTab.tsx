"use client";

import React, { useState } from "react";
import { Box, Skeleton, Stack, Typography, useTheme } from "@mui/material";
import dayjs from "dayjs";
import type { InspectEntity } from "./types";
import { useWorkUpdates } from "@/hooks/queries/useWorkUpdates";
import PhotoFullscreenDialog from "@/components/attendance/work-updates/PhotoFullscreenDialog";
import type { WorkPhoto } from "@/types/work-updates.types";

interface LightboxState {
  photos: WorkPhoto[];
  index: number;
  period?: "morning" | "evening";
  title: string;
}

function urlsToPhotos(urls: string[], idPrefix: string): WorkPhoto[] {
  return urls.map((url, i) => ({
    id: `${idPrefix}-${i}`,
    url,
    uploadedAt: "",
  }));
}

export default function WorkUpdatesTab({ entity }: { entity: InspectEntity }) {
  const theme = useTheme();
  const [lightbox, setLightbox] = useState<LightboxState | null>(null);

  // Daily-date entity → updates for that single date.
  // Weekly-week / weekly-aggregate / daily-market-weekly entity → updates
  // for the week's date range.
  // Advance entity → InspectPane.tsx hides this tab; defensive fallback to a
  // single-day query that returns no rows.
  const { siteId, dateFrom, dateTo } =
    entity.kind === "daily-date"
      ? { siteId: entity.siteId, dateFrom: entity.date, dateTo: entity.date }
      : entity.kind === "weekly-week" ||
          entity.kind === "weekly-aggregate" ||
          entity.kind === "daily-market-weekly"
        ? {
            siteId: entity.siteId,
            dateFrom: entity.weekStart,
            dateTo: entity.weekEnd,
          }
        : { siteId: entity.siteId, dateFrom: "1970-01-01", dateTo: "1970-01-01" };

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
        {updates.map((u) => {
          const photos = urlsToPhotos(u.photoUrls ?? [], u.id);
          const period = u.timeOfDay === "Morning" ? "morning" : "evening";
          const title = `${u.timeOfDay} · ${dayjs(u.createdAt).format("DD MMM")}`;
          return (
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
                    mb: photos.length > 0 ? 1 : 0,
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {u.note}
                </Typography>
              )}
              {photos.length > 0 && (
                <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
                  {photos.slice(0, 6).map((photo, i) => (
                    <Box
                      key={photo.id}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open photo ${i + 1} fullscreen`}
                      onClick={() =>
                        setLightbox({ photos, index: i, period, title })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setLightbox({ photos, index: i, period, title });
                        }
                      }}
                      sx={{
                        width: 64,
                        height: 64,
                        borderRadius: 0.75,
                        overflow: "hidden",
                        bgcolor: theme.palette.action.hover,
                        border: `1px solid ${theme.palette.divider}`,
                        cursor: "pointer",
                        flex: "0 0 auto",
                        transition: "transform 120ms ease, box-shadow 120ms ease",
                        "&:hover": {
                          transform: "scale(1.04)",
                          boxShadow: theme.shadows[2],
                        },
                        "&:focus-visible": {
                          outline: `2px solid ${theme.palette.primary.main}`,
                          outlineOffset: 2,
                        },
                      }}
                    >
                      <Box
                        component="img"
                        src={photo.url}
                        alt={`Photo ${i + 1}`}
                        loading="lazy"
                        sx={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          display: "block",
                        }}
                      />
                    </Box>
                  ))}
                  {photos.length > 6 && (
                    <Box
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setLightbox({ photos, index: 6, period, title })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setLightbox({ photos, index: 6, period, title });
                        }
                      }}
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
                        cursor: "pointer",
                      }}
                    >
                      +{photos.length - 6}
                    </Box>
                  )}
                </Stack>
              )}
            </Box>
          );
        })}
      </Stack>

      <PhotoFullscreenDialog
        open={lightbox !== null}
        onClose={() => setLightbox(null)}
        photos={lightbox?.photos ?? []}
        initialIndex={lightbox?.index ?? 0}
        period={lightbox?.period}
        title={lightbox?.title}
      />
    </Box>
  );
}
