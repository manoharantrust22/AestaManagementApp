"use client";

import React, { useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Typography,
  TextField,
  Alert,
  CircularProgress,
  Chip,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  IconButton,
  Divider,
} from "@mui/material";
import {
  EventBusy as HolidayIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SiteHoliday {
  id: string;
  site_id: string;
  date: string;
  reason: string | null;
  is_paid_holiday: boolean | null;
  created_at: string;
  created_by: string | null;
}

interface Site {
  id: string;
  name: string;
}

export interface HolidayConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "mark" | "revoke" | "list";
  site: Site;
  existingHoliday?: SiteHoliday | null;
  recentHolidays?: SiteHoliday[];
  onSuccess: (newHoliday?: SiteHoliday) => void;
  date?: string; // Optional date to mark as holiday (defaults to today)
  /** Active trade scope — passed from T3; wired in T4 to scope the created holiday. */
  tradeCategoryId?: string | null;
  /** Active trade display name — passed from T3; shown in T4 confirm copy. */
  tradeName?: string | null;
}

export default function HolidayConfirmDialog({
  open,
  onClose,
  mode,
  site,
  existingHoliday,
  recentHolidays = [],
  onSuccess,
  date,
}: HolidayConfirmDialogProps) {
  const supabase = createClient();
  const { userProfile } = useAuth();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Use provided date or default to today
  const targetDate = date || dayjs().format("YYYY-MM-DD");
  const targetDateFormatted = dayjs(targetDate).format("dddd, DD MMMM YYYY");
  const isToday = dayjs(targetDate).isSame(dayjs(), "day");

  const handleMarkHoliday = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for the holiday");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Check if this date is already marked as a holiday
      const { data: existingHolidayData } = await supabase
        .from("site_holidays")
        .select("id")
        .eq("site_id", site.id)
        .eq("date", targetDate)
        .maybeSingle();

      if (existingHolidayData) {
        setError("This date is already marked as a holiday. Use the revoke option to remove it first.");
        setSaving(false);
        return;
      }

      // Check if attendance exists for this date
      const { data: existingAttendance } = await supabase
        .from("daily_attendance")
        .select("date")
        .eq("site_id", site.id)
        .eq("date", targetDate)
        .limit(1);

      if (existingAttendance && existingAttendance.length > 0) {
        setError("Cannot mark as holiday - attendance already recorded for this date");
        setSaving(false);
        return;
      }

      const { data: insertedHoliday, error: insertError } = await supabase
        .from("site_holidays")
        .insert({
          site_id: site.id,
          date: targetDate,
          reason: reason.trim(),
          created_by: userProfile?.id,
        })
        .select()
        .single();

      if (insertError) throw insertError;

      onSuccess(insertedHoliday);
      handleClose();
    } catch (err) {
      console.error("Error marking holiday:", err);
      setError("Failed to mark holiday. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeHoliday = async () => {
    if (!existingHoliday) return;

    setSaving(true);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("site_holidays")
        .delete()
        .eq("id", existingHoliday.id);

      if (deleteError) throw deleteError;

      onSuccess();
      handleClose();
    } catch (err) {
      console.error("Error revoking holiday:", err);
      setError("Failed to revoke holiday. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteHoliday = async (holidayId: string) => {
    setDeletingId(holidayId);
    setError(null);

    try {
      const { error: deleteError } = await supabase
        .from("site_holidays")
        .delete()
        .eq("id", holidayId);

      if (deleteError) throw deleteError;

      onSuccess();
    } catch (err) {
      console.error("Error deleting holiday:", err);
      setError("Failed to delete holiday. Please try again.");
    } finally {
      setDeletingId(null);
    }
  };

  const handleClose = () => {
    setReason("");
    setError(null);
    onClose();
  };

  // Mark Holiday Mode
  if (mode === "mark") {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <HolidayIcon color="success" />
          <Typography variant="h6" component="span" fontWeight={600}>
            Mark as Holiday
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {/* Site Info Card */}
          <Box
            sx={{
              bgcolor: "success.50",
              borderRadius: 2,
              p: 2,
              mb: 2,
              border: 2,
              borderColor: "success.200",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <LocationIcon fontSize="small" color="success" />
              <Typography variant="h6" fontWeight={700} color="success.dark">
                {site.name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CalendarIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {targetDateFormatted}
              </Typography>
              {isToday && <Chip label="Today" size="small" color="success" sx={{ ml: 1 }} />}
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            <Typography variant="body2">
              Marking {isToday ? "today" : "this date"} as a holiday will prevent attendance reminder notifications for this site.
            </Typography>
          </Alert>

          {/* Reason Input */}
          <TextField
            fullWidth
            label="Reason for Holiday"
            placeholder="e.g., Diwali, Rain, Material shortage, Sunday"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            error={!!error && !reason.trim()}
            helperText={!reason.trim() && error ? error : "Please provide a reason for the holiday"}
            sx={{ mb: 1 }}
            autoFocus
          />

          {error && reason.trim() && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={handleClose} color="inherit" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleMarkHoliday}
            variant="contained"
            color="success"
            disabled={saving || !reason.trim()}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{ minWidth: 140 }}
          >
            {saving ? "Marking..." : "Mark Holiday"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // Revoke Holiday Mode
  if (mode === "revoke" && existingHoliday) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <WarningIcon color="error" />
          <Typography variant="h6" component="span" fontWeight={600}>
            Revoke Holiday
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {/* Site Info Card */}
          <Box
            sx={{
              bgcolor: "error.50",
              borderRadius: 2,
              p: 2,
              mb: 2,
              border: 2,
              borderColor: "error.200",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <LocationIcon fontSize="small" color="error" />
              <Typography variant="h6" fontWeight={700} color="error.dark">
                {site.name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <CalendarIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {dayjs(existingHoliday.date).format("dddd, DD MMMM YYYY")}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <HolidayIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                Reason: <strong>{existingHoliday.reason || "Not specified"}</strong>
              </Typography>
            </Box>
          </Box>

          <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2, borderRadius: 2 }}>
            <Typography variant="body2" fontWeight={500}>
              Are you sure you want to revoke this holiday?
            </Typography>
            <Typography variant="caption" color="text.secondary">
              This will remove the holiday marking and attendance can be recorded for this date.
            </Typography>
          </Alert>

          {error && (
            <Alert severity="error" sx={{ borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button onClick={handleClose} color="inherit" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleRevokeHoliday}
            variant="contained"
            color="error"
            disabled={saving}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <DeleteIcon />}
            sx={{ minWidth: 140 }}
          >
            {saving ? "Revoking..." : "Revoke Holiday"}
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // List Mode - Show recent/upcoming holidays with delete option
  if (mode === "list") {
    const upcomingHolidays = recentHolidays.filter(
      (h) => dayjs(h.date).isSame(dayjs(), "day") || dayjs(h.date).isAfter(dayjs())
    );
    const pastHolidays = recentHolidays.filter(
      (h) => dayjs(h.date).isBefore(dayjs(), "day")
    );

    return (
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <HolidayIcon color="primary" />
          <Typography variant="h6" component="span" fontWeight={600}>
            Site Holidays
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          {/* Site Info */}
          <Box
            sx={{
              bgcolor: "action.hover",
              borderRadius: 2,
              p: 2,
              mb: 2,
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <LocationIcon fontSize="small" color="action" />
              <Typography variant="body1" fontWeight={600}>
                {site.name}
              </Typography>
            </Box>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}

          {recentHolidays.length === 0 ? (
            <Alert severity="info" sx={{ borderRadius: 2 }}>
              No holidays marked for this site recently.
            </Alert>
          ) : (
            <>
              {/* Upcoming/Today Holidays */}
              {upcomingHolidays.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="success.main" sx={{ mb: 1 }}>
                    Today & Upcoming
                  </Typography>
                  <List dense sx={{ bgcolor: "success.50", borderRadius: 2, mb: 2 }}>
                    {upcomingHolidays.map((holiday, index) => (
                      <React.Fragment key={holiday.id}>
                        {index > 0 && <Divider />}
                        <ListItem>
                          <ListItemText
                            primaryTypographyProps={{ component: "div" }}
                            primary={
                              <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                                <Typography variant="body2" fontWeight={500}>
                                  {dayjs(holiday.date).format("ddd, DD MMM YYYY")}
                                </Typography>
                                {dayjs(holiday.date).isSame(dayjs(), "day") && (
                                  <Chip label="Today" size="small" color="success" sx={{ height: 20 }} />
                                )}
                              </Box>
                            }
                            secondary={holiday.reason || "No reason specified"}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              color="error"
                              size="small"
                              onClick={() => handleDeleteHoliday(holiday.id)}
                              disabled={deletingId === holiday.id}
                            >
                              {deletingId === holiday.id ? (
                                <CircularProgress size={18} />
                              ) : (
                                <DeleteIcon fontSize="small" />
                              )}
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      </React.Fragment>
                    ))}
                  </List>
                </>
              )}

              {/* Past Holidays */}
              {pastHolidays.length > 0 && (
                <>
                  <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                    Recent Past
                  </Typography>
                  <List dense sx={{ bgcolor: "action.selected", borderRadius: 2 }}>
                    {pastHolidays.slice(0, 5).map((holiday, index) => (
                      <React.Fragment key={holiday.id}>
                        {index > 0 && <Divider />}
                        <ListItem>
                          <ListItemText
                            primary={dayjs(holiday.date).format("ddd, DD MMM YYYY")}
                            secondary={holiday.reason || "No reason specified"}
                            primaryTypographyProps={{ variant: "body2" }}
                          />
                          <ListItemSecondaryAction>
                            <IconButton
                              edge="end"
                              color="error"
                              size="small"
                              onClick={() => handleDeleteHoliday(holiday.id)}
                              disabled={deletingId === holiday.id}
                            >
                              {deletingId === holiday.id ? (
                                <CircularProgress size={18} />
                              ) : (
                                <DeleteIcon fontSize="small" />
                              )}
                            </IconButton>
                          </ListItemSecondaryAction>
                        </ListItem>
                      </React.Fragment>
                    ))}
                  </List>
                </>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3 }}>
          <Button onClick={handleClose} variant="contained">
            Close
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  return null;
}
