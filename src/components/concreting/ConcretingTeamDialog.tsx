"use client";

import React, { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Grid,
  Switch,
  TextField,
} from "@mui/material";
import {
  useCreateConcretingTeam,
  useUpdateConcretingTeam,
} from "@/hooks/queries/useConcretingTeams";
import type {
  ConcretingTeam,
  ConcretingTeamFormData,
} from "@/types/concreting.types";

interface ConcretingTeamDialogProps {
  open: boolean;
  onClose: () => void;
  /** When provided, the dialog edits this team; otherwise it creates a new one. */
  team?: ConcretingTeam | null;
  /** Called after a successful save with the saved row (used by the inline
   *  "+ Add new team" quick-add on the day-work subcontract dialog). */
  onSaved?: (team: ConcretingTeam) => void;
}

const emptyForm: ConcretingTeamFormData = {
  name: "",
  contact_person: "",
  phone: "",
  whatsapp_number: "",
  area: "",
  brings_own_machine: false,
  typical_rate: null,
  notes: "",
};

export default function ConcretingTeamDialog({
  open,
  onClose,
  team,
  onSaved,
}: ConcretingTeamDialogProps) {
  const [form, setForm] = useState<ConcretingTeamFormData>(emptyForm);
  const [error, setError] = useState("");

  const createTeam = useCreateConcretingTeam();
  const updateTeam = useUpdateConcretingTeam();
  const saving = createTeam.isPending || updateTeam.isPending;

  // Sync form when the dialog opens (load the team for edit, reset for create).
  useEffect(() => {
    if (!open) return;
    setError("");
    if (team) {
      setForm({
        name: team.name ?? "",
        contact_person: team.contact_person ?? "",
        phone: team.phone ?? "",
        whatsapp_number: team.whatsapp_number ?? "",
        area: team.area ?? "",
        brings_own_machine: team.brings_own_machine ?? false,
        typical_rate: team.typical_rate ?? null,
        notes: team.notes ?? "",
      });
    } else {
      setForm(emptyForm);
    }
  }, [open, team]);

  const handleChange = <K extends keyof ConcretingTeamFormData>(
    key: K,
    value: ConcretingTeamFormData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setError("Team name is required");
      return;
    }
    setError("");
    try {
      if (team) {
        await updateTeam.mutateAsync({ id: team.id, data: form });
        onSaved?.({ ...team, ...form, name: form.name.trim() } as ConcretingTeam);
      } else {
        const created = await createTeam.mutateAsync(form);
        onSaved?.(created);
      }
      onClose();
    } catch (err: any) {
      setError(err?.message || "Failed to save the concreting team");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {team ? "Edit Concreting Team" : "New Concreting Team"}
      </DialogTitle>
      <DialogContent>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 1 }}>
          <TextField
            label="Team / Gang Name"
            value={form.name}
            onChange={(e) => handleChange("name", e.target.value)}
            required
            fullWidth
            autoFocus
            placeholder="e.g., Murugan Concreting Gang"
          />

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Contact Person"
                value={form.contact_person ?? ""}
                onChange={(e) => handleChange("contact_person", e.target.value)}
                fullWidth
                placeholder="Foreman / supervisor"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Phone"
                value={form.phone ?? ""}
                onChange={(e) => handleChange("phone", e.target.value)}
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="WhatsApp Number"
                value={form.whatsapp_number ?? ""}
                onChange={(e) =>
                  handleChange("whatsapp_number", e.target.value)
                }
                fullWidth
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Area / Location"
                value={form.area ?? ""}
                onChange={(e) => handleChange("area", e.target.value)}
                fullWidth
                placeholder="Where they work"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField
                label="Typical / Last-agreed Rate"
                type="number"
                value={form.typical_rate ?? ""}
                onChange={(e) =>
                  handleChange(
                    "typical_rate",
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
                fullWidth
                slotProps={{ input: { startAdornment: "₹" } }}
                helperText="For comparing teams later"
              />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <FormControlLabel
                sx={{ mt: 1 }}
                control={
                  <Switch
                    checked={form.brings_own_machine ?? false}
                    onChange={(e) =>
                      handleChange("brings_own_machine", e.target.checked)
                    }
                  />
                }
                label="Brings own machine"
              />
            </Grid>
          </Grid>

          <TextField
            label="Notes"
            value={form.notes ?? ""}
            onChange={(e) => handleChange("notes", e.target.value)}
            fullWidth
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
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button onClick={handleSubmit} variant="contained" disabled={saving}>
          {team ? "Update" : "Create"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
