"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Typography,
  TextField,
  Button,
  IconButton,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Radio,
  RadioGroup,
  Divider,
  Checkbox,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Chip,
  Paper,
  InputAdornment,
} from "@mui/material";
import {
  Close as CloseIcon,
  Groups as GroupsIcon,
  QrCode2 as QrCodeIcon,
} from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { useAuth } from "@/contexts/AuthContext";
import type { Database } from "@/types/database.types";

type TeaShopAccount = Database["public"]["Tables"]["tea_shop_accounts"]["Row"];
type TeaShopGroupEntry = Database["public"]["Tables"]["tea_shop_group_entries"]["Row"];
type TeaShopGroupSettlement = Database["public"]["Tables"]["tea_shop_group_settlements"]["Row"];
type PaymentMode = Database["public"]["Enums"]["payment_mode"];

interface TeaShopGroupEntryWithAllocations extends TeaShopGroupEntry {
  allocations?: any[];
}
import type { SiteGroupWithSites } from "@/types/material.types";
import type { PayerSource } from "@/types/settlement.types";
import {
  useGroupTeaShopUnsettledEntries,
  useGroupTeaShopPendingBalance,
  useCreateGroupTeaShopSettlement,
} from "@/hooks/queries/useGroupTeaShop";
import dayjs from "dayjs";

interface GroupTeaShopSettlementDialogProps {
  open: boolean;
  onClose: () => void;
  shop: TeaShopAccount;
  siteGroup: SiteGroupWithSites;
  onSuccess?: () => void;
}

interface SiteEngineer {
  id: string;
  name: string;
}

interface SubcontractOption {
  id: string;
  title: string;
  team_name?: string;
}

interface AllocationPreview {
  entryId: string;
  date: string;
  entryAmount: number;
  previouslyPaid: number;
  allocatedAmount: number;
  isFullyPaid: boolean;
}

export default function GroupTeaShopSettlementDialog({
  open,
  onClose,
  shop,
  siteGroup,
  onSuccess,
}: GroupTeaShopSettlementDialogProps) {
  const { userProfile } = useAuth();
  const supabase = createClient();

  const [error, setError] = useState<string | null>(null);

  // Form state
  const [amountPaying, setAmountPaying] = useState(0);
  const [paymentDate, setPaymentDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerType, setPayerType] = useState<"site_engineer" | "company_direct">(
    "company_direct"
  );
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [createWalletTransaction, setCreateWalletTransaction] = useState(true);
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [customPayerName, setCustomPayerName] = useState("");
  const [selectedSubcontractId, setSelectedSubcontractId] = useState<string>("");

  // Site engineers list
  const [engineers, setEngineers] = useState<SiteEngineer[]>([]);
  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);

  // Fetch unsettled entries and pending balance
  const { data: unsettledEntries, isLoading: loadingEntries } =
    useGroupTeaShopUnsettledEntries(siteGroup.id);
  const { data: balanceData } = useGroupTeaShopPendingBalance(siteGroup.id);

  const pendingBalance = balanceData?.pending || 0;

  // Mutation
  const createSettlement = useCreateGroupTeaShopSettlement();
  const isLoading = createSettlement.isPending;

  // Calculate waterfall allocation preview
  const allocationPreview = useMemo((): AllocationPreview[] => {
    if (!unsettledEntries || unsettledEntries.length === 0) return [];

    let remaining = amountPaying;
    const allocations: AllocationPreview[] = [];

    for (const entry of unsettledEntries) {
      if (remaining <= 0) break;

      const entryAmount = entry.total_amount || 0;
      const previouslyPaid = entry.amount_paid || 0;
      const pendingForEntry = entryAmount - previouslyPaid;

      if (pendingForEntry <= 0) continue;

      const allocatedAmount = Math.min(remaining, pendingForEntry);
      remaining -= allocatedAmount;

      allocations.push({
        entryId: entry.id,
        date: entry.date,
        entryAmount,
        previouslyPaid,
        allocatedAmount,
        isFullyPaid: allocatedAmount >= pendingForEntry,
      });
    }

    return allocations;
  }, [unsettledEntries, amountPaying]);

  useEffect(() => {
    if (open) {
      fetchEngineers();
      fetchSubcontracts();

      // Reset form
      setAmountPaying(pendingBalance);
      setPaymentDate(dayjs().format("YYYY-MM-DD"));
      setPaymentMode("cash");
      setPayerType("company_direct");
      setSelectedEngineerId("");
      setCreateWalletTransaction(true);
      setNotes("");
      setProofUrl(null);
      setPayerSource("own_money");
      setCustomPayerName("");
      setSelectedSubcontractId("");
      setError(null);
    }
  }, [open, pendingBalance]);

  const fetchEngineers = async () => {
    try {
      const { data } = await supabase
        .from("users")
        .select("id, name")
        .in("role", ["site_engineer", "admin", "office"]);

      setEngineers(data || []);
    } catch (err) {
      console.error("Error fetching engineers:", err);
    }
  };

  const fetchSubcontracts = async () => {
    try {
      // Fetch from first site in group for subcontracts
      const firstSiteId = siteGroup.sites?.[0]?.id;
      if (!firstSiteId) return;

      const { data } = await supabase
        .from("subcontracts")
        .select("id, title")
        .eq("site_id", firstSiteId)
        .in("status", ["draft", "active"]);

      setSubcontracts(
        (data || []).map((sc: any) => ({
          id: sc.id,
          title: sc.title,
        }))
      );
    } catch (err) {
      console.error("Error fetching subcontracts:", err);
    }
  };

  const handleFileUpload = (file: UploadedFile) => {
    setProofUrl(file.url);
  };

  const handleFileRemove = () => {
    setProofUrl(null);
  };

  const handleSave = async () => {
    if (amountPaying <= 0) {
      setError("Please enter an amount to pay");
      return;
    }

    if (payerType === "site_engineer" && !selectedEngineerId) {
      setError("Please select an engineer");
      return;
    }

    if (paymentMode !== "cash" && !proofUrl) {
      setError("Please upload payment proof screenshot (required for non-cash payments)");
      return;
    }

    if (allocationPreview.length === 0) {
      setError("No entries to settle");
      return;
    }

    setError(null);

    // Calculate period dates
    const sortedAllocations = [...allocationPreview].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
    const periodStart = sortedAllocations[0]?.date || paymentDate;
    const periodEnd =
      sortedAllocations[sortedAllocations.length - 1]?.date || paymentDate;

    // Calculate totals
    const entriesTotal = allocationPreview.reduce(
      (sum, a) => sum + a.entryAmount,
      0
    );
    const totalDue = pendingBalance;
    const balanceRemaining = totalDue - amountPaying;

    try {
      await createSettlement.mutateAsync({
        teaShopId: shop.id,
        siteGroupId: siteGroup.id,
        amountPaid: amountPaying,
        paymentDate,
        paymentMode,
        payerType,
        siteEngineerId:
          payerType === "site_engineer" ? selectedEngineerId : undefined,
        createWalletTransaction:
          payerType === "site_engineer" ? createWalletTransaction : false,
        payerSource,
        payerName: payerSource === "custom" ? customPayerName : undefined,
        proofUrl: proofUrl || undefined,
        subcontractId: selectedSubcontractId || undefined,
        notes: notes || undefined,
        recordedBy: userProfile?.display_name || undefined,
        recordedByUserId: userProfile?.id,
        allocations: allocationPreview.map((a) => ({
          entryId: a.entryId,
          amount: a.allocatedAmount,
        })),
        periodStart,
        periodEnd,
        entriesTotal,
        totalDue,
        balanceRemaining,
      });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to create settlement");
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{ sx: { borderRadius: 2 } }}
    >
      <DialogTitle>
        <Box
          sx={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <GroupsIcon color="primary" />
            <Typography variant="h6" component="span">Group Settlement</Typography>
          </Box>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
        <Typography variant="body2" color="text.secondary">
          {shop.shop_name} - {siteGroup.name}
        </Typography>
      </DialogTitle>

      <DialogContent dividers>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
          {/* Error Alert */}
          {error && (
            <Alert severity="error" onClose={() => setError(null)}>
              {error}
            </Alert>
          )}

          {/* Pending Balance Display */}
          <Paper
            variant="outlined"
            sx={{ p: 2, bgcolor: "error.50", borderColor: "error.main" }}
          >
            <Typography variant="body2" color="text.secondary">
              Pending Balance (All Sites)
            </Typography>
            <Typography variant="h5" fontWeight={700} color="error.main">
              Rs {pendingBalance.toLocaleString()}
            </Typography>
          </Paper>

          {/* QR Code Display */}
          {shop.qr_code_url && (
            <Paper variant="outlined" sx={{ p: 2, textAlign: "center" }}>
              <QrCodeIcon sx={{ fontSize: 40, color: "primary.main", mb: 1 }} />
              <Box
                component="img"
                src={shop.qr_code_url}
                alt="Payment QR Code"
                sx={{ maxWidth: 200, maxHeight: 200, mx: "auto", display: "block" }}
              />
              {shop.upi_id && (
                <Typography variant="caption" color="text.secondary">
                  UPI: {shop.upi_id}
                </Typography>
              )}
            </Paper>
          )}

          {/* Amount to Pay */}
          <TextField
            label="Amount to Pay"
            type="number"
            value={amountPaying || ""}
            onChange={(e) => setAmountPaying(parseInt(e.target.value) || 0)}
            fullWidth
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">Rs</InputAdornment>
                ),
              },
            }}
          />

          {/* Waterfall Allocation Preview */}
          {allocationPreview.length > 0 && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Payment Allocation (Oldest First)
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow sx={{ bgcolor: "action.hover" }}>
                    <TableCell>Date</TableCell>
                    <TableCell align="right">Entry</TableCell>
                    <TableCell align="right">Allocated</TableCell>
                    <TableCell align="center">Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {allocationPreview.map((alloc) => (
                    <TableRow key={alloc.entryId}>
                      <TableCell>
                        {dayjs(alloc.date).format("DD MMM")}
                      </TableCell>
                      <TableCell align="right">
                        Rs {alloc.entryAmount.toLocaleString()}
                      </TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={600} color="success.main">
                          Rs {alloc.allocatedAmount.toLocaleString()}
                        </Typography>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          size="small"
                          label={alloc.isFullyPaid ? "Full" : "Partial"}
                          color={alloc.isFullyPaid ? "success" : "warning"}
                          variant="outlined"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Box>
          )}

          <Divider />

          {/* Payment Date */}
          <TextField
            label="Payment Date"
            type="date"
            value={paymentDate}
            onChange={(e) => setPaymentDate(e.target.value)}
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
          />

          {/* Payer Type */}
          <FormControl>
            <Typography variant="subtitle2" gutterBottom>
              Paid By
            </Typography>
            <RadioGroup
              row
              value={payerType}
              onChange={(e) =>
                setPayerType(e.target.value as "site_engineer" | "company_direct")
              }
            >
              <FormControlLabel
                value="company_direct"
                control={<Radio size="small" />}
                label="Company Direct"
              />
              <FormControlLabel
                value="site_engineer"
                control={<Radio size="small" />}
                label="Site Engineer"
              />
            </RadioGroup>
          </FormControl>

          {/* Engineer Selection */}
          {payerType === "site_engineer" && (
            <>
              <FormControl fullWidth size="small">
                <InputLabel>Select Engineer</InputLabel>
                <Select
                  value={selectedEngineerId}
                  onChange={(e) => setSelectedEngineerId(e.target.value)}
                  label="Select Engineer"
                >
                  {engineers.map((eng) => (
                    <MenuItem key={eng.id} value={eng.id}>
                      {eng.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={createWalletTransaction}
                    onChange={(e) =>
                      setCreateWalletTransaction(e.target.checked)
                    }
                    size="small"
                  />
                }
                label="Create wallet transaction for reimbursement"
              />

              <PayerSourceSelector
                value={payerSource}
                onChange={setPayerSource}
                customName={customPayerName}
                onCustomNameChange={setCustomPayerName}
              />
            </>
          )}

          {/* Payment Mode */}
          <FormControl fullWidth size="small">
            <InputLabel>Payment Mode</InputLabel>
            <Select
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
              label="Payment Mode"
            >
              <MenuItem value="cash">Cash</MenuItem>
              <MenuItem value="upi">UPI</MenuItem>
              <MenuItem value="bank_transfer">Bank Transfer</MenuItem>
              <MenuItem value="cheque">Cheque</MenuItem>
            </Select>
          </FormControl>

          {/* Payment Proof - required for all non-cash payments */}
          {paymentMode !== "cash" && (
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                Payment Screenshot (Required) *
              </Typography>
              <FileUploader
                supabase={supabase}
                bucketName="settlement-proofs"
                folderPath={`tea-shop/${shop.id}`}
                onUpload={handleFileUpload}
                onRemove={handleFileRemove}
                value={proofUrl ? { url: proofUrl, name: "proof", size: 0 } : null}
                accept="image"
                maxSizeMB={5}
              />
            </Box>
          )}

          {/* Link to Subcontract (Optional) */}
          <FormControl fullWidth size="small">
            <InputLabel>Link to Subcontract (Optional)</InputLabel>
            <Select
              value={selectedSubcontractId}
              onChange={(e) => setSelectedSubcontractId(e.target.value)}
              label="Link to Subcontract (Optional)"
            >
              <MenuItem value="">None</MenuItem>
              {subcontracts.map((sc) => (
                <MenuItem key={sc.id} value={sc.id}>
                  {sc.title}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          {/* Notes */}
          <TextField
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            fullWidth
            multiline
            rows={2}
            placeholder="Optional notes..."
          />

          {/* Balance After Payment */}
          <Paper
            variant="outlined"
            sx={{
              p: 2,
              bgcolor:
                pendingBalance - amountPaying > 0 ? "warning.50" : "success.50",
            }}
          >
            <Typography variant="body2" color="text.secondary">
              Balance After Payment
            </Typography>
            <Typography
              variant="h6"
              fontWeight={600}
              color={
                pendingBalance - amountPaying > 0
                  ? "warning.main"
                  : "success.main"
              }
            >
              Rs {(pendingBalance - amountPaying).toLocaleString()}
            </Typography>
          </Paper>
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: 3, py: 2 }}>
        <Button onClick={onClose} disabled={isLoading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={isLoading || amountPaying <= 0 || loadingEntries}
        >
          {isLoading ? (
            <CircularProgress size={20} color="inherit" />
          ) : (
            "Record Payment"
          )}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
