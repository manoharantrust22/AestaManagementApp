"use client";

import { Box, Chip, Stack, Typography } from "@mui/material";
import { PhotoCamera as PhotoIcon } from "@mui/icons-material";
import type { WorkPhoto } from "@/types/work-updates.types";
import type { SiteRecordedStatus } from "@/hooks/queries/useCompanyDailyPeek";
import { recordedStatusMeta } from "./recordedStatusMeta";

interface WorkScopePeekProps {
  recordedStatus: SiteRecordedStatus;
  morningPhotos: WorkPhoto[];
  eveningPhotos: WorkPhoto[];
  morningPlanText: string | null;
}

/**
 * Compact "status badge + photo strip + plan one-liner" block for one work scope
 * (Civil or a single trade) on a given day. Mirrors the SitePeekCard body so the
 * site-dashboard "Today by trade" card reads the same as the company peek.
 */
export default function WorkScopePeek({
  recordedStatus,
  morningPhotos,
  eveningPhotos,
  morningPlanText,
}: WorkScopePeekProps) {
  const meta = recordedStatusMeta(recordedStatus);
  const photos = [...morningPhotos, ...eveningPhotos];
  const photoStrip = photos.slice(0, 4);
  const extraPhotos = Math.max(0, photos.length - 4);
  const isWaiting = recordedStatus === "waiting";

  return (
    <Stack spacing={1}>
      <Chip
        size="small"
        label={meta.label}
        color={meta.color}
        icon={meta.icon}
        sx={{
          alignSelf: "flex-start",
          height: 22,
          "& .MuiChip-label": { px: 0.75, fontSize: 11, fontWeight: 600 },
        }}
      />

      {isWaiting ? (
        <Box sx={{ textAlign: "center", py: 1.5 }}>
          <PhotoIcon sx={{ fontSize: 26, color: "warning.main", opacity: 0.6 }} />
          <Typography variant="body2" fontWeight={600} color="warning.dark" sx={{ mt: 0.5 }}>
            Not recorded yet
          </Typography>
          <Typography variant="caption" color="text.secondary">
            No work logged for this trade today
          </Typography>
        </Box>
      ) : (
        <>
          {photoStrip.length > 0 ? (
            <Box sx={{ display: "flex", gap: 0.5 }}>
              {photoStrip.map((p) => (
                <Box
                  key={`${p.id}-${p.url}`}
                  component="img"
                  src={p.url}
                  alt={p.description || `Photo ${p.id}`}
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 1,
                    objectFit: "cover",
                    border: "1px solid",
                    borderColor: "divider",
                  }}
                />
              ))}
              {extraPhotos > 0 && (
                <Box
                  sx={{
                    width: 44,
                    height: 44,
                    borderRadius: 1,
                    bgcolor: "grey.200",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Typography variant="caption" fontWeight={700} color="text.secondary">
                    +{extraPhotos}
                  </Typography>
                </Box>
              )}
            </Box>
          ) : (
            <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: "text.disabled" }}>
              <PhotoIcon sx={{ fontSize: 14 }} />
              <Typography variant="caption">No photos yet</Typography>
            </Stack>
          )}

          {morningPlanText && (
            <Typography
              variant="caption"
              sx={{
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                color: "text.secondary",
              }}
            >
              <Box component="span" fontWeight={600} color="text.primary">
                Plan:{" "}
              </Box>
              {morningPlanText}
            </Typography>
          )}
        </>
      )}
    </Stack>
  );
}
