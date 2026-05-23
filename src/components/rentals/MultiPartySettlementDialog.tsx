"use client";

import { useMemo, useState } from "react";
import {
  Alert,
  Autocomplete,
  Box,
  Button,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWallet";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import SkipNextIcon from "@mui/icons-material/SkipNext";
import { useCreateRentalSettlementParty } from "@/hooks/queries/useRentals";
import {
  RENTAL_SETTLEMENT_PARTY_LABELS,
  type RentalOrderWithDetails,
  type RentalSettlementPartyType,
} from "@/types/rental.types";
import { calculateSpentToDate } from "@/lib/utils/rentalCostUtils";
import { useAuth } from "@/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { recordSpend } from "@/lib/services/engineerWalletV2";
import { useSiteSubcontracts } from "@/hooks/queries/useSubcontracts";
import FileUploader, { type UploadedFile } from "@/components/common/FileUploader";

interface MultiPartySettlementDialogProps {
  open: boolean;
  onClose: () => void;
  order: RentalOrderWithDetails;
  focusedPartyType?: RentalSettlementPartyType;
}

interface PartyState {
  skipped: boolean;
  payer_source: string;
  payment_mode: string;
  party_name: string;
  amount: number;
  settlement_date: string;
  subcontract_id: string | null;
  upi_proof: UploadedFile | null;
}

const PAYER_SOURCES = ["Company Account", "Site Cash", "Engineer Wallet"];
const PAYMENT_MODES = ["Cash", "Bank Transfer", "UPI", "Cheque"];
const ENGINEER_PAYMENT_MODES = ["Cash", "UPI", "Bank Transfer"];

const WALLET_PAYMENT_MODE_MAP: Record<string, "cash" | "upi" | "bank_transfer"> = {
  Cash: "cash",
  UPI: "upi",
  "Bank Transfer": "bank_transfer",
  Cheque: "bank_transfer",
};

const today = new Date().toISOString().split("T")[0];

export function MultiPartySettlementDialog({ open, onClose, order, focusedPartyType }: MultiPartySettlementDialogProps) {
  const settleParty = useCreateRentalSettlementParty();
  const { userProfile } = useAuth();
  const isSiteEngineer = userProfile?.role === "site_engineer";
  const supabase = useMemo(() => createClient(), []);

  const { data: subcontracts } = useSiteSubcontracts(order.site_id);

  const totalAdvances = (order.advances ?? []).reduce((s, a) => s + (a.amount ?? 0), 0);
  const rentalAmount =
    order.status === "completed" && order.actual_total != null
      ? order.actual_total
      : calculateSpentToDate(
          order.items as any ?? [],
          order.returns ?? [],
          order.start_date ?? order.order_date
        );
  const inboundAmount = order.transport_cost_outward ?? 0;
  const outboundAmount = order.transport_cost_return ?? 0;
  const loadingAmount =
    (order.loading_cost_outward ?? 0) +
    (order.unloading_cost_outward ?? 0) +
    ((order as any).loading_cost_return ?? 0) +
    ((order as any).unloading_cost_return ?? 0);

  // Vendor-handled transport (handler in 'vendor' or NULL) is part of the vendor's bill,
  // not a separate party. Fold those amounts into the vendor balance and omit the
  // separate transport rows from the party list.
  const inboundIsVendor = order.outward_by == null || order.outward_by === "vendor";
  const outboundIsVendor = order.return_by == null || order.return_by === "vendor";
  const vendorBundledTransport =
    (inboundIsVendor ? inboundAmount : 0) +
    (outboundIsVendor ? outboundAmount : 0);

  // Defense-in-depth: if a caller focuses a transport party but the handler is vendor,
  // coerce to vendor so we never render an empty/missing party row.
  const effectiveFocusedPartyType: typeof focusedPartyType =
    focusedPartyType === "transport_inbound" && inboundIsVendor ? "vendor"
    : focusedPartyType === "transport_outbound" && outboundIsVendor ? "vendor"
    : focusedPartyType;

  const grossTotal = rentalAmount + inboundAmount + outboundAmount;
  const vendorBalance = Math.max(0, rentalAmount + vendorBundledTransport - totalAdvances);

  const alreadySettled = new Set((order.settlements ?? []).map((s) => s.party_type));
  const defaultPayer = isSiteEngineer ? "Engineer Wallet" : "Company Account";

  // Default settlement date: use actual_return_date for completed orders, else today
  const defaultDate = order.actual_return_date
    ? order.actual_return_date.split("T")[0]
    : today;

  const makeParty = (amount: number, skipped: boolean): PartyState => ({
    skipped,
    payer_source: defaultPayer,
    payment_mode: isSiteEngineer ? "Cash" : "Cash",
    party_name: "",
    amount,
    settlement_date: defaultDate,
    subcontract_id: null,
    upi_proof: null,
  });

  const [parties, setParties] = useState<Record<RentalSettlementPartyType, PartyState>>({
    vendor: {
      ...makeParty(vendorBalance, false),
      payment_mode: isSiteEngineer ? "Cash" : "Bank Transfer",
      party_name: order.vendor?.name ?? "",
    },
    transport: makeParty(inboundAmount + outboundAmount, true),
    transport_inbound: makeParty(inboundAmount, inboundIsVendor || inboundAmount === 0),
    transport_outbound: makeParty(outboundAmount, outboundIsVendor || outboundAmount === 0),
    loading_unloading: { ...makeParty(loadingAmount, true), party_name: "Site Laborers" },
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateParty = (type: RentalSettlementPartyType, patch: Partial<PartyState>) =>
    setParties((prev) => ({ ...prev, [type]: { ...prev[type], ...patch } }));

  const handleSettle = async (partyType: RentalSettlementPartyType) => {
    const p = parties[partyType];
    setErrors((prev) => ({ ...prev, [partyType]: "" }));

    try {
      let engineerTransactionId: string | null = null;
      const isEngineerWallet = isSiteEngineer || p.payer_source === "Engineer Wallet";

      if (isEngineerWallet && userProfile?.id && order.site_id) {
        const walletMode = WALLET_PAYMENT_MODE_MAP[p.payment_mode] ?? "cash";
        const result = await recordSpend(supabase as any, {
          engineer_id: userProfile.id,
          site_id: order.site_id,
          amount: p.amount,
          payment_mode: walletMode,
          transaction_date: p.settlement_date,
          description: `Rental settlement — ${order.rental_order_number} (${RENTAL_SETTLEMENT_PARTY_LABELS[partyType]})`,
          recorded_by: userProfile.name ?? userProfile.id,
          recorded_by_user_id: userProfile.id,
        });
        engineerTransactionId = result.id;
      }

      const { data: refData } = await supabase.rpc("generate_rental_settlement_reference", {
        p_site_id: order.site_id!,
      });
      const settlementRef = refData || `RSET-${Date.now().toString(36).toUpperCase()}`;

      const isTransport = partyType === "transport_inbound" || partyType === "transport_outbound";

      await settleParty.mutateAsync({
        rental_order_id: order.id,
        party_type: partyType,
        party_name: p.party_name || null,
        settlement_date: p.settlement_date,
        total_rental_amount: partyType === "vendor" ? rentalAmount : 0,
        total_transport_amount: isTransport ? p.amount : 0,
        total_damage_amount: 0,
        negotiated_final_amount: p.amount,
        total_advance_paid: partyType === "vendor" ? totalAdvances : 0,
        balance_amount: p.amount,
        payment_mode: p.payment_mode,
        payment_channel: isEngineerWallet ? "engineer_wallet" : "direct",
        payer_source: isEngineerWallet ? "own_money" : p.payer_source,
        payer_name: p.party_name,
        engineer_transaction_id: engineerTransactionId,
        settlement_reference: settlementRef,
        subcontract_id: p.subcontract_id ?? undefined,
        upi_screenshot_url: p.upi_proof?.url ?? undefined,
      });
    } catch (err: any) {
      setErrors((prev) => ({ ...prev, [partyType]: err?.message ?? "Settlement failed" }));
    }
  };

  const activePartyTypes: RentalSettlementPartyType[] = [
    "vendor",
    ...(!inboundIsVendor ? (["transport_inbound"] as const) : []),
    ...(!outboundIsVendor ? (["transport_outbound"] as const) : []),
    "loading_unloading",
  ];

  // Only show parties that haven't been settled yet; if effectiveFocusedPartyType is set, show only that one
  const visiblePartyTypes = effectiveFocusedPartyType
    ? activePartyTypes.filter((pt) => pt === effectiveFocusedPartyType && !alreadySettled.has(pt))
    : activePartyTypes.filter((pt) => !alreadySettled.has(pt));

  const partyColors: Record<RentalSettlementPartyType, "success" | "info" | "warning"> = {
    vendor: "success",
    transport: "info",
    transport_inbound: "info",
    transport_outbound: "info",
    loading_unloading: "warning",
  };

  const originalAmounts: Partial<Record<RentalSettlementPartyType, number>> = {
    vendor: vendorBalance,
    transport_inbound: inboundIsVendor ? 0 : inboundAmount,
    transport_outbound: outboundIsVendor ? 0 : outboundAmount,
    loading_unloading: loadingAmount,
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        {effectiveFocusedPartyType
          ? `${RENTAL_SETTLEMENT_PARTY_LABELS[effectiveFocusedPartyType]} Settlement — ${order.rental_order_number}`
          : `Settlement — ${order.rental_order_number}`}
      </DialogTitle>

      {/* Summary bar */}
      <Box sx={{ px: 2.5, pb: 1 }}>
        <Stack direction="row" spacing={1}>
          <Box sx={{ flex: 1, bgcolor: "success.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>RENTAL</Typography>
            <Typography variant="body2" fontWeight={700}>₹{rentalAmount.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "info.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>INBOUND</Typography>
            <Typography variant="body2" fontWeight={700}>₹{inboundAmount.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "info.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>OUTBOUND</Typography>
            <Typography variant="body2" fontWeight={700}>₹{outboundAmount.toLocaleString("en-IN")}</Typography>
          </Box>
          <Box sx={{ flex: 1, bgcolor: "warning.light", borderRadius: 1, p: 1, textAlign: "center" }}>
            <Typography variant="caption" display="block" sx={{ fontSize: 9 }}>LOADING</Typography>
            <Typography variant="body2" fontWeight={700}>₹{loadingAmount.toLocaleString("en-IN")}</Typography>
          </Box>
        </Stack>

        {/* Gross total + advances context */}
        <Box sx={{ mt: 1, p: 1, bgcolor: "grey.50", borderRadius: 1 }}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="caption" color="text.secondary">Gross Total</Typography>
            <Typography variant="caption" fontWeight={600}>₹{grossTotal.toLocaleString("en-IN")}</Typography>
          </Box>
          {totalAdvances > 0 && (
            <Box display="flex" justifyContent="space-between">
              <Typography variant="caption" color="text.secondary">Advances Paid</Typography>
              <Typography variant="caption" color="warning.main" fontWeight={600}>− ₹{totalAdvances.toLocaleString("en-IN")}</Typography>
            </Box>
          )}
          <Box display="flex" justifyContent="space-between" sx={{ borderTop: "1px solid", borderColor: "divider", mt: 0.5, pt: 0.5 }}>
            <Typography variant="caption" color="text.secondary">Balance to Settle</Typography>
            <Typography variant="caption" fontWeight={700} color="success.main">₹{(grossTotal - totalAdvances).toLocaleString("en-IN")}</Typography>
          </Box>
        </Box>
      </Box>

      {isSiteEngineer && (
        <Box sx={{ px: 2.5, pb: 1 }}>
          <Alert severity="info" icon={<AccountBalanceWalletIcon fontSize="small" />} sx={{ py: 0.5 }}>
            Settlements will be deducted from your engineer wallet
          </Alert>
        </Box>
      )}

      <DialogContent sx={{ pt: 1 }}>
        {visiblePartyTypes.map((partyType) => {
          const p = parties[partyType];
          const isSettled = alreadySettled.has(partyType);
          const color = partyColors[partyType];
          const original = originalAmounts[partyType] ?? 0;
          const isNegotiated = Math.abs(p.amount - original) > 0.01;
          const isUpi = p.payment_mode === "UPI";

          return (
            <Box
              key={partyType}
              sx={{
                border: "1px solid",
                borderColor: `${color}.main`,
                borderRadius: 2,
                p: 1.5,
                mb: 1.5,
                opacity: p.skipped ? 0.5 : 1,
              }}
            >
              <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                <Box>
                  <Typography variant="caption" color={`${color}.dark`} fontWeight={700}>
                    {RENTAL_SETTLEMENT_PARTY_LABELS[partyType].toUpperCase()}
                  </Typography>
                  <Typography variant="subtitle2" fontWeight={700}>
                    {p.party_name || "—"}
                  </Typography>
                </Box>
                {isSettled ? (
                  <Chip icon={<CheckCircleIcon />} label="Settled" size="small" color="success" />
                ) : p.skipped ? (
                  <Chip icon={<SkipNextIcon />} label="Skipped" size="small" color="default" />
                ) : null}
              </Box>

              {!isSettled && !p.skipped && (
                <>
                  {partyType !== "vendor" && (
                    <TextField
                      label="Person name"
                      size="small"
                      fullWidth
                      value={p.party_name}
                      onChange={(e) => updateParty(partyType, { party_name: e.target.value })}
                      sx={{ mb: 1 }}
                    />
                  )}

                  {/* Settlement date */}
                  <TextField
                    label="Settlement Date"
                    type="date"
                    size="small"
                    fullWidth
                    value={p.settlement_date}
                    onChange={(e) => updateParty(partyType, { settlement_date: e.target.value })}
                    inputProps={{ max: today }}
                    sx={{ mb: 1 }}
                    InputLabelProps={{ shrink: true }}
                  />

                  {/* Amount + payer */}
                  <Stack direction="row" spacing={1} sx={{ mb: 0.5 }}>
                    <Box sx={{ flex: 1 }}>
                      <TextField
                        label="Negotiated Final Amount (₹)"
                        type="number"
                        size="small"
                        fullWidth
                        value={p.amount}
                        onChange={(e) => updateParty(partyType, { amount: parseFloat(e.target.value) || 0 })}
                      />
                    </Box>
                    {!isSiteEngineer ? (
                      <Select
                        size="small"
                        value={p.payer_source}
                        onChange={(e) => updateParty(partyType, { payer_source: e.target.value })}
                        sx={{ flex: 1 }}
                      >
                        {PAYER_SOURCES.map((s) => (
                          <MenuItem key={s} value={s}>{s}</MenuItem>
                        ))}
                      </Select>
                    ) : (
                      <Box sx={{ flex: 1, display: "flex", alignItems: "center", gap: 0.5, px: 1, border: "1px solid", borderColor: "divider", borderRadius: 1 }}>
                        <AccountBalanceWalletIcon fontSize="small" color="action" />
                        <Typography variant="body2" color="text.secondary">Engineer Wallet</Typography>
                      </Box>
                    )}
                  </Stack>

                  {/* Bargain hint */}
                  {original > 0 && (
                    <Box sx={{ mb: 1 }}>
                      {isNegotiated ? (
                        <Typography variant="caption" color="warning.main">
                          Bargained down from ₹{original.toLocaleString("en-IN")} — saving ₹{(original - p.amount).toLocaleString("en-IN")}
                        </Typography>
                      ) : (
                        <Typography variant="caption" color="text.secondary">
                          Full amount: ₹{original.toLocaleString("en-IN")}
                          {partyType === "vendor" && totalAdvances > 0 && ` (after ₹${totalAdvances.toLocaleString("en-IN")} advance)`}
                        </Typography>
                      )}
                    </Box>
                  )}

                  {/* Payment mode */}
                  <Select
                    size="small"
                    fullWidth
                    value={p.payment_mode}
                    onChange={(e) => {
                      updateParty(partyType, { payment_mode: e.target.value, upi_proof: null });
                    }}
                    sx={{ mb: 1 }}
                  >
                    {(isSiteEngineer ? ENGINEER_PAYMENT_MODES : PAYMENT_MODES).map((m) => (
                      <MenuItem key={m} value={m}>{m}</MenuItem>
                    ))}
                  </Select>

                  {/* UPI screenshot upload */}
                  {isUpi && (
                    <Box sx={{ mb: 1 }}>
                      <FileUploader
                        supabase={supabase as any}
                        bucketName="settlement-proofs"
                        folderPath={`rentals/${order.site_id}/${order.id}/${partyType}`}
                        fileNamePrefix="upi"
                        accept="image"
                        maxSizeMB={10}
                        label="UPI screenshot"
                        helperText="Upload UPI payment screenshot"
                        value={p.upi_proof}
                        onUpload={(file) => updateParty(partyType, { upi_proof: file })}
                        onRemove={() => updateParty(partyType, { upi_proof: null })}
                        compact
                      />
                    </Box>
                  )}

                  {/* Subcontract / Mesthri link */}
                  {subcontracts && subcontracts.length > 0 && (
                    <Autocomplete
                      size="small"
                      options={subcontracts}
                      getOptionLabel={(s) =>
                        `${s.title}${s.laborer_name ? ` — ${s.laborer_name}` : ""}`
                      }
                      value={subcontracts.find((s) => s.id === p.subcontract_id) ?? null}
                      onChange={(_, val) => updateParty(partyType, { subcontract_id: val?.id ?? null })}
                      slotProps={{ popper: { disablePortal: false } }}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label="Link to Subcontract / Mesthri (optional)"
                          placeholder="Search subcontracts…"
                        />
                      )}
                      sx={{ mb: 1 }}
                    />
                  )}

                  {errors[partyType] && (
                    <Alert severity="error" sx={{ mb: 1, py: 0 }}>{errors[partyType]}</Alert>
                  )}

                  <Stack direction="row" spacing={1}>
                    <Button
                      variant="contained"
                      color={color}
                      size="small"
                      onClick={() => handleSettle(partyType)}
                      disabled={settleParty.isPending || (isUpi && !p.upi_proof)}
                      sx={{ flex: 1 }}
                    >
                      Settle ₹{p.amount.toLocaleString("en-IN")}
                    </Button>
                    {partyType !== "vendor" && (
                      <Button
                        variant="outlined"
                        size="small"
                        onClick={() => updateParty(partyType, { skipped: true })}
                        sx={{ fontSize: 10 }}
                      >
                        {partyType === "loading_unloading" ? "Skip — our laborers" : "Skip — vendor included"}
                      </Button>
                    )}
                  </Stack>
                </>
              )}
            </Box>
          );
        })}
      </DialogContent>
    </Dialog>
  );
}
