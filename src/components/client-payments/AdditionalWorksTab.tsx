"use client";

import React, { useState } from "react";
import {
  Box, Button, Chip, Paper, Stack, Typography,
  Table, TableBody, TableCell, TableHead, TableRow,
} from "@mui/material";
import { Add } from "@mui/icons-material";
import type { SiteAdditionalWork, AdditionalWorkStatus } from "@/types/site.types";
import { ADDITIONAL_WORK_STATUS_LABELS } from "@/types/site.types";
import { formatINR } from "@/components/payments/KpiTile";
import { formatDateDDMMMYY } from "@/lib/formatters";
import AdditionalWorkDialog from "./AdditionalWorkDialog";
import SiteClientLabel from "@/components/clients/SiteClientLabel";

const STATUS_COLOR: Record<AdditionalWorkStatus, "default" | "info" | "success" | "warning"> = {
  quoted: "default",
  confirmed: "info",
  paid: "success",
  cancelled: "warning",
};

export interface AdditionalWorksTabProps {
  siteId: string;
  works: SiteAdditionalWork[];
  paidByWorkId: Map<string, number>;
}

export function AdditionalWorksTab({ siteId, works, paidByWorkId }: AdditionalWorksTabProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SiteAdditionalWork | undefined>(undefined);

  const open = (work?: SiteAdditionalWork) => {
    setEditing(work);
    setDialogOpen(true);
  };

  return (
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography variant="subtitle1">Additional Works ({works.length})</Typography>
        <Button startIcon={<Add />} onClick={() => open()} variant="contained" size="small">
          Add Additional Work
        </Button>
      </Stack>

      {works.length === 0 ? (
        <Paper variant="outlined" sx={{ p: 3, textAlign: "center", color: "text.secondary" }}>
          <Typography>No additional works yet. Click &quot;Add Additional Work&quot; when client requests extra scope.</Typography>
        </Paper>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Title</TableCell>
                <TableCell align="right">Estimated</TableCell>
                <TableCell align="right">Confirmed</TableCell>
                <TableCell>Confirmed on</TableCell>
                <TableCell>Expected pay</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell>Status</TableCell>
                <TableCell />
              </TableRow>
            </TableHead>
            <TableBody>
              {works.map((w) => {
                const isCancelled = w.status === "cancelled";
                const sxRow = isCancelled
                  ? { textDecoration: "line-through", color: "text.disabled" }
                  : undefined;
                const paid = paidByWorkId.get(w.id) ?? 0;
                return (
                  <TableRow key={w.id} hover>
                    <TableCell sx={sxRow}>
                      <Box>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{w.title}</Typography>
                        {w.description && (
                          <Typography variant="caption" color="text.secondary">{w.description}</Typography>
                        )}
                        {(w.client_approved_by_id || w.client_approved_by) && (
                          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ mt: 0.5 }}>
                            <Typography variant="caption" color="text.secondary">Approved by</Typography>
                            <SiteClientLabel
                              siteId={siteId}
                              clientId={w.client_approved_by_id}
                              fallbackName={w.client_approved_by}
                              size={18}
                            />
                          </Stack>
                        )}
                      </Box>
                    </TableCell>
                    <TableCell align="right" sx={{ ...sxRow, fontVariantNumeric: "tabular-nums" }}>
                      {formatINR(Number(w.estimated_amount))}
                    </TableCell>
                    <TableCell align="right" sx={{ ...sxRow, fontVariantNumeric: "tabular-nums" }}>
                      {w.confirmed_amount == null ? "—" : formatINR(Number(w.confirmed_amount))}
                    </TableCell>
                    <TableCell sx={sxRow}>{formatDateDDMMMYY(w.confirmation_date)}</TableCell>
                    <TableCell sx={sxRow}>{formatDateDDMMMYY(w.expected_payment_date)}</TableCell>
                    <TableCell align="right" sx={{ ...sxRow, fontVariantNumeric: "tabular-nums" }}>
                      {formatINR(paid)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        color={STATUS_COLOR[w.status]}
                        label={ADDITIONAL_WORK_STATUS_LABELS[w.status]}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button size="small" onClick={() => open(w)}>Edit</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}

      <AdditionalWorkDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        siteId={siteId}
        initial={editing}
      />
    </Stack>
  );
}

export default AdditionalWorksTab;
