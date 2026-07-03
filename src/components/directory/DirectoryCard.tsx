"use client";

import React from "react";
import { Box, Chip, IconButton, Tooltip, Typography } from "@mui/material";
import {
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  CheckCircle as CheckCircleIcon,
  Place as PlaceIcon,
  MoreVert as MoreVertIcon,
} from "@mui/icons-material";
import { ListRow } from "@/components/common/ListRow";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { telHref, whatsappHref } from "@/lib/utils/contact";
import { SOURCE_META, type DirectoryEntry } from "@/types/directory.types";
import { SOURCE_ICON, WA_GREEN } from "./sourceIcons";

interface DirectoryCardProps {
  entry: DirectoryEntry;
  onOpen: (entry: DirectoryEntry) => void;
  /** When set, shows a ⋮ actions button (page passes it only for editors). */
  onMenuOpen?: (anchorEl: HTMLElement, entry: DirectoryEntry) => void;
}

export function DirectoryCard({ entry, onOpen, onMenuOpen }: DirectoryCardProps) {
  const meta = SOURCE_META[entry.source];
  const tel = telHref(entry.phone);
  const wa = whatsappHref(entry.whatsapp || entry.phone);

  const extraTrades = entry.secondaryTrades.slice(0, 2);
  const extraOverflow = entry.secondaryTrades.length - extraTrades.length;

  return (
    <ListRow
      ariaLabel={`${entry.name}, ${entry.trade ?? meta.label}`}
      onClick={() => onOpen(entry)}
      image={
        <EntityImageAvatar
          src={entry.photoUrl}
          name={entry.name}
          size={52}
          tint={meta.color}
          fallbackIcon={SOURCE_ICON[entry.source]}
        />
      }
      primary={
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 600,
              fontSize: 14.5,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {entry.name}
          </Typography>
          {entry.source === "technician" && entry.workedWith ? (
            <Tooltip title="Worked with before">
              <CheckCircleIcon sx={{ fontSize: 15, color: "success.main" }} />
            </Tooltip>
          ) : null}
        </Box>
      }
      secondary={
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.5,
            color: "text.secondary",
            fontSize: 12.5,
            minWidth: 0,
          }}
        >
          {entry.trade ? (
            <Typography component="span" sx={{ fontSize: 12.5, fontWeight: 500 }}>
              {entry.trade}
            </Typography>
          ) : null}
          {entry.area ? (
            <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.25, minWidth: 0 }}>
              <PlaceIcon sx={{ fontSize: 13, opacity: 0.7 }} />
              <Typography
                component="span"
                sx={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
              >
                {entry.area}
              </Typography>
            </Box>
          ) : null}
        </Box>
      }
      chips={
        <>
          <Chip
            size="small"
            label={meta.label}
            color={meta.color}
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          {entry.source === "laborer" && entry.alsoMestri ? (
            <Chip size="small" label="Mestri" color="warning" variant="outlined" />
          ) : null}
          {entry.source === "technician" && !entry.workedWith ? (
            <Chip size="small" label="New contact" variant="outlined" />
          ) : null}
          {extraTrades.map((t) => (
            <Chip key={t} size="small" label={t} variant="filled" sx={{ bgcolor: "action.hover" }} />
          ))}
          {extraOverflow > 0 ? (
            <Chip size="small" label={`+${extraOverflow}`} variant="filled" sx={{ bgcolor: "action.hover" }} />
          ) : null}
        </>
      }
      rightContent={
        <Box sx={{ display: "flex", flexDirection: "row", gap: 0.5 }}>
          <Tooltip title={entry.phone ? `Call ${entry.phone}` : "No number"}>
            <span>
              <IconButton
                component="a"
                href={tel ?? undefined}
                disabled={!tel}
                onClick={(e: React.MouseEvent) => e.stopPropagation()}
                sx={{
                  width: 40,
                  height: 40,
                  bgcolor: tel ? "success.main" : "action.disabledBackground",
                  color: "common.white",
                  "&:hover": { bgcolor: "success.dark" },
                }}
                aria-label="Call"
              >
                <PhoneIcon fontSize="small" />
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
                  width: 40,
                  height: 40,
                  bgcolor: wa ? WA_GREEN : "action.disabledBackground",
                  color: "common.white",
                  "&:hover": { bgcolor: "#1da851" },
                }}
                aria-label="WhatsApp"
              >
                <WhatsAppIcon fontSize="small" />
              </IconButton>
            </span>
          </Tooltip>
        </Box>
      }
      actionsMenu={
        onMenuOpen ? (
          <IconButton
            size="small"
            aria-label="More actions"
            onClick={(e) => onMenuOpen(e.currentTarget, entry)}
          >
            <MoreVertIcon fontSize="small" />
          </IconButton>
        ) : undefined
      }
    />
  );
}
