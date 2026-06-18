"use client";

import { Fragment, useState } from "react";
import {
  Box,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Button,
  Stack,
  Typography,
  Collapse,
  Alert,
  CircularProgress,
  Tooltip,
} from "@mui/material";
import {
  Undo as RevokeIcon,
  Restore as RestoreIcon,
  DeleteForever as PurgeIcon,
  ExpandMore as ExpandIcon,
  ExpandLess as CollapseIcon,
} from "@mui/icons-material";
import { ImportBatch } from "@/types/mass-upload.types";
import { useImportBatches } from "@/hooks/queries/useImportBatches";
import {
  useRevertImportBatch,
  useRestoreImportBatch,
  usePurgeImportBatch,
} from "@/hooks/mutations/useImportBatchMutations";
import { LegacyExpenseSummaryPanel } from "./LegacyExpenseSummaryPanel";
import { ImportBatchActionsDialog, BatchAction } from "./ImportBatchActionsDialog";

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;

function statusChip(status: ImportBatch["status"]) {
  switch (status) {
    case "committed":
      return <Chip label="Live" color="success" size="small" />;
    case "reverted":
      return <Chip label="Revoked" color="warning" size="small" variant="outlined" />;
    case "purged":
      return <Chip label="Purged" color="default" size="small" variant="outlined" />;
  }
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

/** A clean period label: a single month reads as "Dec 2024"; a span as "min → max". */
function periodLabel(range?: { min: string | null; max: string | null } | null) {
  if (!range?.min || !range?.max) return "—";
  const monthOf = (d: string) =>
    new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
  if (range.min.slice(0, 7) === range.max.slice(0, 7)) return monthOf(range.min);
  return `${range.min} → ${range.max}`;
}

export function ImportHistoryList() {
  const { data: batches, isLoading, error } = useImportBatches();
  const revert = useRevertImportBatch();
  const restore = useRestoreImportBatch();
  const purge = usePurgeImportBatch();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ action: BatchAction; batch: ImportBatch } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const busy = revert.isPending || restore.isPending || purge.isPending;

  const runAction = async (reason: string | null) => {
    if (!dialog) return;
    setActionError(null);
    try {
      if (dialog.action === "revert") {
        await revert.mutateAsync({ batchId: dialog.batch.id, reason });
      } else if (dialog.action === "restore") {
        await restore.mutateAsync({ batchId: dialog.batch.id });
      } else {
        await purge.mutateAsync({ batchId: dialog.batch.id });
      }
      setDialog(null);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Action failed");
    }
  };

  if (isLoading) {
    return (
      <Box display="flex" justifyContent="center" py={6}>
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return <Alert severity="error">Failed to load import history: {(error as Error).message}</Alert>;
  }

  if (!batches || batches.length === 0) {
    return (
      <Paper variant="outlined" sx={{ p: 4, textAlign: "center" }}>
        <Typography color="text.secondary">No bulk imports yet.</Typography>
      </Paper>
    );
  }

  return (
    <>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell />
              <TableCell>Import</TableCell>
              <TableCell>Site</TableCell>
              <TableCell align="right">Records</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Period</TableCell>
              <TableCell>Status</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {batches.map((b) => {
              const open = expanded === b.id;
              const range = b.summary?.dateRange;
              return (
                <Fragment key={b.id}>
                  <TableRow hover>
                    <TableCell>
                      <IconButton size="small" onClick={() => setExpanded(open ? null : b.id)}>
                        {open ? <CollapseIcon /> : <ExpandIcon />}
                      </IconButton>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight={600}>
                        {b.file_name || "Untitled CSV"}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {fmtDate(b.created_at)} · {b.created_by_name || "—"}
                      </Typography>
                    </TableCell>
                    <TableCell>{b.site_name || "—"}</TableCell>
                    <TableCell align="right">{b.inserted_count}</TableCell>
                    <TableCell align="right">{inr(b.summary?.totalSpent)}</TableCell>
                    <TableCell>{periodLabel(range)}</TableCell>
                    <TableCell>{statusChip(b.status)}</TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                        {b.status === "committed" && (
                          <Tooltip title="Revoke (hide this batch)">
                            <IconButton
                              size="small"
                              color="warning"
                              onClick={() => {
                                setActionError(null);
                                setDialog({ action: "revert", batch: b });
                              }}
                            >
                              <RevokeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {b.status === "reverted" && (
                          <Tooltip title="Restore (un-hide this batch)">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => {
                                setActionError(null);
                                setDialog({ action: "restore", batch: b });
                              }}
                            >
                              <RestoreIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                        {b.status !== "purged" && (
                          <Tooltip title="Purge permanently (delete)">
                            <IconButton
                              size="small"
                              color="error"
                              onClick={() => {
                                setActionError(null);
                                setDialog({ action: "purge", batch: b });
                              }}
                            >
                              <PurgeIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell colSpan={8} sx={{ py: 0, border: 0 }}>
                      <Collapse in={open} unmountOnExit>
                        <Box sx={{ py: 2 }}>
                          {b.revert_reason && (
                            <Alert severity="warning" sx={{ mb: 2 }}>
                              Revoked: {b.revert_reason}
                            </Alert>
                          )}
                          {b.summary ? (
                            <LegacyExpenseSummaryPanel summary={b.summary} />
                          ) : (
                            <Typography variant="body2" color="text.secondary">
                              No financial summary stored for this batch.
                            </Typography>
                          )}
                        </Box>
                      </Collapse>
                    </TableCell>
                  </TableRow>
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>

      <ImportBatchActionsDialog
        open={Boolean(dialog)}
        action={dialog?.action ?? "revert"}
        batch={dialog?.batch ?? null}
        busy={busy}
        errorText={actionError}
        onClose={() => setDialog(null)}
        onConfirm={runAction}
      />
    </>
  );
}

export default ImportHistoryList;
