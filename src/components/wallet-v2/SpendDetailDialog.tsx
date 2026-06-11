"use client";

import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Close, ReceiptLong, Undo, WarningAmber } from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import type { WorkPhoto } from "@/types/work-updates.types";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import { useMiscExpenseForTransaction } from "@/hooks/queries/useMiscExpenseForTransaction";
import { useSettlementLinkage } from "@/hooks/queries/useSettlementLinkage";
import { usePossibleDuplicate } from "@/hooks/queries/usePossibleDuplicate";
import { useReverseSettlement } from "@/hooks/mutations/useReverseSettlement";
import { useAuth } from "@/contexts/AuthContext";
import {
  classifySpend,
  parseMiscReference,
  buildSpendPhotos,
  prettyPayerSource,
} from "./spendDetailHelpers";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

const titleCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

interface SpendDetailDialogProps {
  open: boolean;
  onClose: () => void;
  row: WalletLedgerEntry | null;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <Stack direction="row" spacing={2} sx={{ py: 0.5 }}>
      <Typography variant="body2" color="text.secondary" sx={{ minWidth: 92, flexShrink: 0 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 500 }}>
        {value}
      </Typography>
    </Stack>
  );
}

export default function SpendDetailDialog({ open, onClose, row }: SpendDetailDialogProps) {
  // Hooks must run unconditionally before any early return.
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [confirmReverse, setConfirmReverse] = useState(false);
  const [reverseReason, setReverseReason] = useState("");
  const { userProfile } = useAuth();

  const kind = classifySpend(row?.description);
  const isMisc = kind === "misc";
  const miscQuery = useMiscExpenseForTransaction(
    open && isMisc ? row?.id ?? null : null
  );

  // A spend is a settlement debit if it classifies as salary/contract OR carries a
  // settlement_group_id. Resolve the linked settlement (group-id preferred, spend-id
  // fallback for rows created before the spend carried the id).
  const looksLikeSettlement =
    kind === "salary" || kind === "contract" || !!row?.settlement_group_id;
  const settlementEnabled =
    open && looksLikeSettlement && row?.transaction_type !== "return";
  const linkageQuery = useSettlementLinkage(
    settlementEnabled ? row?.settlement_group_id ?? null : null,
    settlementEnabled ? row?.id ?? null : null
  );
  const linkedGroupId =
    linkageQuery.data?.group_id ??
    (settlementEnabled ? row?.settlement_group_id ?? null : null);
  const dupQuery = usePossibleDuplicate(open && linkedGroupId ? linkedGroupId : null);
  const reverseMutation = useReverseSettlement();

  if (!row) return null;

  const misc = miscQuery.data ?? null;
  const isReturn = row.transaction_type === "return";
  const reference = parseMiscReference(row.description);
  const photos: WorkPhoto[] = buildSpendPhotos(row, misc);
  const payerKey = misc?.payer_source ?? row.payer_source ?? null;
  const payerName = misc?.payer_name ?? row.payer_name ?? null;
  const noteText = misc?.notes ?? row.notes;

  const linkage = linkageQuery.data ?? null;
  const dupes = dupQuery.data ?? [];
  const role = userProfile?.role;
  const isRecorder = !!userProfile?.id && row.recorded_by_user_id === userProfile.id;
  // The RPC enforces the same rule (recorder or office/admin) from auth.uid();
  // this just hides the button when it would be denied.
  const canReverse =
    !!linkedGroupId &&
    !!linkage &&
    !linkage.is_cancelled &&
    !isReturn &&
    (role === "admin" || role === "office" || isRecorder);

  const handleReverse = () => {
    if (!linkedGroupId) return;
    reverseMutation.mutate(
      {
        settlementGroupId: linkedGroupId,
        reason: reverseReason.trim() || null,
        engineerId: row.user_id,
      },
      {
        onSuccess: () => {
          setConfirmReverse(false);
          setReverseReason("");
          onClose();
        },
      }
    );
  };

  const handleClose = () => {
    if (reverseMutation.isPending) return;
    setConfirmReverse(false);
    setReverseReason("");
    onClose();
  };

  return (
    <>
      <Dialog open={open} onClose={handleClose} fullWidth maxWidth="xs">
        <DialogTitle sx={{ pr: 6 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Typography variant="h6" fontWeight={700}>
              {isReturn ? "Return details" : "Spend details"}
            </Typography>
            <Stack direction="row" alignItems="center" spacing={1}>
              <Typography variant="h6" fontWeight={700}>
                − ₹{fmt(row.amount)}
              </Typography>
              <Chip
                size="small"
                variant="outlined"
                label={row.payment_mode.toUpperCase()}
                sx={{ fontSize: "0.65rem", height: 20 }}
              />
            </Stack>
          </Stack>
          <IconButton
            onClick={handleClose}
            size="small"
            sx={{ position: "absolute", top: 8, right: 8 }}
            aria-label="Close"
          >
            <Close fontSize="small" />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <DetailRow label="Date" value={dayjs(row.transaction_date).format("D MMM YYYY")} />
          {reference && <DetailRow label="Reference" value={reference} />}
          {!isMisc && row.description && <DetailRow label="Details" value={row.description} />}

          {isMisc && miscQuery.isLoading && (
            <Stack direction="row" alignItems="center" spacing={1} sx={{ py: 1 }}>
              <CircularProgress size={16} />
              <Typography variant="caption" color="text.secondary">
                Loading bill details…
              </Typography>
            </Stack>
          )}
          {isMisc && miscQuery.isError && (
            <Typography variant="caption" color="error" sx={{ display: "block", py: 1 }}>
              Couldn&apos;t load bill details.
            </Typography>
          )}
          {isMisc && misc && (
            <>
              <DetailRow label="Vendor" value={misc.vendor_name} />
              <DetailRow label="Category" value={misc.category_name} />
              <DetailRow label="For" value={misc.description} />
            </>
          )}

          <DetailRow
            label="Paid by"
            value={payerKey ? prettyPayerSource(payerKey, payerName) : null}
          />
          <DetailRow label="Recorded" value={row.recorded_by ? `by ${row.recorded_by}` : null} />
          <DetailRow label="Notes" value={noteText} />

          {/* Linked settlement — what this debit actually paid. */}
          {linkage && (
            <>
              <Divider sx={{ my: 1.5 }} />
              <Typography
                variant="caption"
                sx={{
                  color: "text.secondary",
                  textTransform: "uppercase",
                  letterSpacing: 0.5,
                  fontWeight: 600,
                  display: "block",
                  mb: 0.5,
                }}
              >
                Linked settlement
              </Typography>
              <DetailRow label="Settlement" value={linkage.settlement_reference} />
              <DetailRow
                label="Type"
                value={linkage.payment_type ? titleCase(linkage.payment_type) : null}
              />
              <DetailRow label="Laborers" value={linkage.laborer_count ?? null} />
              {linkage.is_cancelled && (
                <Chip size="small" color="default" label="Settlement cancelled" sx={{ mt: 0.5 }} />
              )}
            </>
          )}

          {/* Possible-duplicate warning — same site/date/amount/laborer-count. */}
          {dupes.length > 0 && (
            <Alert severity="warning" icon={<WarningAmber />} sx={{ mt: 2 }}>
              <Typography variant="body2" fontWeight={700}>
                Possible duplicate{dupes.length > 1 ? "s" : ""}
              </Typography>
              <Typography variant="caption" component="div" sx={{ mt: 0.5 }}>
                {dupes.length} other live settlement{dupes.length > 1 ? "s" : ""} on this site for
                the same date &amp; amount: {dupes.map((d) => d.settlement_reference).join(", ")}.
                If this is a double entry, reverse the wrong one.
              </Typography>
            </Alert>
          )}

          <Typography
            variant="caption"
            sx={{
              color: "text.secondary",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              fontWeight: 600,
              display: "block",
              mt: 2,
            }}
          >
            Attachments
          </Typography>
          {photos.length === 0 ? (
            <Stack direction="row" spacing={1} alignItems="center" sx={{ py: 1, color: "text.secondary" }}>
              <ReceiptLong fontSize="small" sx={{ opacity: 0.5 }} />
              <Typography variant="body2">No bill or payment proof attached</Typography>
            </Stack>
          ) : (
            <Stack direction="row" spacing={1.5} sx={{ mt: 1, flexWrap: "wrap" }}>
              {photos.map((p, i) => (
                <Stack key={p.id} alignItems="center" spacing={0.5}>
                  <Box
                    component="img"
                    src={p.url}
                    alt={p.description || "attachment"}
                    onClick={() => setLightboxIndex(i)}
                    sx={{
                      width: 88,
                      height: 88,
                      objectFit: "cover",
                      borderRadius: 1,
                      border: 1,
                      borderColor: "divider",
                      cursor: "pointer",
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    {p.description}
                  </Typography>
                </Stack>
              ))}
            </Stack>
          )}
        </DialogContent>

        {/* Reverse this settlement — recorder or office/admin only. */}
        {canReverse && (
          <DialogActions sx={{ px: 3, py: 2, display: "block" }}>
            {!confirmReverse ? (
              <Button
                color="error"
                size="small"
                startIcon={<Undo />}
                onClick={() => setConfirmReverse(true)}
              >
                Reverse this settlement
              </Button>
            ) : (
              <Stack spacing={1.25} sx={{ width: "100%" }}>
                <Typography variant="body2" color="error" fontWeight={700}>
                  Reverse this settlement?
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  This marks the laborers unpaid, removes the wallet debit and cancels the
                  settlement. Use it to undo a wrong or duplicate entry.
                </Typography>
                <TextField
                  size="small"
                  label="Reason (optional)"
                  value={reverseReason}
                  onChange={(e) => setReverseReason(e.target.value)}
                  fullWidth
                  disabled={reverseMutation.isPending}
                />
                {reverseMutation.isError && (
                  <Typography variant="caption" color="error">
                    {(reverseMutation.error as Error)?.message || "Couldn't reverse the settlement."}
                  </Typography>
                )}
                <Stack direction="row" spacing={1} justifyContent="flex-end">
                  <Button
                    size="small"
                    onClick={() => setConfirmReverse(false)}
                    disabled={reverseMutation.isPending}
                  >
                    Keep
                  </Button>
                  <Button
                    size="small"
                    color="error"
                    variant="contained"
                    onClick={handleReverse}
                    disabled={reverseMutation.isPending}
                  >
                    {reverseMutation.isPending ? "Reversing…" : "Confirm reverse"}
                  </Button>
                </Stack>
              </Stack>
            )}
          </DialogActions>
        )}
      </Dialog>

      <PhotoLightbox
        open={lightboxIndex !== null}
        photos={photos}
        startIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
      />
    </>
  );
}
