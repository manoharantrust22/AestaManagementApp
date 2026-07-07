"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Fade,
  IconButton,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import {
  FitScreen as FitScreenIcon,
  ZoomIn as ZoomInIcon,
  ZoomOut as ZoomOutIcon,
} from "@mui/icons-material";
import { TransformWrapper, TransformComponent } from "react-zoom-pan-pinch";

export interface ZoomableImageProps {
  src: string;
  alt?: string;
  /** On-screen +/−/reset buttons (desktop). Default true. */
  showButtons?: boolean;
  /** "Pinch to zoom" caption (mobile). Default false. */
  showHint?: boolean;
}

/**
 * Self-contained zoom/pan image: drag-to-pan, wheel zoom (desktop), pinch
 * (mobile), double-click/tap reset. Extracted from ImageZoomDialog so the
 * floor-plan viewer reuses the exact same behaviour.
 */
export default function ZoomableImage({
  src,
  alt = "Image",
  showButtons = true,
  showHint = false,
}: ZoomableImageProps) {
  const theme = useTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
  }, [src]);

  const handleOpenInNewTab = useCallback(() => {
    if (src) window.open(src, "_blank");
  }, [src]);

  if (error) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, p: 4 }}>
        <Typography color="error">Failed to load image</Typography>
        <Button variant="outlined" onClick={handleOpenInNewTab}>
          Open in new tab
        </Button>
      </Box>
    );
  }

  return (
    <>
      {loading && (
        <Box sx={{ position: "absolute", zIndex: 5 }}>
          <CircularProgress size={40} />
        </Box>
      )}
      <TransformWrapper
        initialScale={1}
        minScale={0.5}
        maxScale={6}
        centerOnInit
        wheel={{ step: 0.15 }}
        pinch={{ step: 5 }}
        doubleClick={{ mode: "reset" }}
      >
        {({ zoomIn, zoomOut, resetTransform }) => (
          <>
            {showButtons && (
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

            {showHint && !loading && (
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
                  alt={alt}
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
    </>
  );
}
