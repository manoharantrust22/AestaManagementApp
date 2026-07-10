"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import {
  Calculate as CalculateIcon,
  AttachMoney as MoneyIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useLaborers } from "@/hooks/queries/useLaborers";
import { useTechnicians } from "@/hooks/queries/useTechnicians";
import { useLaborCategoriesForReport } from "@/hooks/queries/useSettlementReport";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import {
  useCreateTaskWorkPackage,
  useUpdateTaskWorkPackage,
} from "@/hooks/queries/useTaskWorkPackages";
import { computeProfitability } from "@/lib/taskWork/profitability";
import { estimateRollup } from "@/lib/taskWork/estimateLines";
import EstimateLinesEditor, {
  type DraftLine,
  emptyDraftLine,
  draftFromLines,
  cleanDraftLines,
} from "@/components/task-work/EstimateLinesEditor";
import { blurOnWheel } from "@/lib/utils/numberInput";
import { useContractCrewCommissionDays } from "@/hooks/queries/useContractCrewCommissionDays";
import { splitCrewCommissionByDate } from "@/lib/workforce/commission";
import type {
  TaskWorkMeasurementUnit,
  TaskWorkPackage,
  TaskWorkPackageInput,
  TaskWorkPricingMode,
  TaskWorkStatus,
} from "@/types/taskWork.types";

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  editing?: TaskWorkPackage | null;
  onSaved?: () => void;
  /**
   * When set (and not editing), the new package auto-nests under this contract/section
   * and the "Part of subcontract" picker is hidden — the parent is already known because
   * the dialog was opened from a "+" on that row in the tree. Left undefined when opened
   * from the top "Add" button, where the picker is still shown.
   */
  parentSubcontractId?: string | null;
}

interface MaistryOption {
  kind: "laborer" | "technician";
  id: string;
  label: string;
  phone: string | null;
}

interface FormState {
  title: string;
  scope_of_work: string;
  labor_category_id: string;
  maistry_laborer_id: string | null;
  maistry_name: string;
  maistry_phone: string;
  pricing_mode: TaskWorkPricingMode;
  total_value: number;
  measurement_unit: TaskWorkMeasurementUnit;
  rate_per_unit: number;
  total_units: number;
  estimated_days: number;
  // Per-worker-type daywage estimate rows; crew size + blended rate are derived
  // from these on save (estimateRollup) for v_task_work_profitability.
  estimate_lines: DraftLine[];
  planned_start_date: string;
  planned_end_date: string;
  retention_percent: number;
  status: TaskWorkStatus;
  parent_subcontract_id: string;
  mesthri_commission_enabled: boolean;
  mesthri_commission_effective_from: string;
  mesthri_commission_applies: boolean;
  notes: string;
}

const EMPTY: FormState = {
  title: "",
  scope_of_work: "",
  labor_category_id: "",
  maistry_laborer_id: null,
  maistry_name: "",
  maistry_phone: "",
  pricing_mode: "lump_sum",
  total_value: 0,
  measurement_unit: "sqft",
  rate_per_unit: 0,
  total_units: 0,
  estimated_days: 0,
  estimate_lines: [emptyDraftLine()],
  planned_start_date: dayjs().format("YYYY-MM-DD"),
  planned_end_date: "",
  retention_percent: 0,
  status: "active",
  parent_subcontract_id: "",
  mesthri_commission_enabled: false,
  mesthri_commission_effective_from: "",
  mesthri_commission_applies: true,
  notes: "",
};

/** Today as YYYY-MM-DD (local). */
function todayISO(): string {
  return dayjs().format("YYYY-MM-DD");
}

/** Format a work-day count, dropping a trailing ".0" (2 → "2", 1.5 → "1.5"). */
function fmtWorkDays(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export default function TaskWorkPackageDialog({
  open,
  onClose,
  siteId,
  editing,
  onSaved,
  parentSubcontractId,
}: Props) {
  const isMobile = useIsMobile();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState("");

  const { data: laborers = [] } = useLaborers();
  const { data: technicians = [] } = useTechnicians();
  const { data: categories = [] } = useLaborCategoriesForReport();
  const { data: subcontracts = [] } = useSiteSubcontracts(siteId);

  const createMut = useCreateTaskWorkPackage();
  const updateMut = useUpdateTaskWorkPackage();
  const saving = createMut.isPending || updateMut.isPending;

  // Build the maistry picker options: known laborers + directory technicians.
  const maistryOptions = useMemo<MaistryOption[]>(() => {
    const fromLaborers: MaistryOption[] = (laborers as any[]).map((l) => ({
      kind: "laborer",
      id: l.id,
      label: l.name,
      phone: l.phone ?? null,
    }));
    const fromTech: MaistryOption[] = (technicians as any[]).map((t) => ({
      kind: "technician",
      id: t.id,
      label: t.name,
      phone: t.phone ?? t.whatsapp_number ?? null,
    }));
    return [...fromLaborers, ...fromTech];
  }, [laborers, technicians]);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        title: editing.title,
        scope_of_work: editing.scope_of_work ?? "",
        labor_category_id: editing.labor_category_id ?? "",
        maistry_laborer_id: editing.maistry_laborer_id,
        maistry_name: editing.maistry_name ?? "",
        maistry_phone: editing.maistry_phone ?? "",
        pricing_mode: editing.pricing_mode,
        total_value: editing.total_value ?? 0,
        measurement_unit: (editing.measurement_unit ?? "sqft") as TaskWorkMeasurementUnit,
        rate_per_unit: editing.rate_per_unit ?? 0,
        total_units: editing.total_units ?? 0,
        estimated_days: editing.estimated_days ?? 0,
        estimate_lines: editing.estimate_lines?.length
          ? draftFromLines(editing.estimate_lines)
          : // Legacy package: a single crew size + daily wage → one row, so the
            // old estimate still shows and stays editable.
            (editing.estimated_crew_size ?? 0) > 0 ||
              (editing.benchmark_daily_rate ?? 0) > 0
            ? [
                {
                  kind: "custom" as const,
                  ref_id: null,
                  label: "Crew",
                  count: String(editing.estimated_crew_size ?? ""),
                  daily_rate: String(editing.benchmark_daily_rate ?? ""),
                },
              ]
            : [emptyDraftLine()],
        planned_start_date: editing.planned_start_date ?? "",
        planned_end_date: editing.planned_end_date ?? "",
        retention_percent: editing.retention_percent ?? 0,
        status: editing.status,
        parent_subcontract_id: editing.parent_subcontract_id ?? "",
        mesthri_commission_enabled: Boolean(editing.mesthri_commission_enabled),
        mesthri_commission_effective_from: editing.mesthri_commission_effective_from ?? "",
        mesthri_commission_applies: editing.mesthri_commission_applies ?? true,
        notes: editing.notes ?? "",
      });
    } else {
      // New package: when opened from a row's "+", auto-nest under that parent.
      setForm({ ...EMPTY, parent_subcontract_id: parentSubcontractId ?? "" });
    }
    setError("");
  }, [open, editing, parentSubcontractId]);

  // Auto-calculate total for rate-based pricing.
  useEffect(() => {
    if (
      form.pricing_mode === "rate_based" &&
      form.rate_per_unit > 0 &&
      form.total_units > 0
    ) {
      const v = Math.round(form.rate_per_unit * form.total_units * 100) / 100;
      setForm((p) => (p.total_value === v ? p : { ...p, total_value: v }));
    }
  }, [form.pricing_mode, form.rate_per_unit, form.total_units]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((p) => ({ ...p, [key]: value }));

  // Opened from a row's "+": the parent contract/section is already known, so we
  // nest under it automatically and hide the picker (no "standalone vs subcontract"
  // question). Only the top "Add" button (no parentSubcontractId) shows the picker.
  const lockedParent = !editing && !!parentSubcontractId;
  const lockedParentTitle =
    subcontracts.find((s) => s.id === parentSubcontractId)?.title ?? null;

  // Live benchmark + win-win preview from the per-type estimate. The rows are
  // rolled up to man-days + a count-weighted blended ₹/day so the same
  // computeProfitability (and the SQL view) math applies unchanged.
  const estRoll = estimateRollup(
    cleanDraftLines(form.estimate_lines),
    form.estimated_days
  );
  const preview = computeProfitability({
    totalValue: form.total_value,
    manDays: estRoll.manDays,
    benchmarkDailyRate: estRoll.blendedRate,
    retentionPercent: form.retention_percent,
    totalUnits: form.pricing_mode === "rate_based" ? form.total_units : null,
  });

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError("Please enter a title.");
      return;
    }
    if (!form.maistry_laborer_id && !form.maistry_name.trim()) {
      setError("Please choose or name the maistry leading this work.");
      return;
    }
    if (form.total_value <= 0) {
      setError("The agreed price must be greater than zero.");
      return;
    }
    if (
      form.pricing_mode === "rate_based" &&
      (form.rate_per_unit <= 0 || form.total_units <= 0)
    ) {
      setError("Enter a valid rate and total units for rate-based pricing.");
      return;
    }

    // Roll the per-type rows up into the scalar summary columns the
    // profitability view reads, and persist the full breakdown for re-editing.
    const cleanedLines = cleanDraftLines(form.estimate_lines);
    const roll = estimateRollup(cleanedLines, form.estimated_days);

    const payload: TaskWorkPackageInput = {
      site_id: siteId,
      title: form.title.trim(),
      scope_of_work: form.scope_of_work.trim() || null,
      labor_category_id: form.labor_category_id || null,
      maistry_laborer_id: form.maistry_laborer_id,
      maistry_name: form.maistry_name.trim() || null,
      maistry_phone: form.maistry_phone.trim() || null,
      pricing_mode: form.pricing_mode,
      total_value: form.total_value,
      rate_per_unit: form.pricing_mode === "rate_based" ? form.rate_per_unit : null,
      measurement_unit:
        form.pricing_mode === "rate_based" ? form.measurement_unit : null,
      total_units: form.pricing_mode === "rate_based" ? form.total_units : null,
      estimated_crew_size: roll.crewSize || null,
      estimated_days: roll.days || null,
      benchmark_daily_rate: roll.blendedRate || null,
      estimate_lines: cleanedLines.length ? cleanedLines : null,
      planned_start_date: form.planned_start_date || null,
      planned_end_date: form.planned_end_date || null,
      retention_percent: form.retention_percent || 0,
      status: form.status,
      parent_subcontract_id: form.parent_subcontract_id || null,
      mesthri_commission_enabled: form.mesthri_commission_enabled,
      // When enabled, a start date is required (default to the crew's first day so
      // all their worked days count; today if no attendance yet).
      mesthri_commission_effective_from: form.mesthri_commission_enabled
        ? form.mesthri_commission_effective_from || crewDays?.earliestDate || todayISO()
        : null,
      // Direct-pay sub-option: false = laborers get their full wage, no maistry commission.
      // Only meaningful when direct-pay is on; keep it true otherwise so re-enabling starts clean.
      mesthri_commission_applies: form.mesthri_commission_enabled
        ? form.mesthri_commission_applies
        : true,
      notes: form.notes.trim() || null,
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, siteId, data: payload });
      } else {
        await createMut.mutateAsync(payload);
      }
      onSaved?.();
      onClose();
    } catch (e: any) {
      setError(e?.message || "Failed to save the task-work package.");
    }
  };

  const { data: crewDays } = useContractCrewCommissionDays(
    "task_work",
    editing?.id ?? null,
    form.maistry_laborer_id,
    open && Boolean(editing?.id),
  );

  const commissionSplit = useMemo(
    () =>
      splitCrewCommissionByDate(
        crewDays?.rows ?? [],
        form.mesthri_commission_effective_from || null,
      ),
    [crewDays?.rows, form.mesthri_commission_effective_from],
  );

  const selectedMaistryValue: MaistryOption | string | null = useMemo(() => {
    if (form.maistry_laborer_id) {
      return (
        maistryOptions.find(
          (o) => o.kind === "laborer" && o.id === form.maistry_laborer_id
        ) || null
      );
    }
    return form.maistry_name || null;
  }, [form.maistry_laborer_id, form.maistry_name, maistryOptions]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle>
        {editing ? "Edit Task Work" : "New Task Work Package"}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            fullWidth
            required
            label="Title"
            placeholder="e.g. Brickwork up to lintel — Block A"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
          />

          <TextField
            fullWidth
            label="Scope of work"
            placeholder="Exactly what is included (e.g. brickwork up to lintel, incl. scaffolding & curing). A tight scope prevents settlement disputes."
            value={form.scope_of_work}
            onChange={(e) => set("scope_of_work", e.target.value)}
            multiline
            rows={3}
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Autocomplete<MaistryOption, false, false, true>
                freeSolo
                options={maistryOptions}
                value={selectedMaistryValue as any}
                getOptionLabel={(o) => (typeof o === "string" ? o : o.label)}
                groupBy={(o) =>
                  o.kind === "laborer" ? "Laborers" : "Directory"
                }
                isOptionEqualToValue={(o, v) =>
                  typeof o !== "string" &&
                  typeof v !== "string" &&
                  o.id === (v as MaistryOption).id
                }
                slotProps={{ popper: { disablePortal: false } }}
                onChange={(_e, val) => {
                  if (val && typeof val !== "string") {
                    setForm((p) => ({
                      ...p,
                      maistry_laborer_id: val.kind === "laborer" ? val.id : null,
                      // Denormalize the name for display regardless of source,
                      // so lists don't need a laborer join (mirrors
                      // subcontracts.contractor_name).
                      maistry_name: val.label,
                      maistry_phone: val.phone ?? p.maistry_phone,
                    }));
                  } else {
                    setForm((p) => ({
                      ...p,
                      maistry_laborer_id: null,
                      maistry_name: (val as string) ?? "",
                    }));
                  }
                }}
                onInputChange={(_e, text, reason) => {
                  // Capture free-typed outside-maistry names as they type.
                  if (reason === "input" && !form.maistry_laborer_id) {
                    set("maistry_name", text);
                  }
                }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    required
                    label="Maistry / lead mason"
                    placeholder="Pick from list or type an outside maistry"
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                fullWidth
                label="Maistry phone"
                value={form.maistry_phone}
                onChange={(e) => set("maistry_phone", e.target.value)}
              />
            </Grid>
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Work type</InputLabel>
                <Select
                  value={form.labor_category_id}
                  label="Work type"
                  onChange={(e) => set("labor_category_id", e.target.value)}
                >
                  <MenuItem value="">
                    <em>None</em>
                  </MenuItem>
                  {categories.map((c) => (
                    <MenuItem key={c.id} value={c.id}>
                      {c.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={form.status}
                  label="Status"
                  onChange={(e) => set("status", e.target.value as TaskWorkStatus)}
                >
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="on_hold">On Hold</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider />

          {/* Mesthri commission — pay company laborers directly (net) and let the
              maistry collect the per-day cut. Rate is per-laborer (commission_per_day). */}
          <Box
            sx={{
              p: 1.5,
              borderRadius: 1.5,
              border: (t) => `1px solid ${t.palette.divider}`,
              bgcolor: "action.hover",
            }}
          >
            <FormControlLabel
              sx={{ alignItems: "flex-start", m: 0 }}
              control={
                <Switch
                  checked={form.mesthri_commission_enabled}
                  onChange={(e) => {
                    const on = e.target.checked;
                    setForm((p) => ({
                      ...p,
                      mesthri_commission_enabled: on,
                      mesthri_commission_effective_from:
                        on && !p.mesthri_commission_effective_from
                          ? (crewDays?.earliestDate ?? todayISO())
                          : p.mesthri_commission_effective_from,
                    }));
                  }}
                />
              }
              label={
                <Box component="span" sx={{ display: "block", pt: 0.75 }}>
                  <Typography variant="body2" fontWeight={700}>
                    Pay each laborer directly
                  </Typography>
                  <Typography variant="caption" color="text.secondary" component="span" sx={{ display: "block" }}>
                    ON — you pay each company laborer their net wages from the crew ledger (net of a
                    per-day ₹50 commission per laborer); the maistry gets his commission + own wages
                    separately. OFF — you pay the maistry a lump against the fixed price and he
                    distributes to the crew.
                  </Typography>
                </Box>
              }
            />
            {form.mesthri_commission_enabled && (
              <Box sx={{ mt: 1.5 }}>
                <TextField
                  label="Commission / direct-pay from"
                  type="date"
                  value={form.mesthri_commission_effective_from}
                  onChange={(e) => set("mesthri_commission_effective_from", e.target.value)}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Commission applies to company-laborer days on/after this date. Earlier days are not counted."
                  sx={{ maxWidth: 280 }}
                />
                {(crewDays?.rows.length ?? 0) > 0 &&
                  (commissionSplit.excludedWorkDays > 0 ? (
                    <Alert severity="warning" sx={{ mt: 1 }}>
                      {fmtWorkDays(commissionSplit.excludedWorkDays)} work-day
                      {commissionSplit.excludedWorkDays === 1 ? "" : "s"} before{" "}
                      {dayjs(form.mesthri_commission_effective_from).format("DD MMM")} won&apos;t earn
                      commission (−₹
                      {Math.round(commissionSplit.excludedCommission).toLocaleString("en-IN")} to the
                      mesthri). Pick an earlier date to include them.
                    </Alert>
                  ) : (
                    <Alert severity="success" sx={{ mt: 1 }}>
                      All {fmtWorkDays(commissionSplit.includedWorkDays)} work-day
                      {commissionSplit.includedWorkDays === 1 ? "" : "s"} so far are included.
                    </Alert>
                  ))}
                <Divider sx={{ my: 1.5 }} />
                <FormControlLabel
                  sx={{ alignItems: "flex-start", m: 0 }}
                  control={
                    <Switch
                      checked={form.mesthri_commission_applies}
                      onChange={(e) => set("mesthri_commission_applies", e.target.checked)}
                    />
                  }
                  label={
                    <Box component="span" sx={{ display: "block", pt: 0.75 }}>
                      <Typography variant="body2" fontWeight={700}>
                        Deduct maistry commission
                      </Typography>
                      <Typography
                        variant="caption"
                        color="text.secondary"
                        component="span"
                        sx={{ display: "block" }}
                      >
                        ON — ₹50/day per company laborer is held back from their wage for the maistry
                        (default). OFF — each laborer is paid their <strong>full</strong> wage directly and
                        the maistry earns no commission on this contract.
                      </Typography>
                    </Box>
                  }
                />
              </Box>
            )}
          </Box>

          <Divider />

          {/* Pricing */}
          <Box>
            <Typography
              variant="subtitle2"
              color="text.secondary"
              sx={{ mb: 1 }}
            >
              Agreed price
            </Typography>
            <ToggleButtonGroup
              value={form.pricing_mode}
              exclusive
              fullWidth
              onChange={(_e, v: TaskWorkPricingMode | null) => {
                if (v) set("pricing_mode", v);
              }}
              sx={{ "& .MuiToggleButton-root": { textTransform: "none", py: 1.2 } }}
            >
              <ToggleButton value="lump_sum">
                <MoneyIcon sx={{ mr: 1, fontSize: 20 }} /> Lump sum
              </ToggleButton>
              <ToggleButton value="rate_based">
                <CalculateIcon sx={{ mr: 1, fontSize: 20 }} /> Rate-based (per unit)
              </ToggleButton>
            </ToggleButtonGroup>
          </Box>

          {form.pricing_mode === "rate_based" ? (
            <>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl fullWidth>
                    <InputLabel>Unit</InputLabel>
                    <Select
                      value={form.measurement_unit}
                      label="Unit"
                      onChange={(e) =>
                        set(
                          "measurement_unit",
                          e.target.value as TaskWorkMeasurementUnit
                        )
                      }
                    >
                      <MenuItem value="sqft">Square feet (sqft)</MenuItem>
                      <MenuItem value="rft">Running feet (rft)</MenuItem>
                      <MenuItem value="nos">Numbers (nos)</MenuItem>
                      <MenuItem value="per_point">Point</MenuItem>
                      <MenuItem value="lumpsum">Lump unit</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label="Rate / unit"
                    type="number"
                    value={form.rate_per_unit || ""}
                    onChange={(e) => set("rate_per_unit", Number(e.target.value))}
                    onWheel={blurOnWheel}
                    slotProps={{ input: { startAdornment: "₹" } }}
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    fullWidth
                    label={`Total ${form.measurement_unit}`}
                    type="number"
                    value={form.total_units || ""}
                    onChange={(e) => set("total_units", Number(e.target.value))}
                    onWheel={blurOnWheel}
                  />
                </Grid>
              </Grid>
              <Paper
                variant="outlined"
                sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}
              >
                <Typography variant="caption" color="text.secondary">
                  Agreed price
                </Typography>
                <Typography variant="h6" fontWeight={700} color="primary.main">
                  ₹{form.total_value.toLocaleString("en-IN")}
                </Typography>
              </Paper>
            </>
          ) : (
            <TextField
              fullWidth
              required
              label="Agreed lump-sum price"
              type="number"
              value={form.total_value || ""}
              onChange={(e) => set("total_value", Number(e.target.value))}
              onWheel={blurOnWheel}
              slotProps={{ input: { startAdornment: "₹" } }}
              helperText="The single fixed amount you'll pay for the whole package"
            />
          )}

          <Divider />

          {/* Estimate / benchmark — the basis the price was arrived at */}
          <Box>
            <Typography variant="subtitle2" color="text.secondary">
              Daywage estimate (basis for the price)
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1 }}
            >
              The crew you reckon this needs — one row per worker type (Mason,
              male/female helper…) with its own daily wage, all over the same
              days. Used to show whether the deal is a saving for the company.
            </Typography>
            <EstimateLinesEditor
              lines={form.estimate_lines}
              onLinesChange={(next) => set("estimate_lines", next)}
              days={form.estimated_days ? String(form.estimated_days) : ""}
              onDaysChange={(v) => set("estimated_days", Number(v) || 0)}
              laborCategoryId={form.labor_category_id || null}
            />
            {estRoll.benchmarkCost > 0 && (
              <Alert
                severity={preview.companySaving >= 0 ? "success" : "warning"}
                sx={{ mt: 1.5 }}
              >
                Daywork estimate: {estRoll.manDays} man-days × ₹
                {estRoll.blendedRate.toLocaleString("en-IN")}/day avg = ₹
                {preview.daywageBenchmarkCost.toLocaleString("en-IN")}.{" "}
                {preview.companySaving >= 0
                  ? `This package saves ~₹${preview.companySaving.toLocaleString(
                      "en-IN"
                    )} (${preview.savingPct ?? 0}%).`
                  : `This package costs ~₹${Math.abs(
                      preview.companySaving
                    ).toLocaleString("en-IN")} more than daywork at this estimate.`}
                {preview.crewEffectiveDaily != null && (
                  <>
                    {" "}
                    Crew earns ≈ ₹
                    {preview.crewEffectiveDaily.toLocaleString("en-IN")}/man-day.
                  </>
                )}
              </Alert>
            )}
          </Box>

          <Divider />

          {/* Schedule + retention */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Planned start"
                type="date"
                value={form.planned_start_date}
                onChange={(e) => set("planned_start_date", e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Planned end"
                type="date"
                value={form.planned_end_date}
                onChange={(e) => set("planned_end_date", e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <TextField
                fullWidth
                label="Retention %"
                type="number"
                value={form.retention_percent || ""}
                onChange={(e) =>
                  set("retention_percent", Number(e.target.value))
                }
                onWheel={blurOnWheel}
                helperText="Held back for quality"
                slotProps={{ input: { endAdornment: "%" } }}
              />
            </Grid>
          </Grid>

          {lockedParent ? (
            <Paper
              variant="outlined"
              sx={{ p: 1.5, borderRadius: 1.5, bgcolor: "action.hover" }}
            >
              <Typography variant="caption" color="text.secondary">
                Inside
              </Typography>
              <Typography variant="body2" fontWeight={700}>
                {lockedParentTitle ?? "the selected contract"}
              </Typography>
            </Paper>
          ) : (
            <FormControl fullWidth>
              <InputLabel shrink>Part of subcontract (optional)</InputLabel>
              <Select
                value={form.parent_subcontract_id}
                label="Part of subcontract (optional)"
                displayEmpty
                notched
                onChange={(e) => set("parent_subcontract_id", e.target.value)}
              >
                <MenuItem value="">
                  <em>Standalone — not under a subcontract</em>
                </MenuItem>
                {subcontracts.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {s.title}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          <TextField
            fullWidth
            label="Notes"
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
            multiline
            rows={2}
          />

          {error && (
            <Alert severity="error" onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSubmit} disabled={saving}>
          {editing ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
