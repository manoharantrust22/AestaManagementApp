"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  Chip,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Check as CheckIcon,
  Close as CloseIcon,
  DeleteOutline as DeleteIcon,
} from "@mui/icons-material";
import dayjs from "dayjs";
import {
  useTaskWorkVariations,
  useDecideTaskWorkVariation,
  useDeleteTaskWorkVariation,
} from "@/hooks/queries/useTaskWorkVariations";
import type {
  TaskWorkVariation,
  TaskWorkVariationStatus,
} from "@/types/taskWork.types";
import TaskWorkVariationDialog from "./TaskWorkVariationDialog";

interface Props {
  packageId: string;
  siteId: string;
  canEdit: boolean;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const STATUS_CHIP: Record<
  TaskWorkVariationStatus,
  { label: string; color: "warning" | "success" | "default" }
> = {
  pending: { label: "Pending", color: "warning" },
  approved: { label: "Approved", color: "success" },
  rejected: { label: "Rejected", color: "default" },
};

/**
 * Extras (variations) list for a package: record an extra-money request, then
 * approve (adds to the agreed amount) or reject it with a note. Lives under the
 * "Money vs work" card in the Overview tab.
 */
export default function TaskWorkVariationsSection({
  packageId,
  siteId,
  canEdit,
}: Props) {
  const { data: variations = [] } = useTaskWorkVariations(packageId);
  const decideMut = useDecideTaskWorkVariation();
  const deleteMut = useDeleteTaskWorkVariation();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectNote, setRejectNote] = useState("");

  const today = dayjs().format("YYYY-MM-DD");

  const approve = (v: TaskWorkVariation) =>
    decideMut.mutate({
      id: v.id,
      packageId,
      siteId,
      status: "approved",
      decided_date: today,
    });

  const confirmReject = (v: TaskWorkVariation) => {
    decideMut.mutate(
      {
        id: v.id,
        packageId,
        siteId,
        status: "rejected",
        decided_date: today,
        decided_note: rejectNote.trim() || null,
      },
      {
        onSuccess: () => {
          setRejectingId(null);
          setRejectNote("");
        },
      }
    );
  };

  return (
    <Box>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          mb: 1,
        }}
      >
        <Typography variant="subtitle2">Extras</Typography>
        {canEdit && (
          <Button size="small" startIcon={<AddIcon />} onClick={() => setDialogOpen(true)}>
            Record extra work
          </Button>
        )}
      </Box>

      {variations.length === 0 ? (
        <Typography variant="body2" color="text.secondary">
          No extras yet. If the maistry asks for more money as the scope grows,
          record it here so it can be reviewed and added to the agreed amount.
        </Typography>
      ) : (
        <Stack spacing={1}>
          {variations.map((v) => {
            const chip = STATUS_CHIP[v.status];
            const isRejecting = rejectingId === v.id;
            return (
              <Box
                key={v.id}
                sx={{ p: 1.25, borderRadius: 1.5, border: 1, borderColor: "divider" }}
              >
                <Box
                  sx={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 1,
                  }}
                >
                  <Typography variant="body2" fontWeight={700}>
                    {inr(v.amount)}
                  </Typography>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
                    <Chip size="small" label={chip.label} color={chip.color} />
                    {canEdit && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => deleteMut.mutate({ id: v.id, packageId, siteId })}
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                </Box>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 0.25 }}>
                  {v.reason}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Asked {dayjs(v.requested_date).format("DD MMM YYYY")}
                  {v.status !== "pending" && v.decided_date
                    ? ` · ${chip.label.toLowerCase()} ${dayjs(v.decided_date).format(
                        "DD MMM"
                      )}`
                    : ""}
                  {v.decided_note ? ` · ${v.decided_note}` : ""}
                </Typography>

                {canEdit && v.status === "pending" && !isRejecting && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
                    <Button
                      size="small"
                      variant="contained"
                      color="success"
                      startIcon={<CheckIcon />}
                      disabled={decideMut.isPending}
                      onClick={() => approve(v)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="inherit"
                      startIcon={<CloseIcon />}
                      onClick={() => {
                        setRejectingId(v.id);
                        setRejectNote("");
                      }}
                    >
                      Reject
                    </Button>
                  </Stack>
                )}

                {canEdit && isRejecting && (
                  <Stack direction="row" spacing={1} sx={{ mt: 1 }} alignItems="center">
                    <TextField
                      size="small"
                      placeholder="Reason for rejecting (optional)"
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      fullWidth
                    />
                    <Button
                      size="small"
                      variant="contained"
                      color="error"
                      disabled={decideMut.isPending}
                      onClick={() => confirmReject(v)}
                    >
                      Confirm
                    </Button>
                    <Button size="small" onClick={() => setRejectingId(null)}>
                      Cancel
                    </Button>
                  </Stack>
                )}
              </Box>
            );
          })}
        </Stack>
      )}

      <TaskWorkVariationDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        packageId={packageId}
        siteId={siteId}
      />
    </Box>
  );
}
