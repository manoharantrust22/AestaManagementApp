"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Alert,
  Box,
  Stack,
  CircularProgress,
} from "@mui/material";
import Handshake from "@mui/icons-material/Handshake";
import { useConvertTaskToPackage } from "@/hooks/queries/useTaskWorkPackages";

/**
 * Confirms converting a fixed-price subcontract TASK into a task-work PACKAGE so
 * it adopts the standardized Day-Log + Extras + Payments screen (like Barun's).
 *
 * The actual move is one atomic RPC (convert_subcontract_task_to_package). It
 * refuses cleanly if the task carries data (children, packages, day-entries, or
 * payments) — that reason is shown inline so the user knows what to clear first.
 */
export function ConvertToPackageDialog({
  open,
  onClose,
  subcontractId,
  taskTitle,
  siteId,
  onConverted,
}: {
  open: boolean;
  onClose: () => void;
  subcontractId: string;
  taskTitle: string;
  siteId: string;
  /** Called with the new package id once the conversion lands. */
  onConverted: (packageId: string) => void;
}) {
  const convert = useConvertTaskToPackage();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const handleConfirm = async () => {
    setError(null);
    try {
      const pkgId = await convert.mutateAsync({ subcontractId, siteId });
      onConverted(pkgId);
      onClose();
    } catch (e) {
      setError((e as Error).message || "Couldn't convert this task.");
    }
  };

  const saving = convert.isPending;

  return (
    <Dialog open={open} onClose={saving ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Handshake fontSize="small" color="primary" />
          <span>Convert to fixed-price package</span>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 1.5 }}>
          Turn <strong>{taskTitle}</strong> into a fixed-price package so it shows the
          same screen as Barun&apos;s contract.
        </Typography>
        <Box component="ul" sx={{ pl: 2.5, m: 0, color: "text.secondary" }}>
          <li>
            <Typography variant="caption">
              It keeps its place in the tree (same parent) and its agreed price.
            </Typography>
          </li>
          <li>
            <Typography variant="caption">
              The &ldquo;count labourers by role&rdquo; screen is replaced by the{" "}
              <strong>Day Log</strong> (effort vs price) + Extras + Payments. Days
              you&apos;ve already counted are carried into the Day Log.
            </Typography>
          </li>
          <li>
            <Typography variant="caption">
              You can&apos;t undo this in one tap.
            </Typography>
          </li>
        </Box>

        {error && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {error}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button
          onClick={handleConfirm}
          variant="contained"
          disabled={saving}
          startIcon={saving ? <CircularProgress size={16} /> : <Handshake />}
        >
          {saving ? "Converting…" : "Convert"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
