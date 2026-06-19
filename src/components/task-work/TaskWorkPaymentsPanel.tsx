"use client";

import React, { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Divider,
  Grid,
  IconButton,
  List,
  ListItem,
  ListItemText,
  Paper,
  Typography,
} from "@mui/material";
import { Add, Delete, ReceiptLong } from "@mui/icons-material";
import dayjs from "dayjs";
import {
  useTaskWorkPayments,
  useDeleteTaskWorkPayment,
} from "@/hooks/queries/useTaskWorkPayments";
import { formatPayerSource } from "@/lib/settlement/payerSource";
import {
  TASK_WORK_PAYMENT_MODE_LABEL,
  TASK_WORK_PAYMENT_TYPE_LABEL,
  type TaskWorkPackageWithMeta,
} from "@/types/taskWork.types";
import TaskWorkPaymentDialog from "./TaskWorkPaymentDialog";

interface Props {
  pkg: TaskWorkPackageWithMeta;
  canEdit: boolean;
}

const inr = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;

export default function TaskWorkPaymentsPanel({ pkg, canEdit }: Props) {
  const { data: payments = [], isLoading } = useTaskWorkPayments(pkg.id);
  const deleteMut = useDeleteTaskWorkPayment();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [defaultType, setDefaultType] = useState<"advance" | "final_settlement">(
    "advance"
  );

  const paid = useMemo(
    () => payments.reduce((s, p) => s + (p.amount || 0), 0),
    [payments]
  );
  const balance = (pkg.total_value || 0) - paid;

  const open = (type: "advance" | "final_settlement") => {
    setDefaultType(type);
    setDialogOpen(true);
  };

  return (
    <Box>
      <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2, mb: 1.5 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Price
            </Typography>
            <Typography variant="body1" fontWeight={700}>
              {inr(pkg.total_value)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Paid
            </Typography>
            <Typography variant="body1" fontWeight={700} color="success.main">
              {inr(paid)}
            </Typography>
          </Grid>
          <Grid size={{ xs: 4 }}>
            <Typography variant="caption" color="text.secondary">
              Balance
            </Typography>
            <Typography variant="body1" fontWeight={700} color="error.main">
              {inr(balance)}
            </Typography>
          </Grid>
        </Grid>
      </Paper>

      {canEdit && (
        <Box sx={{ display: "flex", gap: 1, mb: 1 }}>
          <Button
            fullWidth
            size="small"
            variant="outlined"
            startIcon={<Add />}
            onClick={() => open("advance")}
          >
            Advance
          </Button>
          <Button
            fullWidth
            size="small"
            variant="contained"
            onClick={() => open("final_settlement")}
          >
            Settle
          </Button>
        </Box>
      )}

      <Divider />

      {isLoading ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          Loading…
        </Typography>
      ) : payments.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 2 }}>
          No advances or settlement recorded yet. You can record payments even
          without a day log — handy for historical back-fill.
        </Typography>
      ) : (
        <List dense disablePadding>
          {payments.map((p) => {
            const src = formatPayerSource({
              payer_source: p.payer_source,
              payer_name: p.payer_name,
              payer_source_split: p.payer_source_split,
            });
            return (
              <ListItem
                key={p.id}
                disableGutters
                secondaryAction={
                  <Box sx={{ display: "flex", alignItems: "center" }}>
                    {p.proof_url && (
                      <IconButton
                        size="small"
                        component="a"
                        href={p.proof_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View payment screenshot"
                      >
                        <ReceiptLong fontSize="small" />
                      </IconButton>
                    )}
                    {canEdit && (
                      <IconButton
                        size="small"
                        color="error"
                        onClick={() => {
                          if (!confirm("Delete this payment?")) return;
                          deleteMut.mutate({
                            paymentId: p.id,
                            packageId: pkg.id,
                            siteId: pkg.site_id,
                            reason: "Removed by user",
                          });
                        }}
                      >
                        <Delete fontSize="small" />
                      </IconButton>
                    )}
                  </Box>
                }
              >
                <ListItemText
                  primary={
                    <Box
                      sx={{ display: "flex", alignItems: "center", gap: 1 }}
                      component="span"
                    >
                      <Typography variant="body2" fontWeight={700} component="span">
                        {inr(p.amount)}
                      </Typography>
                      <Chip
                        size="small"
                        variant="outlined"
                        label={TASK_WORK_PAYMENT_TYPE_LABEL[p.payment_type]}
                      />
                    </Box>
                  }
                  secondary={`${dayjs(p.payment_date).format("DD MMM YYYY")} · ${
                    TASK_WORK_PAYMENT_MODE_LABEL[p.payment_mode] ?? "Cash"
                  } · ${
                    p.payment_channel === "engineer_wallet"
                      ? "Engineer wallet"
                      : src.kind === "single"
                      ? src.label
                      : src.summary
                  }`}
                  secondaryTypographyProps={{ component: "div" }}
                />
              </ListItem>
            );
          })}
        </List>
      )}

      <TaskWorkPaymentDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        pkg={pkg}
        balanceDue={balance}
        defaultType={defaultType}
      />
    </Box>
  );
}
