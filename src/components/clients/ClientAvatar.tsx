"use client";

import React from "react";
import { Avatar, type SxProps, type Theme } from "@mui/material";

/** Two-letter initials, ignoring honorifics like "Mr." / "Mrs.". */
export function clientInitials(name: string | null | undefined): string {
  const words = (name ?? "")
    .replace(/\b(mr|mrs|ms|dr|smt|shri|thiru|tmt)\.?\s+/gi, "")
    .split(/\s+/)
    .filter((w) => /^[A-Za-z஀-௿]/.test(w) && !/^(w\/o|s\/o|d\/o|c\/o)$/i.test(w));
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export interface ClientAvatarProps {
  name: string | null | undefined;
  photoUrl?: string | null;
  size?: number;
  sx?: SxProps<Theme>;
}

export function ClientAvatar({ name, photoUrl, size = 32, sx }: ClientAvatarProps) {
  return (
    <Avatar
      src={photoUrl || undefined}
      alt={name ?? ""}
      sx={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        bgcolor: "primary.main",
        color: "primary.contrastText",
        ...sx,
      }}
    >
      {clientInitials(name)}
    </Avatar>
  );
}

export default ClientAvatar;
