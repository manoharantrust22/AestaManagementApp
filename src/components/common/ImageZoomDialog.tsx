"use client";

import React, { useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  IconButton,
  Typography,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import ZoomableImage from "./ZoomableImage";

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

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

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
        <ZoomableImage src={src} alt={label} showButtons={!isMobile} showHint={isMobile} />
      </DialogContent>
    </Dialog>
  );
}
