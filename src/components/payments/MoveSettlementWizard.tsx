"use client";

import * as React from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControlLabel,
  MenuItem,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  alpha,
  useTheme,
} from "@mui/material";
import { SwapHoriz as SwapHorizIcon } from "@mui/icons-material";
import dayjs from "dayjs";
import { createClient } from "@/lib/supabase/client";
import { useSiteGroupMembership } from "@/hooks/queries/useSiteGroups";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import type { PayerSource } from "@/types/settlement.types";
import {
  moveSettlementsToSite,
  type MoveSettlementsResult,
} from "@/lib/services/settlementService";
import type { SettlementListRow } from "@/hooks/queries/useSettlementsList";

function formatINR(n: number): string {
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

export interface MoveSettlementWizardProps {
  open: boolean;
  onClose: () => void;
  originSiteId: string;
  originSiteName: string;
  /** The subcontract the excess is shown for (amount mode is scoped to it). */
  fromSubcontractId?: string | null;
  /** Excess (futureCredit) to default the amount field to. */
  defaultAmount?: number;
  /** Rows the user could move (the visible list); filtered to movable here. */
  candidateRows: SettlementListRow[];
  /** When launched from a single row's action, preselect it + rows mode. */
  preselectedRowId?: string | null;
  onDone: (result: MoveSettlementsResult) => void;
}

type Mode = "rows" | "amount";

export function MoveSettlementWizard({
  open,
  onClose,
  originSiteId,
  originSiteName,
  fromSubcontractId,
  defaultAmount,
  candidateRows,
  preselectedRowId,
  onDone,
}: MoveSettlementWizardProps) {
  const theme = useTheme();
  const supabase = React.useMemo(() => createClient(), []);

  const membership = useSiteGroupMembership(originSiteId);
  const otherSites = (membership.data?.otherSites ?? []) as Array<{ id: string; name: string }>;

  const movableRows = React.useMemo(
    () =>
      candidateRows.filter(
        (r) => r.isContract && !r.isCancelled && !r.transferredOutAt && !r.transferId
      ),
    [candidateRows]
  );

  const [destSiteId, setDestSiteId] = React.useState("");
  const [mode, setMode] = React.useState<Mode>("amount");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [amount, setAmount] = React.useState("");
  const [destSubcontractId, setDestSubcontractId] = React.useState<string>(""); // "" = Unlinked
  const [payerSource, setPayerSource] = React.useState<PayerSource>("own_money");
  const [payerName, setPayerName] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const destSubcontractsQuery = useSiteSubcontracts(destSiteId || undefined);
  const destSubcontracts = destSubcontractsQuery.data ?? [];

  // Initialise on open. Preselecting a row forces rows mode.
  React.useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
    setDestSiteId(otherSites.length === 1 ? otherSites[0].id : "");
    setDestSubcontractId("");
    setPayerSource("own_money");
    setPayerName("");
    setReason("");
    if (preselectedRowId) {
      setMode("rows");
      setSelectedIds(new Set([preselectedRowId]));
      setAmount("");
    } else {
      setMode("amount");
      setSelectedIds(new Set());
      setAmount(defaultAmount && defaultAmount > 0 ? String(Math.round(defaultAmount)) : "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, preselectedRowId, defaultAmount, otherSites.length]);

  const selectedRows = movableRows.filter((r) => selectedIds.has(r.id));
  const selectedTotal = selectedRows.reduce((s, r) => s + r.totalAmount, 0);
  const amountNum = Number(amount) || 0;
  const availableTotal = movableRows.reduce((s, r) => s + r.totalAmount, 0);

  const destSiteName = otherSites.find((s) => s.id === destSiteId)?.name ?? "the other site";

  const requiresPayerName = payerSource === "custom" || payerSource === "other_site_money";
  const payerNameOk = !requiresPayerName || payerName.trim().length > 0;

  const canSubmit =
    !submitting &&
    !!destSiteId &&
    payerNameOk &&
    (mode === "rows" ? selectedRows.length > 0 : amountNum > 0 && amountNum <= availableTotal + 0.5);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await moveSettlementsToSite(supabase, {
        toSiteId: destSiteId,
        mode,
        settlementIds: mode === "rows" ? Array.from(selectedIds) : undefined,
        targetAmount: mode === "amount" ? amountNum : undefined,
        fromSiteId: originSiteId,
        fromSubcontractId: mode === "amount" ? fromSubcontractId ?? null : null,
        destSubcontractId: destSubcontractId || null,
        payerSource,
        payerName: requiresPayerName ? payerName.trim() : null,
        reason: reason.trim() || null,
        idempotencyKey:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : null,
      });
      onDone(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move the settlement(s).");
      setSubmitting(false);
    }
  };

  const notInGroup = membership.isSuccess && otherSites.length === 0;

  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pb: 1 }}>
        <SwapHorizIcon color="info" />
        <Box>
          <Typography variant="h6" component="div" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
            Move to another site
          </Typography>
          <Typography variant="caption" color="text.secondary">
            From {originSiteName} · same group only
          </Typography>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {notInGroup ? (
          <Alert severity="info">
            This site isn&apos;t part of a group, so there&apos;s nowhere to move payments to.
            Add it to a site group first.
          </Alert>
        ) : (
          <Stack spacing={2.5}>
            {/* 1 — destination site */}
            <TextField
              select
              label="Destination site"
              value={destSiteId}
              onChange={(e) => {
                setDestSiteId(e.target.value);
                setDestSubcontractId("");
              }}
              fullWidth
              size="small"
              disabled={submitting}
            >
              {otherSites.map((s) => (
                <MenuItem key={s.id} value={s.id}>
                  {s.name}
                </MenuItem>
              ))}
            </TextField>

            {/* 2 — mode */}
            <Box>
              <Typography variant="subtitle2" color="text.secondary" fontWeight={600} gutterBottom>
                What to move
              </Typography>
              <ToggleButtonGroup
                exclusive
                size="small"
                value={mode}
                onChange={(_, v) => v && setMode(v as Mode)}
                disabled={submitting}
                sx={{ mb: 1 }}
              >
                <ToggleButton value="amount" sx={{ textTransform: "none" }}>
                  Enter an amount
                </ToggleButton>
                <ToggleButton value="rows" sx={{ textTransform: "none" }}>
                  Pick payments
                </ToggleButton>
              </ToggleButtonGroup>

              {mode === "amount" ? (
                <Box>
                  <TextField
                    label="Amount to move (₹)"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
                    fullWidth
                    size="small"
                    disabled={submitting}
                    inputMode="numeric"
                    helperText={
                      defaultAmount && defaultAmount > 0
                        ? `Defaults to the excess (${formatINR(defaultAmount)}). Moves newest-first; attendance-linked payments are moved whole, never split.`
                        : "Moves newest-first; attendance-linked payments are moved whole, never split."
                    }
                  />
                  {amountNum > availableTotal + 0.5 && (
                    <Typography variant="caption" color="error.main">
                      Only {formatINR(availableTotal)} is available to move from this scope.
                    </Typography>
                  )}
                </Box>
              ) : (
                <Box
                  sx={{
                    maxHeight: 260,
                    overflowY: "auto",
                    border: 1,
                    borderColor: "divider",
                    borderRadius: 1,
                  }}
                >
                  {movableRows.length === 0 ? (
                    <Typography variant="body2" color="text.secondary" sx={{ p: 2 }}>
                      No movable contract payments in view.
                    </Typography>
                  ) : (
                    movableRows.map((r) => (
                      <Box
                        key={r.id}
                        onClick={() => !submitting && toggleRow(r.id)}
                        sx={{
                          display: "flex",
                          alignItems: "center",
                          gap: 1,
                          px: 1,
                          py: 0.75,
                          cursor: "pointer",
                          borderBottom: 1,
                          borderColor: "divider",
                          "&:last-of-type": { borderBottom: 0 },
                          "&:hover": { bgcolor: "action.hover" },
                          bgcolor: selectedIds.has(r.id)
                            ? alpha(theme.palette.info.main, 0.08)
                            : "transparent",
                        }}
                      >
                        <Checkbox size="small" checked={selectedIds.has(r.id)} sx={{ p: 0.5 }} />
                        <Box sx={{ minWidth: 0, flex: 1 }}>
                          <Typography sx={{ fontSize: 12, fontWeight: 600 }} noWrap>
                            {r.notes || r.subcontractTitle || `${r.laborerCount} laborer(s)`}
                          </Typography>
                          <Typography sx={{ fontSize: 10.5, color: "text.secondary" }}>
                            {dayjs(r.settlementDate).format("DD MMM YYYY")} · {r.ref}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 13, fontWeight: 700, color: "success.dark" }}>
                          {formatINR(r.totalAmount)}
                        </Typography>
                      </Box>
                    ))
                  )}
                </Box>
              )}
            </Box>

            {/* 3 — destination contract */}
            <TextField
              select
              label="Attach to (on destination site)"
              value={destSubcontractId}
              onChange={(e) => setDestSubcontractId(e.target.value)}
              fullWidth
              size="small"
              disabled={submitting || !destSiteId}
              helperText={
                destSiteId
                  ? "Links it to that site's contract as a company-salary expense. Leave Unlinked to land it without a contract."
                  : "Choose a destination site first."
              }
            >
              <MenuItem value="">Unlinked (no contract)</MenuItem>
              {destSubcontracts.map((sc) => (
                <MenuItem key={sc.id} value={sc.id}>
                  {sc.title}
                  {sc.laborer_name ? ` · ${sc.laborer_name}` : ""}
                </MenuItem>
              ))}
            </TextField>

            {/* 4 — payer source (destination registry) */}
            {destSiteId && (
              <Box>
                <PayerSourceSelector
                  value={payerSource}
                  customName={payerName}
                  onChange={setPayerSource}
                  onCustomNameChange={setPayerName}
                  siteId={destSiteId}
                  disabled={submitting}
                  compact
                />
              </Box>
            )}

            {/* 5 — reason */}
            <TextField
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              fullWidth
              size="small"
              disabled={submitting}
              placeholder="e.g. Civil work finished here; carried to the other site"
            />

            <Divider />

            {/* summary */}
            <Box
              sx={{
                p: 1.5,
                borderRadius: 1,
                bgcolor: alpha(theme.palette.info.main, 0.06),
                border: 1,
                borderColor: alpha(theme.palette.info.main, 0.25),
              }}
            >
              <Typography variant="body2" sx={{ fontWeight: 600 }}>
                Move{" "}
                <Box component="span" sx={{ color: "info.dark" }}>
                  {mode === "rows"
                    ? `${formatINR(selectedTotal)} (${selectedRows.length} payment${
                        selectedRows.length === 1 ? "" : "s"
                      })`
                    : formatINR(amountNum)}
                </Box>{" "}
                from {originSiteName} → {destSiteName}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {originSiteName}&apos;s expenses drop by this much; it appears on{" "}
                {destSiteName} as a company-salary expense. Fully reversible.
              </Typography>
              {mode === "rows" && selectedRows.length > 0 && (
                <Chip
                  size="small"
                  label={`Selected ${formatINR(selectedTotal)}`}
                  sx={{ mt: 0.75, height: 20, fontSize: 10.5, fontWeight: 700 }}
                />
              )}
            </Box>

            {error && <Alert severity="error">{error}</Alert>}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={submitting} color="inherit">
          Cancel
        </Button>
        {!notInGroup && (
          <Button
            variant="contained"
            color="info"
            onClick={handleSubmit}
            disabled={!canSubmit}
            startIcon={submitting ? <CircularProgress size={16} color="inherit" /> : <SwapHorizIcon />}
          >
            {submitting ? "Moving…" : "Move payment"}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
