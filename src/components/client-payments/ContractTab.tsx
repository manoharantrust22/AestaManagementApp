"use client";

import React from "react";
import {
  Stack, Typography, Paper, Button, Alert,
  Table, TableBody, TableCell, TableHead, TableRow, Chip,
} from "@mui/material";
import type { Database } from "@/types/database.types";
import { formatINR } from "@/components/payments/KpiTile";
import { formatDateDDMMMYY } from "@/lib/formatters";
import SiteClientsCard from "@/components/clients/SiteClientsCard";

type PaymentPhase = Database["public"]["Tables"]["payment_phases"]["Row"];

export interface ContractTabProps {
  siteId: string;
  baseContract: number;
  contractDocumentUrl: string | null;
  phases: PaymentPhase[];
  paidByPhaseId: Map<string, number>;
}

export function ContractTab({
  siteId,
  baseContract,
  contractDocumentUrl,
  phases,
  paidByPhaseId,
}: ContractTabProps) {
  return (
    <Stack spacing={2}>
      <Paper variant="outlined" sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary">Base Contract</Typography>
        <Typography variant="h5" sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
          {formatINR(baseContract)}
        </Typography>
        {contractDocumentUrl && (
          <Button size="small" component="a" href={contractDocumentUrl} target="_blank" rel="noopener noreferrer" sx={{ mt: 0.5 }}>
            View contract document
          </Button>
        )}
        <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>
          Edit base contract amount on Company → Sites.
        </Typography>
      </Paper>

      <SiteClientsCard siteId={siteId} />

      <Typography variant="subtitle1">Payment Phases ({phases.length})</Typography>

      {phases.length === 0 ? (
        <Alert severity="info">
          No phases configured. Treating base contract as a single line item.
        </Alert>
      ) : (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Phase</TableCell>
                <TableCell align="right">Amount</TableCell>
                <TableCell>Expected</TableCell>
                <TableCell align="right">Paid</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {phases.map((phase) => {
                const paid = paidByPhaseId.get(phase.id) ?? 0;
                const phaseAmount = Number(phase.amount ?? 0);
                const settled = phaseAmount > 0 && paid >= phaseAmount;
                return (
                  <TableRow key={phase.id} hover>
                    <TableCell>{phase.phase_name ?? `Phase ${phase.sequence_order ?? ""}`}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatINR(phaseAmount)}
                    </TableCell>
                    <TableCell>{formatDateDDMMMYY(phase.expected_date)}</TableCell>
                    <TableCell align="right" sx={{ fontVariantNumeric: "tabular-nums" }}>
                      {formatINR(paid)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={settled ? "Settled" : "Pending"}
                        color={settled ? "success" : "default"}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

export default ContractTab;
