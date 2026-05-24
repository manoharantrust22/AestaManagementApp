"use client";

/**
 * CreateRentalV2Dialog — the spec's biggest UX win: one form that replaces
 * the v1 trio (New Request / Historical Record / New Rental).
 *
 * Mode is driven by the "Already happened? Record as historical" toggle.
 *
 *   Forward mode (toggle OFF):
 *     - Creates an active rental via useCreateRentalOrder.
 *     - Status will be 'confirmed' (the hook hardcodes that). The engineer
 *       then runs the row's "Verify delivery" to flip it to active.
 *
 *   Historical mode (toggle ON):
 *     - "All returned"   → useCreateHistoricalRental, status='completed',
 *       actual_return_date pre-filled, items pre-marked qty_returned=qty.
 *     - "Fully settled"  → useCreateHistoricalRental, status='completed',
 *       plus an inline vendor settlement record.
 *     - "Still on site"  → disabled in v1 of v2 (hook only supports
 *       draft/completed). A small TODO chip surfaces this gap. Use the v1
 *       page for now.
 *
 * Items list is intentionally simple in v1: catalog dropdown + qty + rate +
 * rate_type. Variants, per-item start/end, and the full v1 EstimateBasket are
 * deferred. Most real-world rentals are 1-3 lines; this covers the 80% case.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  FormControlLabel,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Paper,
  Radio,
  RadioGroup,
  Select,
  Stack,
  Switch,
  TextField,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import AddIcon from "@mui/icons-material/Add";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import HistoryIcon from "@mui/icons-material/History";
import RentalStoreSelector from "@/components/rentals/RentalStoreSelector";
import {
  useCreateHistoricalRental,
  useCreateRentalOrder,
  useCreateRentalSettlementParty,
  useRentalItems,
} from "@/hooks/queries/useRentals";
import { hubTokens } from "@/lib/material-hub/tokens";
import { inr } from "@/lib/rental-hub/formatters";
import type {
  HistoricalRentalFormData,
  RentalOrderFormData,
} from "@/types/rental.types";
import dayjs from "dayjs";

type HistoricalSubStatus = "still_on_site" | "all_returned" | "fully_settled";
type TransportHandler = "vendor" | "company" | "laborer";
type RateType = "daily" | "hourly";

interface ItemRow {
  id: string;
  rentalItemId: string;
  itemNameOverride: string; // for historical only
  quantity: number;
  dailyRate: number;
  rateType: RateType;
  hoursUsed?: number;
}

export interface CreateRentalV2DialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
}

const PAYER_SOURCES = ["Company Account", "Site Cash", "Engineer Wallet"];
const PAYMENT_MODES = ["Cash", "Bank Transfer", "UPI", "Cheque"];

let rowKey = 0;
const newRowKey = () => `row-${++rowKey}-${Date.now()}`;

function makeBlankRow(): ItemRow {
  return {
    id: newRowKey(),
    rentalItemId: "",
    itemNameOverride: "",
    quantity: 1,
    dailyRate: 0,
    rateType: "daily",
  };
}

export default function CreateRentalV2Dialog({
  open,
  onClose,
  siteId,
}: CreateRentalV2DialogProps) {
  const createOrder = useCreateRentalOrder();
  const createHistorical = useCreateHistoricalRental();
  const createSettlement = useCreateRentalSettlementParty();
  const { data: catalogItems = [] } = useRentalItems();

  const [isHistorical, setIsHistorical] = useState(false);
  const [historicalStatus, setHistoricalStatus] =
    useState<HistoricalSubStatus>("all_returned");

  const [vendorId, setVendorId] = useState("");
  const [pickupDate, setPickupDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [returnDate, setReturnDate] = useState("");
  const [excludeStartDate, setExcludeStartDate] = useState(false);

  const [items, setItems] = useState<ItemRow[]>([makeBlankRow()]);

  const [transportHandler, setTransportHandler] = useState<TransportHandler>("vendor");
  const [transportCost, setTransportCost] = useState<string>("");
  const [loadingCost, setLoadingCost] = useState<string>("");
  const [unloadingCost, setUnloadingCost] = useState<string>("");

  const [discountPct, setDiscountPct] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const [payerSource, setPayerSource] = useState("Site Cash");
  const [paymentMode, setPaymentMode] = useState("Cash");

  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setIsHistorical(false);
      setHistoricalStatus("all_returned");
      setVendorId("");
      setPickupDate(dayjs().format("YYYY-MM-DD"));
      setReturnDate("");
      setExcludeStartDate(false);
      setItems([makeBlankRow()]);
      setTransportHandler("vendor");
      setTransportCost("");
      setLoadingCost("");
      setUnloadingCost("");
      setDiscountPct("");
      setNotes("");
      setPayerSource("Site Cash");
      setPaymentMode("Cash");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  // ─── derived totals ─────────────────────────────────────────────
  const days = useMemo(() => {
    if (!returnDate) return 1;
    const ms = new Date(returnDate).getTime() - new Date(pickupDate).getTime();
    if (Number.isNaN(ms) || ms < 0) return 1;
    return Math.max(
      1,
      Math.ceil(ms / (1000 * 60 * 60 * 24)) + (excludeStartDate ? 0 : 1),
    );
  }, [pickupDate, returnDate, excludeStartDate]);

  const itemsSubtotal = useMemo(
    () =>
      items.reduce((sum, r) => {
        if (r.rateType === "hourly") return sum + r.quantity * r.dailyRate * (r.hoursUsed ?? 0);
        return sum + r.quantity * r.dailyRate * days;
      }, 0),
    [items, days],
  );

  const transportTotal = useMemo(() => {
    if (transportHandler === "vendor") return 0;
    return (Number(transportCost) || 0) + (Number(loadingCost) || 0) + (Number(unloadingCost) || 0);
  }, [transportHandler, transportCost, loadingCost, unloadingCost]);

  const discountAmount = useMemo(() => {
    const pct = Number(discountPct) || 0;
    return (itemsSubtotal * pct) / 100;
  }, [itemsSubtotal, discountPct]);

  const grandTotal = itemsSubtotal + transportTotal - discountAmount;

  const stillOnSiteDisabled = isHistorical && historicalStatus === "still_on_site";

  const itemsValid = items.every(
    (r) =>
      r.quantity > 0 &&
      r.dailyRate >= 0 &&
      (isHistorical
        ? r.itemNameOverride.trim().length > 0
        : r.rentalItemId.length > 0),
  );

  const canSubmit =
    !!vendorId &&
    !!pickupDate &&
    (!isHistorical || !!returnDate) &&
    itemsValid &&
    items.length > 0 &&
    !stillOnSiteDisabled;

  // ─── submit handlers ─────────────────────────────────────────────
  const submitForward = async () => {
    const itemPayload = items.map((r) => ({
      rental_item_id: r.rentalItemId,
      quantity: r.quantity,
      daily_rate_default: r.dailyRate,
      daily_rate_actual: r.dailyRate,
      rate_type: r.rateType,
      hours_used: r.rateType === "hourly" ? r.hoursUsed ?? 0 : undefined,
      item_start_date: pickupDate,
      item_expected_return_date: returnDate || undefined,
    }));

    const payload: RentalOrderFormData = {
      site_id: siteId,
      vendor_id: vendorId,
      start_date: pickupDate,
      expected_return_date: returnDate || undefined,
      transport_cost_outward:
        transportHandler !== "vendor" ? Number(transportCost) || 0 : 0,
      loading_cost_outward:
        transportHandler !== "vendor" ? Number(loadingCost) || 0 : 0,
      unloading_cost_outward:
        transportHandler !== "vendor" ? Number(unloadingCost) || 0 : 0,
      outward_by: transportHandler,
      notes: notes || undefined,
      negotiated_discount_percentage: Number(discountPct) || 0,
      exclude_start_date: excludeStartDate,
      items: itemPayload,
    };

    await createOrder.mutateAsync(payload);
  };

  const submitHistorical = async () => {
    const inbound =
      transportHandler === "vendor"
        ? { amount: 0, paid_to: "vendor" as const }
        : {
            amount: Number(transportCost) || 0,
            paid_to: "driver" as const,
            driver_name: undefined,
          };

    const itemPayload = items.map((r) => ({
      item_name: r.itemNameOverride,
      rental_item_id: r.rentalItemId || null,
      rental_item_size_id: null,
      size_label: null,
      quantity: r.quantity,
      daily_rate: r.dailyRate,
      days,
    }));

    const includeSettlement = historicalStatus === "fully_settled";

    const payload: HistoricalRentalFormData = {
      site_id: siteId,
      vendor_id: vendorId,
      start_date: pickupDate,
      end_date: returnDate || pickupDate,
      exclude_start_date: excludeStartDate,
      items: itemPayload,
      rental_total: itemsSubtotal,
      inbound_transport:
        transportHandler === "vendor" || inbound.amount > 0 ? inbound : undefined,
      advances: [],
      settlement: includeSettlement
        ? {
            final_amount: grandTotal,
            settlement_date: returnDate || pickupDate,
            payer_source: payerSource,
            payment_mode: paymentMode,
          }
        : undefined,
      bill_ref: notes || undefined,
      status: "completed",
    };

    await createHistorical.mutateAsync(payload);
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError(null);
    setBusy(true);
    try {
      if (isHistorical) {
        await submitHistorical();
      } else {
        await submitForward();
      }
      onClose();
    } catch (err) {
      setError((err as Error)?.message ?? "Failed to create rental");
    } finally {
      setBusy(false);
    }
  };

  // ─── render helpers ──────────────────────────────────────────────
  const updateItem = (idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };
  const removeItem = (idx: number) => {
    setItems((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)));
  };
  const addItem = () => setItems((prev) => [...prev, makeBlankRow()]);

  const pickupLabel = isHistorical ? "Actual pickup date" : "Pickup date";
  const returnLabel = isHistorical ? "Actual return date" : "Expected return date";

  return (
    <Dialog
      open={open}
      onClose={busy ? undefined : onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: "14px" } }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          py: 1.5,
          borderBottom: `1px solid ${hubTokens.border}`,
        }}
      >
        <Box>
          <Typography sx={{ fontSize: 16, fontWeight: 700 }}>
            {isHistorical ? "Record historical rental" : "New rental"}
          </Typography>
          <Typography sx={{ fontSize: 12, color: hubTokens.muted }}>
            One unified form. Toggle &quot;Already happened?&quot; for backfill.
          </Typography>
        </Box>
        <IconButton onClick={onClose} disabled={busy} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
      </DialogTitle>

      <DialogContent sx={{ pt: 2 }}>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        <Stack spacing={2}>
          {/* 1. Historical toggle */}
          <Paper
            variant="outlined"
            sx={{
              p: 1.5,
              borderRadius: "10px",
              background: isHistorical ? hubTokens.warnSoft : hubTokens.bg,
              borderColor: isHistorical ? hubTokens.warn : hubTokens.border,
              transition: "all .15s",
            }}
          >
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Box sx={{ flex: 1 }}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={isHistorical}
                      onChange={(e) => setIsHistorical(e.target.checked)}
                    />
                  }
                  label={
                    <Box>
                      <Typography sx={{ fontSize: 13.5, fontWeight: 700 }}>
                        Already happened? Record as historical
                      </Typography>
                      <Typography sx={{ fontSize: 11.5, color: hubTokens.muted }}>
                        Work was done on site before opening the app. You&rsquo;re
                        backfilling now.
                      </Typography>
                    </Box>
                  }
                />
              </Box>
              {isHistorical && (
                <Box
                  sx={{
                    padding: "3px 8px",
                    background: hubTokens.warn,
                    color: "#fff",
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.6px",
                    borderRadius: "4px",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "5px",
                  }}
                >
                  <HistoryIcon sx={{ fontSize: 12 }} />
                  BACKFILL
                </Box>
              )}
            </Box>

            {isHistorical && (
              <Box sx={{ mt: 1.5, pl: 4 }}>
                <Typography sx={{ fontSize: 11, fontWeight: 700, color: hubTokens.muted, mb: 0.5 }}>
                  Status when recorded
                </Typography>
                <RadioGroup
                  value={historicalStatus}
                  onChange={(e) => setHistoricalStatus(e.target.value as HistoricalSubStatus)}
                  row
                  sx={{ gap: 0.5 }}
                >
                  <FormControlLabel
                    value="still_on_site"
                    disabled
                    control={<Radio size="small" />}
                    label={
                      <Box component="span" sx={{ fontSize: 12.5 }}>
                        Still on site{" "}
                        <Box
                          component="span"
                          sx={{
                            fontSize: 9.5,
                            color: hubTokens.subtle,
                            fontWeight: 700,
                            marginLeft: "4px",
                          }}
                        >
                          (use v1 for now)
                        </Box>
                      </Box>
                    }
                  />
                  <FormControlLabel
                    value="all_returned"
                    control={<Radio size="small" />}
                    label={<Box component="span" sx={{ fontSize: 12.5 }}>All returned</Box>}
                  />
                  <FormControlLabel
                    value="fully_settled"
                    control={<Radio size="small" />}
                    label={<Box component="span" sx={{ fontSize: 12.5 }}>Fully settled</Box>}
                  />
                </RadioGroup>
                {stillOnSiteDisabled && (
                  <Alert severity="info" sx={{ mt: 1, py: 0.25 }}>
                    Status &quot;Still on site&quot; isn&apos;t supported in v2 of
                    the create flow yet. Use the v1 page meanwhile.
                  </Alert>
                )}
              </Box>
            )}
          </Paper>

          {/* 3. Vendor */}
          <RentalStoreSelector
            value={vendorId}
            onChange={setVendorId}
            label="Vendor"
            required
          />

          {/* 4. Dates */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              type="date"
              label={pickupLabel}
              value={pickupDate}
              onChange={(e) => setPickupDate(e.target.value)}
              fullWidth
              required
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              type="date"
              label={returnLabel}
              value={returnDate}
              onChange={(e) => setReturnDate(e.target.value)}
              fullWidth
              required={isHistorical}
              InputLabelProps={{ shrink: true }}
              helperText={`Estimated ${days} day${days === 1 ? "" : "s"}`}
            />
          </Stack>

          {/* 5. Exclude start */}
          <FormControlLabel
            control={
              <Switch
                checked={excludeStartDate}
                onChange={(e) => setExcludeStartDate(e.target.checked)}
                size="small"
              />
            }
            label={
              <Box>
                <Typography sx={{ fontSize: 12.5, fontWeight: 600 }}>
                  Exclude start date from billing
                </Typography>
                <Typography sx={{ fontSize: 11, color: hubTokens.muted }}>
                  Common for centring/shuttering — day 1 is delivery, billing starts day 2.
                </Typography>
              </Box>
            }
          />

          {/* 6. Items */}
          <Box>
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                mb: 1,
              }}
            >
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: hubTokens.muted }}>
                Line items
              </Typography>
              <Button
                size="small"
                startIcon={<AddIcon fontSize="small" />}
                onClick={addItem}
                sx={{ textTransform: "none", fontWeight: 600 }}
              >
                Add line
              </Button>
            </Box>
            <Stack spacing={1}>
              {items.map((row, idx) => (
                <Paper
                  key={row.id}
                  variant="outlined"
                  sx={{ p: 1.5, borderRadius: "10px" }}
                >
                  <Stack direction={{ xs: "column", sm: "row" }} spacing={1} alignItems="center">
                    {/* Item picker / name */}
                    {isHistorical ? (
                      <TextField
                        label="Item name"
                        value={row.itemNameOverride}
                        onChange={(e) => updateItem(idx, { itemNameOverride: e.target.value })}
                        fullWidth
                        size="small"
                        required
                      />
                    ) : (
                      <FormControl size="small" fullWidth required>
                        <InputLabel>Catalog item</InputLabel>
                        <Select
                          label="Catalog item"
                          value={row.rentalItemId}
                          onChange={(e) =>
                            updateItem(idx, { rentalItemId: e.target.value })
                          }
                        >
                          {catalogItems.map((item) => (
                            <MenuItem key={item.id} value={item.id}>
                              {item.name}
                              {item.unit ? ` (${item.unit})` : ""}
                            </MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                    )}

                    {/* Qty */}
                    <TextField
                      label="Qty"
                      type="number"
                      value={row.quantity}
                      onChange={(e) =>
                        updateItem(idx, { quantity: Number(e.target.value) || 0 })
                      }
                      size="small"
                      sx={{ minWidth: 80 }}
                      inputProps={{ min: 1, step: 1 }}
                    />

                    {/* Rate */}
                    <TextField
                      label="Rate"
                      type="number"
                      value={row.dailyRate}
                      onChange={(e) =>
                        updateItem(idx, { dailyRate: Number(e.target.value) || 0 })
                      }
                      size="small"
                      sx={{ minWidth: 100 }}
                      InputProps={{
                        startAdornment: <InputAdornment position="start">₹</InputAdornment>,
                      }}
                      inputProps={{ min: 0, step: 1 }}
                    />

                    {/* Rate type */}
                    <FormControl size="small" sx={{ minWidth: 100 }}>
                      <Select
                        value={row.rateType}
                        onChange={(e) =>
                          updateItem(idx, { rateType: e.target.value as RateType })
                        }
                      >
                        <MenuItem value="daily">per day</MenuItem>
                        <MenuItem value="hourly">per hour</MenuItem>
                      </Select>
                    </FormControl>

                    {row.rateType === "hourly" && (
                      <TextField
                        label="Hours"
                        type="number"
                        value={row.hoursUsed ?? 0}
                        onChange={(e) =>
                          updateItem(idx, { hoursUsed: Number(e.target.value) || 0 })
                        }
                        size="small"
                        sx={{ minWidth: 80 }}
                        inputProps={{ min: 0, step: 0.5 }}
                      />
                    )}

                    {/* Remove */}
                    <IconButton
                      onClick={() => removeItem(idx)}
                      disabled={items.length === 1}
                      size="small"
                      sx={{ color: hubTokens.danger }}
                    >
                      <DeleteOutlineIcon fontSize="small" />
                    </IconButton>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Box>

          {/* 7. Transport handler */}
          <Box>
            <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: hubTokens.muted, mb: 0.75 }}>
              Transport · who handles it
            </Typography>
            <RadioGroup
              value={transportHandler}
              onChange={(e) => setTransportHandler(e.target.value as TransportHandler)}
              row
            >
              <FormControlLabel
                value="vendor"
                control={<Radio size="small" />}
                label={<Box component="span" sx={{ fontSize: 12.5 }}>Vendor (bundled)</Box>}
              />
              <FormControlLabel
                value="company"
                control={<Radio size="small" />}
                label={<Box component="span" sx={{ fontSize: 12.5 }}>Company truck/driver</Box>}
              />
              <FormControlLabel
                value="laborer"
                control={<Radio size="small" />}
                label={<Box component="span" sx={{ fontSize: 12.5 }}>On-site laborer</Box>}
              />
            </RadioGroup>
          </Box>

          {/* 8. Transport cost panel */}
          {transportHandler !== "vendor" && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: "10px",
                background: hubTokens.bg,
                border: `1px solid ${hubTokens.border}`,
              }}
            >
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <TextField
                  label="Transport ₹"
                  type="number"
                  value={transportCost}
                  onChange={(e) => setTransportCost(e.target.value)}
                  fullWidth
                  size="small"
                  inputProps={{ min: 0, step: 1 }}
                />
                <TextField
                  label="Loading ₹"
                  type="number"
                  value={loadingCost}
                  onChange={(e) => setLoadingCost(e.target.value)}
                  fullWidth
                  size="small"
                  inputProps={{ min: 0, step: 1 }}
                />
                <TextField
                  label="Unloading ₹"
                  type="number"
                  value={unloadingCost}
                  onChange={(e) => setUnloadingCost(e.target.value)}
                  fullWidth
                  size="small"
                  inputProps={{ min: 0, step: 1 }}
                />
              </Stack>
            </Box>
          )}

          {/* 9. Discount + Notes */}
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5}>
            <TextField
              label="Discount %"
              type="number"
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              size="small"
              sx={{ minWidth: 120, flex: { sm: "0 0 120px" } }}
              inputProps={{ min: 0, max: 100, step: 0.5 }}
            />
            <TextField
              label="Notes / bill ref"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              size="small"
              fullWidth
            />
          </Stack>

          {/* Settlement extras for Fully settled */}
          {isHistorical && historicalStatus === "fully_settled" && (
            <Box
              sx={{
                p: 1.5,
                borderRadius: "10px",
                background: hubTokens.successSoft,
                border: `1px solid ${hubTokens.success}`,
              }}
            >
              <Typography sx={{ fontSize: 12.5, fontWeight: 700, mb: 1 }}>
                Settlement details
              </Typography>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1}>
                <FormControl size="small" fullWidth>
                  <InputLabel>Payer source</InputLabel>
                  <Select
                    label="Payer source"
                    value={payerSource}
                    onChange={(e) => setPayerSource(e.target.value)}
                  >
                    {PAYER_SOURCES.map((s) => (
                      <MenuItem key={s} value={s}>
                        {s}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <FormControl size="small" fullWidth>
                  <InputLabel>Payment mode</InputLabel>
                  <Select
                    label="Payment mode"
                    value={paymentMode}
                    onChange={(e) => setPaymentMode(e.target.value)}
                  >
                    {PAYMENT_MODES.map((m) => (
                      <MenuItem key={m} value={m}>
                        {m}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </Box>
          )}

          {/* 10. Totals block */}
          <Divider />
          <Box
            sx={{
              p: 1.5,
              borderRadius: "10px",
              background: hubTokens.bg,
              border: `1px solid ${hubTokens.border}`,
            }}
          >
            <Stack spacing={0.5}>
              <Row label={`Items × ${days}d`} value={itemsSubtotal} muted />
              {transportTotal > 0 && (
                <Row label={`Transport (${transportHandler})`} value={transportTotal} muted />
              )}
              {discountAmount > 0 && (
                <Row label={`Discount (${discountPct}%)`} value={-discountAmount} muted />
              )}
              <Divider sx={{ my: 0.5 }} />
              <Row label="Estimated total" value={grandTotal} strong />
            </Stack>
          </Box>
        </Stack>
      </DialogContent>

      <DialogActions
        sx={{
          py: 1.25,
          px: 2.5,
          borderTop: `1px solid ${hubTokens.border}`,
          background: hubTokens.bg,
        }}
      >
        <Button onClick={onClose} disabled={busy} sx={{ textTransform: "none" }}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={!canSubmit || busy}
          sx={{ textTransform: "none", fontWeight: 700 }}
        >
          {isHistorical
            ? historicalStatus === "fully_settled"
              ? "Record settled rental"
              : "Record historical rental"
            : "Create rental"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({
  label,
  value,
  muted,
  strong,
}: {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
}) {
  return (
    <Box
      sx={{
        display: "flex",
        justifyContent: "space-between",
        fontSize: strong ? 14 : 12,
        fontWeight: strong ? 700 : 500,
        color: muted ? hubTokens.muted : hubTokens.text,
      }}
    >
      <span>{label}</span>
      <Box component="span" sx={{ fontFamily: hubTokens.mono }}>
        {inr(value)}
      </Box>
    </Box>
  );
}
