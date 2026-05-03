"use client";

import React, { useEffect, useMemo } from "react";
import {
  Box,
  IconButton,
  Tab,
  Tabs,
  Typography,
  useMediaQuery,
  useTheme,
  Drawer,
  alpha,
} from "@mui/material";
import {
  Close as CloseIcon,
  PushPin as PinIcon,
  PushPinOutlined as PinOutlinedIcon,
  OpenInNew as OpenInNewIcon,
  CalendarMonth as CalendarIcon,
  Person as PersonIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import type { InspectPaneProps, InspectTabKey } from "./types";
import AttendanceTab from "./AttendanceTab";
import WorkUpdatesTab from "./WorkUpdatesTab";
import SettlementTab from "./SettlementTab";
import AuditTab from "./AuditTab";

const ALL_TABS: { key: InspectTabKey; label: string }[] = [
  { key: "attendance", label: "Attendance" },
  { key: "work-updates", label: "Work Updates" },
  { key: "settlement", label: "Settlement" },
  { key: "audit", label: "Audit" },
];

const ADVANCE_TABS: { key: InspectTabKey; label: string }[] = [
  { key: "settlement", label: "Settlement" },
  { key: "audit", label: "Audit" },
];

export function InspectPane(props: InspectPaneProps) {
  const {
    entity,
    isOpen,
    isPinned,
    activeTab,
    onTabChange,
    onClose,
    onTogglePin,
    onOpenInPage,
    onSettleClick,
    zIndex,
  } = props;

  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm")); // < 600px

  // Esc closes pane (only when open). Dialog Esc precedence is implicit:
  // MUI dialogs add their own Esc listeners that fire first.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  const title = useMemo(() => {
    if (!entity) return "";
    if (entity.kind === "daily-date") {
      return dayjs(entity.date).format("DD MMM · ddd");
    }
    if (entity.kind === "advance") {
      return "Advance";
    }
    // weekly-week or weekly-aggregate
    const start = dayjs(entity.weekStart).format("DD");
    const end = dayjs(entity.weekEnd).format("DD MMM");
    return `Week ${start}–${end}`;
  }, [entity]);

  const subtitle = useMemo(() => {
    if (!entity) return "";
    if (entity.kind === "weekly-aggregate") {
      return entity.subcontractId ? "Subcontract scope" : "All subcontracts";
    }
    if (entity.kind === "daily-market-weekly") {
      return "Daily + Market";
    }
    if (entity.kind === "advance") {
      return entity.settlementRef ?? "Advance";
    }
    const ref = entity.settlementRef ? entity.settlementRef : "Pending";
    return ref;
  }, [entity]);

  // If the active tab isn't available for the current entity kind (e.g., advance
  // hides Attendance + Work Updates), redirect to Settlement so the pane body
  // doesn't go blank.
  useEffect(() => {
    if (entity?.kind === "advance" && (activeTab === "attendance" || activeTab === "work-updates")) {
      onTabChange("settlement");
    }
  }, [entity?.kind, activeTab, onTabChange]);

  if (!isOpen || !entity) return null;

  // Width: 480 desktop, full on mobile.
  const drawerWidth = isMobile ? "100%" : 480;

  return (
    <Drawer
      anchor="right"
      open={isOpen}
      onClose={onClose}
      variant={isMobile ? "temporary" : "persistent"}
      ModalProps={{ keepMounted: false }}
      // On non-mobile: persistent drawer overlays without dimming.
      // On mobile: temporary drawer with backdrop.
      PaperProps={{
        sx: {
          width: drawerWidth,
          border: 0,
          borderLeft: `1px solid ${theme.palette.divider}`,
          boxShadow: isMobile ? undefined : 8,
          background: theme.palette.background.paper,
          ...(zIndex !== undefined ? { zIndex } : {}),
        },
      }}
      sx={{
        ...(zIndex !== undefined ? { zIndex } : {}),
        // Persistent drawer should NOT dim background.
        ...(isMobile
          ? {}
          : { "& .MuiBackdrop-root": { display: "none" } }),
      }}
    >
      {/* Header */}
      <Box
        sx={{
          px: 2,
          py: 1.5,
          borderBottom: `1px solid ${theme.palette.divider}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
        }}
      >
        <Box sx={{ minWidth: 0 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
            {entity.kind === "daily-date" ||
            entity.kind === "daily-market-weekly" ? (
              <CalendarIcon fontSize="small" color="action" />
            ) : (
              <PersonIcon fontSize="small" color="action" />
            )}
            <Typography variant="subtitle2" fontWeight={700} noWrap>
              {title}
            </Typography>
          </Box>
          <Typography
            variant="caption"
            color="text.secondary"
            noWrap
            sx={{ display: "block" }}
          >
            {subtitle}
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: 0.5, flexShrink: 0 }}>
          <IconButton
            size="small"
            aria-label="Open in page"
            onClick={() => onOpenInPage(entity)}
          >
            <OpenInNewIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            aria-label={isPinned ? "Unpin pane" : "Pin pane"}
            onClick={onTogglePin}
            color={isPinned ? "primary" : "default"}
          >
            {isPinned ? (
              <PinIcon fontSize="small" />
            ) : (
              <PinOutlinedIcon fontSize="small" />
            )}
          </IconButton>
          <IconButton size="small" aria-label="Close pane" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onChange={(_, v) => onTabChange(v as InspectTabKey)}
        variant="fullWidth"
        sx={{
          minHeight: 36,
          "& .MuiTab-root": {
            minHeight: 36,
            fontSize: 12,
            textTransform: "none",
          },
          borderBottom: `1px solid ${theme.palette.divider}`,
        }}
      >
        {(entity?.kind === "advance" ? ADVANCE_TABS : ALL_TABS).map((t) => (
          <Tab key={t.key} value={t.key} label={t.label} />
        ))}
      </Tabs>

      {/* Body */}
      <Box
        role="region"
        aria-label={`Inspector for ${subtitle}`}
        sx={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          background: alpha(theme.palette.background.default, 0.3),
        }}
      >
        {activeTab === "attendance" && <AttendanceTab entity={entity} />}
        {activeTab === "work-updates" && <WorkUpdatesTab entity={entity} />}
        {activeTab === "settlement" && (
          <SettlementTab entity={entity} onSettleClick={onSettleClick} />
        )}
        {activeTab === "audit" && <AuditTab entity={entity} />}
      </Box>
    </Drawer>
  );
}

export default InspectPane;
