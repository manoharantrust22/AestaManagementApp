"use client";

import { useState } from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { DeleteOutline as DeleteOutlineIcon } from "@mui/icons-material";
import type { LaborSpecialty } from "@/hooks/queries/useLaborSpecialties";

interface ManageSpecialtiesDialogProps {
  open: boolean;
  onClose: () => void;
  specialties: LaborSpecialty[];
  supabase: any;
  onChanged: () => void;
}

/**
 * Lightweight in-app manager for the labor_specialties reference list:
 * add, activate/deactivate, and delete specialties. Deleting cascades to
 * laborer_specialties (the tag is removed from any laborer who had it).
 */
export default function ManageSpecialtiesDialog({
  open,
  onClose,
  specialties,
  supabase,
  onChanged,
}: ManageSpecialtiesDialogProps) {
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleAdd = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    setError("");
    try {
      const maxOrder = specialties.reduce(
        (m, s) => Math.max(m, s.display_order),
        0
      );
      const { error: insErr } = await (
        supabase.from("labor_specialties") as any
      ).insert({ name, display_order: maxOrder + 10 });
      if (insErr) throw insErr;
      setNewName("");
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't add specialty");
    } finally {
      setBusy(false);
    }
  };

  const handleToggleActive = async (s: LaborSpecialty) => {
    setBusy(true);
    setError("");
    try {
      const { error: updErr } = await (
        supabase.from("labor_specialties") as any
      )
        .update({ is_active: !s.is_active })
        .eq("id", s.id);
      if (updErr) throw updErr;
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't update specialty");
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (s: LaborSpecialty) => {
    if (
      !window.confirm(
        `Delete "${s.name}"? It will be removed from any laborer tagged with it.`
      )
    ) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error: delErr } = await (
        supabase.from("labor_specialties") as any
      )
        .delete()
        .eq("id", s.id);
      if (delErr) throw delErr;
      onChanged();
    } catch (e: any) {
      setError(e?.message || "Couldn't delete specialty");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Manage specialties</DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
          <TextField
            fullWidth
            size="small"
            label="New specialty"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            disabled={busy}
          />
          <Button
            variant="contained"
            onClick={handleAdd}
            disabled={busy || !newName.trim()}
          >
            Add
          </Button>
        </Box>

        {error && (
          <Typography color="error" variant="caption" sx={{ display: "block", mb: 1 }}>
            {error}
          </Typography>
        )}

        <Stack spacing={0.5}>
          {specialties.length === 0 && (
            <Typography variant="body2" color="text.secondary">
              No specialties yet.
            </Typography>
          )}
          {specialties.map((s) => (
            <Box
              key={s.id}
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 1,
                py: 0.25,
              }}
            >
              <Typography
                variant="body2"
                sx={{
                  color: s.is_active ? "text.primary" : "text.disabled",
                  textDecoration: s.is_active ? "none" : "line-through",
                }}
              >
                {s.name}
              </Typography>
              <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                <Tooltip title={s.is_active ? "Active" : "Hidden"}>
                  <Switch
                    size="small"
                    checked={s.is_active}
                    onChange={() => handleToggleActive(s)}
                    disabled={busy}
                  />
                </Tooltip>
                <Tooltip title="Delete">
                  <span>
                    <IconButton
                      size="small"
                      color="error"
                      onClick={() => handleDelete(s)}
                      disabled={busy}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
              </Box>
            </Box>
          ))}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Done</Button>
      </DialogActions>
    </Dialog>
  );
}
