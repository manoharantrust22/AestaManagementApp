"use client";

/**
 * Full add/edit form for a subcontract — every field, including the ones the
 * quick in-workspace dialogs leave out: contract type, contractor (team /
 * specialist / concreting gang), head mestri, trade, rate-vs-lump-sum, and the
 * day-work bargaining breakdown.
 *
 * Extracted from the old /site/subcontracts page so the Subcontracts workspace
 * (/site/trades) can open it directly ("More options" in EditContractDialog,
 * "All fields…" in the Add menu, the Table view, and ?edit=<id> deep links).
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
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
import { createClient } from "@/lib/supabase/client";
import { useIsMobile } from "@/hooks/useIsMobile";
import { withTimeout, TIMEOUTS } from "@/lib/utils/timeout";
import { useConcretingTeams } from "@/hooks/queries/useConcretingTeams";
import ConcretingTeamDialog from "@/components/concreting/ConcretingTeamDialog";
import SpecialistLaborerPicker from "@/components/contracts/SpecialistLaborerPicker";
import type { Database } from "@/types/database.types";
import { notifySubcontractsChanged, useInvalidateSubcontracts } from "./subcontractSync";

type Subcontract = Database["public"]["Tables"]["subcontracts"]["Row"];
type ContractType = Database["public"]["Enums"]["contract_type"];
type ContractStatus = Database["public"]["Enums"]["contract_status"];
type MeasurementUnit = Database["public"]["Enums"]["measurement_unit"];

interface FormState {
  contract_type: ContractType;
  team_id: string;
  laborer_id: string;
  trade_category_id: string;
  concreting_team_id: string;
  contractor_name: string;
  male_count: number;
  female_count: number;
  machine_rental: number;
  transport_cost: number;
  breakdown_notes: string;
  title: string;
  description: string;
  scope_of_work: string;
  total_value: number;
  measurement_unit: MeasurementUnit;
  rate_per_unit: number;
  total_units: number;
  weekly_advance_rate: number;
  start_date: string;
  expected_end_date: string;
  status: ContractStatus;
  is_rate_based: boolean;
}

const emptyForm = (): FormState => ({
  contract_type: "mesthri",
  team_id: "",
  laborer_id: "",
  trade_category_id: "",
  concreting_team_id: "",
  contractor_name: "",
  male_count: 0,
  female_count: 0,
  machine_rental: 0,
  transport_cost: 0,
  breakdown_notes: "",
  title: "",
  description: "",
  scope_of_work: "",
  total_value: 0,
  measurement_unit: "sqft",
  rate_per_unit: 0,
  total_units: 0,
  weekly_advance_rate: 0,
  start_date: dayjs().format("YYYY-MM-DD"),
  expected_end_date: "",
  status: "draft",
  is_rate_based: true,
});

const formFromRow = (s: Subcontract): FormState => ({
  contract_type: s.contract_type,
  team_id: s.team_id || "",
  laborer_id: s.laborer_id || "",
  trade_category_id: s.trade_category_id || "",
  concreting_team_id: s.concreting_team_id || "",
  contractor_name: s.contractor_name || "",
  male_count: s.male_count || 0,
  female_count: s.female_count || 0,
  machine_rental: s.machine_rental || 0,
  transport_cost: s.transport_cost || 0,
  breakdown_notes: s.breakdown_notes || "",
  title: s.title,
  description: s.description || "",
  scope_of_work: s.scope_of_work || "",
  total_value: s.total_value,
  measurement_unit: s.measurement_unit || "sqft",
  rate_per_unit: s.rate_per_unit || 0,
  total_units: s.total_units || 0,
  weekly_advance_rate: s.weekly_advance_rate || 0,
  start_date: s.start_date || "",
  expected_end_date: s.expected_end_date || "",
  status: s.status,
  is_rate_based: (s.rate_per_unit ?? 0) > 0 && (s.total_units ?? 0) > 0,
});

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  /** Edit this subcontract (row is fetched fresh). Omit / null to create. */
  subcontractId?: string | null;
  onSaved?: () => void;
}

export default function SubcontractFormDialog({ open, onClose, siteId, subcontractId, onSaved }: Props) {
  const supabase = createClient();
  const isMobile = useIsMobile();
  const invalidate = useInvalidateSubcontracts(siteId);

  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [laborers, setLaborers] = useState<any[]>([]);
  const [tradeCategories, setTradeCategories] = useState<{ id: string; name: string }[]>([]);
  const [editing, setEditing] = useState<Subcontract | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loadingRow, setLoadingRow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Concreting-team catalog (for the day_work picker) + inline quick-add dialog
  const { data: concretingTeams = [] } = useConcretingTeams();
  const [teamDialogOpen, setTeamDialogOpen] = useState(false);

  // Option lists — loaded once the dialog is first opened.
  const [optionsLoaded, setOptionsLoaded] = useState(false);
  useEffect(() => {
    if (!open || optionsLoaded) return;
    void (async () => {
      const [teamsRes, laborersRes, tradesRes] = await Promise.all([
        supabase.from("teams").select("id, name").eq("status", "active").order("name"),
        supabase
          .from("laborers")
          .select("id, name, team_id, labor_categories(name), role:labor_roles(name)")
          .eq("status", "active")
          .order("name"),
        supabase.from("labor_categories").select("id, name").eq("is_active", true).order("name"),
      ]);
      setTeams((teamsRes.data as { id: string; name: string }[] | null) || []);
      setLaborers(
        (laborersRes.data || []).map((l: any) => ({
          ...l,
          category_name: l.labor_categories?.name || "Unknown",
          role_name: l.role?.name || "",
        }))
      );
      setTradeCategories(((tradesRes.data as { id: string; name: string }[] | null) || []).filter(Boolean));
      setOptionsLoaded(true);
    })();
  }, [open, optionsLoaded, supabase]);

  // Reset / load the row each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setError("");
    if (!subcontractId) {
      setEditing(null);
      setForm(emptyForm());
      return;
    }
    let cancelled = false;
    setLoadingRow(true);
    void (async () => {
      const { data, error: e } = await supabase
        .from("subcontracts")
        .select("*")
        .eq("id", subcontractId)
        .single();
      if (cancelled) return;
      if (e || !data) {
        setError(e?.message ?? "Could not load the subcontract.");
      } else {
        setEditing(data as Subcontract);
        setForm(formFromRow(data as Subcontract));
      }
      setLoadingRow(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, subcontractId, supabase]);

  // Auto-calculate total value for rate-based contracts
  useEffect(() => {
    if (form.is_rate_based && form.rate_per_unit > 0 && form.total_units > 0) {
      const calculatedValue = form.rate_per_unit * form.total_units;
      setForm((prev) => ({ ...prev, total_value: Math.round(calculatedValue * 100) / 100 }));
    }
  }, [form.is_rate_based, form.rate_per_unit, form.total_units]);

  const handleSubmit = async () => {
    if (!form.title || form.total_value <= 0) {
      setError("Please fill in all required fields with valid values");
      return;
    }
    if (form.contract_type === "mesthri" && !form.team_id) {
      setError("Please select a team for Mesthri subcontract");
      return;
    }
    if (form.contract_type === "specialist" && !form.laborer_id) {
      setError("Please select a laborer for Specialist subcontract");
      return;
    }
    if (form.contract_type === "day_work" && !form.concreting_team_id) {
      setError("Please select a concreting team for the day-work job");
      return;
    }
    if (form.is_rate_based && (form.rate_per_unit <= 0 || form.total_units <= 0)) {
      setError("Please enter valid rate per unit and total units for rate-based contracts");
      return;
    }

    setSaving(true);
    try {
      // Duplicate guard (create only): warn — don't block — if this contractor
      // already has an open contract on this site (day-work jobs are exempt).
      if (!editing && form.contract_type !== "day_work") {
        const contractorCol = form.contract_type === "mesthri" ? "team_id" : "laborer_id";
        const contractorVal = form.contract_type === "mesthri" ? form.team_id : form.laborer_id;
        if (contractorVal) {
          const { data: existing } = await supabase
            .from("subcontracts")
            .select("title, status")
            .eq("site_id", siteId)
            .eq(contractorCol, contractorVal)
            .in("status", ["draft", "active", "on_hold"]);
          if (existing && existing.length > 0) {
            const list = (existing as { title: string; status: string }[])
              .map((d) => `• ${d.title} (${d.status})`)
              .join("\n");
            const proceed = window.confirm(
              `This contractor already has ${existing.length} open contract(s) on this site:\n\n${list}\n\nCreate another one anyway?`
            );
            if (!proceed) {
              setSaving(false);
              return;
            }
          }
        }
      }

      const isDayWork = form.contract_type === "day_work";
      const subcontractData: Record<string, unknown> = {
        site_id: siteId,
        contract_type: form.contract_type,
        team_id: form.contract_type === "mesthri" ? form.team_id : null,
        // For specialist contracts, laborer_id is the contract holder. For
        // mesthri contracts, laborer_id (when set) is the head mestri who
        // receives team-wage settlements via the salary waterfall RPC.
        // Day-work jobs use no laborer.
        laborer_id: isDayWork ? null : form.laborer_id || null,
        // Optional trade tag — enables attendance tracking. null = payments-only.
        trade_category_id: form.trade_category_id || null,
        // Day-work (external concreting gang) fields — null for other types.
        // Breakdown figures are reference-only and need not sum to total_value.
        concreting_team_id: isDayWork ? form.concreting_team_id : null,
        contractor_name: isDayWork ? form.contractor_name || null : null,
        male_count: isDayWork ? form.male_count || null : null,
        female_count: isDayWork ? form.female_count || null : null,
        machine_rental: isDayWork ? form.machine_rental || null : null,
        transport_cost: isDayWork ? form.transport_cost || null : null,
        breakdown_notes: isDayWork ? form.breakdown_notes || null : null,
        title: form.title,
        description: form.description || null,
        scope_of_work: form.scope_of_work || null,
        total_value: form.total_value,
        is_rate_based: form.is_rate_based,
        measurement_unit: form.is_rate_based ? form.measurement_unit : null,
        rate_per_unit: form.rate_per_unit || null,
        total_units: form.total_units || null,
        weekly_advance_rate: form.weekly_advance_rate || null,
        // Empty strings → null so Postgres doesn't reject the date columns.
        start_date: form.start_date || null,
        expected_end_date: form.expected_end_date || null,
        status: form.status,
      };

      // When a trade is attached and the contract has no tracking mode yet, default
      // to payments-only ('mesthri_only') so it surfaces in the workspace without
      // forcing attendance. Never clobber an existing mode on edit.
      if (form.trade_category_id && !editing?.labor_tracking_mode) {
        subcontractData.labor_tracking_mode = "mesthri_only";
      }

      const result = (await withTimeout(
        editing
          ? (supabase.from("subcontracts") as any).update(subcontractData).eq("id", editing.id)
          : (supabase.from("subcontracts") as any).insert(subcontractData),
        TIMEOUTS.DATABASE_OPERATION,
        "Save operation timed out. Please check your connection and try again."
      )) as { error: any };
      if (result.error) throw result.error;

      await invalidate();
      notifySubcontractsChanged(siteId);
      onSaved?.();
      onClose();
    } catch (err: any) {
      console.error("Error saving subcontract:", err);
      setError("Failed to save subcontract: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="md" fullWidth fullScreen={isMobile}>
        <DialogTitle>{subcontractId ? "Edit subcontract" : "New subcontract"}</DialogTitle>
        <DialogContent>
          {loadingRow ? (
            <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
              <CircularProgress size={24} />
            </Box>
          ) : (
            <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 2 }}>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <FormControl fullWidth required>
                    <InputLabel>Subcontract Type</InputLabel>
                    <Select
                      value={form.contract_type}
                      onChange={(e) => {
                        const next = e.target.value as ContractType;
                        setForm({
                          ...form,
                          contract_type: next,
                          // Day-work concreting jobs are always a single bargained lump sum.
                          is_rate_based: next === "day_work" ? false : form.is_rate_based,
                        });
                      }}
                      label="Subcontract Type"
                    >
                      <MenuItem value="mesthri">Mesthri (Team Based)</MenuItem>
                      <MenuItem value="specialist">Specialist (Individual)</MenuItem>
                      <MenuItem value="day_work">Day-work / Concreting (External gang)</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 12, sm: 6 }}>
                  {form.contract_type === "day_work" ? (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <Autocomplete
                        fullWidth
                        options={concretingTeams}
                        getOptionLabel={(o) => o.name}
                        value={concretingTeams.find((t) => t.id === form.concreting_team_id) || null}
                        onChange={(_e, val) =>
                          setForm({
                            ...form,
                            concreting_team_id: val?.id || "",
                            contractor_name: val?.name || "",
                          })
                        }
                        isOptionEqualToValue={(o, v) => o.id === v.id}
                        slotProps={{ popper: { disablePortal: false } }}
                        renderInput={(params) => <TextField {...params} label="Concreting Team" required />}
                      />
                      <Button
                        size="small"
                        onClick={() => setTeamDialogOpen(true)}
                        sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
                      >
                        + Add
                      </Button>
                    </Box>
                  ) : form.contract_type === "mesthri" ? (
                    <FormControl fullWidth required>
                      <InputLabel>Team</InputLabel>
                      <Select
                        value={teams.some((t) => t.id === form.team_id) ? form.team_id : ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            team_id: e.target.value,
                            // Clear a stale head-mestri pick that isn't in the new team.
                            laborer_id:
                              laborers.find((l) => l.id === form.laborer_id)?.team_id === e.target.value
                                ? form.laborer_id
                                : "",
                          })
                        }
                        label="Team"
                      >
                        {teams.map((team) => (
                          <MenuItem key={team.id} value={team.id}>
                            {team.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  ) : (
                    <SpecialistLaborerPicker
                      laborers={laborers}
                      value={form.laborer_id}
                      onChange={(id) => setForm({ ...form, laborer_id: id })}
                      required
                    />
                  )}
                </Grid>
                {/* Head Mestri — the laborer who receives team wages in the salary
                    waterfall. Optional at schema level so older contracts still save. */}
                {form.contract_type === "mesthri" && form.team_id && (
                  <Grid size={{ xs: 12 }}>
                    <FormControl fullWidth>
                      <InputLabel shrink>Head Mestri (Laborer)</InputLabel>
                      <Select
                        value={laborers.some((l) => l.id === form.laborer_id) ? form.laborer_id : ""}
                        onChange={(e) => setForm({ ...form, laborer_id: e.target.value })}
                        label="Head Mestri (Laborer)"
                        displayEmpty
                        notched
                      >
                        <MenuItem value="">
                          <em>None — block salary settlements</em>
                        </MenuItem>
                        {(() => {
                          const teamMembers = laborers.filter((l) => l.team_id === form.team_id);
                          const pool = teamMembers.length > 0 ? teamMembers : laborers;
                          return pool.map((laborer) => (
                            <MenuItem key={laborer.id} value={laborer.id}>
                              {laborer.name}
                              {teamMembers.length === 0 ? " (any)" : ""}
                            </MenuItem>
                          ));
                        })()}
                      </Select>
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, ml: 1.5 }}>
                        Required for the &quot;Record mesthri payment&quot; waterfall in Salary
                        Settlements. If no team members appear, pick any active laborer as the wage
                        recipient.
                      </Typography>
                    </FormControl>
                  </Grid>
                )}
              </Grid>

              <Autocomplete
                options={tradeCategories}
                getOptionLabel={(o) => o.name}
                isOptionEqualToValue={(o, v) => o.id === v.id}
                value={tradeCategories.find((tc) => tc.id === form.trade_category_id) ?? null}
                onChange={(_e, value) => setForm({ ...form, trade_category_id: value?.id ?? "" })}
                slotProps={{ popper: { disablePortal: false } }}
                renderInput={(params) => (
                  <TextField
                    {...params}
                    label="Trade (optional — enables attendance tracking)"
                    helperText="Leave blank for a payments-only subcontract. Pick a trade to group it under that trade and allow attendance tracking — you can add this anytime."
                  />
                )}
              />

              <TextField
                fullWidth
                label="Subcontract Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
                placeholder="e.g., Plastering Work - Ground Floor"
              />

              <TextField
                fullWidth
                label="Description"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                multiline
                rows={2}
              />

              <TextField
                fullWidth
                label="Scope of Work"
                value={form.scope_of_work}
                onChange={(e) => setForm({ ...form, scope_of_work: e.target.value })}
                multiline
                rows={3}
              />

              <Divider sx={{ my: 2 }} />

              {/* Value type toggle — hidden for day-work (always lump sum) */}
              {form.contract_type !== "day_work" && (
                <Box>
                  <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mb: 1.5 }}>
                    Subcontract Value Type
                  </Typography>
                  <ToggleButtonGroup
                    value={form.is_rate_based ? "rate" : "lumpsum"}
                    exclusive
                    onChange={(_e, value) => {
                      if (value !== null) {
                        setForm({
                          ...form,
                          is_rate_based: value === "rate",
                          total_value: value === "rate" ? 0 : form.total_value,
                          rate_per_unit: value === "rate" ? form.rate_per_unit : 0,
                          total_units: value === "rate" ? form.total_units : 0,
                        });
                      }
                    }}
                    fullWidth
                    sx={{
                      "& .MuiToggleButton-root": { py: 1.5, textTransform: "none", fontWeight: 500 },
                      "& .Mui-selected": {
                        backgroundColor: "primary.main",
                        color: "white",
                        "&:hover": { backgroundColor: "primary.dark" },
                      },
                    }}
                  >
                    <ToggleButton value="rate">
                      <CalculateIcon sx={{ mr: 1, fontSize: 20 }} />
                      Rate-Based (Per Unit)
                    </ToggleButton>
                    <ToggleButton value="lumpsum">
                      <MoneyIcon sx={{ mr: 1, fontSize: 20 }} />
                      Lump Sum Subcontract
                    </ToggleButton>
                  </ToggleButtonGroup>
                </Box>
              )}

              {form.is_rate_based ? (
                <>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <FormControl fullWidth>
                        <InputLabel>Measurement Unit</InputLabel>
                        <Select
                          value={form.measurement_unit}
                          onChange={(e) =>
                            setForm({ ...form, measurement_unit: e.target.value as MeasurementUnit })
                          }
                          label="Measurement Unit"
                        >
                          <MenuItem value="sqft">Square Feet (sqft)</MenuItem>
                          <MenuItem value="rft">Running Feet (rft)</MenuItem>
                          <MenuItem value="nos">Numbers (nos)</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid size={{ xs: 12, sm: 6 }}>
                      <TextField
                        fullWidth
                        label="Rate per Unit"
                        type="number"
                        value={form.rate_per_unit || ""}
                        onChange={(e) => setForm({ ...form, rate_per_unit: Number(e.target.value) })}
                        required
                        slotProps={{ input: { startAdornment: "₹" } }}
                      />
                    </Grid>
                  </Grid>

                  <TextField
                    fullWidth
                    label={`Total Units (${form.measurement_unit})`}
                    type="number"
                    value={form.total_units || ""}
                    onChange={(e) => setForm({ ...form, total_units: Number(e.target.value) })}
                    required
                    slotProps={{ input: { endAdornment: form.measurement_unit } }}
                  />

                  <Paper
                    elevation={0}
                    sx={{ p: 2, bgcolor: "primary.50", border: "2px solid", borderColor: "primary.main", borderRadius: 2 }}
                  >
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Box>
                        <Typography variant="caption" color="text.secondary">
                          Total Subcontract Value
                        </Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                          {form.rate_per_unit > 0 && form.total_units > 0 ? (
                            <>
                              ₹{form.rate_per_unit.toLocaleString("en-IN")} ×{" "}
                              {form.total_units.toLocaleString("en-IN")} {form.measurement_unit}
                            </>
                          ) : (
                            "Enter rate and units to calculate"
                          )}
                        </Typography>
                      </Box>
                      <Typography variant="h5" fontWeight={700} color="primary.main">
                        ₹{form.total_value.toLocaleString("en-IN")}
                      </Typography>
                    </Box>
                  </Paper>
                </>
              ) : (
                <TextField
                  fullWidth
                  label={
                    form.contract_type === "day_work" ? "Total Agreed Amount (lump sum)" : "Total Subcontract Value"
                  }
                  type="number"
                  value={form.total_value || ""}
                  onChange={(e) => setForm({ ...form, total_value: Number(e.target.value) })}
                  required
                  slotProps={{ input: { startAdornment: "₹" } }}
                  helperText={
                    form.contract_type === "day_work"
                      ? "The single bargained amount you pay the gang on completion"
                      : "Enter the fixed subcontract amount"
                  }
                />
              )}

              {/* Day-work bargaining breakdown (reference figures only) */}
              {form.contract_type === "day_work" && (
                <Box
                  sx={{
                    p: 2,
                    border: "1px dashed",
                    borderColor: "divider",
                    borderRadius: 2,
                    display: "flex",
                    flexDirection: "column",
                    gap: 2,
                  }}
                >
                  <Typography variant="subtitle2" color="text.secondary">
                    Bargaining breakdown
                  </Typography>
                  <Grid container spacing={2}>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField
                        fullWidth
                        label="Male laborers"
                        type="number"
                        value={form.male_count || ""}
                        onChange={(e) => setForm({ ...form, male_count: Number(e.target.value) })}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField
                        fullWidth
                        label="Female laborers"
                        type="number"
                        value={form.female_count || ""}
                        onChange={(e) => setForm({ ...form, female_count: Number(e.target.value) })}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField
                        fullWidth
                        label="Machine rental"
                        type="number"
                        value={form.machine_rental || ""}
                        onChange={(e) => setForm({ ...form, machine_rental: Number(e.target.value) })}
                        slotProps={{ input: { startAdornment: "₹" } }}
                      />
                    </Grid>
                    <Grid size={{ xs: 6, sm: 3 }}>
                      <TextField
                        fullWidth
                        label="Transport"
                        type="number"
                        value={form.transport_cost || ""}
                        onChange={(e) => setForm({ ...form, transport_cost: Number(e.target.value) })}
                        slotProps={{ input: { startAdornment: "₹" } }}
                      />
                    </Grid>
                  </Grid>
                  <TextField
                    fullWidth
                    label="Other factors / notes"
                    value={form.breakdown_notes}
                    onChange={(e) => setForm({ ...form, breakdown_notes: e.target.value })}
                    multiline
                    rows={2}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Reference figures — they need not add up to the agreed total.
                  </Typography>
                </Box>
              )}

              <Divider sx={{ my: 2 }} />

              <Grid container spacing={2}>
                <Grid size={{ xs: 12, sm: 6 }}>
                  <TextField
                    fullWidth
                    label={form.contract_type === "day_work" ? "Work Date" : "Start Date"}
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    slotProps={{ inputLabel: { shrink: true } }}
                    required
                  />
                </Grid>
                {form.contract_type !== "day_work" && (
                  <Grid size={{ xs: 12, sm: 6 }}>
                    <TextField
                      fullWidth
                      label="Expected End Date"
                      type="date"
                      value={form.expected_end_date}
                      onChange={(e) => setForm({ ...form, expected_end_date: e.target.value })}
                      slotProps={{ inputLabel: { shrink: true } }}
                    />
                  </Grid>
                )}
              </Grid>

              <FormControl fullWidth>
                <InputLabel>Status</InputLabel>
                <Select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value as ContractStatus })}
                  label="Status"
                >
                  <MenuItem value="draft">Draft</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="on_hold">On hold</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="cancelled">Cancelled</MenuItem>
                </Select>
              </FormControl>
            </Box>
          )}
          {error && (
            <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} variant="contained" disabled={saving || loadingRow}>
            {saving ? "Saving…" : subcontractId ? "Update" : "Create"}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Inline quick-add for a concreting team (from the day-work picker) */}
      <ConcretingTeamDialog
        open={teamDialogOpen}
        onClose={() => setTeamDialogOpen(false)}
        onSaved={(team) =>
          setForm((prev) => ({ ...prev, concreting_team_id: team.id, contractor_name: team.name }))
        }
      />
    </>
  );
}
