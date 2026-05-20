"use client";

import { useState } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions,
  Button, FormControl, FormControlLabel, FormGroup, FormLabel,
  Checkbox, RadioGroup, Radio, Stack, Typography, TextField, Box,
} from "@mui/material";
import type {
  ExportColumnKey, ExportConfig, SettlementReportRow,
} from "@/types/settlementReport.types";
import { DEFAULT_EXPORT_COLUMNS } from "@/types/settlementReport.types";
import {
  buildCsvRows,
  buildExportFilename,
  downloadCsv,
} from "@/lib/utils/settlementReportExport";

const COLUMN_OPTIONS: { key: ExportColumnKey; label: string }[] = [
  { key: "date",         label: "Date / Week range" },
  { key: "site",         label: "Site name" },
  { key: "trade",        label: "Trade / Category" },
  { key: "subcontract",  label: "Subcontract title" },
  { key: "paid",         label: "Paid amount" },
  { key: "calc",         label: "Calculated amount" },
  { key: "diff",         label: "Diff (Paid − Calc)" },
  { key: "notes",        label: "Settlement notes" },
  { key: "payer_source", label: "Payer source (blank — RPC not yet returning)" },
  { key: "payment_mode", label: "Payment mode (blank — RPC not yet returning)" },
  { key: "created_by",   label: "Created by / at (blank — RPC not yet returning)" },
];

export interface SettlementReportExportDialogProps {
  open: boolean;
  onClose: () => void;
  rows: SettlementReportRow[];
  scopeLabel: string;
  dateFrom: string;
  dateTo: string;
}

export default function SettlementReportExportDialog(props: SettlementReportExportDialogProps) {
  const { open, onClose, rows, scopeLabel, dateFrom, dateTo } = props;

  const [config, setConfig] = useState<ExportConfig>({
    granularity: "weekly",
    layout: "wide",
    columns: [...DEFAULT_EXPORT_COLUMNS],
    includeLaborerBreakdown: false,
  });

  const filename = buildExportFilename({ scopeLabel, dateFrom, dateTo });

  const toggleColumn = (key: ExportColumnKey) => {
    setConfig((prev) => ({
      ...prev,
      columns: prev.columns.includes(key)
        ? prev.columns.filter((k) => k !== key)
        : [...prev.columns, key],
    }));
  };

  const handleDownload = () => {
    const csvRows = buildCsvRows(rows, config);
    downloadCsv(csvRows, filename);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>Export Settlement Report</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={3} sx={{ pt: 1 }}>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={4}>
            <FormControl>
              <FormLabel>Granularity</FormLabel>
              <RadioGroup
                row
                value={config.granularity}
                onChange={(e) => setConfig((p) => ({ ...p, granularity: e.target.value as "daily" | "weekly" }))}
              >
                <FormControlLabel value="weekly" control={<Radio />} label="Weekly" />
                <FormControlLabel
                  value="daily"
                  control={<Radio />}
                  disabled
                  label={
                    <Box component="span">
                      Daily{" "}
                      <Typography component="span" variant="caption" sx={{ color: "text.secondary" }}>
                        (Phase 2 — needs daily RPC)
                      </Typography>
                    </Box>
                  }
                />
              </RadioGroup>
            </FormControl>

            <FormControl>
              <FormLabel>Layout</FormLabel>
              <RadioGroup
                row
                value={config.layout}
                onChange={(e) => setConfig((p) => ({ ...p, layout: e.target.value as "wide" | "long" }))}
              >
                <FormControlLabel value="wide" control={<Radio />} label="Wide (per-site cols)" />
                <FormControlLabel value="long" control={<Radio />} label="Long (chronological)" />
              </RadioGroup>
            </FormControl>
          </Stack>

          <FormControl component="fieldset">
            <FormLabel>Columns</FormLabel>
            <FormGroup sx={{ mt: 1, display: "grid", gridTemplateColumns: { xs: "1fr", sm: "1fr 1fr" }, columnGap: 2 }}>
              {COLUMN_OPTIONS.map((opt) => (
                <FormControlLabel
                  key={opt.key}
                  control={
                    <Checkbox
                      checked={config.columns.includes(opt.key)}
                      onChange={() => toggleColumn(opt.key)}
                    />
                  }
                  label={opt.label}
                />
              ))}
            </FormGroup>
          </FormControl>

          <TextField
            label="Filename"
            value={filename}
            slotProps={{ input: { readOnly: true } }}
            size="small"
          />

          <Typography variant="caption" color="text.secondary">
            {rows.length} settlement row{rows.length === 1 ? "" : "s"} match the current filters.
          </Typography>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleDownload} disabled={rows.length === 0}>
          Download CSV
        </Button>
      </DialogActions>
    </Dialog>
  );
}
