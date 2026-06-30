"use client";

import { Box, Card, CardActionArea, Chip, Stack, Typography } from "@mui/material";
import {
  PhotoCamera as PhotoIcon,
  LocationOn as LocationIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { DailyPeekSite } from "@/hooks/queries/useCompanyDailyPeek";
import { recordedStatusMeta } from "./recordedStatusMeta";

interface SitePeekCardProps {
  site: DailyPeekSite;
  onClick: () => void;
}

function formatRecordedAt(site: DailyPeekSite): string {
  if (site.eveningAt) {
    return `Confirmed ${dayjs(site.eveningAt).format("h:mm A")}${site.recordedByName ? ` · ${site.recordedByName}` : ""}`;
  }
  if (site.morningAt) {
    return `Morning ${dayjs(site.morningAt).format("h:mm A")}${site.recordedByName ? ` · ${site.recordedByName}` : ""}`;
  }
  return "";
}

export default function SitePeekCard({ site, onClick }: SitePeekCardProps) {
  const meta = recordedStatusMeta(site.recordedStatus);
  const isWaiting = site.recordedStatus === "waiting";
  const photos = [...site.morningPhotos, ...site.eveningPhotos];
  const photoStrip = photos.slice(0, 4);
  const extraPhotos = Math.max(0, photos.length - 4);
  const totalWorkers = site.dailyCount + site.contractCount;

  return (
    <Card
      sx={{
        borderRadius: 2,
        borderLeft: "4px solid",
        borderLeftColor: meta.borderColor,
        height: "100%",
        bgcolor: isWaiting ? "warning.50" : undefined,
        transition: "transform 0.15s, box-shadow 0.15s",
        "&:hover": { transform: "translateY(-2px)", boxShadow: 3 },
      }}
    >
      <CardActionArea onClick={onClick} sx={{ p: 2, height: "100%", alignItems: "stretch" }}>
        <Stack spacing={1.25} sx={{ height: "100%" }}>
          {/* Header */}
          <Box sx={{ display: "flex", justifyContent: "space-between", gap: 1 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="subtitle2" fontWeight={700} noWrap title={site.siteName}>
                {site.siteName}
              </Typography>
              {site.siteCity && (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mt: 0.25 }}>
                  <LocationIcon sx={{ fontSize: 12, color: "text.disabled" }} />
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {site.siteCity}
                  </Typography>
                </Stack>
              )}
              {!isWaiting && formatRecordedAt(site) && (
                <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 0.25 }} noWrap>
                  {formatRecordedAt(site)}
                </Typography>
              )}
            </Box>
            <Chip
              size="small"
              label={meta.label}
              color={meta.color}
              icon={meta.icon}
              sx={{ height: 22, "& .MuiChip-label": { px: 0.75, fontSize: 11, fontWeight: 600 } }}
            />
          </Box>

          {/* Body */}
          {isWaiting ? (
            <Box sx={{ textAlign: "center", py: 1.5 }}>
              <PhotoIcon sx={{ fontSize: 28, color: "warning.main", opacity: 0.6 }} />
              <Typography variant="body2" fontWeight={600} color="warning.dark" sx={{ mt: 0.5 }}>
                Not recorded yet
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Tap to nudge engineer
              </Typography>
            </Box>
          ) : (
            <>
              {/* Photo strip */}
              {photoStrip.length > 0 ? (
                <Box sx={{ display: "flex", gap: 0.5 }}>
                  {photoStrip.map((p) => (
                    <Box
                      key={`${p.id}-${p.url}`}
                      component="img"
                      src={p.url}
                      alt={p.description || `Photo ${p.id}`}
                      sx={{
                        width: 40,
                        height: 40,
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
                        width: 40,
                        height: 40,
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

              {/* Plan one-liner */}
              {site.morningPlanText && (
                <Typography
                  variant="caption"
                  sx={{
                    display: "-webkit-box",
                    WebkitLineClamp: 1,
                    WebkitBoxOrient: "vertical",
                    overflow: "hidden",
                    color: "text.secondary",
                  }}
                >
                  <Box component="span" fontWeight={600} color="text.primary">
                    Plan:{" "}
                  </Box>
                  {site.morningPlanText}
                </Typography>
              )}

              {/* 3-stat footer */}
              <Box
                sx={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 1,
                  pt: 1,
                  mt: "auto",
                  borderTop: "1px solid",
                  borderColor: "divider",
                }}
              >
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                    {totalWorkers}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    Workers
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                    ₹{site.dailyTotal.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    Daily
                  </Typography>
                </Box>
                <Box sx={{ textAlign: "center" }}>
                  <Typography variant="subtitle2" fontWeight={700} color="text.primary">
                    ₹{site.contractTotal.toLocaleString()}
                  </Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>
                    Contract
                  </Typography>
                </Box>
              </Box>
            </>
          )}
        </Stack>
      </CardActionArea>
    </Card>
  );
}
