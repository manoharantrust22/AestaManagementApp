"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
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
  Paper,
  Checkbox,
  Chip,
  Autocomplete,
} from "@mui/material";
import { Close as CloseIcon } from "@mui/icons-material";
import { createClient } from "@/lib/supabase/client";
import FileUploader, { UploadedFile } from "@/components/common/FileUploader";
import PayerSourceSelector from "@/components/settlement/PayerSourceSelector";
import { useAuth } from "@/contexts/AuthContext";
import { useSite } from "@/contexts/SiteContext";
import { createMiscExpense, updateMiscExpense } from "@/lib/services/miscExpenseService";
import type { MiscExpense, SubcontractOption, SiteEngineerOption } from "@/types/misc-expense.types";
import type { PayerSource } from "@/types/settlement.types";
import { useVendors } from "@/hooks/queries/useVendors";
import { useLaborers } from "@/hooks/queries/useLaborers";
import type { Database } from "@/types/database.types";
import WalletBalancePreview from "@/components/wallet-v2/WalletBalancePreview";
import { useEngineerWalletBalance } from "@/hooks/queries/useEngineerWalletV2";
import { isSiteEngineerPayingFromWallet } from "./walletPayerLock";

type PaymentMode = Database["public"]["Enums"]["payment_mode"];
import dayjs from "dayjs";

interface ExpenseCategory {
  id: string;
  name: string;
  module: string;
}

interface MiscExpenseDialogProps {
  open: boolean;
  onClose: () => void;
  expense?: MiscExpense | null; // For edit mode
  onSuccess?: () => void;
  /**
   * When opening this dialog from a trade workspace (or anywhere already
   * scoped to a contract), preselect the "Link to Subcontract" field. The
   * user can still change it. Ignored in edit mode (the existing expense's
   * subcontract_id wins).
   */
  defaultSubcontractId?: string;
}

export default function MiscExpenseDialog({
  open,
  onClose,
  expense,
  onSuccess,
  defaultSubcontractId,
}: MiscExpenseDialogProps) {
  const isEditMode = !!expense;
  const { userProfile } = useAuth();
  const { selectedSite } = useSite();
  const isSiteEngineer = userProfile?.role === "site_engineer";
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [date, setDate] = useState(dayjs().format("YYYY-MM-DD"));
  const [amount, setAmount] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [vendorName, setVendorName] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<PaymentMode>("cash");
  const [payerType, setPayerType] = useState<"site_engineer" | "company_direct">("company_direct");
  const [selectedEngineerId, setSelectedEngineerId] = useState("");
  const [createWalletTransaction, setCreateWalletTransaction] = useState(true);
  const [payerSource, setPayerSource] = useState<PayerSource>("own_money");
  const [customPayerName, setCustomPayerName] = useState("");
  const [subcontractId, setSubcontractId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [proofUrl, setProofUrl] = useState<string | null>(null);

  // Data lists
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [engineers, setEngineers] = useState<SiteEngineerOption[]>([]);
  const [subcontracts, setSubcontracts] = useState<SubcontractOption[]>([]);

  // Vendor & laborer autocomplete data
  const { data: vendors = [] } = useVendors();
  const { data: laborers = [] } = useLaborers();

  const selectedCategory = categories.find((c) => c.id === categoryId);

  const vendorRecipientOptions: string[] = useMemo(() => {
    const categoryName = selectedCategory?.name || "";
    if (categoryName === "Material Expenses") {
      return vendors.map((v) => v.name);
    }
    if (categoryName === "Contract Labor Settlement") {
      return laborers
        .filter((l) => l.employment_type === "contract")
        .map((l) => l.name);
    }
    return [];
  }, [selectedCategory, vendors, laborers]);

  // Wallet balance for site engineers — disabled (no fetch) for other roles.
  const balanceQuery = useEngineerWalletBalance(
    isSiteEngineer ? userProfile?.id : undefined,
    selectedSite?.id
  );
  const walletOnlyView = isSiteEngineerPayingFromWallet({
    userRole: userProfile?.role,
    payerType,
    createWalletTransaction,
  });

  useEffect(() => {
    if (open) {
      fetchCategories();
      fetchEngineers();
      fetchSubcontracts();

      if (isEditMode && expense) {
        // Edit mode - populate from expense
        setDate(expense.date);
        setAmount(expense.amount);
        setCategoryId(expense.category_id || "");
        setDescription(expense.description || "");
        setVendorName(expense.vendor_name || "");
        setPaymentMode((expense.payment_mode as PaymentMode) || "cash");
        setPayerType(expense.payer_type || "company_direct");
        setSelectedEngineerId(expense.site_engineer_id || "");
        setCreateWalletTransaction(false); // Don't create new transaction when editing
        setPayerSource((expense.payer_source as PayerSource) || "own_money");
        setCustomPayerName(expense.payer_name || "");
        setSubcontractId(expense.subcontract_id || "");
        setNotes(expense.notes || "");
        setProofUrl(expense.proof_url || null);
      } else {
        // New expense - reset form
        setDate(dayjs().format("YYYY-MM-DD"));
        setAmount(0);
        setCategoryId("");
        setDescription("");
        setVendorName("");
        setPaymentMode("cash");
        setPayerType("company_direct");
        setSelectedEngineerId("");
        setCreateWalletTransaction(true);
        setPayerSource("own_money");
        setCustomPayerName("");
        // Preselect contract when opened from a contract-scoped surface
        // (e.g. /site/trades expanded row); user can still change it.
        setSubcontractId(defaultSubcontractId || "");
        setNotes("");
        setProofUrl(null);
      }
      setError(null);
    }
  }, [open, expense, isEditMode, defaultSubcontractId]);

  // Site engineers always pay via their own wallet — auto-select, pre-fill, and
  // force the wallet debit so there is no opt-out path to a "company direct" record.
  useEffect(() => {
    if (isSiteEngineer && userProfile?.id && !isEditMode) {
      setPayerType("site_engineer");
      setSelectedEngineerId(userProfile.id);
      setCreateWalletTransaction(true);
    }
  }, [isSiteEngineer, userProfile?.id, isEditMode]);

  const fetchCategories = async () => {
    try {
      const { data } = await (supabase as any)
        .from("expense_categories")
        .select("id, name, module, description")
        .eq("is_active", true)
        .eq("module", "miscellaneous")
        .order("display_order")
        .order("name");

      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  const fetchEngineers = async () => {
    if (!selectedSite) return;

    try {
      const { data } = await supabase
        .from("users")
        .select("id, name")
        .in("role", ["site_engineer", "admin", "office"]);

      // Get wallet balances from v2 view
      const allIds = (data || []).map((e: any) => e.id);
      const { data: balanceRows } = await (supabase as any)
        .from("v_engineer_wallet_balance")
        .select("user_id, balance")
        .in("user_id", allIds)
        .eq("site_id", selectedSite.id);
      const balanceMap = Object.fromEntries(
        (balanceRows ?? []).map((r: any) => [r.user_id, r.balance as number])
      );

      const engineersWithBalance: SiteEngineerOption[] = (data || []).map((eng: any) => ({
        id: eng.id,
        name: eng.name,
        wallet_balance: balanceMap[eng.id] ?? 0,
      }));

      setEngineers(engineersWithBalance);
    } catch (err) {
      console.error("Error fetching engineers:", err);
    }
  };

  const fetchSubcontracts = async () => {
    if (!selectedSite) return;

    try {
      // Teams are company-scoped (no site_id since 2026-05-07 mesthri refactor);
      // RLS already restricts to current company.
      const { data: teamsData } = await supabase
        .from("teams")
        .select("id, name");

      const teamsMap = new Map<string, string>();
      (teamsData || []).forEach((t: any) => teamsMap.set(t.id, t.name));

      const { data } = await supabase
        .from("subcontracts")
        .select("id, title, team_id")
        .eq("site_id", selectedSite.id)
        .in("status", ["draft", "active"]);

      const options: SubcontractOption[] = (data || []).map((sc: any) => ({
        id: sc.id,
        title: sc.title,
        team_name: sc.team_id ? teamsMap.get(sc.team_id) : undefined,
      }));
      setSubcontracts(options);
    } catch (err) {
      console.error("Error fetching subcontracts:", err);
    }
  };

  const handleSave = async () => {
    if (amount <= 0) {
      setError("Please enter a valid amount");
      return;
    }

    if (payerType === "site_engineer" && !selectedEngineerId) {
      setError("Please select a site engineer");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      if (isEditMode && expense) {
        // Update existing expense
        const result = await updateMiscExpense(
          supabase,
          expense.id,
          {
            date,
            amount,
            category_id: categoryId || null,
            description: description || null,
            vendor_name: vendorName || null,
            payment_mode: paymentMode,
            payer_source: payerSource,
            custom_payer_name: customPayerName,
            subcontract_id: subcontractId || null,
            notes: notes || null,
            proof_url: proofUrl,
          },
          userProfile?.id || "",
          userProfile?.name || "System"
        );

        if (!result.success) {
          throw new Error(result.error);
        }
      } else {
        // Create new expense
        const result = await createMiscExpense(supabase, {
          siteId: selectedSite?.id || "",
          formData: {
            date,
            amount,
            category_id: categoryId,
            description,
            vendor_name: vendorName,
            payment_mode: paymentMode,
            payer_source: payerSource,
            custom_payer_name: customPayerName,
            payer_type: payerType,
            site_engineer_id: selectedEngineerId,
            subcontract_id: subcontractId || null,
            notes,
          },
          proofUrl: proofUrl || undefined,
          userId: userProfile?.id || "",
          userName: userProfile?.name || "System",
          // Misc expense engineer-wallet payments now use the v2 wallet
          // primitive (single LIFO pool, no batches). Other v1 callers
          // (settlement/rental) keep the legacy batch path until they migrate.
          useV2Wallet: payerType === "site_engineer" && createWalletTransaction,
        });

        if (!result.success) {
          throw new Error(result.error);
        }
      }

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ["misc-expenses"] });
      queryClient.invalidateQueries({ queryKey: ["v_all_expenses"] });
      queryClient.invalidateQueries({ queryKey: ["subcontract-totals"] });

      onSuccess?.();
      onClose();
    } catch (err: any) {
      console.error("Error saving expense:", err);
      setError(err.message || "Failed to save expense");
    } finally {
      setLoading(false);
    }
  };

  const selectedEngineer = engineers.find((e) => e.id === selectedEngineerId);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6" component="span" fontWeight={700}>
            {isEditMode ? "Edit Expense" : "Add Miscellaneous Expense"}
          </Typography>
          <IconButton onClick={onClose} size="small">
            <CloseIcon />
          </IconButton>
        </Box>
      </DialogTitle>

      <DialogContent dividers>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}

        {/* Amount */}
        <TextField
          label="Amount"
          type="number"
          value={amount || ""}
          onChange={(e) => setAmount(Math.max(0, parseFloat(e.target.value) || 0))}
          fullWidth
          size="small"
          sx={{ mb: 2 }}
          slotProps={{
            htmlInput: { min: 0 },
            input: { startAdornment: <Typography sx={{ mr: 0.5 }}>₹</Typography> },
          }}
          required
        />

        {/* Date */}
        <TextField
          label="Date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          fullWidth
          size="small"
          slotProps={{ inputLabel: { shrink: true } }}
          sx={{ mb: 2 }}
          required
        />

        {/* Category */}
        <FormControl fullWidth size="small" sx={{ mb: 2 }}>
          <InputLabel>Category</InputLabel>
          <Select
            value={categoryId}
            onChange={(e) => {
              setCategoryId(e.target.value);
              setVendorName("");
            }}
            label="Category"
          >
            <MenuItem value="">
              <em>None</em>
            </MenuItem>
            {categories.map((cat) => (
              <MenuItem key={cat.id} value={cat.id}>
                {cat.name}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        {/* Vendor/Recipient Name */}
        <Autocomplete
          freeSolo
          value={vendorName}
          onChange={(_, newValue) => setVendorName(typeof newValue === "string" ? newValue : "")}
          onInputChange={(_, newValue) => setVendorName(newValue)}
          options={vendorRecipientOptions}
          size="small"
          slotProps={{ popper: { disablePortal: false } }}
          renderInput={(params) => (
            <TextField
              {...params}
              label="Vendor / Recipient"
              placeholder={
                selectedCategory?.name === "Material Expenses"
                  ? "Search vendors..."
                  : selectedCategory?.name === "Contract Labor Settlement"
                  ? "Search laborers..."
                  : "e.g., Hardware Store, Electrician"
              }
            />
          )}
          sx={{ mb: 2 }}
        />

        {/* Description */}
        <TextField
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          fullWidth
          size="small"
          multiline
          rows={2}
          placeholder="Brief description of the expense"
          sx={{ mb: 3 }}
        />

        {walletOnlyView && selectedSite && (
          <WalletBalancePreview
            engineerName={userProfile?.name ?? "You"}
            siteName={selectedSite.name}
            currentBalance={balanceQuery.data?.balance ?? 0}
            amount={amount}
            isLoading={balanceQuery.isLoading}
          />
        )}

        {!walletOnlyView && (
          <>
            {/* Who is Paying */}
            <Paper variant="outlined" sx={{ p: 2, mb: 3 }}>
              <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 1 }}>
                WHO IS PAYING?
              </Typography>

              <RadioGroup
                value={payerType}
                onChange={(e) => {
                  setPayerType(e.target.value as "site_engineer" | "company_direct");
                  if (e.target.value === "company_direct") {
                    setSelectedEngineerId("");
                  }
                }}
              >
                {!isSiteEngineer && (
                  <FormControlLabel
                    value="company_direct"
                    control={<Radio size="small" />}
                    label="Company Direct"
                    disabled={isEditMode}
                  />
                )}
                <FormControlLabel
                  value="site_engineer"
                  control={<Radio size="small" />}
                  label="Via Site Engineer"
                  disabled={isEditMode || isSiteEngineer}
                />
              </RadioGroup>

              {payerType === "site_engineer" && (
                <Box sx={{ mt: 2, pl: 3 }}>
                  <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                    <InputLabel>Select Engineer</InputLabel>
                    <Select
                      value={selectedEngineerId}
                      onChange={(e) => {
                        setSelectedEngineerId(e.target.value);
                      }}
                      label="Select Engineer"
                      disabled={isEditMode || isSiteEngineer}
                    >
                      {engineers.map((eng) => (
                        <MenuItem key={eng.id} value={eng.id}>
                          {eng.name}
                          {eng.wallet_balance !== undefined && (
                            <Typography
                              component="span"
                              variant="caption"
                              color={eng.wallet_balance >= amount ? "success.main" : "error.main"}
                              sx={{ ml: 1 }}
                            >
                              (₹{eng.wallet_balance?.toLocaleString()} available)
                            </Typography>
                          )}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>

                  {!isEditMode && selectedEngineerId && (
                    isSiteEngineer ? (
                      <Alert severity="info" sx={{ mt: 1 }}>
                        Wallet auto-debit: ON. Site engineer purchases must always settle
                        from your own site wallet — no direct-pay option.
                      </Alert>
                    ) : (
                      <FormControlLabel
                        control={
                          <Checkbox
                            checked={createWalletTransaction}
                            onChange={(e) => setCreateWalletTransaction(e.target.checked)}
                            size="small"
                          />
                        }
                        label={
                          <Box>
                            <Typography variant="body2">Deduct from wallet</Typography>
                            <Typography variant="caption" color="text.secondary">
                              Debits the engineer&apos;s LIFO wallet pool for this site
                            </Typography>
                          </Box>
                        }
                      />
                    )
                  )}
                </Box>
              )}
            </Paper>

            {/* Payment Source */}
            <PayerSourceSelector
              value={payerSource}
              customName={customPayerName}
              onChange={setPayerSource}
              onCustomNameChange={setCustomPayerName}
              compact
            />
          </>
        )}

        {/* Payment Mode */}
        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
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

        {/* Proof Upload - especially for UPI */}
        {paymentMode === "upi" && (
          <Box sx={{ mb: 3 }}>
            <FileUploader
              supabase={supabase}
              bucketName="settlement-proofs"
              folderPath={`misc-expenses/${selectedSite?.id}`}
              fileNamePrefix="misc-expense"
              accept="image"
              label="Payment Screenshot"
              helperText="Upload screenshot of UPI payment confirmation"
              compact
              uploadOnSelect
              value={proofUrl ? { name: "Payment Proof", size: 0, url: proofUrl } : null}
              onUpload={(file: UploadedFile) => setProofUrl(file.url)}
              onRemove={() => setProofUrl(null)}
            />
          </Box>
        )}

        {/* Link to Subcontract (Optional) */}
        <FormControl fullWidth size="small" sx={{ mb: 3 }}>
          <InputLabel>Link to Subcontract (Optional)</InputLabel>
          <Select
            value={subcontractId}
            onChange={(e) => setSubcontractId(e.target.value)}
            label="Link to Subcontract (Optional)"
          >
            <MenuItem value="">
              <em>None - General Site Expense</em>
            </MenuItem>
            {subcontracts.map((sc) => (
              <MenuItem key={sc.id} value={sc.id}>
                {sc.title}{sc.team_name ? ` (${sc.team_name})` : ""}
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
          size="small"
          placeholder="Additional notes..."
        />
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button
          variant="contained"
          onClick={handleSave}
          disabled={loading || amount <= 0}
        >
          {loading ? <CircularProgress size={24} /> : isEditMode ? "Update Expense" : "Add Expense"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
