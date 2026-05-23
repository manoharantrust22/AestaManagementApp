"use client";

import React from "react";
import {
  Box,
  Button,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import {
  Add as AddIcon,
  Close as CloseIcon,
  CallSplit as SplitIcon,
} from "@mui/icons-material";
import PayerSourceSelector from "./PayerSourceSelector";
import type {
  PayerSourceInput,
  PayerSourceSplitRow,
  PayerSource,
} from "@/types/settlement.types";

interface Props {
  value: PayerSourceInput;
  onChange: (next: PayerSourceInput) => void;
  total: number;
  siteId?: string;
  disabled?: boolean;
}

function defaultSplitFrom(single: { source: PayerSource; name?: string }): PayerSourceInput {
  return {
    mode: "split",
    rows: [
      { source: single.source, name: single.name, amount: 0 },
      { source: "trust_account", amount: 0 },
    ],
  };
}

export default function PayerSourceSplitInput({
  value,
  onChange,
  total,
  siteId,
  disabled,
}: Props) {
  if (value.mode === "single") {
    return (
      <Stack spacing={1}>
        <PayerSourceSelector
          value={value.source}
          customName={value.name ?? ""}
          onChange={(source) => onChange({ ...value, source })}
          onCustomNameChange={(name) => onChange({ ...value, name })}
          siteId={siteId}
          disabled={disabled}
        />
        <Button
          size="small"
          startIcon={<SplitIcon fontSize="small" />}
          onClick={() => onChange(defaultSplitFrom(value))}
          sx={{ alignSelf: "flex-start", textTransform: "none" }}
          disabled={disabled}
        >
          Split across sources
        </Button>
      </Stack>
    );
  }

  const rows = value.rows;
  const sum = rows.reduce((a, r) => a + (Number.isFinite(r.amount) ? r.amount : 0), 0);
  const diff = total - sum;
  const within1 = Math.abs(diff) <= 1;
  const status = within1
    ? { text: "OK", color: "success.main" as const }
    : diff > 0
    ? { text: `Remaining: ₹${Math.round(diff).toLocaleString("en-IN")}`, color: "text.secondary" as const }
    : { text: `Over by: ₹${Math.round(-diff).toLocaleString("en-IN")}`, color: "error.main" as const };

  function updateRow(i: number, patch: Partial<PayerSourceSplitRow>) {
    const next = rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r));
    onChange({ mode: "split", rows: next });
  }
  function removeRow(i: number) {
    if (rows.length <= 2) return;
    onChange({ mode: "split", rows: rows.filter((_, idx) => idx !== i) });
  }
  function addRow() {
    if (rows.length >= 3) return;
    onChange({
      mode: "split",
      rows: [...rows, { source: "own_money", amount: 0 }],
    });
  }
  function turnOff() {
    onChange({ mode: "single", source: rows[0].source, name: rows[0].name });
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Typography variant="subtitle2">Payment Sources (split)</Typography>
        <Button
          size="small"
          onClick={turnOff}
          sx={{ textTransform: "none" }}
          disabled={disabled}
        >
          Use a single source
        </Button>
      </Box>

      {rows.map((row, i) => (
        <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
          <Box sx={{ flex: 1 }}>
            <PayerSourceSelector
              value={row.source}
              customName={row.name ?? ""}
              onChange={(source) => updateRow(i, { source })}
              onCustomNameChange={(name) => updateRow(i, { name })}
              siteId={siteId}
              disabled={disabled}
              compact
            />
          </Box>
          <TextField
            label={`Row ${i + 1} amount`}
            size="small"
            type="number"
            inputProps={{ min: 0, step: 1, inputMode: "numeric" }}
            value={Number.isFinite(row.amount) && row.amount !== 0 ? row.amount : ""}
            onChange={(e) => updateRow(i, { amount: Number(e.target.value) || 0 })}
            sx={{ width: 130 }}
            disabled={disabled}
          />
          {rows.length > 2 && (
            <IconButton
              size="small"
              onClick={() => removeRow(i)}
              aria-label={`remove row ${i + 1}`}
              disabled={disabled}
            >
              <CloseIcon fontSize="small" />
            </IconButton>
          )}
        </Stack>
      ))}

      {rows.length < 3 && (
        <Button
          size="small"
          startIcon={<AddIcon fontSize="small" />}
          onClick={addRow}
          sx={{ alignSelf: "flex-start", textTransform: "none" }}
          disabled={disabled}
        >
          Add another source
        </Button>
      )}

      <Typography variant="caption" sx={{ color: status.color, fontWeight: 500 }}>
        {status.text}
      </Typography>
    </Stack>
  );
}
