"use client";

import React, { useEffect, useState } from "react";
import { Box, Typography, useTheme, alpha } from "@mui/material";

type TintColor = "primary" | "secondary" | "info" | "success" | "warning" | "error";

interface EntityImageAvatarProps {
  src?: string | null;
  name: string;
  size?: number;
  radius?: number;
  fallbackIcon?: React.ReactNode;
  tint?: TintColor;
}

function initialsOf(name: string): string {
  const trimmed = (name || "").trim();
  if (!trimmed) return "?";
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export function EntityImageAvatar({
  src,
  name,
  size = 56,
  radius = 1.25,
  fallbackIcon,
  tint = "primary",
}: EntityImageAvatarProps) {
  const theme = useTheme();
  const palette = theme.palette[tint];
  const bg = alpha(palette.main, 0.12);
  const fg = palette.dark;

  // Track per-src failures so we can fall back to the initials avatar when an
  // image URL is broken (404, CORB-blocked, dead Google image search redirect,
  // etc.) instead of showing the browser's broken-image icon.
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [src]);

  if (src && !failed) {
    return (
      <Box
        component="img"
        src={src}
        alt={name}
        loading="lazy"
        onError={() => setFailed(true)}
        sx={{
          width: size,
          height: size,
          borderRadius: radius,
          objectFit: "cover",
          flexShrink: 0,
          border: 1,
          borderColor: "divider",
          bgcolor: "background.paper",
        }}
      />
    );
  }

  return (
    <Box
      aria-label={name}
      sx={{
        width: size,
        height: size,
        borderRadius: radius,
        flexShrink: 0,
        bgcolor: bg,
        color: fg,
        border: 1,
        borderColor: alpha(palette.main, 0.18),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {fallbackIcon ? (
        <Box
          sx={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            opacity: 0.32,
            display: "flex",
            "& svg": { fontSize: size * 0.55 },
          }}
        >
          {fallbackIcon}
        </Box>
      ) : null}
      <Typography
        sx={{
          fontWeight: 700,
          fontSize: Math.max(11, size * 0.32),
          letterSpacing: 0.4,
          position: "relative",
          zIndex: 1,
        }}
      >
        {initialsOf(name)}
      </Typography>
    </Box>
  );
}
