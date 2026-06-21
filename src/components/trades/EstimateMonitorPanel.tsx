"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Box,
  Stack,
  Typography,
  TextField,
  IconButton,
  Button,
  Chip,
  Autocomplete,
  CircularProgress,
  Alert,
  Divider,
} from "@mui/material";
import {
  Add as AddIcon,
  DeleteOutline as DeleteIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import type { ContractReconciliation, LaborTrackingMode } from "@/types/trade.types";
import {
  useSubcontractEstimateLines,
  useReplaceSubcontractEstimate,
  type SubcontractEstimateLine,
} from "@/hooks/queries/useSubcontractEstimateLines";
import {
  estimateBenchmark,
  computeMonitor,
  type MonitorVerdict,
} from "@/lib/workforce/taskWorkMonitor";

interface RoleOption {
  id: string;
  name: string;
  defaultRate: number;
}

interface DraftLine {
  role_id: string | null;
  role_label: string;
  worker_count: string;
  days: string;
  daily_rate: string;
}

interface Props {
  subcontractId: string;
  tradeCategoryId: string | null;
  /** Agreed lump sum (subcontracts.total_value). */
  agreedPrice: number;
  laborTrackingMode: LaborTrackingMode;
  /** Reconciliation row — supplies the implied (actual) labour value. */
  reconciliation?: ContractReconciliation;
  canEdit?: boolean;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const num = (s: string) => Math.max(0, Number(s) || 0);

// Stable empty default so the draft-sync effect doesn't loop while loading.
const EMPTY_LINES: SubcontractEstimateLine[] = [];

const VERDICT: Record<
  MonitorVerdict,
  { label: string; color: "success" | "warning" | "error" | "default" }
> = {
  fair: { label: "Fair deal", color: "success" },
  overpaid: { label: "Likely overpaid", color: "warning" },
  underpaid: { label: "Underpaid — crew at a loss", color: "error" },
  unknown: { label: "No actuals yet", color: "default" },
};

export function EstimateMonitorPanel({
  subcontractId,
  tradeCategoryId,
  agreedPrice,
  laborTrackingMode,
  reconciliation,
  canEdit = false,
}: Props) {
  const supabase = createClient();
  const { data, isLoading } = useSubcontractEstimateLines(subcontractId);
  const lines = data ?? EMPTY_LINES;
  const replaceEstimate = useReplaceSubcontractEstimate(subcontractId);

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load role options for this trade (prefill the daily rate).
  useEffect(() => {
    if (!tradeCategoryId) return;
    (supabase as any)
      .from("labor_roles")
      .select("id, name, default_daily_rate")
      .eq("category_id", tradeCategoryId)
      .eq("is_active", true)
      .order("display_order", { ascending: true })
      .then(({ data }: { data: any[] | null }) => {
        setRoles(
          (data ?? []).map((r) => ({
            id: r.id,
            name: r.name,
            defaultRate: Number(r.default_daily_rate ?? 0),
          }))
        );
      });
  }, [tradeCategoryId, supabase]);

  // Sync the draft from loaded lines whenever they change (and not mid-edit).
  useEffect(() => {
    if (dirty) return;
    setDraft(
      lines.map((l) => ({
        role_id: l.role_id,
        role_label: l.role_label,
        worker_count: String(l.worker_count || ""),
        days: String(l.days || ""),
        daily_rate: String(l.daily_rate || ""),
      }))
    );
  }, [lines, dirty]);

  const benchmark = useMemo(
    () =>
      estimateBenchmark(
        draft.map((d) => ({
          workerCount: num(d.worker_count),
          days: num(d.days),
          dailyRate: num(d.daily_rate),
        }))
      ),
    [draft]
  );

  // The reliable "actual labour cost" comes from HEADCOUNT mode (units × role
  // rates) — this is the app's intended over/under mechanism for lump-sum work.
  // Detailed-attendance labour variance is intentionally not used (legacy
  // cross-contract attribution can drift; see ReconciliationStrip), and
  // mesthri_only has no tracking. Those fall back to the estimate-based view.
  const actualLaborValue =
    laborTrackingMode === "headcount"
      ? reconciliation?.impliedLaborValueHeadcount ?? 0
      : 0;

  const monitor = useMemo(
    () => computeMonitor({ agreedPrice, benchmark, actualLaborValue }),
    [agreedPrice, benchmark, actualLaborValue]
  );

  const update = (i: number, patch: Partial<DraftLine>) => {
    setDirty(true);
    setDraft((d) => d.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const addLine = () => {
    setDirty(true);
    setDraft((d) => [
      ...d,
      { role_id: null, role_label: "", worker_count: "", days: "", daily_rate: "" },
    ]);
  };
  const removeLine = (i: number) => {
    setDirty(true);
    setDraft((d) => d.filter((_, idx) => idx !== i));
  };

  const handleSave = async () => {
    setError(null);
    try {
      await replaceEstimate.mutateAsync(
        draft.map((d, i) => ({
          role_id: d.role_id,
          role_label: d.role_label,
          worker_count: num(d.worker_count),
          days: num(d.days),
          daily_rate: num(d.daily_rate),
          sort_order: i,
        }))
      );
      setDirty(false);
    } catch (e: any) {
      setError(e.message ?? String(e));
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 2 }}>
        <CircularProgress size={20} />
      </Box>
    );
  }

  const verdict = VERDICT[monitor.verdict];

  return (
    <Stack spacing={1.5}>
      <Typography variant="subtitle2">Worker estimate</Typography>

      {draft.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Add the crew you expect (e.g. Mason ×2 × 6 days, Helper ×1 × 6 days) to
          see the day-wage benchmark and whether the lump sum is a good deal.
        </Typography>
      )}

      <Stack spacing={1}>
        {draft.map((row, i) => {
          const lineTotal = num(row.worker_count) * num(row.days) * num(row.daily_rate);
          return (
            <Stack
              key={i}
              direction={{ xs: "column", sm: "row" }}
              spacing={1}
              alignItems={{ sm: "center" }}
            >
              <Autocomplete
                freeSolo
                size="small"
                sx={{ flex: 1, minWidth: 140 }}
                options={roles}
                getOptionLabel={(o) => (typeof o === "string" ? o : o.name)}
                value={row.role_label}
                disabled={!canEdit}
                onInputChange={(_, v) => update(i, { role_label: v })}
                onChange={(_, v) => {
                  if (v && typeof v !== "string") {
                    update(i, {
                      role_id: v.id,
                      role_label: v.name,
                      daily_rate: v.defaultRate ? String(v.defaultRate) : row.daily_rate,
                    });
                  } else {
                    update(i, { role_id: null, role_label: (v as string) ?? "" });
                  }
                }}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField {...params} label="Worker type" placeholder="Mason" />
                )}
              />
              <TextField
                size="small"
                label="Count"
                value={row.worker_count}
                disabled={!canEdit}
                onChange={(e) =>
                  update(i, { worker_count: e.target.value.replace(/[^0-9.]/g, "") })
                }
                sx={{ width: 76 }}
              />
              <TextField
                size="small"
                label="Days"
                value={row.days}
                disabled={!canEdit}
                onChange={(e) => update(i, { days: e.target.value.replace(/[^0-9.]/g, "") })}
                sx={{ width: 76 }}
              />
              <TextField
                size="small"
                label="₹/day"
                value={row.daily_rate}
                disabled={!canEdit}
                onChange={(e) =>
                  update(i, { daily_rate: e.target.value.replace(/[^0-9.]/g, "") })
                }
                sx={{ width: 96 }}
              />
              <Typography variant="body2" sx={{ width: 90, textAlign: "right" }}>
                {inr(lineTotal)}
              </Typography>
              {canEdit && (
                <IconButton size="small" onClick={() => removeLine(i)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              )}
            </Stack>
          );
        })}
      </Stack>

      {canEdit && (
        <Stack direction="row" spacing={1}>
          <Button size="small" startIcon={<AddIcon />} onClick={addLine}>
            Add worker
          </Button>
          {dirty && (
            <Button
              size="small"
              variant="contained"
              onClick={handleSave}
              disabled={replaceEstimate.isPending}
              startIcon={
                replaceEstimate.isPending ? <CircularProgress size={14} /> : null
              }
            >
              Save estimate
            </Button>
          )}
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      <Divider />

      {/* Summary + monitor */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: { xs: "1fr 1fr", sm: "repeat(3, 1fr)" },
          gap: 1,
        }}
      >
        <Metric label="Day-wage benchmark" value={benchmark > 0 ? inr(benchmark) : "—"} />
        <Metric label="Agreed price" value={inr(agreedPrice)} />
        <Metric
          label="Expected saving"
          value={
            monitor.expectedSaving == null
              ? "—"
              : `${inr(monitor.expectedSaving)}${
                  monitor.expectedSavingPct != null
                    ? ` (${Math.round(monitor.expectedSavingPct * 100)}%)`
                    : ""
                }`
          }
          color={
            monitor.expectedSaving != null && monitor.expectedSaving < 0
              ? "error.main"
              : "success.main"
          }
        />
      </Box>

      <Box
        sx={{
          p: 1.25,
          borderRadius: 1.5,
          bgcolor: "action.hover",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 1,
          flexWrap: "wrap",
        }}
      >
        <Box>
          <Typography variant="caption" color="text.secondary" component="div">
            Over / under-paid monitor
          </Typography>
          {actualLaborValue > 0 ? (
            <Typography variant="body2">
              Paid {inr(agreedPrice)} vs actual labour {inr(actualLaborValue)} →{" "}
              <strong>
                {monitor.margin != null
                  ? `${monitor.margin >= 0 ? "+" : ""}${inr(monitor.margin)} margin`
                  : "—"}
              </strong>
            </Typography>
          ) : (
            <Typography variant="body2" color="text.secondary">
              {monitor.expectedSaving != null
                ? "Expected saving shown above. Switch this task work to headcount tracking to compare the price against the actual labour cost."
                : "Add a worker estimate above, and use headcount tracking, to see whether you're over- or under-paying."}
            </Typography>
          )}
        </Box>
        <Chip label={verdict.label} color={verdict.color} size="small" />
      </Box>
    </Stack>
  );
}

function Metric({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary" component="div">
        {label}
      </Typography>
      <Typography variant="body2" fontWeight={700} color={color}>
        {value}
      </Typography>
    </Box>
  );
}
