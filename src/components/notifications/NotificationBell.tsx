"use client";

/**
 * Notifications v2 bell.
 *
 * Two-section popover, priority first:
 *   "Needs your action" — needs_action rows (read or unread): the steps in the
 *     material lifecycle that wait on THIS user (create a PO, record a
 *     delivery, settle a vendor bill…). The DB clears the flag itself when the
 *     step is completed by anyone, so this section never goes stale.
 *   "Updates" — FYI rows (approved / settled / rejected…).
 *
 * Clicking a notification marks it read, switches the active site when the
 * notification belongs to a different site, then follows its action_url —
 * for material-lifecycle rows that is /site/materials/hub?focusThread=<id>,
 * which auto-opens and scrolls to the material's card.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Box,
  Button,
  CircularProgress,
  Divider,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Popover,
  Tooltip,
  Typography,
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActive";
import PendingActionsIcon from "@mui/icons-material/PendingActions";
import AddShoppingCartIcon from "@mui/icons-material/AddShoppingCart";
import LocalShippingIcon from "@mui/icons-material/LocalShipping";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLong";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import BlockIcon from "@mui/icons-material/Block";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import { useSite } from "@/contexts/SiteContext";
import {
  useNotifications,
  useNotificationsRealtime,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
  type AppNotification,
} from "@/hooks/queries/useNotifications";

function typeIcon(type: string) {
  switch (type) {
    case "mr_awaiting_po":
      return <AddShoppingCartIcon fontSize="small" color="warning" />;
    case "po_created":
    case "po_awaiting_delivery":
      return <LocalShippingIcon fontSize="small" color="primary" />;
    case "po_awaiting_settlement":
      return <ReceiptLongIcon fontSize="small" color="warning" />;
    case "mr_approved":
    case "po_settled":
      return <CheckCircleIcon fontSize="small" color="success" />;
    case "mr_rejected":
    case "mr_cancelled":
    case "po_cancelled":
      return <BlockIcon fontSize="small" color="error" />;
    default:
      return <NotificationsIcon fontSize="small" color="action" />;
  }
}

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
}

export default function NotificationBell() {
  const router = useRouter();
  const { sites, selectedSite, setSelectedSite } = useSite();
  const { data: notifications = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();
  useNotificationsRealtime();

  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);

  const { actionable, updates, unreadCount, unreadActionable } = useMemo(() => {
    const actionableRows = notifications.filter((n) => n.needs_action);
    const updateRows = notifications.filter((n) => !n.needs_action);
    return {
      actionable: actionableRows,
      updates: updateRows,
      unreadCount: notifications.filter((n) => !n.is_read).length,
      unreadActionable: actionableRows.some((n) => !n.is_read),
    };
  }, [notifications]);

  const handleClick = (n: AppNotification) => {
    setAnchorEl(null);
    if (!n.is_read) markRead.mutate(n.id);

    // The notification may belong to a different site than the one currently
    // selected — switch first so the target page loads the right data.
    if (n.site_id && n.site_id !== selectedSite?.id) {
      const site = sites.find((s) => s.id === n.site_id);
      if (site) setSelectedSite(site);
    }
    if (n.action_url) router.push(n.action_url);
  };

  const renderItem = (n: AppNotification) => (
    <ListItemButton
      key={n.id}
      onClick={() => handleClick(n)}
      alignItems="flex-start"
      sx={{
        py: 1,
        px: 1.5,
        borderRadius: 1.5,
        bgcolor: n.is_read ? "transparent" : "action.hover",
      }}
    >
      <ListItemIcon sx={{ minWidth: 34, mt: 0.4 }}>
        {typeIcon(n.notification_type)}
      </ListItemIcon>
      <ListItemText
        primary={n.title}
        secondary={
          <>
            {n.message}
            <Typography
              component="span"
              sx={{ display: "block", fontSize: 11, color: "text.disabled", mt: 0.25 }}
            >
              {relativeTime(n.created_at)}
            </Typography>
          </>
        }
        primaryTypographyProps={{
          fontSize: 13.5,
          fontWeight: n.is_read ? 500 : 700,
        }}
        secondaryTypographyProps={{ fontSize: 12.5, component: "div" }}
      />
    </ListItemButton>
  );

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          onClick={(e) => setAnchorEl(e.currentTarget)}
          size="small"
          aria-label={
            unreadCount > 0
              ? `Notifications, ${unreadCount} unread`
              : "Notifications"
          }
        >
          <Badge
            badgeContent={unreadCount}
            color={unreadActionable ? "error" : "primary"}
            max={99}
          >
            {unreadCount > 0 ? (
              <NotificationsActiveIcon />
            ) : (
              <NotificationsIcon />
            )}
          </Badge>
        </IconButton>
      </Tooltip>

      <Popover
        open={Boolean(anchorEl)}
        anchorEl={anchorEl}
        onClose={() => setAnchorEl(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        slotProps={{
          paper: {
            sx: { width: 380, maxWidth: "calc(100vw - 24px)", maxHeight: 520, p: 1 },
          },
        }}
      >
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 1,
            pt: 0.5,
            pb: 1,
          }}
        >
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>
            Notifications
          </Typography>
          {unreadCount > 0 && (
            <Button
              size="small"
              startIcon={<DoneAllIcon />}
              onClick={() => markAllRead.mutate()}
              sx={{ fontSize: 12 }}
            >
              Mark all read
            </Button>
          )}
        </Box>
        <Divider />

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={22} />
          </Box>
        ) : notifications.length === 0 ? (
          <Box sx={{ textAlign: "center", py: 4, px: 2 }}>
            <NotificationsIcon sx={{ fontSize: 34, color: "text.disabled" }} />
            <Typography sx={{ fontSize: 13.5, color: "text.secondary", mt: 1 }}>
              You&apos;re all caught up
            </Typography>
          </Box>
        ) : (
          <>
            {actionable.length > 0 && (
              <>
                <Box
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 0.75,
                    px: 1.5,
                    pt: 1.25,
                    pb: 0.25,
                  }}
                >
                  <PendingActionsIcon sx={{ fontSize: 15 }} color="error" />
                  <Typography
                    sx={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.5px",
                      textTransform: "uppercase",
                      color: "error.main",
                    }}
                  >
                    Needs your action
                  </Typography>
                </Box>
                <List disablePadding>{actionable.map(renderItem)}</List>
              </>
            )}

            {updates.length > 0 && (
              <>
                <Typography
                  sx={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    color: "text.secondary",
                    px: 1.5,
                    pt: 1.25,
                    pb: 0.25,
                  }}
                >
                  Updates
                </Typography>
                <List disablePadding>{updates.map(renderItem)}</List>
              </>
            )}
          </>
        )}
      </Popover>
    </>
  );
}
