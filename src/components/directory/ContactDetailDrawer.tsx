"use client";

import React from "react";
import NextLink from "next/link";
import {
  Box,
  Button,
  Chip,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import {
  Phone as PhoneIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  Close as CloseIcon,
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
  OpenInNew as OpenInNewIcon,
  Place as PlaceIcon,
  CheckCircle as CheckCircleIcon,
  Handyman as HandymanIcon,
  Engineering as EngineeringIcon,
  Storefront as StorefrontIcon,
  Groups as GroupsIcon,
  Sell as SellIcon,
  Language as LanguageIcon,
} from "@mui/icons-material";
import { EntityImageAvatar } from "@/components/common/EntityImageAvatar";
import { telHref, whatsappHref, mailtoHref } from "@/lib/utils/contact";
import { SOURCE_META, type DirectoryEntry } from "@/types/directory.types";

const WA_GREEN = "#25D366";

const SOURCE_ICON: Record<DirectoryEntry["source"], React.ReactNode> = {
  technician: <HandymanIcon />,
  brand: <SellIcon />,
  laborer: <EngineeringIcon />,
  vendor: <StorefrontIcon />,
  mestri: <GroupsIcon />,
};

/** Normalize a pasted website into an absolute, openable URL. */
function websiteHref(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

interface ContactDetailDrawerProps {
  entry: DirectoryEntry | null;
  open: boolean;
  onClose: () => void;
  onEdit: (entry: DirectoryEntry) => void;
  onDelete: (entry: DirectoryEntry) => void;
  canEdit: boolean;
  isMobile: boolean;
}

export default function ContactDetailDrawer({
  entry,
  open,
  onClose,
  onEdit,
  onDelete,
  canEdit,
  isMobile,
}: ContactDetailDrawerProps) {
  return (
    <Drawer
      anchor="right"
      open={open && !!entry}
      onClose={onClose}
      slotProps={{
        paper: { sx: { width: isMobile ? "100%" : 400, maxWidth: "100%" } },
      }}
    >
      {entry ? (
        <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
          {/* Header */}
          <Box sx={{ p: 2, display: "flex", gap: 1.5, alignItems: "flex-start" }}>
            <EntityImageAvatar
              src={entry.photoUrl}
              name={entry.name}
              size={64}
              tint={SOURCE_META[entry.source].color}
              fallbackIcon={SOURCE_ICON[entry.source]}
            />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
                {entry.name}
              </Typography>
              <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: "wrap", gap: 0.5 }}>
                <Chip
                  size="small"
                  label={SOURCE_META[entry.source].label}
                  color={SOURCE_META[entry.source].color}
                  variant="outlined"
                />
                {entry.source === "laborer" && entry.alsoMestri ? (
                  <Chip size="small" label="Mestri" color="warning" variant="outlined" />
                ) : null}
                {entry.source === "technician" ? (
                  entry.workedWith ? (
                    <Chip
                      size="small"
                      icon={<CheckCircleIcon />}
                      label="Worked with"
                      color="success"
                      variant="outlined"
                    />
                  ) : (
                    <Chip size="small" label="New contact" variant="outlined" />
                  )
                ) : null}
              </Stack>
              {entry.trade ? (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
                  {entry.trade}
                </Typography>
              ) : null}
            </Box>
            <IconButton onClick={onClose} size="small" aria-label="Close">
              <CloseIcon />
            </IconButton>
          </Box>

          {/* Quick actions */}
          <Stack direction="row" spacing={1} sx={{ px: 2, pb: 1.5 }}>
            <Button
              fullWidth
              variant="contained"
              color="success"
              startIcon={<PhoneIcon />}
              component={telHref(entry.phone) ? "a" : "button"}
              href={telHref(entry.phone) ?? undefined}
              disabled={!telHref(entry.phone)}
            >
              Call
            </Button>
            <Button
              fullWidth
              variant="contained"
              startIcon={<WhatsAppIcon />}
              component={whatsappHref(entry.whatsapp || entry.phone) ? "a" : "button"}
              href={whatsappHref(entry.whatsapp || entry.phone) ?? undefined}
              target="_blank"
              rel="noopener noreferrer"
              disabled={!whatsappHref(entry.whatsapp || entry.phone)}
              sx={{ bgcolor: WA_GREEN, "&:hover": { bgcolor: "#1da851" } }}
            >
              WhatsApp
            </Button>
          </Stack>

          <Divider />

          {/* Details */}
          <Box sx={{ p: 2, flex: 1, overflowY: "auto" }}>
            <Stack spacing={1.5}>
              {entry.phone ? (
                <DetailRow icon={<PhoneIcon fontSize="small" />} label="Phone" value={entry.phone} />
              ) : null}
              {entry.whatsapp && entry.whatsapp !== entry.phone ? (
                <DetailRow
                  icon={<WhatsAppIcon fontSize="small" />}
                  label="WhatsApp"
                  value={entry.whatsapp}
                />
              ) : null}
              {entry.email ? (
                <DetailRow
                  icon={<EmailIcon fontSize="small" />}
                  label="Email"
                  value={
                    <a href={mailtoHref(entry.email) ?? undefined} style={{ color: "inherit" }}>
                      {entry.email}
                    </a>
                  }
                />
              ) : null}
              {entry.area ? (
                <DetailRow icon={<PlaceIcon fontSize="small" />} label="Area" value={entry.area} />
              ) : null}
              {entry.website ? (
                <DetailRow
                  icon={<LanguageIcon fontSize="small" />}
                  label="Website"
                  value={
                    <a
                      href={websiteHref(entry.website) ?? undefined}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "inherit" }}
                    >
                      {entry.website}
                    </a>
                  }
                />
              ) : null}

              {entry.secondaryTrades.length > 0 ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Specialties
                  </Typography>
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mt: 0.5 }}>
                    {entry.secondaryTrades.map((t) => (
                      <Chip key={t} size="small" label={t} variant="outlined" />
                    ))}
                  </Box>
                </Box>
              ) : null}

              {entry.notes ? (
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Notes
                  </Typography>
                  <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 0.25 }}>
                    {entry.notes}
                  </Typography>
                </Box>
              ) : null}
            </Stack>
          </Box>

          <Divider />

          {/* Footer actions */}
          <Box sx={{ p: 2 }}>
            {entry.source === "technician" || entry.source === "brand" ? (
              <Stack direction="row" spacing={1}>
                <Button
                  fullWidth
                  variant="outlined"
                  startIcon={<EditIcon />}
                  onClick={() => onEdit(entry)}
                  disabled={!canEdit}
                >
                  Edit
                </Button>
                <Button
                  fullWidth
                  variant="outlined"
                  color="error"
                  startIcon={<DeleteIcon />}
                  onClick={() => onDelete(entry)}
                  disabled={!canEdit}
                >
                  Delete
                </Button>
              </Stack>
            ) : entry.profileHref ? (
              <Button
                fullWidth
                variant="outlined"
                endIcon={<OpenInNewIcon />}
                component={NextLink}
                href={entry.profileHref}
              >
                View full profile
              </Button>
            ) : null}
          </Box>
        </Box>
      ) : null}
    </Drawer>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start" }}>
      <Box sx={{ color: "text.secondary", mt: 0.25 }}>{icon}</Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
          {label}
        </Typography>
        <Typography variant="body2" sx={{ wordBreak: "break-word" }}>
          {value}
        </Typography>
      </Box>
    </Box>
  );
}
