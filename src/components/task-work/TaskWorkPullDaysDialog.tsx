"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { wrapQueryFn } from "@/lib/utils/timeout";
import { useAssignAttendanceToPackage } from "@/hooks/mutations/useAssignAttendanceToPackage";

interface Props {
  open: boolean;
  onClose: () => void;
  packageId: string;
  packageTitle: string;
  siteId: string;
  /** Agreed price, so the footer can show the resulting balance. */
  totalValue: number;
  /** Money already recorded against the package (lump payments + crew settlements). */
  alreadyPaid: number;
  /** Seeds the default date range. */
  startDateHint?: string | null;
}

/** One attendance day that can be pulled onto (or pushed off) this package. */
interface DayRow {
  id: string;
  source: "daily" | "market";
  date: string;
  /** Laborer name, or "Mason ×3" for a market crew row. */
  who: string;
  dayUnits: number;
  amount: number;
  /** Settlement reference when this day was already paid, else null. */
  paidRef: string | null;
  /** Package it is currently tagged to (may be another one). */
  currentPackageId: string | null;
  currentPackageTitle: string | null;
}

/**
 * Stable empty array. `const { data: rows = [] }` would mint a NEW array on every
 * render while the query is disabled/loading, which re-fires the selection-seeding
 * effect below on every render → "Maximum update depth exceeded".
 */
const NO_ROWS: DayRow[] = [];

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (v: unknown) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Pull already-recorded attendance days onto a fixed-price package.
 *
 * The case this exists for: work was actually given to a crew as a fixed-price
 * package, but it was logged as ordinary daily attendance first — sometimes for
 * weeks, and sometimes already settled. Retagging those days one date at a time in
 * the attendance drawer is slow, and settled days are locked there on purpose.
 *
 * Pulling a day only sets daily_attendance.task_work_package_id. Nothing about the
 * money is rewritten: an already-settled day keeps its settlement, and the wages
 * paid on it instead surface as "already paid as wages" against this package's
 * price, so the crew is not paid twice. Unchecking a day reverses all of it.
 */
export default function TaskWorkPullDaysDialog({
  open,
  onClose,
  packageId,
  packageTitle,
  siteId,
  totalValue,
  alreadyPaid,
  startDateHint,
}: Props) {
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  // Row ids the user wants tagged to THIS package once they confirm.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const assignMut = useAssignAttendanceToPackage();

  useEffect(() => {
    if (!open) return;
    const end = dayjs();
    const start = startDateHint ? dayjs(startDateHint) : end.subtract(30, "day");
    setFrom(start.format("YYYY-MM-DD"));
    setTo(end.format("YYYY-MM-DD"));
    setError(null);
  }, [open, startDateHint]);

  const rangeReady = Boolean(from && to && dayjs(from).isValid() && dayjs(to).isValid());

  const { data, isLoading } = useQuery<DayRow[]>({
    queryKey: ["task-work-pull-days", siteId, from, to],
    enabled: open && rangeReady,
    staleTime: 30 * 1000,
    queryFn: wrapQueryFn(
      async () => {
        const supabase = createClient();
        const [daily, market] = await Promise.all([
          (supabase.from("daily_attendance") as any)
            .select(
              "id, date, day_units, work_days, daily_earnings, is_paid, task_work_package_id, laborers!daily_attendance_laborer_id_fkey(name), settlement_groups(settlement_reference), task_work_packages(title)"
            )
            .eq("site_id", siteId)
            .gte("date", from)
            .lte("date", to)
            .eq("is_deleted", false)
            .eq("is_archived", false)
            .order("date", { ascending: false }),
          (supabase.from("market_laborer_attendance") as any)
            .select(
              "id, date, day_units, work_days, count, total_cost, is_paid, task_work_package_id, labor_roles(name), settlement_groups(settlement_reference), task_work_packages(title)"
            )
            .eq("site_id", siteId)
            .gte("date", from)
            .lte("date", to)
            .order("date", { ascending: false }),
        ]);
        if (daily.error) throw daily.error;
        if (market.error) throw market.error;

        const paidRef = (r: any): string | null => {
          if (!(r.is_paid === true || r.settlement_groups)) return null;
          return r.settlement_groups?.settlement_reference || "paid";
        };

        const dailyRows: DayRow[] = (daily.data ?? []).map((r: any) => ({
          id: String(r.id),
          source: "daily",
          date: String(r.date),
          who: String(r.laborers?.name ?? "Laborer").trim(),
          dayUnits: num(r.day_units ?? r.work_days ?? 1),
          amount: num(r.daily_earnings),
          paidRef: paidRef(r),
          currentPackageId: r.task_work_package_id ?? null,
          currentPackageTitle: r.task_work_packages?.title ?? null,
        }));
        const marketRows: DayRow[] = (market.data ?? []).map((r: any) => {
          const count = num(r.count) || 1;
          return {
            id: String(r.id),
            source: "market" as const,
            date: String(r.date),
            who: `${r.labor_roles?.name ?? "Market crew"}${count > 1 ? ` ×${count}` : ""}`,
            dayUnits: num(r.day_units ?? r.work_days ?? 1) * count,
            amount: num(r.total_cost),
            paidRef: paidRef(r),
            currentPackageId: r.task_work_package_id ?? null,
            currentPackageTitle: r.task_work_packages?.title ?? null,
          };
        });

        return [...dailyRows, ...marketRows].sort((a, b) =>
          a.date === b.date ? a.who.localeCompare(b.who) : b.date.localeCompare(a.date)
        );
      },
      { operationName: "taskWorkPullDays" }
    ),
  });

  const rows = data ?? NO_ROWS;

  // Whatever is already on this package starts checked, so the dialog reads as the
  // package's current day roster and unchecking is how you take a day back off.
  // Keyed on `data` (React Query's stable reference), so a re-render does not wipe
  // the ticks the user just made.
  useEffect(() => {
    if (!data) return;
    setSelected(
      new Set(data.filter((r) => r.currentPackageId === packageId).map((r) => r.id))
    );
  }, [data, packageId]);

  const initiallyOurs = useMemo(
    () => new Set(rows.filter((r) => r.currentPackageId === packageId).map((r) => r.id)),
    [rows, packageId]
  );

  const toAdd = useMemo(
    () => rows.filter((r) => selected.has(r.id) && !initiallyOurs.has(r.id)),
    [rows, selected, initiallyOurs]
  );
  const toRemove = useMemo(
    () => rows.filter((r) => !selected.has(r.id) && initiallyOurs.has(r.id)),
    [rows, selected, initiallyOurs]
  );
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  // What the package will look like after confirming.
  const resulting = useMemo(() => {
    const mine = rows.filter((r) => selected.has(r.id));
    const days = mine.length;
    const manDays = mine.reduce((s, r) => s + r.dayUnits, 0);
    const value = mine.reduce((s, r) => s + r.amount, 0);
    const prepaid = mine.filter((r) => r.paidRef).reduce((s, r) => s + r.amount, 0);
    return { days, manDays, value, prepaid, balance: totalValue - alreadyPaid - prepaid };
  }, [rows, selected, totalValue, alreadyPaid]);

  // Days sitting on a DIFFERENT package: moving them is legitimate but should be a
  // conscious choice, so they are called out rather than silently swept up.
  const movingFromOther = toAdd.filter((r) => r.currentPackageId);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const byDate = useMemo(() => {
    const map = new Map<string, DayRow[]>();
    for (const r of rows) {
      const list = map.get(r.date) ?? [];
      list.push(r);
      map.set(r.date, list);
    }
    return Array.from(map.entries());
  }, [rows]);

  const handleConfirm = async () => {
    setError(null);
    try {
      const affected = Array.from(
        new Set(
          [...toAdd, ...toRemove]
            .map((r) => r.currentPackageId)
            .filter((id): id is string => !!id && id !== packageId)
        )
      );
      if (toAdd.length > 0) {
        await assignMut.mutateAsync({
          siteId,
          packageId,
          attendanceIds: toAdd.filter((r) => r.source === "daily").map((r) => r.id),
          marketIds: toAdd.filter((r) => r.source === "market").map((r) => r.id),
          affectedPackageIds: affected,
        });
      }
      if (toRemove.length > 0) {
        await assignMut.mutateAsync({
          siteId,
          packageId: null,
          attendanceIds: toRemove.filter((r) => r.source === "daily").map((r) => r.id),
          marketIds: toRemove.filter((r) => r.source === "market").map((r) => r.id),
          affectedPackageIds: [packageId],
        });
      }
      onClose();
    } catch (e: any) {
      console.error("[TaskWorkPullDaysDialog] assign failed:", e);
      setError(e?.message || "Couldn't move those days. Please try again.");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle sx={{ pb: 1 }}>
        Pull days from attendance
        <Typography variant="caption" color="text.secondary" display="block">
          {packageTitle}
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
          Tick the days this crew worked on this contract. Days that were already paid
          as daily wages keep their settlement — that money simply counts against this
          contract&apos;s price instead of being paid a second time.
        </Typography>

        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <TextField
            label="From"
            type="date"
            size="small"
            fullWidth
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            fullWidth
            value={to}
            onChange={(e) => setTo(e.target.value)}
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        {isLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : rows.length === 0 ? (
          <Alert severity="info">No attendance recorded in this date range.</Alert>
        ) : (
          <Box>
            {byDate.map(([date, dayRows]) => (
              <Box key={date} sx={{ mb: 1.5 }}>
                <Typography
                  variant="caption"
                  fontWeight={700}
                  color="text.secondary"
                  sx={{ display: "block", mb: 0.5 }}
                >
                  {dayjs(date).format("ddd, DD MMM YYYY")}
                </Typography>
                {dayRows.map((r) => {
                  const onOther = !!r.currentPackageId && r.currentPackageId !== packageId;
                  return (
                    <Box
                      key={r.id}
                      sx={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                        pl: 0.5,
                      }}
                    >
                      <FormControlLabel
                        sx={{ flex: 1, mr: 0 }}
                        control={
                          <Checkbox
                            size="small"
                            checked={selected.has(r.id)}
                            onChange={() => toggle(r.id)}
                          />
                        }
                        label={
                          <Box
                            component="span"
                            sx={{
                              display: "flex",
                              alignItems: "center",
                              gap: 0.75,
                              flexWrap: "wrap",
                            }}
                          >
                            <Typography component="span" variant="body2">
                              {r.who}
                            </Typography>
                            <Typography
                              component="span"
                              variant="caption"
                              color="text.secondary"
                            >
                              {r.dayUnits} day{r.dayUnits === 1 ? "" : "s"}
                            </Typography>
                            {r.paidRef && (
                              <Chip
                                size="small"
                                color="success"
                                label={
                                  r.paidRef === "paid" ? "Paid" : `Paid · ${r.paidRef}`
                                }
                                sx={{ height: 18, fontSize: "0.6rem" }}
                              />
                            )}
                            {onOther && (
                              <Chip
                                size="small"
                                color="warning"
                                label={`On ${r.currentPackageTitle ?? "another contract"}`}
                                sx={{ height: 18, fontSize: "0.6rem" }}
                              />
                            )}
                          </Box>
                        }
                      />
                      <Typography variant="body2" fontWeight={600}>
                        {inr(r.amount)}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ))}
          </Box>
        )}

        {movingFromOther.length > 0 && (
          <Alert severity="warning" sx={{ mt: 1 }}>
            {movingFromOther.length} day{movingFromOther.length === 1 ? "" : "s"} will be
            moved off another contract onto this one.
          </Alert>
        )}
      </DialogContent>

      <Box sx={{ px: 3, py: 1.5 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack direction="row" justifyContent="space-between" sx={{ mb: 0.5 }}>
          <Typography variant="body2" color="text.secondary">
            {resulting.days} day{resulting.days === 1 ? "" : "s"} ·{" "}
            {resulting.manDays.toLocaleString()} man-days
          </Typography>
          <Typography variant="body2" fontWeight={600}>
            {inr(resulting.value)} labour value
          </Typography>
        </Stack>
        {resulting.prepaid > 0 && (
          <Typography variant="caption" color="text.secondary" display="block">
            {inr(resulting.prepaid)} of that is already paid as wages and counts toward
            this contract&apos;s {inr(totalValue)} — balance {inr(resulting.balance)}.
          </Typography>
        )}
      </Box>

      <DialogActions>
        <Button onClick={onClose} disabled={assignMut.isPending}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleConfirm}
          disabled={!hasChanges || assignMut.isPending}
        >
          {assignMut.isPending
            ? "Saving…"
            : toRemove.length > 0 && toAdd.length === 0
            ? `Remove ${toRemove.length} day${toRemove.length === 1 ? "" : "s"}`
            : `Apply (${toAdd.length} added${
                toRemove.length > 0 ? `, ${toRemove.length} removed` : ""
              })`}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
