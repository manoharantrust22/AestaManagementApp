"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Box,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Autocomplete,
  Radio,
  RadioGroup,
  FormControl,
  FormLabel,
  FormControlLabel,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  Collapse,
  Link as MuiLink,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon } from "@mui/icons-material";
import { useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";
import type { LaborTrackingMode } from "@/types/trade.types";

interface TeamOption {
  id: string;
  name: string;
  leaderName: string | null;
}
interface LaborerOption {
  id: string;
  name: string;
}

interface QuickCreateContractDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: (contractId: string) => void;
  siteId: string;
  tradeCategoryId: string;
  tradeName: string;
}

export function QuickCreateContractDialog({
  open,
  onClose,
  onCreated,
  siteId,
  tradeCategoryId,
  tradeName,
}: QuickCreateContractDialogProps) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { selectedCompany } = useSelectedCompany();

  const [contractType, setContractType] = useState<"mesthri" | "specialist">(
    "mesthri"
  );
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [laborers, setLaborers] = useState<LaborerOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [selectedLaborerId, setSelectedLaborerId] = useState<string | null>(
    null
  );
  const [title, setTitle] = useState("");
  const [totalValue, setTotalValue] = useState<string>("");
  const [laborTrackingMode, setLaborTrackingMode] =
    useState<LaborTrackingMode>("mesthri_only");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  // Inline-create state for team and laborer
  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamLeader, setNewTeamLeader] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamPhone, setNewTeamPhone] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [showNewLaborer, setShowNewLaborer] = useState(false);
  const [newLaborerName, setNewLaborerName] = useState("");
  const [newLaborerPhone, setNewLaborerPhone] = useState("");
  const [creatingLaborer, setCreatingLaborer] = useState(false);

  // Reset state every time dialog opens
  useEffect(() => {
    if (!open) return;
    setContractType("mesthri");
    setSelectedTeamId(null);
    setSelectedLaborerId(null);
    setTitle("");
    setTotalValue("");
    setLaborTrackingMode("mesthri_only");
    setError(null);
    setShowNewTeam(false);
    setNewTeamLeader("");
    setNewTeamName("");
    setNewTeamPhone("");
    setShowNewLaborer(false);
    setNewLaborerName("");
    setNewLaborerPhone("");

    setOptionsLoading(true);
    Promise.all([
      supabase
        .from("teams")
        .select("id, name, leader_name")
        .eq("status", "active")
        .order("name"),
      supabase
        .from("laborers")
        .select("id, name")
        .eq("status", "active")
        .order("name"),
    ])
      .then(([teamsRes, laborersRes]) => {
        setTeams(
          ((teamsRes.data ?? []) as Array<{
            id: string;
            name: string;
            leader_name: string | null;
          }>).map((t) => ({
            id: t.id,
            name: t.name,
            leaderName: t.leader_name,
          }))
        );
        setLaborers(
          ((laborersRes.data ?? []) as Array<{ id: string; name: string }>).map(
            (l) => ({ id: l.id, name: l.name })
          )
        );
      })
      .catch((e) => setError(`Failed to load options: ${e.message}`))
      .finally(() => setOptionsLoading(false));
  }, [open, supabase]);

  // Default the title to a sensible auto-fill once a team or laborer is picked
  useEffect(() => {
    if (title) return; // user already typed something
    if (contractType === "mesthri" && selectedTeamId) {
      const t = teams.find((x) => x.id === selectedTeamId);
      if (t) setTitle(`${tradeName} — ${t.leaderName ?? t.name}`);
    } else if (contractType === "specialist" && selectedLaborerId) {
      const l = laborers.find((x) => x.id === selectedLaborerId);
      if (l) setTitle(`${tradeName} — ${l.name}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractType, selectedTeamId, selectedLaborerId]);

  const handleCreateTeam = async () => {
    setError(null);
    if (!newTeamLeader.trim()) {
      setError("Leader name is required to create a team");
      return;
    }
    if (!selectedCompany?.id) {
      setError("No active company selected");
      return;
    }
    setCreatingTeam(true);
    try {
      const sb = supabase as any;
      const teamName =
        newTeamName.trim() || `${newTeamLeader.trim()} ${tradeName} Team`;
      const insertRes = await sb
        .from("teams")
        .insert({
          name: teamName,
          leader_name: newTeamLeader.trim(),
          leader_phone: newTeamPhone.trim() || null,
          status: "active",
          company_id: selectedCompany.id,
        })
        .select("id, name, leader_name")
        .single();
      if (insertRes.error) throw insertRes.error;
      const created = insertRes.data as {
        id: string;
        name: string;
        leader_name: string | null;
      };
      // Add to local options + auto-select + auto-fill title
      setTeams((prev) => [
        ...prev,
        {
          id: created.id,
          name: created.name,
          leaderName: created.leader_name,
        },
      ]);
      setSelectedTeamId(created.id);
      if (!title) {
        setTitle(`${tradeName} — ${created.leader_name ?? created.name}`);
      }
      setShowNewTeam(false);
      setNewTeamLeader("");
      setNewTeamName("");
      setNewTeamPhone("");
    } catch (e: any) {
      setError(`Failed to create team: ${e.message ?? String(e)}`);
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleCreateLaborer = async () => {
    setError(null);
    if (!newLaborerName.trim()) {
      setError("Specialist name is required");
      return;
    }
    if (!selectedCompany?.id) {
      setError("No active company selected");
      return;
    }
    setCreatingLaborer(true);
    try {
      const sb = supabase as any;
      const insertRes = await sb
        .from("laborers")
        .insert({
          name: newLaborerName.trim(),
          phone: newLaborerPhone.trim() || null,
          status: "active",
          employment_type: "specialist",
          laborer_type: "contract",
          category_id: tradeCategoryId,
          company_id: selectedCompany.id,
        })
        .select("id, name")
        .single();
      if (insertRes.error) throw insertRes.error;
      const created = insertRes.data as { id: string; name: string };
      setLaborers((prev) => [...prev, { id: created.id, name: created.name }]);
      setSelectedLaborerId(created.id);
      if (!title) setTitle(`${tradeName} — ${created.name}`);
      setShowNewLaborer(false);
      setNewLaborerName("");
      setNewLaborerPhone("");
    } catch (e: any) {
      setError(`Failed to create specialist: ${e.message ?? String(e)}`);
    } finally {
      setCreatingLaborer(false);
    }
  };

  const canSubmit = useMemo(() => {
    if (submitting) return false;
    if (!title.trim()) return false;
    if (contractType === "mesthri" && !selectedTeamId) return false;
    if (contractType === "specialist" && !selectedLaborerId) return false;
    return true;
  }, [submitting, title, contractType, selectedTeamId, selectedLaborerId]);

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const totalValueNum = totalValue ? Number(totalValue) : 0;
      if (Number.isNaN(totalValueNum) || totalValueNum < 0) {
        throw new Error("Quoted total must be a positive number");
      }

      const payload: Record<string, unknown> = {
        site_id: siteId,
        trade_category_id: tradeCategoryId,
        contract_type: contractType,
        title: title.trim(),
        total_value: totalValueNum,
        labor_tracking_mode: laborTrackingMode,
        is_in_house: false,
        is_rate_based: false,
        status: "active",
      };
      if (contractType === "mesthri") payload.team_id = selectedTeamId;
      else payload.laborer_id = selectedLaborerId;

      // Cast to any once — the Supabase types haven't been regenerated for the
      // new schema yet (waiting on a separate fix for src/types/database.types.ts).
      const sb = supabase as any;
      const insertRes = await sb
        .from("subcontracts")
        .insert(payload)
        .select("id")
        .single();
      if (insertRes.error) throw insertRes.error;
      const newId: string = insertRes.data.id;

      // Seed subcontract_role_rates for headcount mode using labor_roles defaults
      if (laborTrackingMode === "headcount") {
        const rolesRes = await sb
          .from("labor_roles")
          .select("id, default_daily_rate")
          .eq("category_id", tradeCategoryId)
          .eq("is_active", true);
        if (rolesRes.error) throw rolesRes.error;
        const rateRows = ((rolesRes.data ?? []) as Array<{
          id: string;
          default_daily_rate: number | string;
        }>).map((r) => ({
          subcontract_id: newId,
          role_id: r.id,
          daily_rate: Number(r.default_daily_rate ?? 0),
        }));
        if (rateRows.length > 0) {
          const seedRes = await sb
            .from("subcontract_role_rates")
            .insert(rateRows);
          if (seedRes.error) throw seedRes.error;
        }
      }

      // Invalidate React Query caches and broadcast to other tabs/pages
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["trades", "site", siteId] }),
        queryClient.invalidateQueries({
          queryKey: ["trade-reconciliations", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["trade-activity", "site", siteId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["subcontracts", "site", siteId],
        }),
      ]);
      if (typeof BroadcastChannel !== "undefined") {
        const bc = new BroadcastChannel("subcontracts-changed");
        bc.postMessage({ siteId, at: Date.now() });
        bc.close();
      }

      onCreated(newId);
      onClose();
    } catch (e: any) {
      setError(e.message ?? String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        New {tradeName} contract
        <Typography variant="caption" color="text.secondary" component="div">
          Quick-create — opens the new contract right after submit. Use the
          full Subcontracts page for advanced options like sections or rate-based
          contracts.
        </Typography>
      </DialogTitle>
      <DialogContent dividers>
        {optionsLoading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <Stack spacing={2.5}>
            <FormControl>
              <FormLabel>Contractor type</FormLabel>
              <ToggleButtonGroup
                value={contractType}
                exclusive
                onChange={(_, v) => v && setContractType(v)}
                size="small"
                sx={{ mt: 1 }}
              >
                <ToggleButton value="mesthri">Mesthri (team)</ToggleButton>
                <ToggleButton value="specialist">Specialist (individual)</ToggleButton>
              </ToggleButtonGroup>
            </FormControl>

            {contractType === "mesthri" ? (
              <Box>
                <Autocomplete
                  options={teams}
                  getOptionLabel={(t) => t.leaderName ?? t.name}
                  value={teams.find((t) => t.id === selectedTeamId) ?? null}
                  onChange={(_, v) => setSelectedTeamId(v?.id ?? null)}
                  renderInput={(params) => (
                    <TextField {...params} label="Mesthri team" required />
                  )}
                  slotProps={{ popper: { disablePortal: false } }}
                  noOptionsText={
                    <MuiLink
                      component="button"
                      type="button"
                      onClick={() => setShowNewTeam(true)}
                      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                    >
                      <AddIcon fontSize="small" /> Create new team
                    </MuiLink>
                  }
                />
                {!showNewTeam && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setShowNewTeam(true)}
                    sx={{ mt: 0.5 }}
                  >
                    Mesthri not in the list? Add a new team
                  </Button>
                )}
                <Collapse in={showNewTeam}>
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      border: "1px dashed",
                      borderColor: "divider",
                      borderRadius: 1.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="subtitle2">New mesthri team</Typography>
                      <Button
                        size="small"
                        startIcon={<CloseIcon fontSize="small" />}
                        onClick={() => setShowNewTeam(false)}
                        disabled={creatingTeam}
                      >
                        Cancel
                      </Button>
                    </Stack>
                    <Stack spacing={1.5}>
                      <TextField
                        label="Mesthri (leader) name"
                        value={newTeamLeader}
                        onChange={(e) => setNewTeamLeader(e.target.value)}
                        size="small"
                        required
                        autoFocus
                        helperText='e.g. "Asis"'
                      />
                      <TextField
                        label="Team name (optional)"
                        value={newTeamName}
                        onChange={(e) => setNewTeamName(e.target.value)}
                        size="small"
                        helperText={`Defaults to "${newTeamLeader || "<leader>"} ${tradeName} Team"`}
                      />
                      <TextField
                        label="Leader phone (optional)"
                        value={newTeamPhone}
                        onChange={(e) =>
                          setNewTeamPhone(e.target.value.replace(/[^0-9+\- ]/g, ""))
                        }
                        size="small"
                      />
                      <Button
                        variant="outlined"
                        onClick={handleCreateTeam}
                        disabled={creatingTeam || !newTeamLeader.trim()}
                        startIcon={creatingTeam ? <CircularProgress size={14} /> : <AddIcon />}
                      >
                        {creatingTeam ? "Creating…" : "Create team"}
                      </Button>
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            ) : (
              <Box>
                <Autocomplete
                  options={laborers}
                  getOptionLabel={(l) => l.name}
                  value={laborers.find((l) => l.id === selectedLaborerId) ?? null}
                  onChange={(_, v) => setSelectedLaborerId(v?.id ?? null)}
                  renderInput={(params) => (
                    <TextField {...params} label="Specialist" required />
                  )}
                  slotProps={{ popper: { disablePortal: false } }}
                  noOptionsText={
                    <MuiLink
                      component="button"
                      type="button"
                      onClick={() => setShowNewLaborer(true)}
                      sx={{ display: "inline-flex", alignItems: "center", gap: 0.5 }}
                    >
                      <AddIcon fontSize="small" /> Create new specialist
                    </MuiLink>
                  }
                />
                {!showNewLaborer && (
                  <Button
                    size="small"
                    startIcon={<AddIcon />}
                    onClick={() => setShowNewLaborer(true)}
                    sx={{ mt: 0.5 }}
                  >
                    Specialist not in the list? Add a new one
                  </Button>
                )}
                <Collapse in={showNewLaborer}>
                  <Box
                    sx={{
                      mt: 1,
                      p: 1.5,
                      border: "1px dashed",
                      borderColor: "divider",
                      borderRadius: 1.5,
                    }}
                  >
                    <Stack
                      direction="row"
                      alignItems="center"
                      justifyContent="space-between"
                      sx={{ mb: 1 }}
                    >
                      <Typography variant="subtitle2">New {tradeName.toLowerCase()} specialist</Typography>
                      <Button
                        size="small"
                        startIcon={<CloseIcon fontSize="small" />}
                        onClick={() => setShowNewLaborer(false)}
                        disabled={creatingLaborer}
                      >
                        Cancel
                      </Button>
                    </Stack>
                    <Stack spacing={1.5}>
                      <TextField
                        label="Specialist name"
                        value={newLaborerName}
                        onChange={(e) => setNewLaborerName(e.target.value)}
                        size="small"
                        required
                        autoFocus
                      />
                      <TextField
                        label="Phone (optional)"
                        value={newLaborerPhone}
                        onChange={(e) =>
                          setNewLaborerPhone(e.target.value.replace(/[^0-9+\- ]/g, ""))
                        }
                        size="small"
                      />
                      <Button
                        variant="outlined"
                        onClick={handleCreateLaborer}
                        disabled={creatingLaborer || !newLaborerName.trim()}
                        startIcon={creatingLaborer ? <CircularProgress size={14} /> : <AddIcon />}
                      >
                        {creatingLaborer ? "Creating…" : "Create specialist"}
                      </Button>
                    </Stack>
                  </Box>
                </Collapse>
              </Box>
            )}

            <TextField
              label="Contract title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              fullWidth
              helperText={`e.g. "${tradeName} — Asis Mesthri"`}
            />

            <TextField
              label="Quoted total (lump sum)"
              value={totalValue}
              onChange={(e) => setTotalValue(e.target.value.replace(/[^0-9.]/g, ""))}
              fullWidth
              InputProps={{
                startAdornment: <InputAdornment position="start">₹</InputAdornment>,
              }}
              helperText="Leave 0 if no fixed quote yet (e.g. daily-rate only)."
            />

            <FormControl>
              <FormLabel>Labor tracking</FormLabel>
              <RadioGroup
                value={laborTrackingMode}
                onChange={(e) => setLaborTrackingMode(e.target.value as LaborTrackingMode)}
              >
                <FormControlLabel
                  value="mesthri_only"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">
                        Mesthri-only — just track money I give him
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        Payments alone drive the balance. You&apos;ll see Quoted vs Paid only —
                        the app can&apos;t tell you whether the lump sum was a fair quote.
                        Best for trusted contractors where you accept the price at face value.
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="headcount"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">
                        Headcount — record how many came each day, by role <strong>(recommended for new lump-sum contracts)</strong>
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        e.g. &quot;1 technical painter + 2 helpers today&quot;. Takes 5 seconds per
                        day. Role rate card seeded from defaults (e.g. Painter ₹650, Helper ₹400);
                        editable later. <strong>At end of contract the app tells you whether you
                        overpaid, underpaid, or quoted right</strong> — comparing total paid vs
                        implied labor cost (units × rates).
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="mid"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">
                        Mid (Laborer + Crew) — roster of who came + day total
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        Mesthri brings a crew. Each day, supervisor toggles which laborers
                        came and records ONE day total ₹ for the crew. Tracks presence
                        without per-laborer rates. Best for mesthri-led teams where you
                        pay one daily total.
                      </Typography>
                    </Box>
                  }
                />
                <FormControlLabel
                  value="detailed"
                  control={<Radio />}
                  label={
                    <Box>
                      <Typography variant="body2">
                        Detailed — per-laborer attendance with in/out time
                      </Typography>
                      <Typography variant="caption" color="text.secondary" component="div">
                        Today&apos;s civil attendance flow. Use when the painters/electricians are
                        on YOUR books (you pay them directly, not the mesthri), or for
                        cost-plus-actual-hours contracts.
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit}
          startIcon={submitting ? <CircularProgress size={16} /> : null}
        >
          {submitting ? "Creating…" : "Create contract"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
