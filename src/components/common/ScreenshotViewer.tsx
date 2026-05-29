"use client";

import React, { useState, useCallback, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  Box,
  IconButton,
  Typography,
  useTheme,
  alpha,
  Fade,
} from "@mui/material";
import {
  Close as CloseIcon,
  ChevronLeft as ChevronLeftIcon,
  ChevronRight as ChevronRightIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  Download as DownloadIcon,
} from "@mui/icons-material";

interface ScreenshotViewerProps {
  open: boolean;
  onClose: () => void;
  images: string[];
  initialIndex?: number;
  title?: string;
  /** Override the modal's stacking context. Needed when the host pane runs in
   *  fullscreen (z-index 1400) — without this the lightbox renders underneath. */
  zIndex?: number;
}

export default function ScreenshotViewer({
  open,
  onClose,
  images,
  initialIndex = 0,
  title,
  zIndex,
}: ScreenshotViewerProps) {
  const theme = useTheme();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [loading, setLoading] = useState(true);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setCurrentIndex(initialIndex);
      setZoom(1);
      setLoading(true);
    }
  }, [open, initialIndex]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex((prev) => (prev > 0 ? prev - 1 : images.length - 1));
    setZoom(1);
    setLoading(true);
  }, [images.length]);

  const handleNext = useCallback(() => {
    setCurrentIndex((prev) => (prev < images.length - 1 ? prev + 1 : 0));
    setZoom(1);
    setLoading(true);
  }, [images.length]);

  const handleZoomIn = useCallback(() => {
    setZoom((prev) => Math.min(prev + 0.25, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoom((prev) => Math.max(prev - 0.25, 0.5));
  }, []);

  const handleDownload = useCallback(() => {
    if (images[currentIndex]) {
      const link = document.createElement("a");
      link.href = images[currentIndex];
      link.download = `screenshot-${currentIndex + 1}.jpg`;
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, [images, currentIndex]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          handlePrevious();
          break;
        case "ArrowRight":
          handleNext();
          break;
        case "Escape":
          onClose();
          break;
        case "+":
        case "=":
          handleZoomIn();
          break;
        case "-":
          handleZoomOut();
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, handlePrevious, handleNext, onClose, handleZoomIn, handleZoomOut]);

  if (!images || images.length === 0) {
    return null;
  }

  const currentImage = images[currentIndex];
  const hasMultipleImages = images.length > 1;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth={false}
      fullWidth
      sx={zIndex !== undefined ? { zIndex } : undefined}
      PaperProps={{
        sx: {
          bgcolor: "transparent",
          boxShadow: "none",
          m: 0,
          maxWidth: "100vw",
          maxHeight: "100vh",
          width: "100vw",
          height: "100vh",
        },
      }}
      slotProps={{
        backdrop: {
          sx: {
            bgcolor: alpha(theme.palette.common.black, 0.9),
          },
        },
      }}
    >
      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header with title and controls */}
        <Box
          sx={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            p: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            bgcolor: alpha(theme.palette.common.black, 0.5),
            zIndex: 10,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 2 }}>
            {title && (
              <Typography variant="subtitle1" color="white">
                {title}
              </Typography>
            )}
            {hasMultipleImages && (
              <Typography variant="body2" color="grey.400">
                {currentIndex + 1} / {images.length}
              </Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            {/* Zoom controls */}
            <IconButton
              onClick={handleZoomOut}
              disabled={zoom <= 0.5}
              sx={{ color: "white" }}
              size="small"
            >
              <ZoomOutIcon />
            </IconButton>
            <Typography variant="body2" color="white" sx={{ minWidth: 50, textAlign: "center" }}>
              {Math.round(zoom * 100)}%
            </Typography>
            <IconButton
              onClick={handleZoomIn}
              disabled={zoom >= 3}
              sx={{ color: "white" }}
              size="small"
            >
              <ZoomInIcon />
            </IconButton>

            {/* Download button */}
            <IconButton onClick={handleDownload} sx={{ color: "white" }} size="small" aria-label="Download">
              <DownloadIcon />
            </IconButton>

            {/* Close button */}
            <IconButton
              onClick={onClose}
              sx={{
                color: "white",
                ml: 1,
                "&:hover": {
                  bgcolor: alpha(theme.palette.common.white, 0.1),
                },
              }}
            >
              <CloseIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Navigation arrows */}
        {hasMultipleImages && (
          <>
            <IconButton
              onClick={handlePrevious}
              sx={{
                position: "absolute",
                left: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "white",
                bgcolor: alpha(theme.palette.common.black, 0.5),
                "&:hover": {
                  bgcolor: alpha(theme.palette.common.black, 0.7),
                },
                zIndex: 10,
              }}
              size="large"
            >
              <ChevronLeftIcon fontSize="large" />
            </IconButton>

            <IconButton
              onClick={handleNext}
              sx={{
                position: "absolute",
                right: 16,
                top: "50%",
                transform: "translateY(-50%)",
                color: "white",
                bgcolor: alpha(theme.palette.common.black, 0.5),
                "&:hover": {
                  bgcolor: alpha(theme.palette.common.black, 0.7),
                },
                zIndex: 10,
              }}
              size="large"
            >
              <ChevronRightIcon fontSize="large" />
            </IconButton>
          </>
        )}

        {/* Image */}
        <Fade in={!loading} timeout={300}>
          <Box
            sx={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              overflow: "auto",
              py: 8,
            }}
          >
            <Box
              component="img"
              src={currentImage}
              alt={`Screenshot ${currentIndex + 1}`}
              onLoad={() => setLoading(false)}
              onError={() => setLoading(false)}
              sx={{
                maxWidth: "90vw",
                maxHeight: "85vh",
                objectFit: "contain",
                transform: `scale(${zoom})`,
                transition: "transform 0.2s ease-in-out",
                cursor: zoom > 1 ? "move" : "default",
                borderRadius: 1,
                boxShadow: theme.shadows[24],
              }}
            />
          </Box>
        </Fade>

        {/* Loading placeholder */}
        {loading && (
          <Box
            sx={{
              position: "absolute",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Typography color="grey.400">Loading...</Typography>
          </Box>
        )}

        {/* Thumbnail strip for multiple images */}
        {hasMultipleImages && (
          <Box
            sx={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              p: 2,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 1,
              bgcolor: alpha(theme.palette.common.black, 0.5),
              overflowX: "auto",
            }}
          >
            {images.map((img, idx) => (
              <Box
                key={idx}
                onClick={() => {
                  setCurrentIndex(idx);
                  setZoom(1);
                  setLoading(true);
                }}
                sx={{
                  width: 60,
                  height: 60,
                  borderRadius: 1,
                  overflow: "hidden",
                  cursor: "pointer",
                  border: idx === currentIndex ? `2px solid ${theme.palette.primary.main}` : "2px solid transparent",
                  opacity: idx === currentIndex ? 1 : 0.6,
                  transition: "all 0.2s",
                  "&:hover": {
                    opacity: 1,
                  },
                }}
              >
                <Box
                  component="img"
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  sx={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
              </Box>
            ))}
          </Box>
        )}
      </DialogContent>
    </Dialog>
  );
}
