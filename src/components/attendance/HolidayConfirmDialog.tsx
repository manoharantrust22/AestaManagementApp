"use client";

import React, { useEffect, useState } from "react";
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
  FormControl,
  FormLabel,
  FormControlLabel,
  RadioGroup,
  Radio,
  Switch,
  Stack,
} from "@mui/material";
import {
  EventBusy as HolidayIcon,
  LocationOn as LocationIcon,
  CalendarToday as CalendarIcon,
  Warning as WarningIcon,
  Delete as DeleteIcon,
  CheckCircle as CheckIcon,
  Save as SaveIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  holidayInScope,
  enumerateDates,
  formatHolidayDateRange,
  parseHolidayError,
  type HolidayGroup,
} from "@/lib/utils/holidayUtils";

export interface SiteHoliday {
  id: string;
  site_id: string;
  date: string;
  reason: string | null;
  is_paid_holiday: boolean | null;
  created_at: string;
  created_by: string | null;
  /** Added by migration 20260625110000; used to scope list display. */
  trade_category_id?: string | null;
}

interface Site {
  id: string;
  name: string;
}

export interface HolidayConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  mode: "mark" | "revoke" | "list" | "edit";
  site: Site;
  existingHoliday?: SiteHoliday | null;
  recentHolidays?: SiteHoliday[];
  onSuccess: (newHoliday?: SiteHoliday) => void;
  date?: string; // Optional date to mark as holiday (defaults to today)
  /** Active trade scope — passed from T3; wired in T4 to scope the created holiday. */
  tradeCategoryId?: string | null;
  /** Active trade display name — passed from T3; shown in T4 confirm copy. */
  tradeName?: string | null;
  /** mark mode: open with the "Multiple days" range toggle on (planning). */
  defaultMultiDay?: boolean;
  /** edit mode: the holiday group (one or more consecutive days) being edited. */
  editGroup?: HolidayGroup | null;
  /**
   * Which attendance blocks marking a date as holiday.
   * "civil" (default) = any daily_attendance row for the site (Civil page).
   * "none" = skip that query; trade views pass their own `recordedDates`.
   */
  attendanceCheck?: "civil" | "none";
  /** Dates that already have attendance in this workspace (trade views). */
  recordedDates?: string[];
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
  tradeCategoryId = null,
  tradeName,
  defaultMultiDay = false,
  editGroup = null,
  attendanceCheck = "civil",
  recordedDates,
}: HolidayConfirmDialogProps) {
  const supabase = createClient();
  const { userProfile } = useAuth();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Scope of the holiday being marked: the active workspace only, or all
  // workspaces (trade_category_id NULL).
  const [applyToAll, setApplyToAll] = useState(false);
  // Date selection (mark mode). Single day uses fromDate; range uses both.
  const [multiDay, setMultiDay] = useState(defaultMultiDay);
  const [fromDate, setFromDate] = useState(date || dayjs().format("YYYY-MM-DD"));
  const [toDate, setToDate] = useState(date || dayjs().format("YYYY-MM-DD"));
  const [confirmRevokeGroup, setConfirmRevokeGroup] = useState(false);

  // Re-seed the form every time the dialog opens (date / mode / group may differ).
  useEffect(() => {
    if (!open) return;
    const seed = date || dayjs().format("YYYY-MM-DD");
    setFromDate(seed);
    setToDate(seed);
    setMultiDay(defaultMultiDay);
    setReason(mode === "edit" && editGroup ? editGroup.reason : "");
    setError(null);
    setConfirmRevokeGroup(false);
  }, [open, date, defaultMultiDay, mode, editGroup]);

  const isToday = !multiDay && dayjs(fromDate).isSame(dayjs(), "day");
  const rangeInvalid = multiDay && dayjs(toDate).isBefore(dayjs(fromDate), "day");
  const selectedDates = rangeInvalid
    ? []
    : multiDay
      ? enumerateDates(fromDate, toDate)
      : [fromDate];
  const tooManyDays = selectedDates.length > 62;

  const handleMarkHoliday = async () => {
    if (!reason.trim()) {
      setError("Please provide a reason for the holiday");
      return;
    }
    if (rangeInvalid) {
      setError("End date must be on or after the start date");
      return;
    }
    if (selectedDates.length === 0 || tooManyDays) {
      setError("Pick a range of at most 62 days");
      return;
    }

    // Target scope: the active workspace, or NULL for "all workspaces".
    const targetTradeCategoryId = applyToAll ? null : tradeCategoryId ?? null;

    // Guard the load window: if the workspace id hasn't resolved yet and the
    // user didn't pick "all workspaces", don't silently tag the holiday NULL
    // (which would make a workspace-intended holiday show in every workspace).
    if (!applyToAll && tradeCategoryId == null) {
      setError("Workspace is still loading — please try again in a moment.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      // Dates already a holiday IN THE SAME SCOPE (partial unique index => <=1 row/date)
      let existQuery = supabase
        .from("site_holidays")
        .select("date")
        .eq("site_id", site.id)
        .in("date", selectedDates);
      existQuery = targetTradeCategoryId
        ? existQuery.eq("trade_category_id", targetTradeCategoryId)
        : existQuery.is("trade_category_id", null);
      const { data: existingRows } = await existQuery;
      const taken = new Set((existingRows || []).map((r: { date: string }) => r.date));
      const newDates = selectedDates.filter((d) => !taken.has(d));

      if (newDates.length === 0) {
        setError(
          selectedDates.length === 1
            ? "This date is already marked as a holiday. Use the revoke option to remove it first."
            : "All selected dates are already holidays."
        );
        setSaving(false);
        return;
      }

      // Block dates that already have attendance recorded
      let blockedDate: string | null =
        newDates.find((d) => recordedDates?.includes(d)) ?? null;
      if (!blockedDate && attendanceCheck === "civil") {
        const { data: existingAttendance } = await supabase
          .from("daily_attendance")
          .select("date")
          .eq("site_id", site.id)
          .in("date", newDates)
          .limit(1);
        blockedDate = existingAttendance?.[0]?.date ?? null;
      }

      if (blockedDate) {
        setError(
          `Cannot mark ${dayjs(blockedDate).format("DD MMM YYYY")} as holiday - attendance already recorded for this date`
        );
        setSaving(false);
        return;
      }

      const { data: inserted, error: insertError } = await supabase
        .from("site_holidays")
        .insert(
          newDates.map((d) => ({
            site_id: site.id,
            date: d,
            reason: reason.trim(),
            created_by: userProfile?.id,
            trade_category_id: targetTradeCategoryId,
          }))
        )
        .select();

      if (insertError) throw insertError;

      onSuccess(inserted && inserted.length === 1 ? inserted[0] : undefined);
      handleClose();
    } catch (err) {
      console.error("Error marking holiday:", err);
      setError(parseHolidayError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editGroup) return;
    if (!reason.trim()) {
      setError("Please provide a reason for the holiday");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: updateError } = await supabase
        .from("site_holidays")
        .update({ reason: reason.trim() })
        .in("id", editGroup.holidays.map((h) => h.id));
      if (updateError) throw updateError;
      onSuccess();
      handleClose();
    } catch (err) {
      console.error("Error updating holiday:", err);
      setError(parseHolidayError(err));
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeGroup = async () => {
    if (!editGroup) return;
    if (!confirmRevokeGroup) {
      setConfirmRevokeGroup(true);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const { error: deleteError } = await supabase
        .from("site_holidays")
        .delete()
        .in("id", editGroup.holidays.map((h) => h.id));
      if (deleteError) throw deleteError;
      onSuccess();
      handleClose();
    } catch (err) {
      console.error("Error revoking holidays:", err);
      setError("Failed to revoke holiday. Please try again.");
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
    setApplyToAll(false);
    setConfirmRevokeGroup(false);
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
            {tradeName ? `Mark holiday for ${tradeName}` : "Mark as Holiday"}
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
            <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mt: 1.5 }}>
              <TextField
                type="date"
                size="small"
                label={multiDay ? "From" : "Date"}
                value={fromDate}
                onChange={(e) => {
                  setFromDate(e.target.value);
                  if (dayjs(toDate).isBefore(dayjs(e.target.value), "day")) setToDate(e.target.value);
                }}
                InputLabelProps={{ shrink: true }}
                sx={{ flex: 1, bgcolor: "background.paper" }}
              />
              {multiDay && (
                <TextField
                  type="date"
                  size="small"
                  label="To"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  inputProps={{ min: fromDate }}
                  error={rangeInvalid}
                  sx={{ flex: 1, bgcolor: "background.paper" }}
                />
              )}
            </Stack>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mt: 1, flexWrap: "wrap" }}>
              <FormControlLabel
                control={
                  <Switch size="small" checked={multiDay} onChange={(e) => setMultiDay(e.target.checked)} />
                }
                label={<Typography variant="body2" component="span">Multiple days</Typography>}
              />
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <CalendarIcon fontSize="small" color="action" />
                <Typography variant="body2" color="text.secondary">
                  {multiDay
                    ? `${selectedDates.length} day${selectedDates.length === 1 ? "" : "s"}`
                    : dayjs(fromDate).format("dddd")}
                </Typography>
                {isToday && <Chip label="Today" size="small" color="success" sx={{ ml: 0.5 }} />}
              </Box>
            </Box>
          </Box>

          <Alert severity="info" sx={{ mb: 2, borderRadius: 2 }}>
            <Typography variant="body2">
              {tradeName
                ? `This will mark ${multiDay ? "these dates" : isToday ? "today" : "this date"} as a holiday for ${tradeName}.`
                : `Marking ${multiDay ? "these dates" : isToday ? "today" : "this date"} as a holiday will prevent attendance reminder notifications for this site.`}
            </Typography>
          </Alert>

          {/* Scope: this workspace only, or all workspaces */}
          {tradeCategoryId && (
            <FormControl sx={{ mb: 2 }}>
              <FormLabel sx={{ fontSize: 13, mb: 0.5 }}>Applies to</FormLabel>
              <RadioGroup
                row
                value={applyToAll ? "all" : "workspace"}
                onChange={(e) => setApplyToAll(e.target.value === "all")}
              >
                <FormControlLabel
                  value="workspace"
                  control={<Radio size="small" />}
                  label={tradeName ? `${tradeName} only` : "This workspace only"}
                />
                <FormControlLabel
                  value="all"
                  control={<Radio size="small" />}
                  label="All workspaces"
                />
              </RadioGroup>
            </FormControl>
          )}

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
            disabled={saving || !reason.trim() || rangeInvalid || tooManyDays}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <CheckIcon />}
            sx={{ minWidth: 140 }}
          >
            {saving
              ? "Marking..."
              : selectedDates.length > 1
                ? `Mark ${selectedDates.length} days`
                : "Mark Holiday"}
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

  // Edit Mode - edit reason / revoke a whole holiday group
  if (mode === "edit" && editGroup) {
    return (
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { borderRadius: 3 } }}
      >
        <DialogTitle sx={{ pb: 1, display: "flex", alignItems: "center", gap: 1 }}>
          <HolidayIcon color="warning" />
          <Typography variant="h6" component="span" fontWeight={600}>
            Edit Holiday
          </Typography>
        </DialogTitle>

        <DialogContent sx={{ pt: 2 }}>
          <Box
            sx={{
              bgcolor: "warning.50",
              borderRadius: 2,
              p: 2,
              mb: 2,
              border: 2,
              borderColor: "warning.200",
            }}
          >
            <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
              <LocationIcon fontSize="small" color="warning" />
              <Typography variant="h6" fontWeight={700}>
                {site.name}
              </Typography>
            </Box>
            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <CalendarIcon fontSize="small" color="action" />
              <Typography variant="body2" color="text.secondary">
                {formatHolidayDateRange(editGroup)}
              </Typography>
              <Chip
                label={`${editGroup.dayCount} ${editGroup.dayCount === 1 ? "day" : "days"}`}
                size="small"
                color="warning"
                sx={{ ml: 0.5, height: 20 }}
              />
            </Box>
          </Box>

          <TextField
            fullWidth
            label="Reason for Holiday"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            sx={{ mb: 1, mt: 1 }}
            autoFocus
          />

          {confirmRevokeGroup && (
            <Alert severity="warning" icon={<WarningIcon />} sx={{ mt: 2, borderRadius: 2 }}>
              <Typography variant="body2" fontWeight={500}>
                Revoke {editGroup.dayCount === 1 ? "this holiday" : `all ${editGroup.dayCount} days`}?
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Attendance can then be recorded for {editGroup.dayCount === 1 ? "this date" : "these dates"}.
              </Typography>
            </Alert>
          )}

          {error && (
            <Alert severity="error" sx={{ mt: 2, borderRadius: 2 }}>
              {error}
            </Alert>
          )}
        </DialogContent>

        <DialogActions sx={{ px: 3, pb: 3, gap: 1 }}>
          <Button
            onClick={handleRevokeGroup}
            color="error"
            variant={confirmRevokeGroup ? "contained" : "text"}
            disabled={saving}
            startIcon={<DeleteIcon />}
            sx={{ mr: "auto" }}
          >
            {confirmRevokeGroup ? "Confirm revoke" : "Revoke"}
          </Button>
          <Button onClick={handleClose} color="inherit" disabled={saving}>
            Cancel
          </Button>
          <Button
            onClick={handleSaveEdit}
            variant="contained"
            disabled={saving || !reason.trim() || reason.trim() === editGroup.reason.trim()}
            startIcon={saving ? <CircularProgress size={16} color="inherit" /> : <SaveIcon />}
          >
            Save
          </Button>
        </DialogActions>
      </Dialog>
    );
  }

  // List Mode - Show recent/upcoming holidays with delete option
  if (mode === "list") {
    const scopedHolidays = recentHolidays.filter((h) =>
      holidayInScope(h, tradeCategoryId ?? null)
    );
    const upcomingHolidays = scopedHolidays.filter(
      (h) => dayjs(h.date).isSame(dayjs(), "day") || dayjs(h.date).isAfter(dayjs())
    );
    const pastHolidays = scopedHolidays.filter(
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
            {tradeName ? `${tradeName} Holidays` : "Site Holidays"}
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

          {scopedHolidays.length === 0 ? (
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
