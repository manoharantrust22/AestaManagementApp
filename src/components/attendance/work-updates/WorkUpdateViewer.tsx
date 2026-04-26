"use client";

import { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  Typography,
  IconButton,
  Divider,
  Chip,
  Paper,
  LinearProgress,
  ToggleButtonGroup,
  ToggleButton,
} from "@mui/material";
import {
  Close as CloseIcon,
  WbSunny as MorningIcon,
  NightsStay as EveningIcon,
  Compare as CompareIcon,
  ViewList as ListIcon,
} from "@mui/icons-material";
import { WorkUpdates } from "@/types/work-updates.types";
import PhotoThumbnailStrip from "./PhotoThumbnailStrip";
import PhotoFullscreenDialog from "./PhotoFullscreenDialog";
import dayjs from "dayjs";

interface WorkUpdateViewerProps {
  open: boolean;
  onClose: () => void;
  workUpdates: WorkUpdates | null;
  siteName?: string;
  date: string;
}

export default function WorkUpdateViewer({
  open,
  onClose,
  workUpdates,
  siteName,
  date,
}: WorkUpdateViewerProps) {
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [fullscreenPhotos, setFullscreenPhotos] = useState<
    { url: string; id: string; description?: string; uploadedAt: string }[]
  >([]);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const [fullscreenPeriod, setFullscreenPeriod] = useState<
    "morning" | "evening"
  >("morning");
  const [viewMode, setViewMode] = useState<"list" | "compare">("compare");

  const handleMorningPhotoClick = (index: number) => {
    if (workUpdates?.morning?.photos) {
      setFullscreenPhotos(workUpdates.morning.photos);
      setFullscreenIndex(index);
      setFullscreenPeriod("morning");
      setFullscreenOpen(true);
    }
  };

  const handleEveningPhotoClick = (index: number) => {
    if (workUpdates?.evening?.photos) {
      setFullscreenPhotos(workUpdates.evening.photos);
      setFullscreenIndex(index);
      setFullscreenPeriod("evening");
      setFullscreenOpen(true);
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 80) return "success";
    if (percent >= 50) return "warning";
    return "error";
  };

  const formattedDate = dayjs(date).format("ddd, MMM D, YYYY");

  if (!workUpdates) {
    return null;
  }

  const hasMorning = workUpdates.morning !== null;
  const hasEvening = workUpdates.evening !== null;
  const hasBothPhotos =
    hasMorning &&
    hasEvening &&
    workUpdates.morning!.photos.length > 0 &&
    workUpdates.evening!.photos.length > 0;

  return (
    <>
      <Dialog
        open={open}
        onClose={onClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{
          sx: { maxHeight: "90vh" },
        }}
      >
        <DialogTitle
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            pb: 1,
          }}
        >
          <Box>
            <Typography variant="h6" component="span">Work Updates</Typography>
            <Typography variant="body2" color="text.secondary">
              {siteName && `${siteName} - `}
              {formattedDate}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* View mode toggle - only show when both morning and evening have photos */}
            {hasBothPhotos && (
              <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(_, value) => value && setViewMode(value)}
                size="small"
              >
                <ToggleButton value="compare">
                  <CompareIcon sx={{ fontSize: 18 }} />
                </ToggleButton>
                <ToggleButton value="list">
                  <ListIcon sx={{ fontSize: 18 }} />
                </ToggleButton>
              </ToggleButtonGroup>
            )}
            <IconButton onClick={onClose} size="small">
              <CloseIcon />
            </IconButton>
          </Box>
        </DialogTitle>

        <DialogContent dividers>
          {/* Comparison View */}
          {viewMode === "compare" && hasBothPhotos && (
            <Box>
              {/* Progress and Summary Header */}
              <Paper
                variant="outlined"
                sx={{
                  p: 1.5,
                  mb: 2,
                  bgcolor: "action.hover",
                }}
              >
                <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="caption" color="text.secondary">
                      Completion
                    </Typography>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <LinearProgress
                        variant="determinate"
                        value={workUpdates.evening!.completionPercent}
                        color={getProgressColor(workUpdates.evening!.completionPercent)}
                        sx={{ flex: 1, height: 8, borderRadius: 1 }}
                      />
                      <Chip
                        label={`${workUpdates.evening!.completionPercent}%`}
                        size="small"
                        color={getProgressColor(workUpdates.evening!.completionPercent)}
                      />
                    </Box>
                  </Box>
                </Box>
                {workUpdates.evening!.summary && (
                  <Typography variant="body2" color="text.secondary">
                    {workUpdates.evening!.summary}
                  </Typography>
                )}
              </Paper>

              {/* Side-by-side Photo Comparison */}
              <Typography variant="subtitle2" sx={{ mb: 1.5, display: "flex", alignItems: "center", gap: 1 }}>
                <CompareIcon sx={{ fontSize: 18 }} />
                Progress Comparison
              </Typography>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {workUpdates.morning!.photos.map((morningPhoto, index) => {
                  const eveningPhoto = workUpdates.evening!.photos[index];
                  return (
                    <Paper
                      key={morningPhoto.id}
                      variant="outlined"
                      sx={{
                        display: "flex",
                        p: 1,
                        gap: 1,
                        alignItems: "stretch",
                      }}
                    >
                      {/* Morning Photo */}
                      <Box
                        sx={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Chip
                          icon={<MorningIcon sx={{ fontSize: 14 }} />}
                          label="Morning"
                          size="small"
                          color="warning"
                          variant="outlined"
                        />
                        <Box
                          component="img"
                          src={morningPhoto.url}
                          alt={`Morning ${index + 1}`}
                          onClick={() => handleMorningPhotoClick(index)}
                          sx={{
                            width: "100%",
                            height: 150,
                            borderRadius: 1,
                            objectFit: "cover",
                            cursor: "pointer",
                            "&:hover": { opacity: 0.9 },
                          }}
                        />
                        {morningPhoto.description && (
                          <Typography variant="caption" color="text.secondary" textAlign="center">
                            {morningPhoto.description}
                          </Typography>
                        )}
                      </Box>

                      {/* Arrow */}
                      <Box sx={{ display: "flex", alignItems: "center", px: 1 }}>
                        <Typography color="text.disabled" sx={{ fontSize: 24 }}>
                          →
                        </Typography>
                      </Box>

                      {/* Evening Photo */}
                      <Box
                        sx={{
                          flex: 1,
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 0.5,
                        }}
                      >
                        <Chip
                          icon={<EveningIcon sx={{ fontSize: 14 }} />}
                          label="Evening"
                          size="small"
                          color="info"
                          variant="outlined"
                        />
                        {eveningPhoto ? (
                          <Box
                            component="img"
                            src={eveningPhoto.url}
                            alt={`Evening ${index + 1}`}
                            onClick={() => handleEveningPhotoClick(index)}
                            sx={{
                              width: "100%",
                              height: 150,
                              borderRadius: 1,
                              objectFit: "cover",
                              cursor: "pointer",
                              "&:hover": { opacity: 0.9 },
                            }}
                          />
                        ) : (
                          <Box
                            sx={{
                              width: "100%",
                              height: 150,
                              borderRadius: 1,
                              bgcolor: "grey.200",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                          >
                            <Typography variant="caption" color="text.disabled">
                              No photo
                            </Typography>
                          </Box>
                        )}
                      </Box>
                    </Paper>
                  );
                })}
              </Box>
            </Box>
          )}

          {/* List View — also fallback when compare isn't possible (only one period has photos) */}
          {(viewMode === "list" || !hasBothPhotos) && (
            <>
              {/* Morning Section */}
              {hasMorning && workUpdates.morning && (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    mb: 2,
                    bgcolor: "warning.50",
                    borderColor: "warning.200",
                  }}
                >
                  <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1.5 }}>
                    <MorningIcon sx={{ color: "warning.main", fontSize: 20 }} />
                    <Typography variant="subtitle2" color="warning.dark">
                      Morning Plan
                    </Typography>
                    {workUpdates.morning.timestamp && (
                      <Chip
                        label={dayjs(workUpdates.morning.timestamp).format("h:mm A")}
                        size="small"
                        variant="outlined"
                        sx={{ ml: "auto" }}
                      />
                    )}
                  </Box>

                  {workUpdates.morning.description && (
                    <Typography variant="body2" sx={{ mb: 1.5 }}>
                      {workUpdates.morning.description}
                    </Typography>
                  )}

                  {workUpdates.morning.photos.length > 0 && (
                    <PhotoThumbnailStrip
                      photos={workUpdates.morning.photos}
                      size="medium"
                      maxVisible={5}
                      onPhotoClick={handleMorningPhotoClick}
                      showDescriptions
                    />
                  )}
                </Paper>
              )}

              {/* Evening Section */}
              {hasEvening && workUpdates.evening && (
                <Paper
                  variant="outlined"
                  sx={{
                    p: 2,
                    bgcolor: "info.50",
                    borderColor: "info.200",
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      mb: 1.5,
                    }}
                  >
                    <EveningIcon sx={{ color: "info.main", fontSize: 20 }} />
                    <Typography variant="subtitle2" color="info.dark">
                      Evening Update
                    </Typography>
                    <Chip
                      label={`${workUpdates.evening.completionPercent}%`}
                      size="small"
                      color={getProgressColor(workUpdates.evening.completionPercent)}
                    />
                    {workUpdates.evening.timestamp && (
                      <Chip
                        label={dayjs(workUpdates.evening.timestamp).format("h:mm A")}
                        size="small"
                        variant="outlined"
                        sx={{ ml: "auto" }}
                      />
                    )}
                  </Box>

                  {/* Progress bar */}
                  <Box sx={{ mb: 1.5 }}>
                    <LinearProgress
                      variant="determinate"
                      value={workUpdates.evening.completionPercent}
                      color={getProgressColor(workUpdates.evening.completionPercent)}
                      sx={{ height: 8, borderRadius: 1 }}
                    />
                  </Box>

                  {workUpdates.evening.summary && (
                    <Typography variant="body2" sx={{ mb: 1.5 }}>
                      {workUpdates.evening.summary}
                    </Typography>
                  )}

                  {workUpdates.evening.photos.length > 0 && (
                    <PhotoThumbnailStrip
                      photos={workUpdates.evening.photos}
                      size="medium"
                      maxVisible={5}
                      onPhotoClick={handleEveningPhotoClick}
                    />
                  )}
                </Paper>
              )}
            </>
          )}

          {/* No data state */}
          {!hasMorning && !hasEvening && (
            <Box sx={{ textAlign: "center", py: 4 }}>
              <Typography color="text.secondary">
                No work updates recorded for this date.
              </Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>

      {/* Fullscreen photo viewer */}
      <PhotoFullscreenDialog
        open={fullscreenOpen}
        onClose={() => setFullscreenOpen(false)}
        photos={fullscreenPhotos}
        initialIndex={fullscreenIndex}
        period={fullscreenPeriod}
      />
    </>
  );
}
