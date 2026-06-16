"use client";

import React, { useState } from "react";
import {
  Box,
  Button,
  CircularProgress,
  Stack,
  Typography,
  ToggleButtonGroup,
  ToggleButton,
  TextField,
  Collapse,
  useTheme,
  useMediaQuery,
} from "@mui/material";
import {
  AccountBalance as OwnMoneyIcon,
  Business as ClientIcon,
  Person as PersonIcon,
  Edit as CustomIcon,
  LocationOn as SiteIcon,
  Savings as TrustIcon,
  Add as AddIcon,
} from "@mui/icons-material";
import type { PayerSource } from "@/types/settlement.types";
import { usePayerSources, usePayerSourceMutations } from "@/hooks/queries/usePayerSources";
import { useOptionalAuth } from "@/contexts/AuthContext";

const ICON_BY_NAME: Record<string, React.ReactNode> = {
  AccountBalance: <OwnMoneyIcon fontSize="small" />,
  Business: <ClientIcon fontSize="small" />,
  Person: <PersonIcon fontSize="small" />,
  Edit: <CustomIcon fontSize="small" />,
  LocationOn: <SiteIcon fontSize="small" />,
  Savings: <TrustIcon fontSize="small" />,
};

interface PayerSourceSelectorProps {
  value: PayerSource;
  customName: string;
  onChange: (source: PayerSource) => void;
  onCustomNameChange: (name: string) => void;
  disabled?: boolean;
  compact?: boolean;
  /**
   * When provided, render options from the per-site payer_sources
   * registry instead of the hardcoded 6. Falls back to hardcoded if
   * the registry returns empty (defensive — shouldn't fire post-
   * Slice 1 migration). The 4 other callers of this component will
   * migrate in Slice 2 when the settings page lands.
   */
  siteId?: string;
}

const PAYER_OPTIONS: { value: PayerSource; label: string; shortLabel: string; icon: React.ReactNode }[] = [
  { value: "own_money", label: "Own Money", shortLabel: "Own", icon: <OwnMoneyIcon fontSize="small" /> },
  { value: "amma_money", label: "Amma Money", shortLabel: "Amma", icon: <PersonIcon fontSize="small" /> },
  { value: "client_money", label: "Client Money", shortLabel: "Client", icon: <ClientIcon fontSize="small" /> },
  { value: "trust_account", label: "Trust Account", shortLabel: "Trust", icon: <TrustIcon fontSize="small" /> },
  { value: "other_site_money", label: "Other Site", shortLabel: "Site", icon: <SiteIcon fontSize="small" /> },
  { value: "custom", label: "Other", shortLabel: "Other", icon: <CustomIcon fontSize="small" /> },
];

export default function PayerSourceSelector({
  value,
  customName,
  onChange,
  onCustomNameChange,
  disabled = false,
  compact = false,
  siteId,
}: PayerSourceSelectorProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  // Registry-aware option list. When siteId is provided and the
  // registry has rows, prefer those; otherwise fall back to the
  // hardcoded 6. The fallback covers (a) legacy callers that don't
  // pass siteId, (b) the brief loading window on a fresh fetch, and
  // (c) defensive recovery if the registry is somehow empty.
  const { data: registryRows } = usePayerSources(siteId);
  const options =
    siteId && registryRows && registryRows.length > 0
      ? registryRows.map((r) => ({
          value: r.key as PayerSource,
          label: r.label,
          shortLabel: r.label.split(" ")[0] ?? r.label,
          icon: r.icon ? ICON_BY_NAME[r.icon] ?? null : null,
        }))
      : PAYER_OPTIONS;

  // Inline quick-add: admin/office can add a source to this site without
  // leaving the dialog. Only shown when a site is in scope (registry mode)
  // and the registry has loaded, so the new row dedupes correctly.
  const auth = useOptionalAuth();
  const canManage =
    !!siteId &&
    (auth?.userProfile?.role === "admin" || auth?.userProfile?.role === "office");
  const mutations = usePayerSourceMutations(siteId);
  const [showAddField, setShowAddField] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const handleQuickAdd = async () => {
    const label = newLabel.trim();
    if (!label) return;
    setAdding(true);
    setAddError(null);
    try {
      const created = await mutations.addCustomSource({
        label,
        requiresName: false,
        existingRows: registryRows ?? [],
      });
      setNewLabel("");
      setShowAddField(false);
      onChange(created.key as PayerSource);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not add source");
    } finally {
      setAdding(false);
    }
  };

  return (
    <Box sx={{ mb: compact ? 1.5 : 2 }}>
      <Typography
        variant={compact ? "caption" : "subtitle2"}
        fontWeight={600}
        gutterBottom
        color="text.secondary"
      >
        Payment Source
      </Typography>

      <ToggleButtonGroup
        exclusive
        value={value}
        onChange={(_, newValue) => newValue && onChange(newValue)}
        size="small"
        disabled={disabled}
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 0.5,
          "& .MuiToggleButtonGroup-grouped": {
            border: "1px solid",
            borderColor: "divider",
            borderRadius: "8px !important",
            m: 0,
            px: { xs: 1, sm: 1.5 },
            py: 0.5,
            "&.Mui-selected": {
              bgcolor: "primary.main",
              color: "primary.contrastText",
              borderColor: "primary.main",
              "&:hover": {
                bgcolor: "primary.dark",
              },
            },
          },
        }}
      >
        {options.map((opt) => (
          <ToggleButton
            key={opt.value}
            value={opt.value}
            sx={{
              display: "flex",
              alignItems: "center",
              gap: 0.5,
              textTransform: "none",
            }}
          >
            {opt.icon}
            <Typography variant="caption" fontWeight={500}>
              {isMobile || compact ? opt.shortLabel : opt.label}
            </Typography>
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      {canManage && (
        <Box sx={{ mt: 1 }}>
          {!showAddField ? (
            <Button
              size="small"
              startIcon={<AddIcon fontSize="small" />}
              onClick={() => setShowAddField(true)}
              disabled={disabled}
              sx={{ textTransform: "none" }}
            >
              Add source
            </Button>
          ) : (
            <Stack direction="row" spacing={1} alignItems="center">
              <TextField
                size="small"
                autoFocus
                placeholder="New source name"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleQuickAdd();
                  }
                }}
                disabled={adding}
              />
              <Button
                size="small"
                variant="contained"
                onClick={handleQuickAdd}
                disabled={!newLabel.trim() || adding}
                sx={{ textTransform: "none" }}
              >
                {adding ? <CircularProgress size={16} /> : "Add"}
              </Button>
              <Button
                size="small"
                onClick={() => {
                  setShowAddField(false);
                  setNewLabel("");
                  setAddError(null);
                }}
                disabled={adding}
                sx={{ textTransform: "none" }}
              >
                Cancel
              </Button>
            </Stack>
          )}
          {addError && (
            <Typography variant="caption" color="error.main" sx={{ display: "block", mt: 0.5 }}>
              {addError}
            </Typography>
          )}
        </Box>
      )}

      <Collapse in={value === "custom" || value === "other_site_money"}>
        <TextField
          size="small"
          placeholder={value === "other_site_money" ? "Enter site name" : "Enter payer name"}
          value={customName}
          onChange={(e) => onCustomNameChange(e.target.value)}
          disabled={disabled}
          fullWidth
          sx={{ mt: 1.5 }}
          helperText={value === "other_site_money" ? "Specify which site's money" : "Specify whose money was used"}
        />
      </Collapse>
    </Box>
  );
}

/**
 * Get display label for a payer source
 */
export function getPayerSourceLabel(source: PayerSource, customName?: string): string {
  switch (source) {
    case "own_money":
      return "Own Money";
    case "amma_money":
      return "Amma Money";
    case "client_money":
      return "Client Money";
    case "trust_account":
      return "Trust Account";
    case "other_site_money":
      return customName ? `Site: ${customName}` : "Other Site";
    case "mothers_money":
      return "Amma Money"; // Legacy support
    case "custom":
      return customName || "Other";
    default:
      // 'pending' = unfunded portion an engineer fronted before deposits
      // covered it (wallet FIFO allocation). Not a PayerSource union member.
      if ((source as string) === "pending") return "Pending";
      return source;
  }
}

/**
 * Get color for a payer source chip
 */
export function getPayerSourceColor(source: PayerSource): "default" | "primary" | "secondary" | "success" | "warning" | "info" | "error" {
  switch (source) {
    case "own_money":
      return "primary";
    case "amma_money":
    case "mothers_money":
      return "secondary";
    case "client_money":
      return "success";
    case "trust_account":
      return "info";
    case "other_site_money":
      return "warning";
    case "custom":
      return "default";
    default:
      return "default";
  }
}
