"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Grid,
  Box,
  Typography,
  IconButton,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Radio,
  RadioGroup,
  FormControlLabel,
  FormControl,
  FormLabel,
  Select,
  MenuItem,
  InputLabel,
  InputAdornment,
  Divider,
  Paper,
  Collapse,
  Autocomplete,
  CircularProgress,
} from "@mui/material";
import {
  Close as CloseIcon,
  Add as AddIcon,
  Delete as DeleteIcon,
  ExpandMore as ExpandMoreIcon,
  History as HistoryIcon,
  AttachFile as AttachFileIcon,
} from "@mui/icons-material";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useCreateHistoricalRental, useRentalItems } from "@/hooks/queries/useRentals";
import VendorAutocomplete from "@/components/common/VendorAutocomplete";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { formatCurrency } from "@/lib/formatters";
import { hardenedUpload } from "@/lib/storage/uploadHelpers";
import { createClient } from "@/lib/supabase/client";
import type {
  HistoricalRentalItemFormData,
  HistoricalTransportFormData,
  HistoricalAdvanceFormData,
  RentalItemWithDetails,
} from "@/types/rental.types";
import type { PayerSource } from "@/types/settlement.types";
import dayjs from "dayjs";

interface HistoricalRentalDialogProps {
  open: boolean;
  onClose: () => void;
  siteId: string;
}

type PaymentMode = "cash" | "upi" | "bank_transfer" | "cheque";

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "upi", label: "UPI" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "cheque", label: "Cheque" },
];

const today = dayjs().format("YYYY-MM-DD");

function emptyItem(): HistoricalRentalItemFormData {
  return { item_name: "", rental_item_id: null, quantity: 1, daily_rate: 0, days: 1 };
}

function emptyAdvance(): HistoricalAdvanceFormData {
  return { advance_date: today, amount: 0, payer_source: "own_money", payment_mode: "cash" };
}

export default function HistoricalRentalDialog({
  open,
  onClose,
  siteId,
}: HistoricalRentalDialogProps) {
  const isMobile = useIsMobile();
  const createHistorical = useCreateHistoricalRental();
  const { data: allRentalItems = [] } = useRentalItems();
  const supabase = createClient();

  // Basic info
  const [vendorId, setVendorId] = useState<string | null>(null);
  const [billRef, setBillRef] = useState("");

  // Calculation sheet upload
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [calculationSheetUrl, setCalculationSheetUrl] = useState<string | null>(null);
  const [calculationSheetFileName, setCalculationSheetFileName] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);

  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Items
  const [items, setItems] = useState<HistoricalRentalItemFormData[]>([]);
  const [rentalTotal, setRentalTotal] = useState<string>("");
  const [totalManuallyEdited, setTotalManuallyEdited] = useState(false);

  // Transport
  const [inboundEnabled, setInboundEnabled] = useState(false);
  const [inbound, setInbound] = useState<HistoricalTransportFormData>({ amount: 0, paid_to: "vendor" });
  const [outboundEnabled, setOutboundEnabled] = useState(false);
  const [outbound, setOutbound] = useState<HistoricalTransportFormData>({ amount: 0, paid_to: "vendor" });

  // Settlement
  const [settleNow, setSettleNow] = useState(false);
  const [advances, setAdvances] = useState<HistoricalAdvanceFormData[]>([]);
  const [settlementDate, setSettlementDate] = useState(today);
  const [settlementPayerSource, setSettlementPayerSource] = useState<PayerSource>("own_money");
  const [settlementCustomName, setSettlementCustomName] = useState("");
  const [settlementMode, setSettlementMode] = useState<PaymentMode>("cash");

  const [error, setError] = useState<string | null>(null);

  // Auto-sum items into rentalTotal when items change (unless user typed manually)
  const itemsSum = useMemo(
    () => items.reduce((s, it) => s + it.quantity * it.daily_rate * it.days, 0),
    [items]
  );

  useEffect(() => {
    if (!totalManuallyEdited && items.length > 0) {
      setRentalTotal(String(itemsSum));
    }
  }, [itemsSum, totalManuallyEdited, items.length]);

  const totalAdvances = advances.reduce((s, a) => s + a.amount, 0);
  const transportTotal = (inboundEnabled ? inbound.amount : 0) + (outboundEnabled ? outbound.amount : 0);
  const grandTotal = (parseFloat(rentalTotal) || 0) + transportTotal;
  const balanceDue = grandTotal - totalAdvances;

  function reset() {
    setVendorId(null);
    setBillRef("");
    setCalculationSheetUrl(null);
    setCalculationSheetFileName("");
    setStartDate("");
    setEndDate("");
    setItems([]);
    setRentalTotal("");
    setTotalManuallyEdited(false);
    setInboundEnabled(false);
    setInbound({ amount: 0, paid_to: "vendor" });
    setOutboundEnabled(false);
    setOutbound({ amount: 0, paid_to: "vendor" });
    setSettleNow(false);
    setAdvances([]);
    setSettlementDate(today);
    setSettlementPayerSource("own_money");
    setSettlementCustomName("");
    setSettlementMode("cash");
    setError(null);
  }

  function handleClose() {
    reset();
    onClose();
  }

  function addItem() {
    setItems((prev) => [...prev, emptyItem()]);
    setTotalManuallyEdited(false);
  }

  function updateItem(idx: number, patch: Partial<HistoricalRentalItemFormData>) {
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    if (!("daily_rate" in patch)) setTotalManuallyEdited(false);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
    if (items.length === 1) setTotalManuallyEdited(false);
  }

  function addAdvance() {
    setAdvances((prev) => [...prev, emptyAdvance()]);
  }

  function updateAdvance(idx: number, patch: Partial<HistoricalAdvanceFormData>) {
    setAdvances((prev) => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)));
  }

  function removeAdvance(idx: number) {
    setAdvances((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setError(null);
    try {
      const ext = file.name.split(".").pop() ?? "bin";
      const filePath = `uploads/${siteId}/${Date.now()}.${ext}`;
      const { publicUrl } = await hardenedUpload({
        supabase,
        bucketName: "rental-documents",
        filePath,
        file,
        contentType: file.type || "application/octet-stream",
      });
      setCalculationSheetUrl(publicUrl);
      setCalculationSheetFileName(file.name);
    } catch (err: any) {
      setError(err.message ?? "Failed to upload file.");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleSave(withSettlement: boolean) {
    setError(null);

    if (!vendorId) return setError("Please select a vendor.");
    if (!startDate) return setError("Please enter start date.");
    if (!endDate) return setError("Please enter end date.");
    if (startDate > endDate) return setError("Start date must be before end date.");
    const parsedTotal = parseFloat(rentalTotal);
    if (!rentalTotal || isNaN(parsedTotal) || parsedTotal < 0)
      return setError("Please enter a valid rental total.");

    const validItems = items.filter((it) => it.item_name.trim());

    try {
      await createHistorical.mutateAsync({
        site_id: siteId,
        vendor_id: vendorId,
        bill_ref: billRef || undefined,
        calculation_sheet_url: calculationSheetUrl ?? undefined,
        start_date: startDate,
        end_date: endDate,
        items: validItems,
        rental_total: parsedTotal,
        inbound_transport: inboundEnabled ? inbound : undefined,
        outbound_transport: outboundEnabled ? outbound : undefined,
        advances,
        settlement: withSettlement
          ? {
              final_amount: balanceDue,
              settlement_date: settlementDate,
              payer_source: settlementPayerSource,
              payment_mode: settlementMode,
            }
          : undefined,
      });
      handleClose();
    } catch (err: any) {
      setError(err.message ?? "Failed to save. Please try again.");
    }
  }

  const isBusy = createHistorical.isPending;

  return (
    <Dialog
      open={open}
      onClose={isBusy ? undefined : handleClose}
      maxWidth="md"
      fullWidth
      fullScreen={isMobile}
    >
      <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1, pr: 6 }}>
        <HistoryIcon color="action" />
        Add Historical Rental Record
        <IconButton
          onClick={handleClose}
          disabled={isBusy}
          sx={{ position: "absolute", right: 8, top: 8 }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
        <Grid container spacing={2}>

          {error && (
            <Grid size={12}>
              <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
            </Grid>
          )}

          {/* ── Section 1: Basic Info ── */}
          <Grid size={12}>
            <VendorAutocomplete
              value={vendorId}
              onChange={(val) => setVendorId(val as string | null)}
              label="Vendor *"
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 5 }}>
            <TextField
              fullWidth
              label="Bill / Ref No"
              value={billRef}
              onChange={(e) => setBillRef(e.target.value)}
              placeholder="Optional bill or reference number"
              size="small"
            />
          </Grid>

          {/* Calculation sheet upload */}
          <Grid size={{ xs: 12, sm: 7 }}>
            <input
              type="file"
              ref={fileInputRef}
              style={{ display: "none" }}
              accept="image/*,application/pdf"
              onChange={handleFileSelect}
            />
            {calculationSheetUrl ? (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, border: "1px solid", borderColor: "success.main", borderRadius: 1, px: 1.5, py: 0.75 }}>
                <AttachFileIcon fontSize="small" color="success" />
                <Typography variant="body2" noWrap sx={{ flex: 1, color: "success.dark" }}>
                  {calculationSheetFileName}
                </Typography>
                <IconButton size="small" onClick={() => { setCalculationSheetUrl(null); setCalculationSheetFileName(""); }}>
                  <CloseIcon fontSize="small" />
                </IconButton>
              </Box>
            ) : (
              <Button
                variant="outlined"
                size="small"
                color="inherit"
                startIcon={uploadingFile ? <CircularProgress size={14} /> : <AttachFileIcon />}
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingFile}
                fullWidth
                sx={{ height: 40 }}
              >
                {uploadingFile ? "Uploading..." : "Attach Calculation Sheet"}
              </Button>
            )}
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              label="Start Date *"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: today }}
              size="small"
              required
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              type="date"
              label="End Date *"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              InputLabelProps={{ shrink: true }}
              inputProps={{ max: today }}
              size="small"
              required
            />
          </Grid>

          {/* ── Section 2: Items (optional) ── */}
          <Grid size={12}>
            <Accordion disableGutters variant="outlined">
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">
                  Items{items.length > 0 ? ` (${items.length})` : " — optional"}
                </Typography>
              </AccordionSummary>
              <AccordionDetails sx={{ p: 1 }}>
                {items.length > 0 && (
                  <Box sx={{ overflowX: "auto", mb: 1 }}>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Item Name</TableCell>
                          <TableCell align="right" sx={{ minWidth: 60 }}>Qty</TableCell>
                          <TableCell align="right" sx={{ minWidth: 80 }}>Rate/day</TableCell>
                          <TableCell align="right" sx={{ minWidth: 60 }}>Days</TableCell>
                          <TableCell align="right" sx={{ minWidth: 80 }}>Total</TableCell>
                          <TableCell sx={{ width: 40 }} />
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {items.map((item, idx) => (
                          <TableRow key={idx}>
                            <TableCell sx={{ minWidth: 180 }}>
                              <Autocomplete
                                freeSolo
                                size="small"
                                options={allRentalItems}
                                getOptionLabel={(opt) =>
                                  typeof opt === "string" ? opt : opt.name
                                }
                                inputValue={item.item_name}
                                onInputChange={(_, val, reason) => {
                                  if (reason !== "reset") {
                                    updateItem(idx, { item_name: val, rental_item_id: null });
                                  }
                                }}
                                onChange={(_, val) => {
                                  if (val && typeof val !== "string") {
                                    const catalogItem = val as RentalItemWithDetails;
                                    updateItem(idx, {
                                      item_name: catalogItem.name,
                                      rental_item_id: catalogItem.id,
                                      daily_rate: catalogItem.default_daily_rate ?? item.daily_rate,
                                    });
                                  } else if (typeof val === "string") {
                                    updateItem(idx, { item_name: val, rental_item_id: null });
                                  }
                                }}
                                renderInput={(params) => (
                                  <TextField
                                    {...params}
                                    variant="standard"
                                    placeholder="Search or type item name"
                                    sx={{ minWidth: 160 }}
                                  />
                                )}
                                slotProps={{ popper: { disablePortal: false } }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                size="small"
                                type="number"
                                value={item.quantity}
                                onChange={(e) => updateItem(idx, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                                variant="standard"
                                inputProps={{ min: 1, style: { textAlign: "right", width: 50 } }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                size="small"
                                type="number"
                                value={item.daily_rate || ""}
                                onChange={(e) => updateItem(idx, { daily_rate: parseFloat(e.target.value) || 0 })}
                                variant="standard"
                                inputProps={{ min: 0, step: 0.5, style: { textAlign: "right", width: 70 } }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <TextField
                                size="small"
                                type="number"
                                value={item.days}
                                onChange={(e) => updateItem(idx, { days: Math.max(1, parseInt(e.target.value) || 1) })}
                                variant="standard"
                                inputProps={{ min: 1, style: { textAlign: "right", width: 50 } }}
                              />
                            </TableCell>
                            <TableCell align="right">
                              <Typography variant="body2" noWrap>
                                {formatCurrency(item.quantity * item.daily_rate * item.days)}
                              </Typography>
                            </TableCell>
                            <TableCell>
                              <IconButton size="small" onClick={() => removeItem(idx)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </Box>
                )}
                <Button
                  size="small"
                  startIcon={<AddIcon />}
                  onClick={addItem}
                  variant="text"
                >
                  Add Item
                </Button>
                {items.length > 0 && (
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 2 }}>
                    Items total: {formatCurrency(itemsSum)}
                  </Typography>
                )}
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* ── Rental Total ── */}
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              fullWidth
              label="Total Rental Amount *"
              type="number"
              value={rentalTotal}
              onChange={(e) => {
                setRentalTotal(e.target.value);
                setTotalManuallyEdited(true);
              }}
              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
              size="small"
              required
              helperText={items.length > 0 && !totalManuallyEdited ? "Auto-filled from items" : ""}
            />
          </Grid>

          {/* ── Section 3: Transport Costs ── */}
          <Grid size={12}>
            <Accordion disableGutters variant="outlined">
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">
                  Transport Costs
                  {(inboundEnabled || outboundEnabled) && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      {formatCurrency(transportTotal)}
                    </Typography>
                  )}
                  {!inboundEnabled && !outboundEnabled && (
                    <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                      — optional
                    </Typography>
                  )}
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>
                  {/* Inbound */}
                  <Grid size={12}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                      <FormControlLabel
                        control={
                          <Radio
                            checked={inboundEnabled}
                            onChange={(e) => setInboundEnabled(e.target.checked)}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2" fontWeight={600}>Inbound (bringing to site)</Typography>}
                        sx={{ m: 0 }}
                      />
                    </Box>
                    <Collapse in={inboundEnabled}>
                      <Box sx={{ pl: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Amount"
                              type="number"
                              value={inbound.amount || ""}
                              onChange={(e) => setInbound((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <FormControl size="small" fullWidth>
                              <FormLabel sx={{ fontSize: 12, mb: 0.5 }}>Paid to</FormLabel>
                              <RadioGroup
                                row
                                value={inbound.paid_to}
                                onChange={(e) => setInbound((p) => ({ ...p, paid_to: e.target.value as "vendor" | "driver" }))}
                              >
                                <FormControlLabel value="vendor" control={<Radio size="small" />} label="Vendor" />
                                <FormControlLabel value="driver" control={<Radio size="small" />} label="Separate Driver" />
                              </RadioGroup>
                            </FormControl>
                          </Grid>
                          {inbound.paid_to === "driver" && (
                            <Grid size={{ xs: 12, sm: 4 }}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Driver Name"
                                value={inbound.driver_name ?? ""}
                                onChange={(e) => setInbound((p) => ({ ...p, driver_name: e.target.value }))}
                                placeholder="Optional"
                              />
                            </Grid>
                          )}
                        </Grid>
                      </Box>
                    </Collapse>
                  </Grid>

                  <Grid size={12}><Divider /></Grid>

                  {/* Outbound */}
                  <Grid size={12}>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
                      <FormControlLabel
                        control={
                          <Radio
                            checked={outboundEnabled}
                            onChange={(e) => setOutboundEnabled(e.target.checked)}
                            size="small"
                          />
                        }
                        label={<Typography variant="body2" fontWeight={600}>Outbound (returning to vendor)</Typography>}
                        sx={{ m: 0 }}
                      />
                    </Box>
                    <Collapse in={outboundEnabled}>
                      <Box sx={{ pl: 2 }}>
                        <Grid container spacing={2} alignItems="center">
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <TextField
                              fullWidth
                              size="small"
                              label="Amount"
                              type="number"
                              value={outbound.amount || ""}
                              onChange={(e) => setOutbound((p) => ({ ...p, amount: parseFloat(e.target.value) || 0 }))}
                              InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                            />
                          </Grid>
                          <Grid size={{ xs: 12, sm: 4 }}>
                            <FormControl size="small" fullWidth>
                              <FormLabel sx={{ fontSize: 12, mb: 0.5 }}>Paid to</FormLabel>
                              <RadioGroup
                                row
                                value={outbound.paid_to}
                                onChange={(e) => setOutbound((p) => ({ ...p, paid_to: e.target.value as "vendor" | "driver" }))}
                              >
                                <FormControlLabel value="vendor" control={<Radio size="small" />} label="Vendor" />
                                <FormControlLabel value="driver" control={<Radio size="small" />} label="Separate Driver" />
                              </RadioGroup>
                            </FormControl>
                          </Grid>
                          {outbound.paid_to === "driver" && (
                            <Grid size={{ xs: 12, sm: 4 }}>
                              <TextField
                                fullWidth
                                size="small"
                                label="Driver Name"
                                value={outbound.driver_name ?? ""}
                                onChange={(e) => setOutbound((p) => ({ ...p, driver_name: e.target.value }))}
                                placeholder="Optional"
                              />
                            </Grid>
                          )}
                        </Grid>
                      </Box>
                    </Collapse>
                  </Grid>
                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

          {/* ── Section 4: Settlement ── */}
          <Grid size={12}>
            <Accordion
              disableGutters
              variant="outlined"
              expanded={settleNow}
              onChange={(_, expanded) => setSettleNow(expanded)}
            >
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle2">
                  Settlement
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    {settleNow ? `Grand Total: ${formatCurrency(grandTotal)}` : "— optional, or settle later"}
                  </Typography>
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Grid container spacing={2}>

                  {/* Grand total summary */}
                  <Grid size={12}>
                    <Paper variant="outlined" sx={{ p: 1.5 }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                        <Typography variant="body2" color="text.secondary">Rental Amount</Typography>
                        <Typography variant="body2">{formatCurrency(parseFloat(rentalTotal) || 0)}</Typography>
                      </Box>
                      {(inboundEnabled || outboundEnabled) && (
                        <Box sx={{ display: "flex", justifyContent: "space-between", mb: 0.5 }}>
                          <Typography variant="body2" color="text.secondary">Transport</Typography>
                          <Typography variant="body2">{formatCurrency(transportTotal)}</Typography>
                        </Box>
                      )}
                      <Divider sx={{ my: 0.5 }} />
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" fontWeight={600}>Grand Total</Typography>
                        <Typography variant="body2" fontWeight={600}>{formatCurrency(grandTotal)}</Typography>
                      </Box>
                    </Paper>
                  </Grid>

                  {/* Advances */}
                  <Grid size={12}>
                    <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 1 }}>
                      <Typography variant="body2" fontWeight={600}>Advances Paid</Typography>
                      <Button size="small" startIcon={<AddIcon />} onClick={addAdvance} variant="outlined">
                        Add Advance
                      </Button>
                    </Box>
                    {advances.map((adv, idx) => (
                      <Box key={idx} sx={{ display: "flex", gap: 1, mb: 1, alignItems: "flex-start" }}>
                        <TextField
                          size="small"
                          type="date"
                          label="Date"
                          value={adv.advance_date}
                          onChange={(e) => updateAdvance(idx, { advance_date: e.target.value })}
                          InputLabelProps={{ shrink: true }}
                          inputProps={{ max: today }}
                          sx={{ width: 150 }}
                        />
                        <TextField
                          size="small"
                          type="number"
                          label="Amount"
                          value={adv.amount || ""}
                          onChange={(e) => updateAdvance(idx, { amount: parseFloat(e.target.value) || 0 })}
                          InputProps={{ startAdornment: <InputAdornment position="start">₹</InputAdornment> }}
                          sx={{ width: 130 }}
                        />
                        <FormControl size="small" sx={{ width: 110 }}>
                          <InputLabel>Mode</InputLabel>
                          <Select
                            value={adv.payment_mode}
                            label="Mode"
                            onChange={(e) => updateAdvance(idx, { payment_mode: e.target.value })}
                          >
                            {PAYMENT_MODES.map((m) => (
                              <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                        <IconButton size="small" onClick={() => removeAdvance(idx)} sx={{ mt: 0.5 }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    ))}
                    {advances.length > 0 && (
                      <Typography variant="body2" color="text.secondary">
                        Total advances: {formatCurrency(totalAdvances)}
                      </Typography>
                    )}
                  </Grid>

                  {/* Balance due */}
                  <Grid size={12}>
                    <Paper variant="outlined" sx={{ p: 1.5, bgcolor: "action.hover" }}>
                      <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                        <Typography variant="body2" fontWeight={600}>Balance Due</Typography>
                        <Typography variant="body2" fontWeight={700} color={balanceDue > 0 ? "error.main" : "success.main"}>
                          {formatCurrency(balanceDue)}
                        </Typography>
                      </Box>
                    </Paper>
                  </Grid>

                  {/* Final payment */}
                  <Grid size={12}>
                    <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
                      Final Payment
                    </Typography>
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <TextField
                      fullWidth
                      size="small"
                      type="date"
                      label="Settlement Date"
                      value={settlementDate}
                      onChange={(e) => setSettlementDate(e.target.value)}
                      InputLabelProps={{ shrink: true }}
                      inputProps={{ max: today }}
                    />
                  </Grid>

                  <Grid size={{ xs: 12, sm: 4 }}>
                    <FormControl size="small" fullWidth>
                      <InputLabel>Payment Mode</InputLabel>
                      <Select
                        value={settlementMode}
                        label="Payment Mode"
                        onChange={(e) => setSettlementMode(e.target.value as PaymentMode)}
                      >
                        {PAYMENT_MODES.map((m) => (
                          <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid size={12}>
                    <PayerSourceSelector
                      value={settlementPayerSource}
                      customName={settlementCustomName}
                      onChange={setSettlementPayerSource}
                      onCustomNameChange={setSettlementCustomName}
                      siteId={siteId}
                    />
                  </Grid>

                </Grid>
              </AccordionDetails>
            </Accordion>
          </Grid>

        </Grid>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2, gap: 1 }}>
        <Button onClick={handleClose} disabled={isBusy}>
          Cancel
        </Button>
        <Box sx={{ flex: 1 }} />
        <Button
          variant="outlined"
          onClick={() => handleSave(false)}
          disabled={isBusy}
        >
          Save — Settle Later
        </Button>
        <Button
          variant="contained"
          onClick={() => handleSave(true)}
          disabled={isBusy || !settleNow}
        >
          Save &amp; Mark Settled
        </Button>
      </DialogActions>
    </Dialog>
  );
}
