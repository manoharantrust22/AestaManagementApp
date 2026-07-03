"use client";

import React, { useEffect, useState } from "react";
import {
  Autocomplete,
  Box,
  Button,
  CircularProgress,
  Collapse,
  FormControl,
  FormLabel,
  Link as MuiLink,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from "@mui/material";
import { Add as AddIcon, Close as CloseIcon } from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSelectedCompany } from "@/contexts/CompanyContext/SelectedCompanyContext";

interface TeamOption {
  id: string;
  name: string;
  leaderName: string | null;
}
interface LaborerOption {
  id: string;
  name: string;
}

export interface CrewSelection {
  contractType: "mesthri" | "specialist";
  teamId: string | null;
  laborerId: string | null;
}

export const emptyCrewSelection = (): CrewSelection => ({
  contractType: "mesthri",
  teamId: null,
  laborerId: null,
});

/**
 * Shared crew picker — the mesthri-team / specialist toggle, the two
 * Autocompletes, and the inline "create new team / specialist" forms, lifted
 * out of QuickCreateContractDialog so the Hand-to-crew flow reuses the exact
 * same picking + inline-creation experience. Owns its own options loading.
 */
export function CrewPicker({
  value,
  onChange,
  tradeCategoryId,
  tradeName,
  required = true,
  disabled = false,
  helperText,
  onError,
}: {
  value: CrewSelection;
  /** meta.displayName = the picked crew's display name (for title auto-fill). */
  onChange: (v: CrewSelection, meta?: { displayName?: string }) => void;
  /** Sets category_id on inline-created specialists. */
  tradeCategoryId: string;
  /** Used in default team names and copy. */
  tradeName: string;
  required?: boolean;
  disabled?: boolean;
  /** Shown under both Autocompletes (e.g. "Optional for a plan…"). */
  helperText?: string;
  onError?: (msg: string) => void;
}) {
  const supabase = createClient();
  const { selectedCompany } = useSelectedCompany();

  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [laborers, setLaborers] = useState<LaborerOption[]>([]);
  const [loading, setLoading] = useState(false);

  const [showNewTeam, setShowNewTeam] = useState(false);
  const [newTeamLeader, setNewTeamLeader] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamPhone, setNewTeamPhone] = useState("");
  const [creatingTeam, setCreatingTeam] = useState(false);

  const [showNewLaborer, setShowNewLaborer] = useState(false);
  const [newLaborerName, setNewLaborerName] = useState("");
  const [newLaborerPhone, setNewLaborerPhone] = useState("");
  const [creatingLaborer, setCreatingLaborer] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
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
        if (cancelled) return;
        setTeams(
          ((teamsRes.data ?? []) as Array<{
            id: string;
            name: string;
            leader_name: string | null;
          }>).map((t) => ({ id: t.id, name: t.name, leaderName: t.leader_name }))
        );
        setLaborers(
          ((laborersRes.data ?? []) as Array<{ id: string; name: string }>).map(
            (l) => ({ id: l.id, name: l.name })
          )
        );
      })
      .catch((e) => onError?.(`Failed to load options: ${e.message}`))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const teamDisplayName = (t: TeamOption) => t.leaderName ?? t.name;

  const handleCreateTeam = async () => {
    if (!newTeamLeader.trim()) {
      onError?.("Leader name is required to create a team");
      return;
    }
    if (!selectedCompany?.id) {
      onError?.("No active company selected");
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
      setTeams((prev) => [
        ...prev,
        { id: created.id, name: created.name, leaderName: created.leader_name },
      ]);
      onChange(
        { contractType: "mesthri", teamId: created.id, laborerId: null },
        { displayName: created.leader_name ?? created.name }
      );
      setShowNewTeam(false);
      setNewTeamLeader("");
      setNewTeamName("");
      setNewTeamPhone("");
    } catch (e: any) {
      onError?.(`Failed to create team: ${e.message ?? String(e)}`);
    } finally {
      setCreatingTeam(false);
    }
  };

  const handleCreateLaborer = async () => {
    if (!newLaborerName.trim()) {
      onError?.("Specialist name is required");
      return;
    }
    if (!selectedCompany?.id) {
      onError?.("No active company selected");
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
      onChange(
        { contractType: "specialist", teamId: null, laborerId: created.id },
        { displayName: created.name }
      );
      setShowNewLaborer(false);
      setNewLaborerName("");
      setNewLaborerPhone("");
    } catch (e: any) {
      onError?.(`Failed to create specialist: ${e.message ?? String(e)}`);
    } finally {
      setCreatingLaborer(false);
    }
  };

  return (
    <>
      <FormControl disabled={disabled}>
        <FormLabel>Contractor type</FormLabel>
        <ToggleButtonGroup
          value={value.contractType}
          exclusive
          onChange={(_, v) =>
            v && onChange({ contractType: v, teamId: null, laborerId: null })
          }
          size="small"
          sx={{ mt: 1 }}
          disabled={disabled}
        >
          <ToggleButton value="mesthri">Mesthri (team)</ToggleButton>
          <ToggleButton value="specialist">Specialist (individual)</ToggleButton>
        </ToggleButtonGroup>
      </FormControl>

      {value.contractType === "mesthri" ? (
        <Box>
          <Autocomplete
            options={teams}
            loading={loading}
            disabled={disabled}
            getOptionLabel={teamDisplayName}
            value={teams.find((t) => t.id === value.teamId) ?? null}
            onChange={(_, v) =>
              onChange(
                { contractType: "mesthri", teamId: v?.id ?? null, laborerId: null },
                { displayName: v ? teamDisplayName(v) : undefined }
              )
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Mesthri team"
                required={required}
                helperText={helperText}
              />
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
          {!showNewTeam && !disabled && (
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
            loading={loading}
            disabled={disabled}
            getOptionLabel={(l) => l.name}
            value={laborers.find((l) => l.id === value.laborerId) ?? null}
            onChange={(_, v) =>
              onChange(
                { contractType: "specialist", teamId: null, laborerId: v?.id ?? null },
                { displayName: v?.name }
              )
            }
            renderInput={(params) => (
              <TextField
                {...params}
                label="Specialist"
                required={required}
                helperText={helperText}
              />
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
          {!showNewLaborer && !disabled && (
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
                <Typography variant="subtitle2">
                  New {tradeName.toLowerCase()} specialist
                </Typography>
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
    </>
  );
}
