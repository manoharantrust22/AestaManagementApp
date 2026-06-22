"use client";

import { useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  TextField,
  Typography,
} from "@mui/material";
import CallMerge from "@mui/icons-material/CallMerge";
import type { WorkspaceTask } from "@/lib/workforce/workspaceModel";
import { usePromoteToParentContract } from "@/hooks/queries/useParentContract";
import { formatCurrencyFull } from "@/lib/formatters";
import { wsColors, wsRadius } from "@/lib/workforce/workspaceTokens";

interface Props {
  open: boolean;
  onClose: () => void;
  siteId: string;
  tradeCategoryId: string;
  tradeName: string;
  /** The contractor's display name (e.g. "Jithin"). */
  contractorName: string;
  /** The contracts to fold under the new parent. */
  tasks: WorkspaceTask[];
  onPromoted?: (parentId: string) => void;
}

/**
 * "Make this one contract" — promotes a contractor's separate contracts (the floors)
 * into a single named PARENT contract, keeping the floors as optional children. The
 * "Move existing records" option re-points every past expense / salary / attendance
 * from the floors onto the parent (reversible). Backed by promote_to_parent_contract.
 */
export default function NameCombinedContractDialog({
  open,
  onClose,
  siteId,
  tradeCategoryId,
  tradeName,
  contractorName,
  tasks,
  onPromoted,
}: Props) {
  const promote = usePromoteToParentContract(siteId);
  const [name, setName] = useState("");
  const [moveRecords, setMoveRecords] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) {
      setName(`${contractorName} ${tradeName} contract`.trim());
      setMoveRecords(true);
      setError("");
    }
  }, [open, contractorName, tradeName]);

  const handleConfirm = async () => {
    if (!name.trim()) {
      setError("Give the combined contract a name.");
      return;
    }
    setError("");
    try {
      const parentId = await promote.mutateAsync({
        siteId,
        tradeCategoryId,
        parentTitle: name,
        childIds: tasks.map((t) => t.id),
        moveRecords,
      });
      onPromoted?.(parentId);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? "Couldn't combine these into one contract.");
    }
  };

  const saving = promote.isPending;
  const total = tasks.reduce((s, t) => s + t.quoted, 0);

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
        <CallMerge sx={{ fontSize: 22, color: wsColors.primary }} />
        Make this one contract
      </DialogTitle>
      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 2, mt: 0.5 }}>
          <Typography sx={{ fontSize: 13, color: wsColors.muted }}>
            Combine {contractorName}&apos;s {tasks.length} {tradeName} works into one named contract. The works
            below stay as optional floors you can still pick when you want that detail.
          </Typography>

          <TextField
            label="Contract name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            fullWidth
            autoFocus
            slotProps={{ htmlInput: { maxLength: 200 } }}
          />

          <Box
            sx={{
              border: `1px solid ${wsColors.hairline}`,
              borderRadius: `${wsRadius.card}px`,
              overflow: "hidden",
            }}
          >
            <Box sx={{ px: 1.5, py: 0.75, bgcolor: wsColors.canvas }}>
              <Typography sx={{ fontSize: 11, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: wsColors.muted2 }}>
                Floors to combine · {formatCurrencyFull(total)}
              </Typography>
            </Box>
            {tasks.map((t, i) => (
              <Box
                key={t.id}
                sx={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 1,
                  px: 1.5,
                  py: 0.85,
                  borderTop: i === 0 ? "none" : `1px solid ${wsColors.hairline2}`,
                }}
              >
                <Typography noWrap sx={{ fontSize: 13, color: wsColors.ink, minWidth: 0 }}>
                  {t.title}
                </Typography>
                <Typography sx={{ fontSize: 12.5, color: wsColors.muted, flexShrink: 0 }}>
                  {formatCurrencyFull(t.quoted)}
                </Typography>
              </Box>
            ))}
          </Box>

          <FormControlLabel
            control={
              <Checkbox checked={moveRecords} onChange={(e) => setMoveRecords(e.target.checked)} />
            }
            label={
              <Box component="span">
                <Typography component="span" sx={{ fontSize: 13.5, fontWeight: 700, color: wsColors.ink }}>
                  Move existing records onto the combined contract
                </Typography>
                <Typography sx={{ fontSize: 11.5, color: wsColors.muted }}>
                  Past expenses, salary and attendance move from the floors to the one contract. Reversible.
                </Typography>
              </Box>
            }
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
        <Button variant="contained" onClick={handleConfirm} disabled={saving || tasks.length < 2}>
          {saving ? "Combining…" : "Combine"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
