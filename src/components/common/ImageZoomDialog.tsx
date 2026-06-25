"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  Box,
  IconButton,
  Typography,
  useTheme,
  useMediaQuery,
  alpha,
  Fade,
  Button,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
  FitScreen as FitScreenIcon,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export interface ImageZoomDialogProps {
  open: boolean;
  src: string | null;
  /** Header text + image alt text. */
  title?: string;
  onClose: () => void;
}

/**
 * Full-screen, controlled image viewer with zoom + pan.
 * Image-only sibling of BillViewerDialog: drag-to-pan, wheel zoom (desktop),
 * pinch zoom (mobile), double-click/tap to reset, on-screen zoom buttons.
 */
export default function ImageZoomDialog({
  open,
  src,
  title,
  onClose,
}: ImageZoomDialogProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (open) {
      setLoading(true);
      setError(false);
    }
  }, [open, src]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const handleOpenInNewTab = useCallback(() => {
    if (src) window.open(src, "_blank");
  }, [src]);

  if (!src) return null;

  const label = title || "Image";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      fullScreen={isMobile}
      maxWidth={false}
      PaperProps={{
        sx: {
          ...(isMobile
            ? {}
            : { width: "90vw", height: "90vh", maxWidth: "90vw", maxHeight: "90vh" }),
          bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.100",
        },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1,
          px: 2,
          borderBottom: 1,
          borderColor: "divider",
        }}
      >
        <Typography component="span" variant="subtitle1" fontWeight={600} noWrap sx={{ flex: 1 }}>
          {label}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          p: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          position: "relative",
          overflow: "hidden",
          bgcolor: theme.palette.mode === "dark" ? "grey.900" : "grey.200",
        }}
      >
        {loading && !error && (
          <Box sx={{ position: "absolute", zIndex: 5 }}>
            <CircularProgress size={40} />
          </Box>
        )}

        {error ? (
          <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, p: 4 }}>
            <Typography color="error">Failed to load image</Typography>
            <Button variant="outlined" onClick={handleOpenInNewTab}>
              Open in new tab
            </Button>
          </Box>
        ) : (
          <TransformWrapper
            initialScale={1}
            minScale={0.5}
            maxScale={4}
            centerOnInit
            wheel={{ step: 0.1 }}
            pinch={{ step: 5 }}
            doubleClick={{ mode: "reset" }}
          >
            {({ zoomIn, zoomOut, resetTransform }) => (
              <>
                {!isMobile && (
                  <Box
                    sx={{
                      position: "absolute",
                      bottom: 16,
                      left: "50%",
                      transform: "translateX(-50%)",
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      bgcolor: alpha(theme.palette.common.black, 0.7),
                      borderRadius: 2,
                      px: 2,
                      py: 1,
                      zIndex: 10,
                    }}
                  >
                    <IconButton onClick={() => zoomOut()} size="small" sx={{ color: "white" }} aria-label="Zoom out">
                      <ZoomOutIcon />
                    </IconButton>
                    <IconButton onClick={() => resetTransform()} size="small" sx={{ color: "white" }} aria-label="Reset zoom">
                      <FitScreenIcon />
                    </IconButton>
                    <IconButton onClick={() => zoomIn()} size="small" sx={{ color: "white" }} aria-label="Zoom in">
                      <ZoomInIcon />
                    </IconButton>
                  </Box>
                )}

                {isMobile && !loading && (
                  <Typography
                    variant="caption"
                    sx={{
                      position: "absolute",
                      bottom: 8,
                      left: "50%",
                      transform: "translateX(-50%)",
                      bgcolor: alpha(theme.palette.common.black, 0.6),
                      color: "white",
                      px: 2,
                      py: 0.5,
                      borderRadius: 1,
                      zIndex: 10,
                    }}
                  >
                    Pinch to zoom • double-tap to reset
                  </Typography>
                )}

                <TransformComponent
                  wrapperStyle={{ width: "100%", height: "100%" }}
                  contentStyle={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Fade in={!loading} timeout={300}>
                    <Box
                      component="img"
                      src={src}
                      alt={label}
                      onLoad={() => setLoading(false)}
                      onError={() => {
                        setLoading(false);
                        setError(true);
                      }}
                      sx={{
                        maxWidth: "100%",
                        maxHeight: "100%",
                        objectFit: "contain",
                        borderRadius: 1,
                        boxShadow: theme.shadows[8],
                      }}
                    />
                  </Fade>
                </TransformComponent>
              </>
            )}
          </TransformWrapper>
        )}
      </DialogContent>
    </Dialog>
  );
}
