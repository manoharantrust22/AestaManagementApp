"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  TextField,
  InputAdornment,
  Checkbox,
  Chip,
  Tooltip,
  Divider,
  LinearProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Engineering as EngineeringIcon,
  AutoFixHigh as AutoFixIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/cache/keys";
import { saveContractTeaEntry } from "@/lib/tea/saveContractTeaEntry";
import { buildContractTeaModel } from "@/lib/tea/buildContractTeaModel";
import { recalculateWaterfallForGroup } from "@/hooks/queries/useGroupTeaShop";
import { useTeaBackfillCandidates } from "@/hooks/queries/useTeaBackfillCandidates";

interface TeaBackfillDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  siteGroupId: string;
  sites: { id: string; name: string }[];
  teaShopId: string;
  companyTeaShopId: string | null;
  primarySiteId: string | null;
  user: { name: string | null; id: string | null };
  deactivatedTradeIds?: Set<string>;
}

const fmtUnits = (n: number) => (n % 1 === 0 ? `${n}` : n.toFixed(1));

export default function TeaBackfillDialog({
  open,
  onClose,
  onSuccess,
  siteGroupId,
  sites,
  teaShopId,
  companyTeaShopId,
  primarySiteId,
  user,
  deactivatedTradeIds,
}: TeaBackfillDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Date range — default the last 60 days through today.
  const [dateFrom, setDateFrom] = useState(() =>
    dayjs().subtract(60, "day").format("YYYY-MM-DD")
  );
  const [dateTo, setDateTo] = useState(() => dayjs().format("YYYY-MM-DD"));

  const { data, isLoading, isFetching } = useTeaBackfillCandidates({
    siteGroupId,
    sites,
    dateFrom,
    dateTo,
    deactivatedTradeIds,
    enabled: open,
  });

  const candidates = data?.candidates ?? [];

  // Engineer controls. `amounts` holds ONLY hand edits; untouched rows derive
  // their amount LIVE from the rate, so there is no fragile seeding effect to
  // leave a row blank. `rateStr` empty ⇒ fall back to the group's recent rate.
  const [rateStr, setRateStr] = useState("");
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const rateInitedRef = useRef(false);

  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState<number | null>(null);

  // Reset everything when the dialog (re)opens.
  useEffect(() => {
    if (!open) return;
    rateInitedRef.current = false;
    setRateStr("");
    setAmounts({});
    setExcluded({});
    setError(null);
    setSavedCount(null);
    setProgress(null);
  }, [open]);

  // Seed the rate field from the group's recent ₹/man-day, once per open.
  useEffect(() => {
    if (!open || rateInitedRef.current) return;
    if (data?.ratePerManDay != null) {
      rateInitedRef.current = true;
      setRateStr(String(Math.round(data.ratePerManDay)));
    }
  }, [open, data?.ratePerManDay]);

  const effectiveRate = Number(rateStr) || data?.ratePerManDay || 0;
  const isIncluded = (date: string) => !excluded[date];
  const amountFor = (c: { date: string; totalManDays: number; suggestedAmount: number }) =>
    amounts[c.date] ??
    (effectiveRate > 0 ? Math.round(effectiveRate * c.totalManDays) : c.suggestedAmount);

  // "Apply to all" drops every per-row edit so all amounts follow the rate again.
  const applyRateToAll = () => setAmounts({});

  const setAmount = (date: string, raw: string) =>
    setAmounts((p) => ({ ...p, [date]: Math.max(0, Math.round(Number(raw) || 0)) }));

  const toggle = (date: string, on: boolean) =>
    setExcluded((p) => ({ ...p, [date]: !on }));

  const allOn = candidates.length > 0 && candidates.every((c) => isIncluded(c.date));
  const toggleAll = (on: boolean) => {
    setExcluded(() => {
      if (on) return {};
      const next: Record<string, boolean> = {};
      for (const c of candidates) next[c.date] = true;
      return next;
    });
  };

  const selected = candidates.filter((c) => isIncluded(c.date) && amountFor(c) > 0);
  const selectedTotal = selected.reduce((s, c) => s + amountFor(c), 0);

  const handleSave = async () => {
    if (selected.length === 0) return;
    setSaving(true);
    setError(null);
    setProgress({ done: 0, total: selected.length });
    try {
      let done = 0;
      for (const c of selected) {
        const amount = amountFor(c);
        const model = buildContractTeaModel(amount, c.rows, sites);
        if (!model) {
          done++;
          setProgress({ done, total: selected.length });
          continue;
        }
        await saveContractTeaEntry({
          supabase,
          existingEntryId: null,
          teaShopId,
          primarySiteId,
          companyTeaShopId,
          siteGroupId,
          date: c.date,
          total: amount,
          notes: "Backfilled tea (contract day)",
          totalDayUnits: model.totalDayUnits,
          allocations: model.allocations,
          selections: model.selections,
          user,
          skipWaterfall: true,
        });
        done++;
        setProgress({ done, total: selected.length });
      }
      // One oldest-first waterfall pass over the whole group after all inserts.
      await recalculateWaterfallForGroup(supabase, siteGroupId);

      queryClient.invalidateQueries({ queryKey: queryKeys.combinedTeaShop.all });
      queryClient.invalidateQueries({ queryKey: ["tea-backfill-candidates"] });
      setSavedCount(done);
      onSuccess?.();
    } catch (e: any) {
      setError(e?.message || "Failed to save some days. Please retry.");
    } finally {
      setSaving(false);
      setProgress(null);
    }
  };

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pr: 1 }}>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <EngineeringIcon color="info" />
          <span>Backfill tea on contract days</span>
        </Box>
        <IconButton onClick={onClose} size="small" disabled={saving}>
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          Days where contract or regular crews worked but no tea was logged. Each
          day&apos;s amount splits by man-days across both sites and every crew. Adjust
          the rate or any amount before saving.
        </Typography>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", mb: 1.5 }}>
          <TextField
            label="From"
            type="date"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: "1 1 130px" }}
            disabled={saving}
          />
          <TextField
            label="To"
            type="date"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
            sx={{ flex: "1 1 130px" }}
            disabled={saving}
          />
        </Box>

        <Box sx={{ display: "flex", gap: 1, alignItems: "center", mb: 1 }}>
          <TextField
            label="₹ / man-day"
            type="number"
            size="small"
            value={rateStr}
            onChange={(e) => setRateStr(e.target.value)}
            InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
            sx={{ width: 140 }}
            disabled={saving}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<AutoFixIcon />}
            onClick={applyRateToAll}
            disabled={saving || !(Number(rateStr) > 0)}
          >
            Apply to all
          </Button>
          {data?.ratePerManDay != null && (
            <Typography variant="caption" color="text.secondary">
              recent avg ₹{Math.round(data.ratePerManDay)}/day
            </Typography>
          )}
        </Box>

        {isLoading || isFetching ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={28} />
          </Box>
        ) : candidates.length === 0 ? (
          <Alert severity="success" sx={{ mt: 1 }}>
            No missing contract days in this range — every day with crew already has a
            tea entry.
          </Alert>
        ) : (
          <>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
              <Box sx={{ display: "flex", alignItems: "center" }}>
                <Checkbox
                  size="small"
                  checked={allOn}
                  indeterminate={!allOn && candidates.some((c) => isIncluded(c.date))}
                  onChange={(e) => toggleAll(e.target.checked)}
                  disabled={saving}
                />
                <Typography variant="caption" color="text.secondary">
                  {candidates.length} day{candidates.length === 1 ? "" : "s"} found
                </Typography>
              </Box>
            </Box>
            <Divider sx={{ mb: 1 }} />

            {candidates.map((c) => {
              const isOn = isIncluded(c.date);
              return (
                <Box
                  key={c.date}
                  sx={{
                    display: "flex",
                    alignItems: "center",
                    gap: 1,
                    py: 0.75,
                    opacity: isOn ? 1 : 0.5,
                    borderBottom: 1,
                    borderColor: "divider",
                  }}
                >
                  <Checkbox
                    size="small"
                    checked={isOn}
                    onChange={(e) => toggle(c.date, e.target.checked)}
                    sx={{ p: 0.5 }}
                    disabled={saving}
                  />
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Box sx={{ display: "flex", alignItems: "baseline", gap: 0.75 }}>
                      <Typography variant="body2" fontWeight={700}>
                        {dayjs(c.date).format("DD MMM")}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {dayjs(c.date).format("ddd")} · {fmtUnits(c.totalManDays)} man-days
                      </Typography>
                    </Box>
                    <Box sx={{ display: "flex", gap: 0.5, flexWrap: "wrap", mt: 0.25 }}>
                      {c.contractItems.map((it, i) => (
                        <Tooltip key={i} title={it.title}>
                          <Chip
                            label={`${it.title} · ${fmtUnits(it.manDays)}`}
                            size="small"
                            color="info"
                            variant="outlined"
                            sx={{
                              height: 20,
                              maxWidth: 180,
                              "& .MuiChip-label": { fontSize: "0.65rem", overflow: "hidden", textOverflow: "ellipsis" },
                            }}
                          />
                        </Tooltip>
                      ))}
                    </Box>
                  </Box>
                  <TextField
                    type="number"
                    size="small"
                    disabled={!isOn || saving}
                    value={isOn ? amountFor(c) : ""}
                    onChange={(e) => setAmount(c.date, e.target.value)}
                    InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                    sx={{ width: 110, "& input": { textAlign: "right" } }}
                  />
                </Box>
              );
            })}
          </>
        )}

        {error && (
          <Alert severity="error" sx={{ mt: 1.5 }}>
            {error}
          </Alert>
        )}
        {savedCount != null && !error && (
          <Alert severity="success" sx={{ mt: 1.5 }}>
            Backfilled {savedCount} day{savedCount === 1 ? "" : "s"}. The contract crews
            now share each day&apos;s tea.
          </Alert>
        )}
        {progress && (
          <Box sx={{ mt: 1.5 }}>
            <LinearProgress variant="determinate" value={(progress.done / progress.total) * 100} />
            <Typography variant="caption" color="text.secondary">
              Saving {progress.done}/{progress.total}…
            </Typography>
          </Box>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          {savedCount != null ? "Close" : "Cancel"}
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={saving || selected.length === 0}
        >
          {saving
            ? "Saving…"
            : `Save ${selected.length} day${selected.length === 1 ? "" : "s"}` +
              (selectedTotal > 0 ? ` · ₹${selectedTotal.toLocaleString("en-IN")}` : "")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
