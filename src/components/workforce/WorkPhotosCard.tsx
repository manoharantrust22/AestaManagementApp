"use client";

import { useState } from "react";
import { Box, Typography, Chip, Stack } from "@mui/material";
import dayjs from "dayjs";
import { useRecentContractWorkUpdates } from "@/hooks/queries/useContractWorkUpdates";
import PhotoThumbnailStrip from "@/components/attendance/work-updates/PhotoThumbnailStrip";
import WorkUpdateViewer from "@/components/attendance/work-updates/WorkUpdateViewer";
import { wsColors, wsRadius, wsShadow } from "@/lib/workforce/workspaceTokens";
import type { WorkUpdates } from "@/types/work-updates.types";

/** Evening photos preferred (what got done); fall back to the morning plan. */
function photosOf(wu: WorkUpdates) {
  return (wu.evening?.photos?.length ? wu.evening.photos : wu.morning?.photos) ?? [];
}

/**
 * A compact "work photos" timeline for the contract detail pane: the latest day's
 * photos + its "% done", plus chips to open older days. Captured from the Record
 * drawer's "Photo update + % done". Hidden until there's at least one photo.
 */
export function WorkPhotosCard({ contractId }: { contractId: string }) {
  const { data: recent = [] } = useRecentContractWorkUpdates(contractId);
  const [viewDate, setViewDate] = useState<string | null>(null);

  const withPhotos = recent.filter((r) => photosOf(r.workUpdates).length > 0);
  if (withPhotos.length === 0) return null;

  const latest = withPhotos[0];
  const latestPhotos = photosOf(latest.workUpdates);
  const pct = latest.workUpdates.evening?.completionPercent;
  const viewing = viewDate ? withPhotos.find((r) => r.date === viewDate) : null;

  return (
    <Box
      sx={{
        px: 1.75,
        py: 1.25,
        borderRadius: `${wsRadius.card}px`,
        bgcolor: wsColors.surface,
        border: `1px solid ${wsColors.hairline}`,
        boxShadow: wsShadow.card,
      }}
    >
      <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.75 }}>
        <Typography
          sx={{
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: ".04em",
            textTransform: "uppercase",
            color: wsColors.muted,
          }}
        >
          Work photos · {dayjs(latest.date).format("DD MMM")}
        </Typography>
        {typeof pct === "number" && (
          <Chip
            size="small"
            label={`${pct}% done`}
            sx={{ height: 20, fontSize: 11, fontWeight: 800, bgcolor: wsColors.primaryTint, color: wsColors.primary }}
          />
        )}
      </Stack>

      <PhotoThumbnailStrip
        photos={latestPhotos}
        size="medium"
        maxVisible={5}
        onPhotoClick={() => setViewDate(latest.date)}
      />

      {withPhotos.length > 1 && (
        <Stack direction="row" spacing={0.75} sx={{ mt: 1, flexWrap: "wrap", rowGap: 0.75 }}>
          <Typography sx={{ fontSize: 11, color: wsColors.muted, alignSelf: "center" }}>
            Earlier:
          </Typography>
          {withPhotos.slice(1).map((r) => (
            <Chip
              key={r.date}
              size="small"
              label={dayjs(r.date).format("DD MMM")}
              onClick={() => setViewDate(r.date)}
              sx={{ height: 22, fontSize: 11, cursor: "pointer" }}
            />
          ))}
        </Stack>
      )}

      {viewing && (
        <WorkUpdateViewer
          open
          onClose={() => setViewDate(null)}
          workUpdates={viewing.workUpdates}
          date={viewing.date}
        />
      )}
    </Box>
  );
}
