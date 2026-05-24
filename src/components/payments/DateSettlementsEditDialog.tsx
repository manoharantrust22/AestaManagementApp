"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  FormControlLabel,
  Checkbox,
  Alert,
  CircularProgress,
  Divider,
} from "@mui/material";
import {
  Close as CloseIcon,
  Link as LinkIcon,
  Save as SaveIcon,
  Payment as PaymentIcon,
  Edit as EditIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import { useSite } from "@/contexts/SiteContext";
import dayjs from "dayjs";
import type { DailyPaymentRecord } from "@/types/payment.types";
import PayerSourceSplitInput from "@/components/settlement/PayerSourceSplitInput";
import PayerSourceChip from "@/components/settlement/PayerSourceChip";
import {
  validatePayerSourceInput,
  toRpcArgs,
} from "@/lib/settlement/payerSource";
import type { PayerSource, PayerSourceInput } from "@/types/settlement.types";
import SubcontractLinkSelector from "./SubcontractLinkSelector";

interface DateSettlementsEditDialogProps {
  open: boolean;
  onClose: () => void;
  date: string;
  records: DailyPaymentRecord[];
  onSuccess?: () => void;
}

export default function DateSettlementsEditDialog({
  open,
  onClose,
  date,
  records,
  onSuccess,
}: DateSettlementsEditDialogProps) {
  const { selectedSite } = useSite();
  const supabase = createClient();

  // Form state for bulk editing - Subcontract
  const [selectedSubcontractId, setSelectedSubcontractId] = useState<string | null>(null);
  const [onlyUpdateUnlinked, setOnlyUpdateUnlinked] = useState(true);
  const [editingSubcontract, setEditingSubcontract] = useState(false);

  // Form state for bulk editing - Payer Source
  const [updatePayerSource, setUpdatePayerSource] = useState(false);
  const [payer, setPayer] = useState<PayerSourceInput>({
    mode: "single",
    source: "own_money",
  });

  // UI state
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Submission guard to prevent double-clicks
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submissionIdRef = useRef<string | null>(null);

  const formatCurrency = (amount: number) => `Rs.${amount.toLocaleString("en-IN")}`;

  const dailyRecords = records.filter((r) => r.sourceType === "daily");
  const marketRecords = records.filter((r) => r.sourceType === "market");

  // Count unlinked records (both daily and market)
  const unlinkedCount = records.filter((r) => !r.subcontractId).length;

  // Records that will be updated based on current selection (both daily and market)
  const recordsToUpdate = useMemo(() => {
    if (onlyUpdateUnlinked) {
      return records.filter((r) => !r.subcontractId);
    }
    return records;
  }, [records, onlyUpdateUnlinked]);

  // Calculate total amount that will be linked
  const totalAmountToLink = recordsToUpdate.reduce((sum, r) => sum + r.amount, 0);

  // Total across all records — used as the split-total when bulk-updating Paid By.
  // (Payer source update applies to ALL records, not just the unlinked subset.)
  const totalAllRecords = useMemo(
    () => records.reduce((sum, r) => sum + r.amount, 0),
    [records]
  );

  // Determine current subcontract status from records
  const currentSubcontract = useMemo(() => {
    const linkedRecords = records.filter((r) => r.subcontractId);
    if (linkedRecords.length === 0) {
      return { status: "unlinked" as const, title: null, id: null };
    }

    const uniqueSubcontracts = new Set(linkedRecords.map((r) => r.subcontractId));
    if (uniqueSubcontracts.size === 1) {
      return {
        status: "linked" as const,
        title: linkedRecords[0].subcontractTitle,
        id: linkedRecords[0].subcontractId,
      };
    }
    return { status: "multiple" as const, title: null, id: null };
  }, [records]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      setSelectedSubcontractId(null);
      setOnlyUpdateUnlinked(true);
      setEditingSubcontract(false);
      setUpdatePayerSource(false);
      setPayer({ mode: "single", source: "own_money" });
      setError(null);
    }
  }, [open]);

  // Handle bulk save
  const handleSave = async () => {
    // Guard against rapid double-clicks or multiple submissions
    if (isSubmitting || submissionIdRef.current || processing) {
      console.warn('[DateSettlementsEditDialog] Submission already in progress');
      return;
    }

    if (!selectedSite) {
      setError("No site selected");
      return;
    }

    // Must have at least one update action selected
    const hasSubcontractUpdate = editingSubcontract && selectedSubcontractId !== null;
    const hasPayerSourceUpdate = updatePayerSource;

    if (!hasSubcontractUpdate && !hasPayerSourceUpdate) {
      setError("Please click edit to change subcontract or enable 'Update Paid By'");
      return;
    }

    // For subcontract linking, use recordsToUpdate (respects onlyUpdateUnlinked)
    // For payer source, update ALL records
    if (hasSubcontractUpdate && recordsToUpdate.length === 0) {
      setError("No records to update for subcontract linking");
      return;
    }

    // Validate payer source if updating it. In split mode the user-entered
    // amounts must sum to the combined total across all records (this dialog
    // applies the same payer config to every record bulk-style).
    if (hasPayerSourceUpdate) {
      const payerCheck = validatePayerSourceInput(payer, totalAllRecords);
      if (!payerCheck.ok) {
        setError(payerCheck.reason);
        return;
      }
    }

    // Mark as submitting to prevent double-clicks
    const submissionId = `${Date.now()}-${Math.random()}`;
    submissionIdRef.current = submissionId;
    setIsSubmitting(true);
    setProcessing(true);
    setError(null);

    try {
      // Separate daily and market records for different table updates
      const dailyToUpdate = recordsToUpdate.filter((r) => r.sourceType === "daily");
      const marketToUpdate = recordsToUpdate.filter((r) => r.sourceType === "market");

      // Separate ALL records for payer source update (not just unlinked)
      const allDailyRecords = records.filter((r) => r.sourceType === "daily");
      const allMarketRecords = records.filter((r) => r.sourceType === "market");

      // Build update payloads
      const subcontractPayload = hasSubcontractUpdate ? { subcontract_id: selectedSubcontractId } : {};
      // toRpcArgs gives us the canonical three-column payload.
      // daily_attendance / market_laborer_attendance only have payer_source+payer_name
      // (no payer_source_split column — Phase 1 foundation migration scope). The split
      // JSONB only lives on settlement_groups + site_engineer_transactions.
      const payerRpc = hasPayerSourceUpdate ? toRpcArgs(payer) : null;
      const payerSourcePayloadAttendance = hasPayerSourceUpdate && payerRpc ? {
        payer_source: payerRpc.p_payer_source,
        payer_name: payerRpc.p_payer_name,
      } : {};
      const payerSourcePayloadSG = hasPayerSourceUpdate && payerRpc ? {
        payer_source: payerRpc.p_payer_source,
        payer_name: payerRpc.p_payer_name,
        payer_source_split: payerRpc.p_payer_source_split,
      } : {};

      // Update daily_attendance records
      if (hasSubcontractUpdate && dailyToUpdate.length > 0) {
        const dailySourceIds = dailyToUpdate.map((r) => r.sourceId);
        const { error: dailyError } = await supabase
          .from("daily_attendance")
          .update(subcontractPayload)
          .in("id", dailySourceIds);

        if (dailyError) throw dailyError;
      }

      // Update payer source for ALL daily records (not just unlinked)
      if (hasPayerSourceUpdate && allDailyRecords.length > 0) {
        const allDailyIds = allDailyRecords.map((r) => r.sourceId);
        const { error: dailyPayerError } = await supabase
          .from("daily_attendance")
          .update(payerSourcePayloadAttendance)
          .in("id", allDailyIds);

        if (dailyPayerError) throw dailyPayerError;
      }

      // Update market_laborer_attendance records
      if (hasSubcontractUpdate && marketToUpdate.length > 0) {
        const marketSourceIds = marketToUpdate.map((r) => r.sourceId);
        const { error: marketError } = await supabase
          .from("market_laborer_attendance")
          .update(subcontractPayload as any)
          .in("id", marketSourceIds);

        if (marketError) throw marketError;
      }

      // Update payer source for ALL market records (not just unlinked)
      if (hasPayerSourceUpdate && allMarketRecords.length > 0) {
        const allMarketIds = allMarketRecords.map((r) => r.sourceId);
        const { error: marketPayerError } = await supabase
          .from("market_laborer_attendance")
          .update(payerSourcePayloadAttendance as any)
          .in("id", allMarketIds);

        if (marketPayerError) throw marketPayerError;
      }

      // Update linked expenses for subcontract linking
      if (hasSubcontractUpdate) {
        // Method 1: Update expenses by expenseId (for records that have it)
        const expenseIds = recordsToUpdate
          .filter((r): r is DailyPaymentRecord & { expenseId: string } => !!r.expenseId)
          .map((r) => r.expenseId);

        if (expenseIds.length > 0) {
          const { error: expenseError } = await supabase
            .from("expenses")
            .update({ contract_id: selectedSubcontractId })
            .in("id", expenseIds);

          if (expenseError) {
            console.error("Error updating expenses by id:", expenseError);
          }
        }

        // Method 2: Update expenses by engineer_transaction_id (fallback for engineer wallet payments)
        const engineerTxIds = recordsToUpdate
          .filter((r) => r.engineerTransactionId)
          .map((r) => r.engineerTransactionId)
          .filter((id): id is string => !!id);

        if (engineerTxIds.length > 0) {
          // Update expenses linked via engineer_transaction_id
          const { error: txExpenseError } = await supabase
            .from("expenses")
            .update({ contract_id: selectedSubcontractId })
            .in("engineer_transaction_id", engineerTxIds);

          if (txExpenseError) {
            console.error("Error updating expenses by engineer_transaction_id:", txExpenseError);
          }

          // Also update the engineer_transaction.related_subcontract_id
          const { error: txUpdateError } = await (supabase
            .from("site_engineer_transactions") as any)
            .update({ related_subcontract_id: selectedSubcontractId })
            .in("id", engineerTxIds);

          if (txUpdateError) {
            console.error("Error updating engineer transactions:", txUpdateError);
          }
        }
      }

      // Update engineer transactions for payer source
      if (hasPayerSourceUpdate && payerRpc) {
        const allEngineerTxIds = records
          .filter((r) => r.engineerTransactionId)
          .map((r) => r.engineerTransactionId)
          .filter((id): id is string => !!id);

        if (allEngineerTxIds.length > 0) {
          // site_engineer_transactions has both legacy money_source/money_source_name
          // columns (still in use upstream) and the new payer_source_split JSONB
          // (added in Phase 1 foundation migration).
          const { error: txPayerError } = await (supabase
            .from("site_engineer_transactions") as any)
            .update({
              money_source: payerRpc.p_payer_source,
              money_source_name: payerRpc.p_payer_name,
              payer_source_split: payerRpc.p_payer_source_split,
            })
            .in("id", allEngineerTxIds);

          if (txPayerError) {
            console.error("Error updating engineer transaction payer source:", txPayerError);
          }
        }

        // Also update settlement_groups for all affected settlement group IDs
        // This ensures the payer_name shows correctly in the v_all_expenses view (Daily Expenses page).
        // Note: in split mode the same JSONB is written to every settlement_group — semantically
        // the user is declaring "these settlements (combined) were funded by this split", which
        // matches how the bulk Paid By workflow has always worked (single payer applied to all).
        const settlementGroupIds = records
          .filter((r) => r.settlementGroupId)
          .map((r) => r.settlementGroupId)
          .filter((id, i, arr): id is string => !!id && arr.indexOf(id) === i); // unique IDs

        if (settlementGroupIds.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: sgError } = await (supabase as any)
            .from("settlement_groups")
            .update(payerSourcePayloadSG)
            .in("id", settlementGroupIds);

          if (sgError) {
            console.error("Error updating settlement_groups payer source:", sgError);
          }
        }
      }

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Error updating settlements:", err);
      setError(err.message || "Failed to update settlements");
    } finally {
      // Clean up submission guard
      submissionIdRef.current = null;
      setIsSubmitting(false);
      setProcessing(false);
    }
  };

  const handleSubcontractSelect = useCallback((id: string | null) => {
    setSelectedSubcontractId(id);
  }, []);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Box>
          <Typography variant="h6" component="span">Edit Settlements</Typography>
          <Typography variant="caption" color="text.secondary">
            {dayjs(date).format("dddd, DD MMM YYYY")} - {records.length} records
          </Typography>
        </Box>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {records.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={4}>
            No records found for this date
          </Typography>
        ) : (
          <>
            {/* Records Table (Read-only display) */}
            <Typography variant="subtitle2" gutterBottom>
              Records for this date:
            </Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ mb: 3, maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead>
                  <TableRow>
                    <TableCell>Type</TableCell>
                    <TableCell>Name / Role</TableCell>
                    <TableCell align="right">Amount</TableCell>
                    <TableCell>Paid By</TableCell>
                    <TableCell>Subcontract</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {dailyRecords.map((record) => (
                    <TableRow
                      key={record.id}
                      sx={{
                        bgcolor: (!record.subcontractId && onlyUpdateUnlinked) || !onlyUpdateUnlinked
                          ? "action.selected"
                          : "inherit",
                      }}
                    >
                      <TableCell>
                        <Chip label="Daily" size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{record.laborerName}</Typography>
                        {record.category && (
                          <Typography variant="caption" color="text.secondary">
                            {record.category}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(record.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {record.moneySource ? (
                          <PayerSourceChip
                            row={{
                              payer_source: record.moneySource,
                              payer_name: record.moneySourceName,
                              payer_source_split: record.payerSourceSplit ?? null,
                            }}
                          />
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.subcontractTitle ? (
                          <Chip
                            label={record.subcontractTitle}
                            size="small"
                            color="info"
                            variant="outlined"
                            icon={<LinkIcon sx={{ fontSize: 14 }} />}
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        ) : (
                          <Chip
                            label="Unlinked"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {record.isPaid ? (
                          <Chip label="Paid" size="small" color="success" sx={{ height: 18, fontSize: "0.6rem" }} />
                        ) : record.paidVia === "engineer_wallet" ? (
                          <Chip label="With Engineer" size="small" color="info" sx={{ height: 18, fontSize: "0.6rem" }} />
                        ) : (
                          <Chip label="Pending" size="small" color="warning" sx={{ height: 18, fontSize: "0.6rem" }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                  {marketRecords.map((record) => (
                    <TableRow
                      key={record.id}
                      sx={{
                        bgcolor: (!record.subcontractId && onlyUpdateUnlinked) || !onlyUpdateUnlinked
                          ? "action.selected"
                          : "inherit",
                      }}
                    >
                      <TableCell>
                        <Chip label="Market" size="small" color="secondary" variant="outlined" sx={{ height: 20, fontSize: "0.65rem" }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2">{record.role || record.laborerName}</Typography>
                        {record.count && record.count > 1 && (
                          <Typography variant="caption" color="text.secondary">
                            x{record.count}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight={500}>
                          {formatCurrency(record.amount)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {record.moneySource ? (
                          <PayerSourceChip
                            row={{
                              payer_source: record.moneySource,
                              payer_name: record.moneySourceName,
                              payer_source_split: record.payerSourceSplit ?? null,
                            }}
                          />
                        ) : (
                          <Typography variant="body2" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {record.subcontractTitle ? (
                          <Chip
                            label={record.subcontractTitle}
                            size="small"
                            color="info"
                            variant="outlined"
                            icon={<LinkIcon sx={{ fontSize: 14 }} />}
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        ) : (
                          <Chip
                            label="Unlinked"
                            size="small"
                            color="warning"
                            variant="outlined"
                            sx={{ height: 20, fontSize: "0.65rem" }}
                          />
                        )}
                      </TableCell>
                      <TableCell align="center">
                        {record.isPaid ? (
                          <Chip label="Paid" size="small" color="success" sx={{ height: 18, fontSize: "0.6rem" }} />
                        ) : record.paidVia === "engineer_wallet" ? (
                          <Chip label="With Engineer" size="small" color="info" sx={{ height: 18, fontSize: "0.6rem" }} />
                        ) : (
                          <Chip label="Pending" size="small" color="warning" sx={{ height: 18, fontSize: "0.6rem" }} />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            <Divider sx={{ my: 2 }} />

            {/* Bulk Edit Section - For all records */}
            {records.length > 0 && (
              <Box>
                <Typography variant="subtitle2" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <LinkIcon fontSize="small" color="primary" />
                  Link to Subcontract
                </Typography>

                <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, mb: 2 }}>
                  {!editingSubcontract ? (
                    // Read-only display with edit icon
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                      <Chip
                        label={
                          currentSubcontract.status === "unlinked"
                            ? `Unlinked (${unlinkedCount} of ${records.length})`
                            : currentSubcontract.status === "multiple"
                              ? "Multiple subcontracts"
                              : currentSubcontract.title
                        }
                        color={currentSubcontract.status === "unlinked" ? "warning" : "info"}
                        variant="outlined"
                        icon={currentSubcontract.status !== "unlinked" ? <LinkIcon /> : undefined}
                      />
                      <IconButton
                        size="small"
                        onClick={() => setEditingSubcontract(true)}
                        title="Edit subcontract link"
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Box>
                  ) : (
                    // Edit mode - show dropdown and "Only update unlinked records" checkbox
                    <Box>
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={onlyUpdateUnlinked}
                            onChange={(e) => setOnlyUpdateUnlinked(e.target.checked)}
                          />
                        }
                        label={
                          <Typography variant="body2">
                            Only update unlinked records ({unlinkedCount} of {records.length})
                          </Typography>
                        }
                      />

                      <Box sx={{ mt: 2 }}>
                        <SubcontractLinkSelector
                          selectedSubcontractId={selectedSubcontractId}
                          onSelect={handleSubcontractSelect}
                          paymentAmount={totalAmountToLink}
                          showBalanceAfterPayment
                        />
                      </Box>

                      {selectedSubcontractId && recordsToUpdate.length > 0 && (
                        <Alert severity="success" sx={{ mt: 2 }}>
                          {recordsToUpdate.length} record(s) totaling {formatCurrency(totalAmountToLink)} will be linked
                        </Alert>
                      )}
                    </Box>
                  )}
                </Box>

                <Divider sx={{ my: 2 }} />

                {/* Bulk Update Paid By Section */}
                <Typography variant="subtitle2" gutterBottom sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <PaymentIcon fontSize="small" color="primary" />
                  Bulk Update Paid By
                </Typography>

                <Box sx={{ p: 2, bgcolor: "action.hover", borderRadius: 1, mb: 2 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={updatePayerSource}
                        onChange={(e) => setUpdatePayerSource(e.target.checked)}
                      />
                    }
                    label={
                      <Typography variant="body2">
                        Update &quot;Paid By&quot; for all {records.length} record(s)
                      </Typography>
                    }
                  />

                  {updatePayerSource && (
                    <Box sx={{ mt: 2 }}>
                      <PayerSourceSplitInput
                        value={payer}
                        onChange={setPayer}
                        total={totalAllRecords}
                        siteId={selectedSite?.id}
                        disabled={processing || isSubmitting}
                      />
                      {(() => {
                        const c = validatePayerSourceInput(payer, totalAllRecords);
                        return !c.ok && payer.mode === "split" ? (
                          <Typography
                            variant="caption"
                            color="error.main"
                            sx={{ mt: 1, display: "block" }}
                          >
                            {c.reason}
                          </Typography>
                        ) : null;
                      })()}
                    </Box>
                  )}

                  {updatePayerSource && (
                    <Alert severity="info" sx={{ mt: 2 }}>
                      All {records.length} record(s) will be updated to the selected payer source{payer.mode === "split" ? " split" : ""}.
                    </Alert>
                  )}
                </Box>
              </Box>
            )}
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={processing || isSubmitting}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={
            processing ||
            isSubmitting ||
            (!(editingSubcontract && selectedSubcontractId) && !updatePayerSource) ||
            !!(editingSubcontract && selectedSubcontractId && recordsToUpdate.length === 0) ||
            (updatePayerSource && !validatePayerSourceInput(payer, totalAllRecords).ok)
          }
          startIcon={(processing || isSubmitting) ? <CircularProgress size={16} /> : <SaveIcon />}
        >
          {(processing || isSubmitting)
            ? "Saving..."
            : editingSubcontract && selectedSubcontractId && updatePayerSource
              ? `Update ${records.length} Record(s)`
              : editingSubcontract && selectedSubcontractId
                ? `Link ${recordsToUpdate.length} Record(s)`
                : updatePayerSource
                  ? `Update Paid By (${records.length})`
                  : "Save Changes"
          }
        </Button>
      </DialogActions>
    </Dialog>
  );
}
