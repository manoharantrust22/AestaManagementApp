"use client";

import {
  Box,
  Paper,
  Stack,
  Typography,
  Chip,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Alert,
} from "@mui/material";
import {
  Summarize as SummarizeIcon,
  WarningAmber as WarningIcon,
} from "@mui/icons-material";
import { LegacyExpenseSummary } from "@/types/mass-upload.types";

const PAYER_LABELS: Record<string, string> = {
  own_money: "Own Money",
  amma_money: "Amma Money",
  client_money: "Client Money",
  trust_account: "Trust Account",
  other_site_money: "Other Site",
  custom: "Other",
  unspecified: "Unspecified",
};

const inr = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `₹${Math.round(n).toLocaleString("en-IN")}`;

function Kpi({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <Box sx={{ minWidth: 120 }}>
      <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Typography variant="h6" fontWeight={700} sx={{ color: accent }}>
        {value}
      </Typography>
    </Box>
  );
}

export function LegacyExpenseSummaryPanel({ summary }: { summary: LegacyExpenseSummary }) {
  const { dateRange } = summary;
  const dateRangeLabel =
    dateRange.min && dateRange.max
      ? dateRange.min === dateRange.max
        ? dateRange.min
        : `${dateRange.min} → ${dateRange.max}`
      : "—";

  return (
    <Paper variant="outlined" sx={{ p: 2.5, borderColor: "primary.light", bgcolor: "primary.50" }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={1.5}>
        <SummarizeIcon color="primary" />
        <Typography variant="subtitle1" fontWeight={700}>
          Import summary (preview)
        </Typography>
      </Stack>

      {/* KPI row */}
      <Stack direction="row" flexWrap="wrap" gap={3} mb={2}>
        <Kpi label="Total to import" value={inr(summary.totalSpent)} accent="primary.main" />
        <Kpi label="Records" value={String(summary.count)} />
        <Kpi label="Date range" value={dateRangeLabel} />
        <Kpi label="Subcontracts" value={String(summary.bySubcontract.filter((s) => s.matched).length)} />
      </Stack>

      {summary.rowsOnOrAfterCutoff > 0 && (
        <Alert severity="warning" icon={<WarningIcon />} sx={{ mb: 2 }}>
          {summary.rowsOnOrAfterCutoff} row(s) are dated on/after the legacy cutoff. They will still
          import — confirm they belong in the legacy period.
        </Alert>
      )}

      <Stack direction={{ xs: "column", md: "row" }} spacing={2} divider={<Divider orientation="vertical" flexItem />}>
        {/* By category */}
        <Box flex={1}>
          <Typography variant="subtitle2" gutterBottom>
            By category
          </Typography>
          <Table size="small">
            <TableBody>
              {summary.byCategory.map((c) => (
                <TableRow key={c.categoryId ?? "uncat"}>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    {c.name}{" "}
                    <Typography component="span" variant="caption" color="text.secondary">
                      ({c.count})
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ border: 0, py: 0.5, fontWeight: 600 }}>
                    {inr(c.total)}
                  </TableCell>
                </TableRow>
              ))}
              {summary.byCategory.length === 0 && (
                <TableRow>
                  <TableCell sx={{ border: 0, color: "text.secondary" }}>No rows</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Box>

        {/* By payer source */}
        <Box flex={1}>
          <Typography variant="subtitle2" gutterBottom>
            By payment source
          </Typography>
          <Table size="small">
            <TableBody>
              {summary.byPayerSource.map((p) => (
                <TableRow key={p.payerSource}>
                  <TableCell sx={{ border: 0, py: 0.5 }}>
                    {PAYER_LABELS[p.payerSource] ?? p.payerSource}{" "}
                    <Typography component="span" variant="caption" color="text.secondary">
                      ({p.count})
                    </Typography>
                  </TableCell>
                  <TableCell align="right" sx={{ border: 0, py: 0.5, fontWeight: 600 }}>
                    {inr(p.total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      </Stack>

      {/* By subcontract */}
      {summary.bySubcontract.length > 0 && (
        <Box mt={2}>
          <Typography variant="subtitle2" gutterBottom>
            By subcontract{" "}
            <Typography component="span" variant="caption" color="text.secondary">
              (balance shown is for this import only)
            </Typography>
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Subcontract</TableCell>
                <TableCell align="right">Imported spend</TableCell>
                <TableCell align="right">Contract value</TableCell>
                <TableCell align="right">Balance (as imported)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {summary.bySubcontract.map((s) => (
                <TableRow key={s.subcontractId ?? "none"}>
                  <TableCell>
                    {s.title}
                    {!s.matched && (
                      <Chip label="unlinked" size="small" color="default" sx={{ ml: 1 }} variant="outlined" />
                    )}
                  </TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {inr(s.importedSpend)}
                  </TableCell>
                  <TableCell align="right">{inr(s.value)}</TableCell>
                  <TableCell
                    align="right"
                    sx={{ color: s.balance !== null && s.balance < 0 ? "error.main" : undefined }}
                  >
                    {inr(s.balance)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Paper>
  );
}

export default LegacyExpenseSummaryPanel;
