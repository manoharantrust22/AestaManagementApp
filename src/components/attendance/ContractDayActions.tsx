"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  IconButton,
  Tooltip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from "@mui/material";
import {
  Edit as EditIcon,
  DeleteOutline as DeleteIcon,
  ArrowForward as ArrowForwardIcon,
} from "@mui/icons-material";
import TaskWorkDayLogDialog from "@/components/task-work/TaskWorkDayLogDialog";
import { useDeleteTaskWorkDayLog } from "@/hooks/queries/useTaskWorkDayLogs";
import {
  contractItemHref,
  type ContractPresenceItem,
} from "@/lib/utils/contractPresenceUtils";

interface Props {
  item: ContractPresenceItem;
  /** When false, only the "View" deep-link is shown (no edit/delete). */
  canEdit?: boolean;
  /** Optional toast hook from the host page. */
  notify?: (message: string, severity?: "success" | "error") => void;
}

/**
 * Row actions for a single contract-presence item, shared by the attendance and
 * tea-shop contract rows.
 *
 * - `kind: "package"` (fixed-price task work): Edit + Delete open the SAME
 *   TaskWorkDayLogDialog / delete mutation used on /site/trades, so an edit here
 *   reflects there (and back — the mutations invalidate ["contract-presence"]).
 * - `kind: "subcontract"` (legacy headcount): no per-type/rate breakdown exists,
 *   so only a View deep-link is offered.
 */
export default function ContractDayActions({ item, canEdit = true, notify }: Props) {
  const router = useRouter();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const deleteMut = useDeleteTaskWorkDayLog();

  const isPackage = item.kind === "package";
  const canEditPackage = canEdit && isPackage && !!item.dayLog && !!item.siteId;

  const handleDelete = async () => {
    if (!item.dayLog || !item.siteId) return;
    try {
      await deleteMut.mutateAsync({
        id: item.dayLog.id,
        packageId: item.id,
        siteId: item.siteId,
      });
      notify?.("Contract day log deleted", "success");
      setConfirmOpen(false);
    } catch (e: any) {
      notify?.(e?.message || "Failed to delete the day log", "error");
    }
  };

  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 0.25 }}>
      {canEditPackage && (
        <Tooltip title="Edit contract day">
          <IconButton
            size="small"
            onClick={(e) => {
              e.stopPropagation();
              setEditOpen(true);
            }}
          >
            <EditIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      {canEditPackage && (
        <Tooltip title="Delete contract day">
          <IconButton
            size="small"
            color="error"
            onClick={(e) => {
              e.stopPropagation();
              setConfirmOpen(true);
            }}
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      )}

      <Tooltip title="Open contract">
        <IconButton
          size="small"
          onClick={(e) => {
            e.stopPropagation();
            router.push(contractItemHref(item));
          }}
        >
          <ArrowForwardIcon fontSize="small" />
        </IconButton>
      </Tooltip>

      {canEditPackage && item.dayLog && item.siteId && (
        <TaskWorkDayLogDialog
          open={editOpen}
          onClose={() => setEditOpen(false)}
          packageId={item.id}
          siteId={item.siteId}
          laborCategoryId={item.tradeCategoryId}
          editing={item.dayLog}
        />
      )}

      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>Delete this contract day?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This removes the day log for <strong>{item.title}</strong>. If it was
            auto-derived from attendance, it will come back next time attendance for
            this day changes.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={handleDelete}
            disabled={deleteMut.isPending}
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
