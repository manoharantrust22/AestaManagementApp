"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useUpdateRentalSettlement } from "@/hooks/queries/useRentals";
import {
  RENTAL_SETTLEMENT_PARTY_LABELS,
  type RentalSettlement,
} from "@/types/rental.types";
import { createClient } from "@/lib/supabase/client";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import FileUploader, { type UploadedFile } from "@/components/common/FileUploader";

interface Props {
  open: boolean;
  onClose: () => void;
  settlement: RentalSettlement;
  siteId: string;
  orderId: string;
}

const PAYER_SOURCES = ["Company Account", "Site Cash", "Engineer Wallet", "Own Money"];
const PAYMENT_MODES = ["Cash", "Bank Transfer", "UPI", "Cheque"];

const today = new Date().toISOString().split("T")[0];

function toUploadedFile(url: string | null): UploadedFile | null {
  if (!url) return null;
  const name = url.split("/").pop() ?? "file";
  return { url, name, size: 0, type: "image/jpeg" };
}

export function RentalSettlementEditDialog({ open, onClose, settlement, siteId, orderId }: Props) {
  const update = useUpdateRentalSettlement();
  const supabase = useMemo(() => createClient(), []);
  const { data: subcontracts } = useSiteSubcontracts(siteId);

  const [date, setDate] = useState(settlement.settlement_date ?? today);
  const [amount, setAmount] = useState(
    settlement.negotiated_final_amount ?? settlement.balance_amount ?? 0
  );
  const [paymentMode, setPaymentMode] = useState(settlement.payment_mode ?? "Cash");
  const [payerSource, setPayerSource] = useState(settlement.payer_source ?? "Company Account");
  const [partyName, setPartyName] = useState(settlement.party_name ?? "");
  const [subcontractId, setSubcontractId] = useState<string | null>(settlement.subcontract_id);
  const [notes, setNotes] = useState(settlement.notes ?? "");

  const [upiProof, setUpiProof] = useState<UploadedFile | null>(
    toUploadedFile(settlement.upi_screenshot_url)
  );
  const [vendorBill, setVendorBill] = useState<UploadedFile | null>(
    toUploadedFile(settlement.vendor_bill_url)
  );
  const [calcSheet, setCalcSheet] = useState<UploadedFile | null>(
    toUploadedFile(settlement.final_receipt_url)
  );

  const [error, setError] = useState("");

  const partyLabel =
    RENTAL_SETTLEMENT_PARTY_LABELS[settlement.party_type] ?? settlement.party_type;
  const isUpi = paymentMode === "UPI";

  const handleSave = async () => {
    setError("");
    try {
      await update.mutateAsync({
        id: settlement.id,
        rental_order_id: orderId,
        settlement_date: date,
        negotiated_final_amount: amount,
        balance_amount: amount,
        payment_mode: paymentMode,
        payer_source: payerSource,
        party_name: partyName || null,
        subcontract_id: subcontractId,
        notes: notes || null,
        upi_screenshot_url: upiProof?.url ?? null,
        vendor_bill_url: vendorBill?.url ?? null,
        final_receipt_url: calcSheet?.url ?? null,
      });
      onClose();
    } catch (err: any) {
      setError(err?.message ?? "Failed to update settlement");
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>
        Edit Settlement — {partyLabel}
      </DialogTitle>

      <DialogContent>
        <Stack spacing={1.5} sx={{ pt: 0.5 }}>
          {/* Reference (read-only) */}
          {settlement.settlement_reference && (
            <Typography variant="caption" color="text.secondary">
              Ref: {settlement.settlement_reference}
            </Typography>
          )}

          {/* Party name (for transport rows) */}
          {settlement.party_type !== "vendor" && (
            <TextField
              label="Person name"
              size="small"
              fullWidth
              value={partyName}
              onChange={(e) => setPartyName(e.target.value)}
            />
          )}

          {/* Settlement date */}
          <TextField
            label="Settlement Date"
            type="date"
            size="small"
            fullWidth
            value={date}
            onChange={(e) => setDate(e.target.value)}
            inputProps={{ max: today }}
            InputLabelProps={{ shrink: true }}
          />

          {/* Amount */}
          <TextField
            label="Final Settled Amount (₹)"
            type="number"
            size="small"
            fullWidth
            value={amount}
            onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
            helperText={
              settlement.total_rental_amount > 0
                ? `Gross rental: ₹${settlement.total_rental_amount.toLocaleString("en-IN")} · Advance: ₹${settlement.total_advance_paid.toLocaleString("en-IN")}`
                : undefined
            }
          />

          {/* Payer source */}
          <Select
            size="small"
            fullWidth
            value={payerSource}
            onChange={(e) => setPayerSource(e.target.value)}
            displayEmpty
          >
            {PAYER_SOURCES.map((s) => (
              <MenuItem key={s} value={s}>{s}</MenuItem>
            ))}
          </Select>

          {/* Payment mode */}
          <Select
            size="small"
            fullWidth
            value={paymentMode}
            onChange={(e) => {
              setPaymentMode(e.target.value);
              if (e.target.value !== "UPI") setUpiProof(null);
            }}
          >
            {PAYMENT_MODES.map((m) => (
              <MenuItem key={m} value={m}>{m}</MenuItem>
            ))}
          </Select>

          {/* UPI screenshot */}
          {isUpi && (
            <FileUploader
              supabase={supabase as any}
              bucketName="settlement-proofs"
              folderPath={`rentals/${siteId}/${orderId}/${settlement.party_type}/edit`}
              fileNamePrefix="upi"
              accept="image"
              maxSizeMB={10}
              label="UPI Screenshot"
              helperText="Screenshot of UPI payment"
              value={upiProof}
              onUpload={setUpiProof}
              onRemove={() => setUpiProof(null)}
              compact
            />
          )}

          {/* Vendor Bill */}
          <FileUploader
            supabase={supabase as any}
            bucketName="settlement-proofs"
            folderPath={`rentals/${siteId}/${orderId}/${settlement.party_type}/bills`}
            fileNamePrefix="bill"
            accept="image"
            maxSizeMB={15}
            label="Vendor Bill / Invoice (optional)"
            helperText="Photo or scan of vendor's bill"
            value={vendorBill}
            onUpload={setVendorBill}
            onRemove={() => setVendorBill(null)}
            compact
          />

          {/* Calculation sheet */}
          <FileUploader
            supabase={supabase as any}
            bucketName="settlement-proofs"
            folderPath={`rentals/${siteId}/${orderId}/${settlement.party_type}/calc`}
            fileNamePrefix="calc"
            accept="image"
            maxSizeMB={15}
            label="Calculation Sheet (optional)"
            helperText="Manual calculation or handwritten note"
            value={calcSheet}
            onUpload={setCalcSheet}
            onRemove={() => setCalcSheet(null)}
            compact
          />

          {/* Subcontract link */}
          {subcontracts && subcontracts.length > 0 && (
            <Autocomplete
              size="small"
              options={subcontracts}
              getOptionLabel={(s) =>
                `${s.title}${s.laborer_name ? ` — ${s.laborer_name}` : ""}`
              }
              value={subcontracts.find((s) => s.id === subcontractId) ?? null}
              onChange={(_, val) => setSubcontractId(val?.id ?? null)}
              slotProps={{ popper: { disablePortal: false } }}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label="Link to Subcontract / Mesthri (optional)"
                />
              )}
            />
          )}

          {/* Notes */}
          <TextField
            label="Notes (optional)"
            size="small"
            fullWidth
            multiline
            minRows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={update.isPending}>Cancel</Button>
        <Button
          variant="contained"
          color="success"
          onClick={handleSave}
          disabled={update.isPending}
        >
          {update.isPending ? "Saving…" : "Save Changes"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
