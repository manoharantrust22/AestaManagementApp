"use client";

/**
 * Grid-view card for a directory contact — the card-per-contact counterpart of
 * the DirectoryCard list row (modeled on VendorGridCard so the two grids feel
 * the same). Photo/logo on top, name + trade, source tag, tap-to-call footer.
 *
 * Brand logos render with `objectFit: contain` on a white plate (a cropped
 * logo is worse than a letterboxed one); people/shop photos use `cover`.
 */

import React, { useEffect, useState } from "react";
import { Box, Chip, IconButton, Tooltip, Typography, alpha, useTheme } from "@mui/material";
import {
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  MoreVert as MoreVertIcon,
  CheckCircle as CheckCircleIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { telHref, whatsappHref } from "@/lib/utils/contact";
import { SOURCE_META, type DirectoryEntry } from "@/types/directory.types";
import { SOURCE_ICON, WA_GREEN } from "./sourceIcons";

interface DirectoryGridCardProps {
  entry: DirectoryEntry;
  onOpen: (entry: DirectoryEntry) => void;
  /** When set, shows a ⋮ actions button (page passes it only for editors). */
  onMenuOpen?: (anchorEl: HTMLElement, entry: DirectoryEntry) => void;
}

export function DirectoryGridCard({ entry, onOpen, onMenuOpen }: DirectoryGridCardProps) {
  const theme = useTheme();
  const meta = SOURCE_META[entry.source];
  const tel = telHref(entry.phone);
  const wa = whatsappHref(entry.whatsapp || entry.phone);
  const isBrand = entry.source === "brand";
  const [imgFailed, setImgFailed] = useState(false);
  useEffect(() => {
    setImgFailed(false);
  }, [entry.photoUrl]);

  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={() => onOpen(entry)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(entry);
        }
      }}
      sx={{
        cursor: "pointer",
        bgcolor: "background.paper",
        border: 1,
        borderColor: "divider",
        borderRadius: 1.5,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        transition: "transform 120ms, box-shadow 120ms, border-color 120ms",
        "&:hover": {
          transform: "translateY(-1px)",
          boxShadow: 2,
          borderColor: alpha(theme.palette.primary.main, 0.4),
        },
      }}
    >
      {/* Image area: fixed 4:3 aspect via padding-top trick. */}
      <Box
        sx={{
          position: "relative",
          width: "100%",
          pt: "75%",
          bgcolor: alpha(theme.palette[meta.color].main, 0.04),
          borderBottom: 1,
          borderColor: "divider",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        <Box
          sx={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {entry.photoUrl && !imgFailed ? (
            <Box
              component="img"
              src={entry.photoUrl}
              alt={entry.name}
              loading="lazy"
              onError={() => setImgFailed(true)}
              sx={{
                width: "100%",
                height: "100%",
                display: "block",
                objectFit: isBrand ? "contain" : "cover",
                ...(isBrand ? { p: 1.5, bgcolor: "common.white" } : {}),
              }}
            />
          ) : (
            <EntityImageAvatar
              src={null}
              name={entry.name}
              size={72}
              tint={meta.color}
              fallbackIcon={SOURCE_ICON[entry.source]}
            />
          )}
        </Box>

        {/* Source tag — bottom-left so it never fights the kebab. */}
        <Chip
          size="small"
          label={meta.label}
          color={meta.color}
          variant="outlined"
          sx={{
            position: "absolute",
            bottom: 6,
            left: 6,
            height: 20,
            fontSize: 10,
            fontWeight: 600,
            bgcolor: alpha(theme.palette.background.paper, 0.92),
          }}
        />

        {onMenuOpen ? (
          <IconButton
            size="small"
            aria-label="More actions"
            onClick={(e) => {
              e.stopPropagation();
              onMenuOpen(e.currentTarget, entry);
            }}
            sx={{
              position: "absolute",
              top: 4,
              right: 4,
              bgcolor: alpha(theme.palette.background.paper, 0.85),
              "&:hover": { bgcolor: "background.paper" },
            }}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        ) : null}
      </Box>

      {/* Content */}
      <Box sx={{ p: 1.25, display: "flex", flexDirection: "column", gap: 0.5, flex: 1 }}>
        <Box sx={{ display: "flex", alignItems: "flex-start", gap: 0.5 }}>
          <Typography
            sx={{
              fontWeight: 700,
              fontSize: 13,
              lineHeight: 1.3,
              overflow: "hidden",
              textOverflow: "ellipsis",
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              minHeight: 34,
              flex: 1,
            }}
          >
            {entry.name}
          </Typography>
          {entry.source === "technician" && entry.workedWith ? (
            <Tooltip title="Worked with before">
              <CheckCircleIcon sx={{ fontSize: 14, color: "success.main", mt: 0.25 }} />
            </Tooltip>
          ) : null}
        </Box>
        <Typography
          sx={{
            fontSize: 10.5,
            color: "text.secondary",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {[entry.trade, entry.area].filter(Boolean).join(" · ") || "—"}
        </Typography>

        {/* Footer: tap-to-call / WhatsApp */}
        <Box sx={{ mt: "auto", pt: 0.75, display: "flex", gap: 0.5, justifyContent: "flex-end" }}>
          <Tooltip title={entry.phone ? `Call ${entry.phone}` : "No number"}>
            <span>
              <IconButton
                component="a"
                href={tel ?? undefined}
                disabled={!tel}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                sx={{
                  width: 30,
                  height: 30,
                  bgcolor: tel ? "success.main" : "action.disabledBackground",
                  color: "common.white",
                  "&:hover": { bgcolor: "success.dark" },
                }}
                aria-label="Call"
              >
                <PhoneIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title={wa ? "WhatsApp" : "No number"}>
            <span>
              <IconButton
                component="a"
                href={wa ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                disabled={!wa}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                sx={{
                  width: 30,
                  height: 30,
                  bgcolor: wa ? WA_GREEN : "action.disabledBackground",
                  color: "common.white",
                  "&:hover": { bgcolor: "#1da851" },
                }}
                aria-label="WhatsApp"
              >
                <WhatsAppIcon sx={{ fontSize: 15 }} />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      </Box>
    </Box>
  );
}
