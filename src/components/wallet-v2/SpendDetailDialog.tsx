"use client";

import React, { useState } from "react";
import {
  Box,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  Typography,
} from "@mui/material";
import { Close, ReceiptLong } from "@mui/icons-material";
import dayjs from "dayjs";
import type { WalletLedgerEntry } from "@/types/engineer-wallet-v2.types";
import type { WorkPhoto } from "@/types/work-updates.types";
import PhotoLightbox from "@/components/dashboard/PhotoLightbox";
import { useMiscExpenseForTransaction } from "@/hooks/queries/useMiscExpenseForTransaction";
import {
  classifySpend,
  parseMiscReference,
  buildSpendPhotos,
  prettyPayerSource,
} from "./spendDetailHelpers";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(Number(n)));

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
  const kind = classifySpend(row?.description);
  const isMisc = kind === "misc";
  const miscQuery = useMiscExpenseForTransaction(
    open && isMisc ? row?.id ?? null : null
  );

  if (!row) return null;

  const misc = miscQuery.data ?? null;
  const isReturn = row.transaction_type === "return";
  const reference = parseMiscReference(row.description);
  const photos: WorkPhoto[] = buildSpendPhotos(row, misc);
  const payerKey = misc?.payer_source ?? row.payer_source ?? null;
  const payerName = misc?.payer_name ?? row.payer_name ?? null;
  const noteText = misc?.notes ?? row.notes;

  return (
    <>
      <Dialog open={open} onClose={onClose} fullWidth maxWidth="xs">
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
            onClick={onClose}
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
