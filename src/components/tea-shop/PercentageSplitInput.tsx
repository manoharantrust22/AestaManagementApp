"use client";

import React from "react";
import {
  Box,
  TextField,
  Typography,
  InputAdornment,
  Button,
  Alert,
  Grid,
} from "@mui/material";
import {
  Person as PersonIcon,
  Work as WorkIcon,
  Store as StoreIcon,
  CheckCircle as CheckIcon,
  Error as ErrorIcon,
} from "@mui/icons-material";
interface LaborGroupPercentageSplit {
  daily: number;
  contract: number;
  market: number;
}

interface PercentageSplitInputProps {
  daily: number;
  contract: number;
  market: number;
  totalCost: number;
  onChange: (split: LaborGroupPercentageSplit) => void;
  disabled?: boolean;
}

const PRESETS = [
  { label: "Equal", daily: 33, contract: 34, market: 33 },
  { label: "More Contract", daily: 25, contract: 50, market: 25 },
  { label: "More Daily", daily: 50, contract: 30, market: 20 },
];

export default function PercentageSplitInput({
  daily,
  contract,
  market,
  totalCost,
  onChange,
  disabled = false,
}: PercentageSplitInputProps) {
  const sum = daily + contract + market;
  const isValid = sum === 100;

  const handleChange = (
    type: "daily" | "contract" | "market",
    value: string
  ) => {
    const numValue = Math.max(0, Math.min(100, parseInt(value) || 0));
    onChange({
      daily: type === "daily" ? numValue : daily,
      contract: type === "contract" ? numValue : contract,
      market: type === "market" ? numValue : market,
    });
  };

  const applyPreset = (preset: (typeof PRESETS)[0]) => {
    onChange({
      daily: preset.daily,
      contract: preset.contract,
      market: preset.market,
    });
  };

  const calculateAmount = (percentage: number): string => {
    if (totalCost <= 0) return "₹0";
    return `₹${Math.round((percentage / 100) * totalCost).toLocaleString()}`;
  };

  return (
    <Box>
      <Typography variant="subtitle2" sx={{ mb: 1.5, fontWeight: 600 }}>
        Split by Labor Group
      </Typography>

      <Grid container spacing={2}>
        {/* Daily Laborers */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <PersonIcon color="primary" fontSize="small" />
            <TextField
              label="Daily Laborers"
              type="number"
              size="small"
              value={daily}
              onChange={(e) => handleChange("daily", e.target.value)}
              disabled={disabled}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                  inputProps: { min: 0, max: 100 },
                },
              }}
              sx={{ width: 140 }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ minWidth: 70 }}
            >
              → {calculateAmount(daily)}
            </Typography>
          </Box>
        </Grid>

        {/* Contract Laborers */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <WorkIcon color="secondary" fontSize="small" />
            <TextField
              label="Company Laborers"
              type="number"
              size="small"
              value={contract}
              onChange={(e) => handleChange("contract", e.target.value)}
              disabled={disabled}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                  inputProps: { min: 0, max: 100 },
                },
              }}
              sx={{ width: 140 }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ minWidth: 70 }}
            >
              → {calculateAmount(contract)}
            </Typography>
          </Box>
        </Grid>

        {/* Market Laborers */}
        <Grid size={{ xs: 12 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <StoreIcon color="warning" fontSize="small" />
            <TextField
              label="Market Laborers"
              type="number"
              size="small"
              value={market}
              onChange={(e) => handleChange("market", e.target.value)}
              disabled={disabled}
              slotProps={{
                input: {
                  endAdornment: (
                    <InputAdornment position="end">%</InputAdornment>
                  ),
                  inputProps: { min: 0, max: 100 },
                },
              }}
              sx={{ width: 140 }}
            />
            <Typography
              variant="body2"
              color="text.secondary"
              sx={{ minWidth: 70 }}
            >
              → {calculateAmount(market)}
            </Typography>
          </Box>
        </Grid>
      </Grid>

      {/* Sum Validation */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 0.5,
          mt: 1.5,
          mb: 1,
        }}
      >
        {isValid ? (
          <CheckIcon color="success" fontSize="small" />
        ) : (
          <ErrorIcon color="error" fontSize="small" />
        )}
        <Typography
          variant="body2"
          color={isValid ? "success.main" : "error.main"}
        >
          Sum: {sum}%{" "}
          {isValid ? "(Valid)" : `(Must be 100%, ${100 - sum > 0 ? "+" : ""}${100 - sum}%)`}
        </Typography>
      </Box>

      {/* Quick Presets */}
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        {PRESETS.map((preset) => (
          <Button
            key={preset.label}
            size="small"
            variant="outlined"
            onClick={() => applyPreset(preset)}
            disabled={disabled}
            sx={{ textTransform: "none", fontSize: "0.75rem" }}
          >
            {preset.label}
          </Button>
        ))}
      </Box>

      {!isValid && (
        <Alert severity="warning" sx={{ mt: 1.5 }}>
          Percentages must sum to 100% before saving
        </Alert>
      )}
    </Box>
  );
}
